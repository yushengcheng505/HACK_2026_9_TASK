from langgraph.checkpoint.memory import InMemorySaver

from app.architecture import plan_problems
from app.graph import build_graph
from app.schemas import ArchitectureOut, Decomposition, Requirement, Source
from tests.fake_llm import FakeLLM, default_replies
from tests.test_graph import demo_input, run

OPS = [Source(id=f"PROTO:{op}", kind="proto_rpc", file="x.proto", title=op, text=op)
       for op in ("CourierService.CreateShipment", "CourierService.CalculateRate", "ShippingService.ShipOrder")]


def plan(**overrides) -> ArchitectureOut:
    base = default_replies()["architect"]("")
    return ArchitectureOut.model_validate(base | overrides)


STORIES = ["US-001", "US-002"]


def test_plan_problems_catch_seams():
    reqs = [Requirement(id="REQ-001", type="integration", text="t",
                        source_refs=["PROTO:CourierService.CreateShipment", "PROTO:CourierService.CalculateRate"])]
    assert plan_problems(plan(), OPS, reqs, STORIES) == []

    calls = plan().model_dump()["external_calls"]
    two_owners = plan(external_calls=calls + [{**calls[0], "service": "checkoutservice"}])
    assert any("несколько вызывающих" in p for p in plan_problems(two_owners, OPS, reqs, STORIES))

    missing = plan(external_calls=calls[:1])
    assert any("CalculateRate" in p and "кто его вызывает" in p for p in plan_problems(missing, OPS, reqs, STORIES))

    invented = plan(links=[{"caller": "checkoutservice", "callee": "shippingservice",
                            "method": "PROTO:ShippingService.Teleport", "new": False, "purpose": "p"}])
    assert any("Teleport" in p for p in plan_problems(invented, OPS, reqs, STORIES))
    assert plan_problems(plan(links=[{"caller": "checkoutservice", "callee": "nowhere", "method": "New",
                                      "new": True, "purpose": "p", "story": "US-001"}]), OPS, reqs, STORIES) == [
        "связь checkoutservice → nowhere: сервиса nowhere нет в списке services"]

    unassigned = plan(stores=[{"name": "shipments", "service": "checkoutservice", "data": "d"}])
    assert any("хранилище shipments" in p and "story" in p for p in plan_problems(unassigned, OPS, reqs, STORIES))
    wrong = plan(external_calls=[{**calls[0], "story": "US-009"}, calls[1]])
    assert any(p.startswith("PROTO:CourierService.CreateShipment: в story") for p in plan_problems(wrong, OPS, reqs, STORIES))


async def test_architect_is_off_by_default():
    llm = FakeLLM()
    graph = build_graph(InMemorySaver())
    config = {"configurable": {"thread_id": "a0", "llm": llm}}
    await run(graph, demo_input(skip_questions=True), config)
    result = Decomposition.model_validate((await graph.aget_state(config)).values["result"])
    assert result.architecture is None and not llm.calls["architect"]
    assert "Архитектура интеграции" not in llm.calls["tasks"][0]


async def test_architect_plan_reaches_tasks_and_reviewers():
    llm = FakeLLM()
    graph = build_graph(InMemorySaver())
    config = {"configurable": {"thread_id": "a1", "llm": llm, "architect": True}}
    events, _ = await run(graph, demo_input(skip_questions=True), config)
    result = Decomposition.model_validate((await graph.aget_state(config)).values["result"])

    assert len(llm.calls["architect"]) == 1
    assert result.architecture.external_calls[0].service == "shippingservice"
    planned = [e["data"] for e in events if e["type"] == "architecture_planned"]
    assert planned and planned[0]["problems"] == []
    line = ("PROTO:CourierService.CreateShipment → shippingservice; таймаут 3000 мс; повторять нельзя без проверки "
            "результата; клиент делает US-001, остальные истории только ссылаются")
    assert all(line in user for user in llm.calls["tasks"])
    assert all(line in user for user in llm.calls["reviewer"])
    tasks_prompt = llm.calls["tasks"][0]
    assert "ссылаются [источник: PROTO:CourierService.CreateShipment]" in tasks_prompt
    assert "CalculateRate → shippingservice" in tasks_prompt and "предположение Архитектора" in tasks_prompt
    order = [e["data"]["node"] for e in events if e["type"] == "node_started"]
    assert order.index("stories") < order.index("architect") < order.index("tasks")


async def test_architect_gets_one_chance_to_fix_plan():
    replies = default_replies()
    good = replies["architect"]
    replies["architect"] = lambda user: good(user) if "Ошибки плана" in user else good(user) | {"external_calls": []}
    llm = FakeLLM(replies)
    graph = build_graph(InMemorySaver())
    config = {"configurable": {"thread_id": "a2", "llm": llm, "architect": True}}
    events, _ = await run(graph, demo_input(skip_questions=True), config)
    assert len(llm.calls["architect"]) == 2
    assert "кто его вызывает" in llm.calls["architect"][1]
    planned = [e["data"] for e in events if e["type"] == "architecture_planned"]
    assert planned[0]["problems"] == [] and any("кто его вызывает" in p for p in planned[0]["first_problems"])


def test_ground_drops_unverified_quotes():
    from app.architecture import ground
    p = plan(external_calls=[{**plan().model_dump()["external_calls"][0],
                              "basis": [{"source_id": "PROTO:CourierService.CreateShipment", "quote": "выдуманная цитата"}]}])
    assert ground(p, OPS).external_calls[0].basis == []
