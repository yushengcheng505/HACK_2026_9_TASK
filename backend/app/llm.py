"""Прослойка LLM: любой OpenAI-совместимый endpoint. Модель и адрес — только в настройках."""

import json
import re
from collections.abc import Callable
from typing import Protocol, TypeVar

import httpx
from openai import AsyncOpenAI
from pydantic import BaseModel, ValidationError

from app.config import Settings
from app.prompts import load_prompt

T = TypeVar("T", bound=BaseModel)
OnToken = Callable[[str, str], None]
OnRetry = Callable[[int, str], None]
MAX_ATTEMPTS = 3
EMPTY_RETRY = ("Ответ пустой: похоже, лимит токенов ушёл на рассуждения. "
               "Не рассуждай подробно — сразу верни JSON строго по схеме.")


class LLMError(RuntimeError):
    pass


class LLM(Protocol):
    model: str

    async def complete_json(self, prompt_name: str, user: str, schema: type[T], on_token: OnToken | None = None,
                            on_retry: OnRetry | None = None) -> T: ...


def extract_json(text: str) -> object:
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.S).strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, flags=re.S)
    if fenced:
        text = fenced.group(1).strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end < start:
        raise ValueError("в ответе нет JSON-объекта")
    return json.loads(text[start: end + 1])


def schema_instruction(schema: type[BaseModel]) -> str:
    return (
        "\n\nФормат ответа — один JSON-объект строго по этой JSON-схеме, без пояснений вокруг:\n```json\n"
        + json.dumps(schema.model_json_schema(), ensure_ascii=False)
        + "\n```"
    )


class OpenAICompatLLM:
    def __init__(self, settings: Settings, http_client: httpx.AsyncClient | None = None):
        self.settings = settings
        self.model = settings.llm_model
        self.client = AsyncOpenAI(
            base_url=settings.llm_base_url,
            api_key=settings.llm_api_key,
            timeout=settings.llm_timeout,
            max_retries=2,
            http_client=http_client,
        )

    def _response_format(self, schema: type[BaseModel]) -> dict | None:
        mode = self.settings.llm_json_mode
        if mode == "json_schema":
            return {"type": "json_schema",
                    "json_schema": {"name": schema.__name__, "schema": schema.model_json_schema()}}
        if mode == "json_object":
            return {"type": "json_object"}
        return None

    async def _chat(self, messages: list[dict], schema: type[BaseModel], on_token: OnToken | None) -> tuple[str, str | None]:
        kwargs: dict = {
            "model": self.model,
            "messages": messages,
            "temperature": self.settings.llm_temperature,
            "max_tokens": self.settings.llm_max_tokens,
            "stream": True,
        }
        if (fmt := self._response_format(schema)) is not None:
            kwargs["response_format"] = fmt
        if self.settings.llm_extra_body:
            kwargs["extra_body"] = self.settings.llm_extra_body
        parts: list[str] = []
        finish_reason = None
        stream = await self.client.chat.completions.create(**kwargs)
        async for chunk in stream:
            if not chunk.choices:
                continue
            finish_reason = chunk.choices[0].finish_reason or finish_reason
            delta = chunk.choices[0].delta
            reasoning = getattr(delta, "reasoning_content", None) or getattr(delta, "reasoning", None)
            if reasoning and on_token:
                on_token(reasoning, "reasoning")
            if delta.content:
                parts.append(delta.content)
                if on_token:
                    on_token(delta.content, "content")
        return "".join(parts), finish_reason

    async def complete_json(self, prompt_name: str, user: str, schema: type[T], on_token: OnToken | None = None,
                            on_retry: OnRetry | None = None) -> T:
        messages = [
            {"role": "system", "content": load_prompt(prompt_name).text + schema_instruction(schema)},
            {"role": "user", "content": user},
        ]
        last_error = ""
        for attempt in range(1, MAX_ATTEMPTS + 1):
            if attempt > 1 and on_retry:
                on_retry(attempt, last_error)
            text, finish_reason = await self._chat(messages, schema, on_token)
            if not text.strip():
                last_error = f"пустой ответ (finish_reason={finish_reason})"
                if messages[-1]["role"] != "user" or not messages[-1]["content"].startswith(EMPTY_RETRY):
                    messages.append({"role": "user", "content": EMPTY_RETRY})
                continue
            try:
                return schema.model_validate(extract_json(text))
            except (ValueError, ValidationError) as e:
                last_error = str(e)[:2000]
                messages += [
                    {"role": "assistant", "content": text[:6000]},
                    {"role": "user", "content": f"Ответ не прошёл проверку:\n{last_error}\n"
                                                "Верни исправленный JSON целиком, строго по схеме."},
                ]
        raise LLMError(f"Шаг «{prompt_name}»: модель {MAX_ATTEMPTS} раза вернула невалидный ответ. {last_error}")
