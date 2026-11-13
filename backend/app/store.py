"""SQLite: запуски, события (для SSE и проигрывания), снимки промптов."""

import json
import sqlite3
import threading
import time
from dataclasses import dataclass
from pathlib import Path

from app.prompts import Prompt

SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL,
    origin TEXT NOT NULL,
    demo_id TEXT,
    skip_questions INTEGER NOT NULL DEFAULT 0,
    questions TEXT,
    result TEXT,
    error TEXT,
    model TEXT,
    prompt_versions TEXT
);
CREATE TABLE IF NOT EXISTS events (
    run_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    ts REAL NOT NULL,
    type TEXT NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (run_id, seq)
);
CREATE TABLE IF NOT EXISTS prompt_versions (
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at REAL NOT NULL,
    PRIMARY KEY (name, version)
);
"""
JSON_FIELDS = ("questions", "result", "prompt_versions")
TERMINAL = ("done", "failed")


@dataclass
class Event:
    run_id: str
    seq: int
    ts: float
    type: str
    data: dict

    def as_dict(self) -> dict:
        return {"run_id": self.run_id, "seq": self.seq, "ts": self.ts, "type": self.type, "data": self.data}


class Store:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.executescript(SCHEMA)
        self.lock = threading.Lock()

    def create_run(self, id: str, title: str, origin: str, demo_id: str | None, skip_questions: bool) -> None:
        now = time.time()
        with self.lock, self.db:
            self.db.execute(
                "INSERT INTO runs (id, created_at, updated_at, title, status, origin, demo_id, skip_questions)"
                " VALUES (?, ?, ?, ?, 'running', ?, ?, ?)",
                (id, now, now, title, origin, demo_id, int(skip_questions)),
            )

    def update_run(self, id: str, **fields) -> None:
        fields = {k: json.dumps(v, ensure_ascii=False) if k in JSON_FIELDS and v is not None else v
                  for k, v in fields.items()}
        fields["updated_at"] = time.time()
        sets = ", ".join(f"{k} = ?" for k in fields)
        with self.lock, self.db:
            self.db.execute(f"UPDATE runs SET {sets} WHERE id = ?", (*fields.values(), id))

    def get_run(self, id: str) -> dict | None:
        with self.lock:
            row = self.db.execute("SELECT * FROM runs WHERE id = ?", (id,)).fetchone()
        return self._row(row) if row else None

    def list_runs(self, limit: int = 100) -> list[dict]:
        with self.lock:
            rows = self.db.execute("SELECT * FROM runs ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
        return [self._row(r) for r in rows]

    def fail_interrupted(self) -> None:
        with self.lock, self.db:
            self.db.execute("UPDATE runs SET status = 'failed', error = 'Сервер перезапущен во время выполнения'"
                            " WHERE status = 'running'")

    def add_event(self, run_id: str, type: str, data: dict) -> Event:
        ts = time.time()
        with self.lock, self.db:
            seq = self.db.execute("SELECT COALESCE(MAX(seq), 0) + 1 FROM events WHERE run_id = ?",
                                  (run_id,)).fetchone()[0]
            self.db.execute("INSERT INTO events (run_id, seq, ts, type, data) VALUES (?, ?, ?, ?, ?)",
                            (run_id, seq, ts, type, json.dumps(data, ensure_ascii=False)))
        return Event(run_id, seq, ts, type, data)

    def events(self, run_id: str, after_seq: int = 0) -> list[Event]:
        with self.lock:
            rows = self.db.execute("SELECT * FROM events WHERE run_id = ? AND seq > ? ORDER BY seq",
                                   (run_id, after_seq)).fetchall()
        return [Event(r["run_id"], r["seq"], r["ts"], r["type"], json.loads(r["data"])) for r in rows]

    def save_prompts(self, prompts: dict[str, Prompt]) -> None:
        with self.lock, self.db:
            self.db.executemany(
                "INSERT OR IGNORE INTO prompt_versions (name, version, content, created_at) VALUES (?, ?, ?, ?)",
                [(p.name, p.version, p.text, time.time()) for p in prompts.values()],
            )

    @staticmethod
    def _row(row: sqlite3.Row) -> dict:
        d = dict(row)
        for k in JSON_FIELDS:
            if d.get(k):
                d[k] = json.loads(d[k])
        d["skip_questions"] = bool(d["skip_questions"])
        return d
