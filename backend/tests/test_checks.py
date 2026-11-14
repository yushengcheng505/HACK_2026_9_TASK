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


def test_op_mentioned_only_by_task_is_unused_and_needs_no_test():
    logging = task("TASK-003", title="Журнал вызовов", refs=["PROTO:Courier.Create", "PROTO:Courier.Label"])
    issues, cov = run_checks(SOURCES, REQS, [story([task("TASK-001"), logging])])
    assert "PROTO:Courier.Label" in cov.contract_ops_unused
    assert "PROTO:Courier.Label" not in cov.contract_ops_used
    assert "PROTO:Courier.Label" not in cov.ops_without_tests
    assert ("op_without_tests", "PROTO:Courier.Label") not in codes(issues)


def test_op_named_in_task_title_is_used():
    change = task("TASK-003", title="Добавить pickup_point_id в Courier.Label", refs=["PROTO:Courier.Label"])
    issues, cov = run_checks(SOURCES, REQS, [story([task("TASK-001"), change])])
    assert "PROTO:Courier.Label" in cov.contract_ops_used
    assert ("op_without_tests", "PROTO:Courier.Label") in codes(issues)


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


def dup_codes(*titles_types):
    stories = [Story(id=f"US-00{i}", title="Как покупатель, я хочу x, чтобы y", description="d",
                     acceptance_criteria=["a"], requirement_ids=["REQ-001"],
                     tasks=[task(f"TASK-00{i}", type=type_, title=title)])
               for i, (title, type_) in enumerate(titles_types, 1)]
    issues, _ = run_checks(SOURCES, REQS, stories)
    return [i for i in issues if i.code == "duplicate_task"]


def test_duplicate_across_stories_by_shared_operation():
    found = dup_codes(("Расширить shipping.proto и реализовать в shippingservice клиент CourierService.CalculateRate",
                       "backend"),
                      ("Реализовать вызов CourierService.CalculateRate в shippingservice с учётом способа доставки",
                       "integration"))
    assert [i.target_id for i in found] == ["TASK-002"]
    assert "TASK-001" in found[0].message and "US-001" in found[0].message


def test_duplicate_secret_setup():
    found = dup_codes(("Настроить секрет x-api-key, конфигурацию ретраев и алерт об инциденте", "devops"),
                      ("Настроить секрет x-api-key и параметры повторов отмены в Kubernetes", "devops"))
    assert [i.target_id for i in found] == ["TASK-002"]


def test_different_operations_are_not_duplicates():
    assert dup_codes(("Реализовать клиент CourierService.CalculateRate в shippingservice", "integration"),
                     ("Реализовать клиент CourierService.CreateShipment в shippingservice", "integration")) == []


def test_external_client_and_own_handler_of_same_method_are_not_duplicates():
    assert dup_codes(("Реализовать клиент CourierService.ListPickupPoints в shippingservice", "integration"),
                     ("Реализовать обработчик ShippingService.ListPickupPoints в shippingservice", "backend")) == []


def test_method_without_service_matches_qualified_method():
    found = dup_codes(("Написать интеграционный тест CalculateRate в shippingservice", "qa"),
                      ("Написать интеграционные тесты ShippingService.GetQuote → CourierService.CalculateRate", "qa"))
    assert [i.target_id for i in found] == ["TASK-002"]


def test_generic_rpc_word_does_not_make_duplicates():
    assert dup_codes(("Добавить RPC ShippingService.GetShipmentByOrder и реализовать его в shippingservice", "backend"),
                     ("Реализовать RPC ShippingService.CancelShipment и машину состояний отмены в shippingservice",
                      "backend")) == []


def test_same_operation_different_type_group_is_not_duplicate():
    assert dup_codes(("Реализовать клиент CourierService.CalculateRate в shippingservice", "integration"),
                     ("Написать интеграционный тест CourierService.CalculateRate в shippingservice", "qa")) == []


def test_status_and_events_endpoints_are_not_duplicates():
    assert dup_codes(("Написать интеграционные тесты опроса GET /v1/shipments/{shipment_id}/status", "qa"),
                     ("Написать интеграционные тесты опроса GET /v1/shipments/{shipment_id}/events", "qa")) == []


def test_story_format_accepts_i_want_that():
    title = "Как покупатель, я хочу, чтобы после оплаты отправление создавалось, чтобы заказ поехал"
    issues, _ = run_checks(SOURCES, REQS, [story([task("TASK-001")], title=title)])
    assert ("story_format", "US-001") not in codes(issues)


def test_story_format_requires_value_part():
    title = "Как покупатель, я хочу, чтобы отправление создавалось автоматически"
    issues, _ = run_checks(SOURCES, REQS, [story([task("TASK-001")], title=title)])
    assert ("story_format", "US-001") in codes(issues)


def test_stats():
    s = story([task("TASK-001"), task("TASK-002", type="qa")])
    stats = compute_stats(REQS, [s], [], [], ["допущение"], [])
    assert (stats.requirements_count, stats.stories_count, stats.tasks_count) == (2, 1, 2)
    assert stats.tasks_by_type == {"integration": 1, "qa": 1}
    assert stats.assumptions_count == 1
