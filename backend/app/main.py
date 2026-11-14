import asyncio
import json
import time
import uuid
from contextlib import asynccontextmanager
from dataclasses import replace
from typing import Literal
from urllib.parse import quote, urlparse

import aiosqlite
import httpx
from fastapi import Body, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from pydantic import BaseModel, Field

from app.checks import compute_stats, run_checks
from app.config import BACKEND_DIR, REPO_DIR, get_settings
from app.demos import list_demos, load_demo
from app.exporters import to_docx, to_json, to_xlsx
from app.graph import build_graph, encode_files
from app.limiter import MAX_CONCURRENCY, MIN_CONCURRENCY
from app.llm import LLM, OpenAICompatLLM
from app.prompts import default_prompt, load_prompt, prompt_names, reset_override, save_override
from app.providers import ENV_ID, builtin, list_models, provider_settings, public
from app.providers import api_key as provider_key
from app.runner import Runner
from app.schemas import Decomposition, Source
from app.sources import InputFile
from app.store import TERMINAL, Store

EXPORTS = {
    "json": ("application/json", to_json),
    "xlsx": ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", to_xlsx),
    "docx": ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", to_docx),
}
BENCH_RESULTS = BACKEND_DIR / "bench" / "results"
BENCH_SUMMARY = REPO_DIR / "docs" / "review-benchmark.md"
REPLAY_MAX_PAUSE = 2.0
SSE_PING = 15.0


class DemoRunRequest(BaseModel):
    skip_questions: bool = False
    provider_id: str | None = None
    model: str | None = None
    concurrency: int | None = Field(None, ge=MIN_CONCURRENCY, le=MAX_CONCURRENCY)


class ConcurrencyIn(BaseModel):
    value: int = Field(ge=MIN_CONCURRENCY, le=MAX_CONCURRENCY)


class ProviderIn(BaseModel):
    name: str
    base_url: str
    # None — оставить сохранённый ключ, пустая строка — убрать.
    api_key: str | None = None
    api_key_env: str | None = None
    json_mode: Literal["json_schema", "json_object", "off"] = "json_schema"
    default_model: str | None = None


class AnswersRequest(BaseModel):
    answers: dict[str, str] = {}


class PromptUpdate(BaseModel):
    text: str


def prompt_info(name: str) -> dict:
    current, default = load_prompt(name), default_prompt(name)
    return {"name": name, "text": current.text, "version": current.version, "default_text": default.text,
            "default_version": default.version, "overridden": current.version != default.version}


