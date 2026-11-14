import pytest
from pydantic import ValidationError

from app.schemas import Decomposition, TasksOut, epic_label


def test_decomposition_minimal():
    d = Decomposition.model_validate({"epic": {"title": "Т", "text": "x", "label": "Т_Autogenerate"}})
    assert d.stats.tasks_count == 0
    assert d.coverage.coverage_percent == 0.0


def test_tasks_out_rejects_unknown_type():
    with pytest.raises(ValidationError):
        TasksOut.model_validate({"tasks": [{"title": "a", "description": "b", "type": "magic"}]})


FINDING = {"kind": "duplicate", "severity": "high", "confidence": 90, "task_ids": ["TASK-001", "TASK-002"],
           "scenario": "одна работа дважды", "evidence": [{"where": "task", "ref": "TASK-001", "quote": "клиент CalculateRate"}]}


def test_finding_kinds_are_limited_per_role():
    from app.schemas import EditorFinding, ReviewerFinding

    with pytest.raises(ValidationError):
        ReviewerFinding.model_validate(FINDING)
    assert EditorFinding.model_validate(FINDING).kind == "duplicate"


def test_old_results_and_tasks_without_new_fields_are_valid():
    d = Decomposition.model_validate({"epic": {"title": "Т", "text": "x", "label": "Т_Autogenerate"}})
    assert d.findings == [] and d.review_skipped == []
    out = TasksOut.model_validate({"tasks": []})
    assert out.responses == []


def test_review_settings_defaults_and_flags(monkeypatch):
    from app.config import get_settings

    get_settings.cache_clear()
    try:
        monkeypatch.delenv("REVIEW_MODE", raising=False)
        monkeypatch.setenv("REVIEW_SKEPTIC", "off")
        monkeypatch.delenv("REVIEW_SIMPLIFIER", raising=False)
        s = get_settings()
        assert (s.review_mode, s.review_skeptic, s.review_simplifier) == ("review", False, True)
    finally:
        get_settings.cache_clear()


def test_epic_label_replaces_spaces():
    assert epic_label("Интеграция  со службой доставки") == "Интеграция_со_службой_доставки_Autogenerate"
