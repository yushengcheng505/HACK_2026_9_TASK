import io

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook

from app.config import get_settings
from app.lab import AnalystItem, LabMatch, build_prompt, compare, parse_analyst_list, parse_analyst_xlsx, score
from app.main import create_app
from app.schemas import Decomposition
from tests.fake_llm import FakeLLM
from tests.test_api import wait_status


@pytest.fixture
def decomposition():
    return Decomposition.model_validate({
        "epic": {"title": "Доставка", "text": "Доставлять заказы", "label": "Доставка_Autogenerate"},
        "sources": [
            {"id": "PROTO:CourierService.CreateShipment", "kind": "proto_rpc", "file": "courier.proto",
             "title": "CreateShipment", "excerpt": "Создать отправление"},
            {"id": "PROTO:CourierService.CalculateRate", "kind": "proto_rpc", "file": "courier.proto",
             "title": "CalculateRate", "excerpt": "Рассчитать стоимость"},
            {"id": "DOC-1", "kind": "doc", "file": "guide.md", "title": "Описание", "excerpt": "Доставка"},
        ],
        "requirements": [
            {"id": "REQ-001", "type": "integration", "text": "Создавать отправление"},
            {"id": "REQ-002", "type": "functional", "text": "Рассчитывать стоимость"},
        ],
        "stories": [{"id": "US-001", "title": "Доставка", "description": "d", "tasks": [
            {"id": "TASK-001", "title": "Создать отправление", "description": "d", "type": "integration",
             "requirement_ids": ["REQ-001"], "source_refs": ["PROTO:CourierService.CreateShipment"]},
            {"id": "TASK-002", "title": "Проверить отправление", "description": "d", "type": "qa",
             "requirement_ids": ["REQ-001"], "source_refs": ["PROTO:CourierService.CreateShipment", "DOC-1"]},
            {"id": "TASK-003", "title": "Рассчитать стоимость", "description": "d", "type": "integration",
             "requirement_ids": ["REQ-002"], "source_refs": ["PROTO:CourierService.CalculateRate"]},
        ]}],
    })


def test_parse_markdown_reference():
    items = parse_analyst_list("# Эпик\n\n## История А\n- Первая\n- Вторая\n## История Б\n1. Третья")
    assert [item.model_dump() for item in items] == [
        {"id": "A-01", "story": "История А", "text": "Первая"},
        {"id": "A-02", "story": "История А", "text": "Вторая"},
        {"id": "A-03", "story": "История Б", "text": "Третья"},
    ]


def test_parse_plain_lines():
    assert [i.text for i in parse_analyst_list("Первая\n\nВторая\nТретья")] == ["Первая", "Вторая", "Третья"]


def test_parse_bullet_variants_ignores_prose_and_empty_items():
    items = parse_analyst_list("# Заголовок\nВведение\n## История\n* Первая\n• Вторая\n2) Третья\n- \n### Примечание")
    assert [i.text for i in items] == ["Первая", "Вторая", "Третья"]
    assert all(i.story == "История" for i in items)
    assert parse_analyst_list("# Только заголовок\n## История\n- ") == []


def xlsx_bytes():
    wb = Workbook()
    wb.active.append(["История", "Задача"])
    wb.active.append(["Доставка", "Создать отправление"])
    wb.active.append([None, None])
    wb.active.append(["Цена", "Рассчитать стоимость"])
    wb.create_sheet().append(["Не первый лист"])
    data = io.BytesIO()
    wb.save(data)
    return data.getvalue()


def test_parse_xlsx():
    items = parse_analyst_xlsx(xlsx_bytes())
    assert [i.id for i in items] == ["A-01", "A-02"]
    assert [i.text for i in items] == ["Доставка — Создать отправление", "Цена — Рассчитать стоимость"]


def test_demo_references_parse():
    paths = sorted(get_settings().demo_dir.glob("*/reference.md"))
    assert len(paths) == 4
    for path in paths:
        items = parse_analyst_list(path.read_text(encoding="utf-8"))
        assert len(items) >= 10, path
        assert all(i.story for i in items), path


