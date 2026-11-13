from app.checks import compute_stats, run_checks
from app.schemas import Requirement, Source, Story, Task, TestScenario

SOURCES = [
    Source(id="EPIC-1", kind="epic", file="epic", title="e", text="e"),
    Source(id="PROTO:Courier.Create", kind="proto_rpc", file="c.proto", title="rpc", text="rpc"),
    Source(id="PROTO:Courier.Cancel", kind="proto_rpc", file="c.proto", title="rpc", text="rpc"),
    Source(id="PROTO:Courier.Label", kind="proto_rpc", file="c.proto", title="rpc", text="rpc"),
]
REQS = [
    Requirement(id="REQ-001", type="integration", text="создать", source_refs=["EPIC-1", "PROTO:Courier.Create"]),
    Requirement(id="REQ-002", type="integration", text="отменить", source_refs=["PROTO:Courier.Cancel"]),
]


def task(id, type="integration", reqs=("REQ-001",), refs=("PROTO:Courier.Create",), title=None, scenarios=()):
    return Task(id=id, title=title or f"Задача {id}", description="d", type=type,
                requirement_ids=list(reqs), source_refs=list(refs), test_scenarios=list(scenarios))


def story(tasks, title="Как покупатель, я хочу доставку, чтобы получить заказ", reqs=("REQ-001",)):
    return Story(id="US-001", title=title, description="d", acceptance_criteria=["если…, то…"],
                 requirement_ids=list(reqs), tasks=tasks)


def codes(issues):
    return {(i.code, i.target_id) for i in issues}


def test_invented_api_is_flagged():
    issues, cov = run_checks(SOURCES, REQS, [story([task("TASK-001", refs=["PROTO:Courier.Teleport"])])])
    assert ("unknown_source", "TASK-001") in codes(issues)
    assert cov.unknown_refs == ["TASK-001: PROTO:Courier.Teleport"]


def test_requirement_coverage():
    issues, cov = run_checks(SOURCES, REQS, [story([task("TASK-001")])])
    assert cov.uncovered_requirements == ["REQ-002"]
    assert cov.requirements_without_stories == ["REQ-002"]
    assert cov.coverage_percent == 50.0
    assert ("requirement_without_tasks", "REQ-002") in codes(issues)


def test_task_without_requirement():
    issues, cov = run_checks(SOURCES, REQS, [story([task("TASK-001", reqs=())])])
    assert ("task_without_requirement", "TASK-001") in codes(issues)
    assert cov.tasks_without_requirements == ["TASK-001"]


def test_contract_ops_used_unused_and_tests():
    impl = task("TASK-001")
    test = task("TASK-002", type="qa", title="Интеграционный тест Create",
                scenarios=[TestScenario(name="ok", input="Create", expected="id")])
    issues, cov = run_checks(SOURCES, REQS, [story([impl, test], reqs=("REQ-001", "REQ-002"))])
    assert cov.contract_ops_used == ["PROTO:Courier.Create", "PROTO:Courier.Cancel"]
    assert cov.ops_without_tasks == ["PROTO:Courier.Cancel"]
    assert cov.contract_ops_unused == ["PROTO:Courier.Label"]
    assert "PROTO:Courier.Create" not in cov.ops_without_tests
    assert "PROTO:Courier.Cancel" in cov.ops_without_tests
    assert ("op_without_tasks", "PROTO:Courier.Cancel") in codes(issues)


def test_every_op_lands_in_exactly_one_list():
    extra = task("TASK-003", refs=["PROTO:Courier.Label"])
    _, cov = run_checks(SOURCES, REQS, [story([task("TASK-001"), extra])])
    ops = [s.id for s in SOURCES if s.kind == "proto_rpc"]
    for op in ops:
        assert (op in cov.contract_ops_used) != (op in cov.contract_ops_unused), op
    assert "PROTO:Courier.Label" in cov.contract_ops_used


def test_used_op_without_test_task():
    _, cov = run_checks(SOURCES, REQS, [story([task("TASK-001")])])
    assert "PROTO:Courier.Create" in cov.ops_without_tests


def test_duplicates_format_and_qa_without_scenarios():
    tasks = [task("TASK-001", title="Создать таблицу shipments в PostgreSQL в shippingservice"),
             task("TASK-002", title="Создать в shippingservice хранилище PostgreSQL с таблицей shipments"),
             task("TASK-003", type="qa"),
             task("TASK-004", title="Реализовать клиент CancelShipment")]
    issues, _ = run_checks(SOURCES, REQS, [story(tasks, title="Сделать доставку")])
    found = codes(issues)
    assert ("duplicate_task", "TASK-002") in found
    assert ("duplicate_task", "TASK-004") not in found
    assert ("story_format", "US-001") in found
    assert ("qa_without_scenarios", "TASK-003") in found


def test_stats():
    s = story([task("TASK-001"), task("TASK-002", type="qa")])
    stats = compute_stats(REQS, [s], [], [], ["допущение"], [])
    assert (stats.requirements_count, stats.stories_count, stats.tasks_count) == (2, 1, 2)
    assert stats.tasks_by_type == {"integration": 1, "qa": 1}
    assert stats.assumptions_count == 1
