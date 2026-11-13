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


def test_epic_label_replaces_spaces():
    assert epic_label("Интеграция  со службой доставки") == "Интеграция_со_службой_доставки_Autogenerate"
