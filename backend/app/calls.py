"""Общее для узлов графа и проверяющих ролей: события, вызов LLM, блоки промпта из состояния."""

from functools import lru_cache
from typing import Any

from langchain_core.runnables import RunnableConfig
from langgraph.config import get_stream_writer

from app.config import get_settings
from app.llm import LLM, OpenAICompatLLM
from app.schemas import Language, Requirement, Source, Story

TOKEN_FLUSH = 80
DECISIONS_HEADING = "Принятые решения (обязательны), допущения и пробелы"


def emit(type: str, **data: Any) -> None:
    get_stream_writer()({"type": type, "data": data})


class TokenSink:
    def __init__(self, node: str):
        self.node, self.buffer, self.kind = node, "", "content"

    def __call__(self, text: str, kind: str) -> None:
        if kind != self.kind:
            self.flush()
            self.kind = kind
        self.buffer += text
        if len(self.buffer) >= TOKEN_FLUSH:
            self.flush()

    def flush(self) -> None:
        if self.buffer:
            emit("token", node=self.node, kind=self.kind, text=self.buffer)
            self.buffer = ""


@lru_cache
def _default_llm() -> OpenAICompatLLM:
    return OpenAICompatLLM(get_settings())


def get_llm(config: RunnableConfig) -> LLM:
    return (config.get("configurable") or {}).get("llm") or _default_llm()


async def ask(config: RunnableConfig, node: str, prompt: str, user: str, schema):
    sink = TokenSink(node)

    def on_retry(attempt: int, reason: str) -> None:
        sink.flush()
        emit("llm_retry", node=node, attempt=attempt, reason=reason[:500])

    try:
        return await get_llm(config).complete_json(prompt, user, schema, on_token=sink, on_retry=on_retry)
    finally:
        sink.flush()


def sources_of(state: dict) -> list[Source]:
    return [Source.model_validate(s) for s in state["sources"]]


def requirements_of(state: dict) -> list[Requirement]:
    return [Requirement.model_validate(r) for r in state.get("requirements", [])]


def stories_of(state: dict) -> list[Story]:
    return [Story.model_validate(s) for s in state.get("stories", [])]


def language_line(state: dict) -> str:
    lang = Language.model_validate(state.get("language") or {})
    if not lang.value:
        return "Целевой язык программирования: не определён."
    return f"Целевой язык программирования: {lang.value} (уверенность {lang.confidence})."


def requirements_block(reqs: list[Requirement]) -> str:
    return "\n".join(f"- {r.id} [{r.type}] {r.text} (источники: {', '.join(r.source_refs) or '—'})" for r in reqs)


def decisions_block(state: dict) -> str:
    lines = []
    for q in state.get("questions", []):
        if q.get("answer"):
            lines.append(f"- Вопрос: {q['text']}\n  Ответ: {q['answer']}")
    lines += [f"- Допущение: {a}" for a in state.get("assumptions", [])]
    for g in state.get("gaps", []):
        lines.append(f"- Пробел {g['id']}: {g['text']} Риск: {g['risk']}")
    return "\n".join(lines) or "—"
