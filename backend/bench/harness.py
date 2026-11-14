"""Прогоны графа в процессе со счётчиком вызовов LLM: полный прогон или круг проверки с готовым состоянием."""

import asyncio
import shutil
import time
import uuid
from dataclasses import dataclass, field, replace
from pathlib import Path

from langgraph.checkpoint.memory import InMemorySaver
from openai import APIConnectionError, APIError, InternalServerError, RateLimitError

from app.config import get_settings
from app.graph import build_graph
from app.llm import LLM, OpenAICompatLLM
from app.prompts import load_prompt

CRITIC = {"review_mode": "critic", "review_skeptic": False, "review_simplifier": False}
FULL = {"review_mode": "review", "review_skeptic": True, "review_simplifier": True}

Edits = dict[str, tuple[tuple[str, str], ...]]  # роль → правки (было, стало); «было» пустое — дописать в конец


@dataclass(frozen=True)
class Variant:
    options: dict
    max_tokens: int | None = None
    prompts: Edits = field(default_factory=dict)


VARIANTS: dict[str, Variant] = {
    "critic": Variant(CRITIC),
    "review-noskeptic": Variant({**FULL, "review_skeptic": False}),
    "review": Variant(FULL),
    "review-nosimplifier": Variant({**FULL, "review_simplifier": False}),
}
# Варианты замеров 2–3 (лимит 32k, «рассуждай коротко», линзы, примеры, строгий скептик) — в истории git
# (коммит bc3cdc2); победитель перенесён в prompts/, описание и цифры — docs/review-benchmark.md.


def edit_prompt(text: str, edits: tuple[tuple[str, str], ...]) -> str:
    for old, new in edits:
        if not old:
            text = text.rstrip() + new + "\n"
            continue
        if text.count(old) != 1:
            raise ValueError(f"правка промпта не применяется однозначно: «{old[:60]}»")
        text = text.replace(old, new)
    return text


def variant_llm(name: str, out: Path) -> OpenAICompatLLM:
    """LLM с лимитом и промптами варианта; изменённые промпты кладутся в out/_prompts/<вариант>."""
    v, settings = VARIANTS[name], get_settings()
    if v.max_tokens:
        settings = replace(settings, llm_max_tokens=v.max_tokens)
    if v.prompts:
        target = out / "_prompts" / name
        shutil.copytree(settings.prompts_dir, target, dirs_exist_ok=True)
        for role, edits in v.prompts.items():
            text = (settings.prompts_dir / f"{role}.md").read_text(encoding="utf-8")
            (target / f"{role}.md").write_text(edit_prompt(text, edits), encoding="utf-8")
        settings = replace(settings, prompts_dir=target)
    return OpenAICompatLLM(settings)


RATE_LIMIT_ATTEMPTS = 8
PROVIDER_ERRORS = (RateLimitError, InternalServerError, APIConnectionError)


def provider_failed(error: BaseException | str) -> bool:
    """Сбой провайдера, а не процесса: 429, 5xx, обрыв связи, оборванный поток (голый APIError)."""
    if isinstance(error, str):
        return any(f"{e.__name__}(" in error for e in (*PROVIDER_ERRORS, APIError))
    return isinstance(error, PROVIDER_ERRORS) or type(error) is APIError


class MeteredLLM:
    """Обёртка над LLM: на каждый вызов — роль, символы входа и выхода, повторы, время, успех.

    Перегрузку и сбои провайдера (429, 5xx, обрыв связи) пережидает с растущей паузой: это не свойство
    проверяемого процесса.
    """

    def __init__(self, inner: LLM, backoff: float = 15.0):
        self.inner, self.model, self.backoff = inner, inner.model, backoff
        self.prompts_dir = getattr(getattr(inner, "settings", None), "prompts_dir", None)
        self.calls: list[dict] = []

    async def complete_json(self, prompt_name, user, schema, on_token=None, on_retry=None):
        prompt = load_prompt(prompt_name, self.prompts_dir)
        rec = {"prompt": prompt_name, "input_chars": len(user) + len(prompt.text),
               "content_chars": 0, "reasoning_chars": 0, "retries": 0, "rate_limited": 0, "ok": False,
               "seconds": 0.0}

        def token(text: str, kind: str) -> None:
            rec["reasoning_chars" if kind == "reasoning" else "content_chars"] += len(text)
            if on_token:
                on_token(text, kind)

        def retry(attempt: int, reason: str) -> None:
            rec["retries"] += 1
            if on_retry:
                on_retry(attempt, reason)

        start = time.monotonic()
        try:
            for attempt in range(1, RATE_LIMIT_ATTEMPTS + 1):
                try:
                    out = await self.inner.complete_json(prompt_name, user, schema, on_token=token, on_retry=retry)
                    break
                except APIError as e:
                    if not provider_failed(e) or attempt == RATE_LIMIT_ATTEMPTS:
                        raise
                    rec["rate_limited"] += 1
                    await asyncio.sleep(self.backoff * attempt)
            rec["ok"] = True
            return out
        finally:
            rec["seconds"] = round(time.monotonic() - start, 1)
            self.calls.append(rec)


async def run_graph(inner: LLM, variant: Variant, payload: dict | None = None, base_state: dict | None = None) -> dict:
    """Полный прогон (payload) или круг проверки: base_state подставляется как результат узла tasks."""
    llm, options = MeteredLLM(inner), variant.options
    graph = build_graph(InMemorySaver())
    config = {"configurable": {"thread_id": uuid.uuid4().hex, "llm": llm, **options}, "recursion_limit": 60}
    if base_state is not None:
        await graph.aupdate_state(config, base_state, as_node="tasks")
        payload = None
    events, error = [], None
    start = time.monotonic()
    try:
        async for mode, chunk in graph.astream(payload, config, stream_mode=["custom", "updates"]):
            if mode == "custom" and chunk["type"] != "token":
                events.append(chunk)
    except Exception as e:  # сбой прогона — тоже результат бенчмарка
        error = repr(e)
    state = (await graph.aget_state(config)).values
    return {"options": options, "seconds": round(time.monotonic() - start, 1), "error": error,
            "result": state.get("result"), "stories": state.get("stories", []), "events": events,
            "calls": llm.calls}