def test_score_metrics(decomposition):
    items = parse_analyst_list("Отправление\nАдминка")
    match = LabMatch(analyst_id="A-01", task_id="TASK-001")
    result = score(decomposition, items, [match, match, LabMatch(analyst_id="A-01", task_id="TASK-999"),
                                          LabMatch(analyst_id="A-99", task_id="TASK-003")])
    assert result.matches == [match]
    assert result.missed_by_analyst == ["TASK-002", "TASK-003"]
    assert result.analyst_only == ["A-02"]
    assert result.requirements_missed == ["REQ-002"]
    assert result.contract_ops_missed == ["PROTO:CourierService.CalculateRate"]
    assert result.contract_tests_missed == ["PROTO:CourierService.CreateShipment"]
    assert result.coverage_percent == 50.0
    assert result.recommendations == [
        "Добавить в разбивку: REQ-002 «Рассчитывать стоимость» — у аналитика нет задач (у агента: TASK-003)",
        "Нет задачи на метод контракта PROTO:CourierService.CalculateRate",
        "Нет интеграционного теста на метод PROTO:CourierService.CreateShipment (у агента: TASK-002)",
        "Уточнить: «Админка» — не следует из требований эпика",
    ]


def test_score_many_to_many_and_coverage_denominator(decomposition):
    decomposition.requirements.append(decomposition.requirements[0].model_copy(update={"id": "REQ-003"}))
    items = parse_analyst_list("Доставка\nПроверки")
    result = score(decomposition, items, [LabMatch(analyst_id=a, task_id=t) for a, t in [
        ("A-01", "TASK-001"), ("A-01", "TASK-003"), ("A-02", "TASK-001"), ("A-02", "TASK-002"),
    ]])
    assert len(result.matches) == 4
    assert result.coverage_percent == 100.0
    assert result.missed_by_analyst == result.analyst_only == result.contract_ops_missed == []
    assert result.contract_tests_missed == []


def test_score_empty_decomposition():
    d = Decomposition(epic={"title": "x", "text": "x", "label": "x"})
    assert score(d, [], []).coverage_percent == 0.0


@pytest.mark.asyncio
async def test_compare_builds_prompt_and_scores(decomposition):
    llm = FakeLLM()
    items = [AnalystItem(id="A-01", story="Доставка", text="Создать отправление")]
    prompt = build_prompt(decomposition, items)
    assert "TASK-001 [integration] Создать отправление — REQ-001" in prompt
    assert "A-01 [Доставка] Создать отправление" in prompt
    result = await compare(llm, decomposition, items)
    assert result.matches == [LabMatch(analyst_id="A-01", task_id="TASK-001")]
    assert result.coverage_percent == 50.0


def test_lab_endpoint():
    with TestClient(create_app(llm=FakeLLM())) as client:
        assert client.post("/api/runs/missing/lab", data={"text": "Задача"}).status_code == 404
        run_id = client.post("/api/demos/boutique-delivery/run", json={}).json()["run_id"]
        wait_status(client, run_id, ("waiting_answers",))
        assert client.post(f"/api/runs/{run_id}/lab", data={"text": "Задача"}).status_code == 409
        client.post(f"/api/runs/{run_id}/answers", json={"answers": {}})
        run = wait_status(client, run_id, ("done", "failed"))
        assert run["status"] == "done"
        first_task_id = run["result"]["stories"][0]["tasks"][0]["id"]
        response = client.post(f"/api/runs/{run_id}/lab", data={"text": "Создать отправление\nАдминка"})
        assert response.status_code == 200, response.text
        result = response.json()
        assert result["matches"] == [{"analyst_id": "A-01", "task_id": first_task_id, "note": ""}]
        assert result["coverage_percent"] == 50.0
        empty = client.post(f"/api/runs/{run_id}/lab")
        assert empty.status_code == 422 and empty.json()["detail"] == "Список аналитика пуст"
        assert client.get("/api/demos/boutique-delivery/reference").json()["text"].startswith("# ")
        assert client.get("/api/demos/missing/reference").status_code == 404
        assert any(p["name"] == "lab" for p in client.get("/api/prompts").json())
        for name, content in [("analyst.md", "## Доставка\n- Отправление".encode()), ("analyst.xlsx", xlsx_bytes())]:
            uploaded = client.post(f"/api/runs/{run_id}/lab", files={"file": (name, content)})
            assert uploaded.status_code == 200, uploaded.text
            assert uploaded.json()["matches"]


def test_lab_rejects_invalid_uploads():
    with TestClient(create_app(llm=FakeLLM())) as client:
        run_id = client.post("/api/demos/boutique-delivery/run", json={"skip_questions": True}).json()["run_id"]
        assert wait_status(client, run_id, ("done", "failed"))["status"] == "done"
        for name in ("bad.xlsx", "bad.txt"):
            response = client.post(f"/api/runs/{run_id}/lab", files={"file": (name, b"\xffbroken")})
            assert response.status_code == 422
            assert isinstance(response.json()["detail"], str)
