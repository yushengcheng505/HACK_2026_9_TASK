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

BRIEF = """

## Как рассуждать
Думай коротко и по делу: бюджет на рассуждения ограничен, длинное рассуждение оборвётся, и ответа
не будет вовсе. Не пересказывай входные данные и не перебирай без нужды всё подряд. Каждый вид
находок проверь одним-двумя предложениями, подозрительное место сверь с дословной цитатой — и сразу
пиши JSON."""

STEPS = {
    "reviewer": """

## Порядок рассуждения
Рассуждай коротко, по шагам, одной-двумя строками на пункт — длинное рассуждение оборвётся, и ответа
не будет вовсе. Не пересказывай входные данные и не возвращайся к уже проверенному.
1. Критерии приёмки: по каждому — номер задачи, которая его закрывает, или «нет».
2. Принятые решения: есть ли задача, которая делает иначе (интервал, хранилище, сервис, поведение).
3. Внешние вызовы в задачах: метод и поля есть в контракте; есть таймаут, обработка лимита и ошибок.
4. Ссылки задач на требования: содержание задачи относится к требованию.
5. Каждое подозрение — найди дословную цитату; нет цитаты — нет находки. Затем сразу JSON.""",
    "junction": """

## Порядок рассуждения
Рассуждай коротко, одной-двумя строками на пункт — длинное рассуждение оборвётся, и ответа не будет
вовсе. Не пересказывай входные данные.
1. Подсказки кода о дублях: по каждой — та же работа или разная, одной строкой.
2. Остальные пары задач с тем же клиентом метода, таблицей, секретом или тестом операции.
3. Значения и события, которые появляются в одной истории, а нужны в другой: есть ли передача.
4. По каждой находке — дословная цитата. Затем сразу JSON.""",
    "skeptic": """

## Порядок рассуждения
Рассуждай коротко: по каждой находке не больше трёх строк — что она утверждает, что в задачах,
решениях или источниках её подтверждает или опровергает, вердикт. Длинное рассуждение оборвётся,
и ответа не будет вовсе. Не пересказывай входные данные. Затем сразу JSON.""",
    "simplifier": BRIEF,
}


Edits = dict[str, tuple[tuple[str, str], ...]]  # роль → правки (было, стало); «было» пустое — дописать в конец

SEVERITY = {"reviewer": ((
    "  - `high` — не обработан отказ на реалистичном пути; контракт используется неверно;\n"
    "  - `medium` — ссылка не на то требование; неполные тест-сценарии; маловероятный путь;",
    "  - `high` — не обработан отказ на реалистичном пути; контракт используется неверно; задача\n"
    "    ссылается не на то требование (требование числится покрытым, хотя его никто не закрывает);\n"
    "  - `medium` — неполные тест-сценарии; маловероятный путь;"),)}
FAILURES = {"reviewer": ((
    "  идемпотентность, ошибка метода. Цитата — из источника.",
    "  идемпотентность, ошибка метода. Цитата — из источника. Отдельно проверь:\n"
    "  - у каждого внешнего вызова в задачах задан дедлайн (таймаут). Запасной путь «если сервис\n"
    "    недоступен» не заменяет таймаут: без дедлайна вызов зависнет, и запасной путь не сработает;\n"
    "  - каждая ошибка, которую метод возвращает по контракту или документации, обрабатывается\n"
    "    хотя бы в одной задаче истории."),)}
SKEPTIC_GAPS = {"skeptic": ((
    "действительно есть, а не следует из невнимательного чтения.",
    "действительно есть, а не следует из невнимательного чтения. Для пробелов — только `confirmed`\n"
    "или `rejected`, уровень не понижай: если источники расходятся (разные сроки, интервалы,\n"
    "поведение), это реальный пробел, даже когда его легко закрыть допущением. И для любых находок:\n"
    "простота исправления — не повод понижать уровень; уровень — это вред, если не исправить."),)}
EXAMPLES = {"reviewer": (("", """

## Примеры (из других проектов — для формы, а не для содержания)
- `contradicts_decision`: решение «сессии хранятся в Redis», задача TASK-12 «хранить сессии в памяти
  процесса». Сценарий: после перезапуска пода все пользователи разлогинены. Цитата — из решения.
- `failure_not_handled`: задача вызывает платёжный шлюз без дедлайна, а документация говорит «ответ
  до 30 секунд, при перегрузке — UNAVAILABLE». Сценарий: под нагрузкой запросы висят, пул соединений
  исчерпан. Цитата — из источника.
- `wrong_requirement`: задача «настроить алерты на ошибки оплаты» ссылается на REQ-7 «экспорт заказов
  в CSV». Сценарий: REQ-7 числится покрытым, хотя экспорта нет. Цитата — из требования.
- Не находки: «можно добавить метрики» без требования; работа, которая есть в задачах другой истории."""),)}


def _brief(roles=("reviewer", "junction", "skeptic", "simplifier")) -> Edits:
    return {r: (("", BRIEF),) for r in roles}


def _merge(*edits: Edits) -> Edits:
    merged: dict[str, tuple] = {}
    for e in edits:
        for role, items in e.items():
            merged[role] = merged.get(role, ()) + items
    return merged


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
    "review-32k": Variant(FULL, max_tokens=32768),
    "review-brief": Variant(FULL, prompts=_brief()),
    "review-steps": Variant(FULL, prompts={r: (("", text),) for r, text in STEPS.items()}),
    "review-brief-32k": Variant(FULL, max_tokens=32768, prompts=_brief()),
    "brief-lenses": Variant(FULL, prompts=_merge(_brief(), SEVERITY, FAILURES)),
    "brief-lenses-skeptic": Variant(FULL, prompts=_merge(_brief(), SEVERITY, FAILURES, SKEPTIC_GAPS)),
    "brief-lenses-examples": Variant(FULL, prompts=_merge(_brief(), SEVERITY, FAILURES, EXAMPLES)),
    "brief-all": Variant(FULL, prompts=_merge(_brief(), SEVERITY, FAILURES, SKEPTIC_GAPS, EXAMPLES)),
    "brief-all-nosimplifier": Variant({**FULL, "review_simplifier": False},
                                      prompts=_merge(_brief(), SEVERITY, FAILURES, SKEPTIC_GAPS, EXAMPLES)),
}


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
