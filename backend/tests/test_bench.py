import re

from bench.harness import VARIANTS, run_graph
from bench.mutations import Mutation, strip_matching
from bench.score import score_e2e, score_review
from tests.fake_llm import FakeLLM
from tests.test_graph import demo_input


def test_strip_matching_drops_only_matching_sentences():
    text = "Вызывать CalculateRate. Таймаут 2 секунды; потом fallback. Логировать ответ."
    assert strip_matching(text, re.compile(r"тайм-?аут", re.I)) == "Вызывать CalculateRate. Логировать ответ."


def test_negated_mention_does_not_count_as_defect():
    from bench.mutations import mentioned

    assert mentioned("Передавать поле courier_priority=HIGH. Логировать ответ.", "courier_priority")
    assert not mentioned("Поля courier_priority в CreateShipmentRequest нет; приоритет не передаётся.",
                         "courier_priority")
    assert not mentioned("Журнал пишется в stdout без Kafka и Schema Registry.", "kafka")
    assert mentioned("Опрос каждые 30 секунд.\nНе чаще раза в 15 минут.", "30 секунд")


async def test_rate_limit_is_waited_out_and_counted():
    import httpx
    from openai import RateLimitError

    from app.schemas import CriticOut
    from bench.harness import MeteredLLM

    class Saturated:
        model, attempts = "m", 0

        async def complete_json(self, prompt_name, user, schema, on_token=None, on_retry=None):
            self.attempts += 1
            if self.attempts < 3:
                raise RateLimitError("admission capacity is saturated", body=None,
                                     response=httpx.Response(429, request=httpx.Request("POST", "http://llm.test")))
            return CriticOut()

    llm = MeteredLLM(Saturated(), backoff=0)
    assert await llm.complete_json("critic", "данные", CriticOut) == CriticOut()
    assert llm.calls[0]["rate_limited"] == 2 and llm.calls[0]["ok"]


async def test_full_run_is_metered_and_scored():
    run = await run_graph(FakeLLM(), VARIANTS["review"], payload=demo_input(skip_questions=True))
    assert run["error"] is None and run["result"]
    roles = {c["prompt"] for c in run["calls"]}
    assert {"requirements", "reviewer", "skeptic", "tasks"} <= roles
    score = score_e2e(run)
    assert score["tasks"] == 4 and score["calls"] == len(run["calls"])


async def test_review_only_run_scores_defect_from_start_state():
    full = await run_graph(FakeLLM(), VARIANTS["critic"], payload=demo_input(skip_questions=True))
    state = {k: v for k, v in full["result"].items() if k in ("requirements", "questions", "gaps", "assumptions")}
    graph_state = {**state, "title": "t", "epic_text": "e", "files": [], "skip_questions": True,
                   "language": full["result"]["target_language"], "stories": full["result"]["stories"],
                   "sources": full["result"]["sources"], "critic_round": 0, "redo": {}, "redone": [],
                   "findings": [], "review_skipped": []}
    for s in graph_state["sources"]:
        s["text"] = s.pop("excerpt")
    ghost = Mutation("M0", "задача-призрак", "US-001", ["призрак"], ["unneeded_task"], ["TASK-999"],
                     lambda stories: True)
    run = await run_graph(FakeLLM(), VARIANTS["review"], base_state=graph_state)
    score = score_review(run, [ghost], graph_state)
    assert run["error"] is None
    assert score["defects"]["M0"] == {"raised": False, "detected": False, "fixed": True, "verdicts": []}
    assert score["tasks_before"] == 4 and "reviewer" in score["calls_by_role"]
