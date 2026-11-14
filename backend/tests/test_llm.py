import json

import httpx
import pytest

from app.config import get_settings
from app.llm import LLMError, OpenAICompatLLM, extract_json
from app.schemas import CriticOut


def sse_body(text: str) -> bytes:
    chunks = [text[i: i + 7] for i in range(0, len(text), 7)]
    lines = []
    for part in chunks:
        payload = {"id": "x", "object": "chat.completion.chunk", "created": 0, "model": "m",
                   "choices": [{"index": 0, "delta": {"content": part}, "finish_reason": None}]}
        lines.append(f"data: {json.dumps(payload, ensure_ascii=False)}\n\n")
    lines.append("data: [DONE]\n\n")
    return "".join(lines).encode()


def make_llm(replies: list[str], requests: list[dict]) -> OpenAICompatLLM:
    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(json.loads(request.content))
        return httpx.Response(200, content=sse_body(replies[len(requests) - 1]),
                              headers={"content-type": "text/event-stream"})

    return OpenAICompatLLM(get_settings(), http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)))


def test_extract_json_variants():
    assert extract_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert extract_json('<think>хм {нет}</think>Вот: {"a": 2} готово') == {"a": 2}
    with pytest.raises(ValueError):
        extract_json("ничего")


async def test_valid_reply_streams_tokens_and_sends_schema():
    requests: list[dict] = []
    llm = make_llm(['{"notes": [{"story_id": "US-001", "problem": "нет теста"}]}'], requests)
    tokens: list[str] = []
    out = await llm.complete_json("critic", "данные", CriticOut, on_token=lambda t, kind: tokens.append(t))
    assert out.notes[0].story_id == "US-001"
    assert "".join(tokens).startswith('{"notes"')
    assert requests[0]["response_format"]["type"] == "json_schema"
    assert requests[0]["stream"] is True
    assert "JSON-схеме" in requests[0]["messages"][0]["content"]


async def test_invalid_reply_is_retried_with_error_text():
    requests: list[dict] = []
    llm = make_llm(['{"notes": [{"story": 1}]}', '{"notes": []}'], requests)
    out = await llm.complete_json("critic", "данные", CriticOut)
    assert out.notes == []
    assert len(requests) == 2
    assert "не прошёл проверку" in requests[1]["messages"][-1]["content"]


async def test_empty_reply_is_not_sent_back_as_assistant_message():
    requests: list[dict] = []
    llm = make_llm(["", '{"notes": []}'], requests)
    out = await llm.complete_json("critic", "данные", CriticOut)
    assert out.notes == []
    second = requests[1]["messages"]
    assert [m["role"] for m in second] == ["system", "user", "user"]
    assert all(m["content"] for m in second)


async def test_retries_are_reported_with_reason():
    requests: list[dict] = []
    llm = make_llm(["", '{"notes": [{"story": 1}]}', '{"notes": []}'], requests)
    retries: list[tuple[int, str]] = []
    await llm.complete_json("critic", "данные", CriticOut, on_retry=lambda n, reason: retries.append((n, reason)))
    assert [n for n, _ in retries] == [2, 3]
    assert "пустой ответ" in retries[0][1]
    assert "story_id" in retries[1][1]


async def test_gives_up_after_three_attempts():
    requests: list[dict] = []
    llm = make_llm(["мусор"] * 3, requests)
    with pytest.raises(LLMError):
        await llm.complete_json("critic", "данные", CriticOut)
    assert len(requests) == 3
