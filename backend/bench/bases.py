"""Основы для специальных проблем: итоговые результаты записанных прогонов как состояние после узла tasks."""

import json
import sqlite3

from app.config import get_settings
from app.demos import load_demo
from app.schemas import Decomposition
from app.sources import parse_inputs


def load_result(run_id: str) -> tuple[Decomposition, str]:
    db = sqlite3.connect(get_settings().data_dir / "app.db")
    row = db.execute("SELECT result, demo_id FROM runs WHERE id = ?", (run_id,)).fetchone()
    if row is None or row[0] is None:
        raise SystemExit(f"Нет результата прогона {run_id} в {get_settings().data_dir / 'app.db'}")
    return Decomposition.model_validate(json.loads(row[0])), row[1] or "boutique-delivery"


def base_state(run_id: str) -> dict:
    """Состояние графа, каким оно было бы после генерации задач. Источники — полные, из демо."""
    result, demo_id = load_result(run_id)
    demo = load_demo(demo_id)
    sources = parse_inputs(demo.epic_text, demo.files)
    return {
        "title": result.epic.title, "epic_text": result.epic.text, "files": [], "skip_questions": True,
        "sources": [s.model_dump() for s in sources],
        "language": result.target_language.model_dump(),
        "requirements": [r.model_dump() for r in result.requirements],
        "questions": [q.model_dump() for q in result.questions],
        "gaps": [g.model_dump() for g in result.gaps],
        "assumptions": list(result.assumptions),
        "stories": [s.model_dump() for s in result.stories],
        "issues": [], "coverage": {}, "critic_round": 0, "redo": {}, "redone": [], "findings": [],
        "review_skipped": [],
    }
