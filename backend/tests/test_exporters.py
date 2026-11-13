import io
import json

import pytest
from docx import Document
from langgraph.checkpoint.memory import InMemorySaver
from openpyxl import load_workbook

from app.exporters import STORY_COLUMNS, STORY_SHEET, to_docx, to_json, to_xlsx
from app.graph import build_graph
from app.schemas import Decomposition
from tests.fake_llm import FakeLLM
from tests.test_graph import demo_input


@pytest.fixture
async def result() -> Decomposition:
    graph = build_graph(InMemorySaver())
    config = {"configurable": {"thread_id": "exp", "llm": FakeLLM()}}
    await graph.ainvoke(demo_input(skip_questions=True), config)
    return Decomposition.model_validate((await graph.aget_state(config)).values["result"])


def test_json_has_stats(result):
    data = json.loads(to_json(result))
    assert data["stats"]["stories_count"] == 2
    assert data["stats"]["tasks_count"] == 4


def test_xlsx_contains_all_tasks(result):
    wb = load_workbook(io.BytesIO(to_xlsx(result)))
    assert wb.sheetnames == [STORY_SHEET, "Требования", "Покрытие", "Вопросы и пробелы", "Статистика"]
    ws = wb[STORY_SHEET]
    assert [c.value for c in ws[1]] == STORY_COLUMNS
    ids = {row[1] for row in ws.iter_rows(min_row=2, values_only=True)}
    assert {t.id for s in result.stories for t in s.tasks} | {s.id for s in result.stories} <= ids


def test_docx_contains_stories(result):
    doc = Document(io.BytesIO(to_docx(result)))
    headings = [p.text for p in doc.paragraphs if p.style.name.startswith("Heading")]
    for story in result.stories:
        assert f"{story.id}. {story.title}" in headings
    assert "Пробелы и противоречия" in headings
    assert any("ОТК" in t.rows[0].cells[0].text for t in doc.tables)
