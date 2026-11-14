"""Прогоны графа в процессе со счётчиком вызовов LLM: полный прогон или круг проверки с готовым состоянием."""

import asyncio
import time
import uuid

from langgraph.checkpoint.memory import InMemorySaver
from openai import RateLimitError

from app.graph import build_graph
from app.llm import LLM
from app.prompts import load_prompt

VARIANTS: dict[str, dict] = {
    "critic": {"review_mode": "critic", "review_skeptic": False, "review_simplifier": False},
    "review-noskeptic": {"review_mode": "review", "review_skeptic": False, "review_simplifier": True},
    "review": {"review_mode": "review", "review_skeptic": True, "review_simplifier": True},
    "review-nosimplifier": {"review_mode": "review", "review_skeptic": True, "review_simplifier": False},
}


RATE_LIMIT_ATTEMPTS = 8


class MeteredLLM:
    """Обёртка над LLM: на каждый вызов — роль, символы входа и выхода, повторы, время, успех.

    Перегрузку провайдера (429) пережидает с растущей паузой: это не свойство проверяемого процесса.
    """

    def __init__(self, inner: LLM, backoff: float = 15.0):
        self.inner, self.model, self.backoff = inner, inner.model, backoff
        self.calls: list[dict] = []

    async def complete_json(self, prompt_name, user, schema, on_token=None, on_retry=None):
        rec = {"prompt": prompt_name, "input_chars": len(user) + len(load_prompt(prompt_name).text),
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
                except RateLimitError:
                    if attempt == RATE_LIMIT_ATTEMPTS:
                        raise
                    rec["rate_limited"] += 1
                    await asyncio.sleep(self.backoff * attempt)
            rec["ok"] = True
            return out
        finally:
            rec["seconds"] = round(time.monotonic() - start, 1)
            self.calls.append(rec)


async def run_graph(inner: LLM, options: dict, payload: dict | None = None, base_state: dict | None = None) -> dict:
    """Полный прогон (payload) или круг проверки: base_state подставляется как результат узла tasks."""
    llm = MeteredLLM(inner)
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