def create_app(llm: LLM | None = None) -> FastAPI:
    settings = get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        store = Store(settings.data_dir / "app.db")
        store.fail_interrupted()
        async with aiosqlite.connect(settings.data_dir / "checkpoints.db") as conn:
            graph = build_graph(AsyncSqliteSaver(conn))
            app.state.store = store
            app.state.runner = Runner(store, graph, llm or OpenAICompatLLM(settings), settings.llm_concurrency)
            yield
            for task in list(app.state.runner.tasks.values()):
                task.cancel()

    app = FastAPI(title="Агент-декомпозитор", lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["*"],
                       allow_headers=["*"])

    def runner() -> Runner:
        return app.state.runner

    def store() -> Store:
        return app.state.store

    def get_run_or_404(run_id: str) -> dict:
        run = store().get_run(run_id)
        if run is None:
            raise HTTPException(404, "Запуск не найден")
        return run

    def llm_for(provider_id: str | None, model: str | None) -> LLM:
        """Модель прогона. Без провайдера и с серверной моделью — общий клиент сервера."""
        model = (model or "").strip()
        if not provider_id or provider_id == ENV_ID:
            if not model or model == runner().llm.model:
                return runner().llm
            return OpenAICompatLLM(replace(settings, llm_model=model))
        provider = store().get_provider(provider_id)
        if provider is None:
            raise HTTPException(422, "Нет такого провайдера")
        if not (model := model or provider.get("default_model") or ""):
            raise HTTPException(422, "Выберите модель")
        return OpenAICompatLLM(provider_settings(settings, provider, model))

    def run_llm(run: dict) -> LLM:
        """Модель, с которой прогон запускали, — для продолжения после паузы или ответов."""
        try:
            return llm_for(run.get("provider_id"), run.get("model"))
        except HTTPException:  # провайдер удалили — продолжаем серверной моделью
            return runner().llm

    def start(title: str, text: str, files: list[InputFile], skip: bool, origin: str, demo_id: str | None,
              provider_id: str | None = None, model: str | None = None, concurrency: int | None = None) -> dict:
        if not text.strip():
            raise HTTPException(422, "Текст эпика пуст")
        llm = llm_for(provider_id, model)
        run_id = uuid.uuid4().hex[:12]
        store().create_run(run_id, title, origin, demo_id, skip, provider_id if provider_id != ENV_ID else None,
                           concurrency)
        runner().start(run_id, {"title": title, "epic_text": text, "files": encode_files(files),
                                "skip_questions": skip}, llm)
        return {"run_id": run_id}

    @app.get("/api/health")
    def health():
        return {"status": "ok", "model": runner().llm.model, "llm_host": urlparse(settings.llm_base_url).netloc,
                "concurrency": settings.llm_concurrency,
                "json_mode": settings.llm_json_mode}

    @app.get("/api/demos")
    def demos():
        return [{"id": d.id, "title": d.title, "summary": d.summary, "epic_text": d.epic_text,
                 "files": [{"name": f.name, "role": f.role} for f in d.files]} for d in list_demos()]

    @app.post("/api/demos/{demo_id}/run")
    async def run_demo(demo_id: str, body: DemoRunRequest = Body(default=DemoRunRequest())):
        try:
            demo = load_demo(demo_id)
        except FileNotFoundError:
            raise HTTPException(404, "Демо не найдено")
        return start(demo.title, demo.epic_text, demo.files, body.skip_questions, "demo", demo_id,
                     body.provider_id, body.model, body.concurrency)

    @app.post("/api/runs")
    async def create_run(
        title: str = Form(...),
        text: str = Form(...),
        skip_questions: bool = Form(False),
        provider_id: str | None = Form(None),
        model: str | None = Form(None),
        concurrency: int | None = Form(None, ge=MIN_CONCURRENCY, le=MAX_CONCURRENCY),
        product_docs: list[UploadFile] = File(default=[]),
        external_docs: list[UploadFile] = File(default=[]),
        contracts: list[UploadFile] = File(default=[]),
        examples: list[UploadFile] = File(default=[]),
    ):
        files = []
        for role, uploads in (("product_docs", product_docs), ("external_docs", external_docs),
                              ("contracts", contracts), ("examples", examples)):
            for u in uploads:
                if (u.filename or "").lower().endswith(".pdf"):
                    raise HTTPException(422, f"PDF не поддерживается: {u.filename}")
                files.append(InputFile(name=u.filename or "file", role=role, content=await u.read()))
        return start(title, text, files, skip_questions, "ui", None, provider_id, model, concurrency)

    @app.get("/api/runs")
    def runs():
        return [{k: r[k] for k in ("id", "title", "status", "origin", "demo_id", "created_at", "model")}
                | {"stats": (r.get("result") or {}).get("stats")} for r in store().list_runs()]

    @app.get("/api/runs/{run_id}")
    def get_run(run_id: str):
        return get_run_or_404(run_id)

    @app.post("/api/runs/{run_id}/answers")
    async def answer(run_id: str, body: AnswersRequest):
        run = get_run_or_404(run_id)
        if run["status"] != "waiting_answers":
            raise HTTPException(409, "Запуск не ждёт ответов")
        known = {q["id"] for q in run.get("questions") or []}
        if unknown := sorted(set(body.answers) - known):
            raise HTTPException(422, f"Нет таких вопросов: {', '.join(unknown)}")
        runner().resume(run_id, body.answers, run_llm(run))
        return {"status": "running"}

    @app.post("/api/runs/{run_id}/pause")
    async def pause(run_id: str):
        if get_run_or_404(run_id)["status"] != "running" or not runner().pause(run_id):
            raise HTTPException(409, "Запуск сейчас не выполняется")
        return {"status": "pausing"}

    @app.post("/api/runs/{run_id}/resume")
    async def resume(run_id: str):
        run = get_run_or_404(run_id)
        if run["status"] != "paused":
            raise HTTPException(409, "Запуск не на паузе")
        runner().unpause(run_id, run_llm(run))
        return {"status": "running"}

    @app.put("/api/runs/{run_id}/concurrency")
    async def set_concurrency(run_id: str, body: ConcurrencyIn):
        """Сколько запросов к модели прогон шлёт одновременно — можно менять и до, и во время прогона."""
        get_run_or_404(run_id)
        return {"concurrency": await runner().set_concurrency(run_id, body.value)}

    @app.put("/api/runs/{run_id}/result")
    async def edit_result(run_id: str, result: Decomposition):
        run = get_run_or_404(run_id)
        if run["status"] != "done":
            raise HTTPException(409, "Результат ещё не готов")
        sources = [Source(id=s.id, kind=s.kind, file=s.file, title=s.title, text=s.excerpt) for s in result.sources]
        issues, coverage = run_checks(sources, result.requirements, result.stories)
        result.issues, result.coverage = issues, coverage
        result.stats = compute_stats(result.requirements, result.stories, result.questions, result.gaps,
                                     result.assumptions, issues)
        data = result.model_dump()
        store().update_run(run_id, result=data)
        runner().publish(run_id, "result_edited", {"stats": data["stats"], "coverage": data["coverage"],
                                                   "issues": data["issues"]})
        return data

    # ---------- провайдеры моделей ----------

    def provider_or_404(provider_id: str) -> dict:
        provider = store().get_provider(provider_id)
        if provider is None:
            raise HTTPException(404, "Нет такого провайдера")
        return provider

    def save_provider(provider_id: str, body: ProviderIn, created_at: float, old_key: str | None) -> dict:
        if not body.name.strip() or not body.base_url.startswith(("http://", "https://")):
            raise HTTPException(422, "Нужны название и адрес вида https://…/v1")
        provider = body.model_dump() | {"id": provider_id, "created_at": created_at,
                                        "api_key": old_key if body.api_key is None else (body.api_key or None),
                                        "base_url": body.base_url.strip().rstrip("/")}
        store().save_provider(provider)
        return public(provider)

    @app.get("/api/providers")
    def providers():
        return [builtin(settings, runner().llm.model)] + [public(p) for p in store().list_providers()]

    @app.post("/api/providers")
    def create_provider(body: ProviderIn):
        return save_provider(uuid.uuid4().hex[:8], body, time.time(), None)

    @app.put("/api/providers/{provider_id}")
    def update_provider(provider_id: str, body: ProviderIn):
        old = provider_or_404(provider_id)
        return save_provider(provider_id, body, old["created_at"], old.get("api_key"))

    @app.delete("/api/providers/{provider_id}")
    def delete_provider(provider_id: str):
        provider_or_404(provider_id)
        store().delete_provider(provider_id)
        return {"status": "deleted"}

    @app.get("/api/providers/{provider_id}/models")
    async def provider_models(provider_id: str):
        if provider_id == ENV_ID:
            base_url, key = settings.llm_base_url, settings.llm_api_key
        else:
            provider = provider_or_404(provider_id)
            base_url, key = provider["base_url"], provider_key(provider)
        try:
            return await list_models(base_url, key)
        except (httpx.HTTPError, ValueError) as e:
            reason = (str(e).splitlines() or [type(e).__name__])[0]
            raise HTTPException(502, f"Провайдер не отдал список моделей: {reason}") from e

    def known_prompt(name: str) -> str:
        if name not in prompt_names():
            raise HTTPException(404, "Нет такого промпта")
        return name

    @app.get("/api/prompts")
    def prompts():
        return [prompt_info(name) for name in prompt_names()]

    @app.put("/api/prompts/{name}")
    def update_prompt(name: str, body: PromptUpdate):
        if not body.text.strip():
            raise HTTPException(422, "Промпт пуст")
        save_override(known_prompt(name), body.text)
        return prompt_info(name)

    @app.delete("/api/prompts/{name}")
    def reset_prompt(name: str):
        reset_override(known_prompt(name))
        return prompt_info(name)

    @app.get("/api/bench")
    def bench():
        """Отчёты мини-бенчмарка проверяющих: сводка для презентации и отчёт каждой серии замеров."""
        def doc(path):
            text = path.read_text(encoding="utf-8")
            title = next((line.lstrip("# ").strip() for line in text.splitlines() if line.startswith("# ")), path.stem)
            return {"title": title, "markdown": text}

        series = [{"id": d.name, **doc(d / "report.md"), "runs": len(list(d.glob("*.json")))}
                  for d in sorted(BENCH_RESULTS.glob("*/"), reverse=True) if (d / "report.md").is_file()]
        return {"summary": doc(BENCH_SUMMARY) if BENCH_SUMMARY.is_file() else None, "series": series}

    @app.get("/api/runs/{run_id}/export/{fmt}")
    def export(run_id: str, fmt: str):
        if fmt not in EXPORTS:
            raise HTTPException(404, "Формат: json, xlsx или docx")
        run = get_run_or_404(run_id)
        if not run.get("result"):
            raise HTTPException(409, "Результат ещё не готов")
        result = Decomposition.model_validate(run["result"])
        media, render = EXPORTS[fmt]
        filename = quote(f"{result.epic.label}.{fmt}")
        disposition = f"attachment; filename=\"decomposition-{run_id}.{fmt}\"; filename*=UTF-8''{filename}"
        return Response(render(result), media_type=media, headers={"Content-Disposition": disposition})

    @app.get("/api/runs/{run_id}/events")
    async def events(run_id: str, replay: bool = False, speed: float = 1.0, after: int = 0,
                     last_event_id: str | None = Header(default=None)):
        get_run_or_404(run_id)
        after = int(last_event_id) if last_event_id and last_event_id.isdigit() else after

        def fmt(e) -> str:
            return f"id: {e.seq}\nevent: {e.type}\ndata: {json.dumps(e.data, ensure_ascii=False)}\n\n"

        async def stream():
            queue = runner().subscribe(run_id)
            try:
                last, prev_ts = after, None
                for e in store().events(run_id, after):
                    if replay and prev_ts is not None:
                        await asyncio.sleep(min((e.ts - prev_ts) / max(speed, 0.1), REPLAY_MAX_PAUSE))
                    prev_ts = e.ts
                    last = e.seq
                    yield fmt(e)
                if replay or get_run_or_404(run_id)["status"] in TERMINAL:
                    return
                while True:
                    try:
                        e = await asyncio.wait_for(queue.get(), SSE_PING)
                    except TimeoutError:
                        yield ": ping\n\n"
                        continue
                    if e.seq <= last:
                        continue
                    last = e.seq
                    yield fmt(e)
                    if e.type in ("run_finished", "run_failed"):
                        return
            finally:
                runner().unsubscribe(run_id, queue)

        return StreamingResponse(stream(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    return app


app = create_app()
