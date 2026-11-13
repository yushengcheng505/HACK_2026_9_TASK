"""Запуск графа в фоне: события из узлов сохраняются в SQLite и рассылаются подписчикам SSE."""

import asyncio
import logging
from typing import Any

from langgraph.types import Command

from app.llm import LLM
from app.prompts import prompt_snapshot
from app.store import Event, Store

log = logging.getLogger(__name__)


class Runner:
    def __init__(self, store: Store, graph, llm: LLM):
        self.store = store
        self.graph = graph
        self.llm = llm
        self.subscribers: dict[str, set[asyncio.Queue]] = {}
        self.tasks: dict[str, asyncio.Task] = {}

    def publish(self, run_id: str, type: str, data: dict) -> Event:
        event = self.store.add_event(run_id, type, data)
        for queue in self.subscribers.get(run_id, ()):
            queue.put_nowait(event)
        return event

    def subscribe(self, run_id: str) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue()
        self.subscribers.setdefault(run_id, set()).add(queue)
        return queue

    def unsubscribe(self, run_id: str, queue: asyncio.Queue) -> None:
        self.subscribers.get(run_id, set()).discard(queue)

    def start(self, run_id: str, payload: dict) -> None:
        prompts = prompt_snapshot()
        self.store.save_prompts(prompts)
        self.store.update_run(run_id, model=self.llm.model,
                              prompt_versions={name: p.version for name, p in prompts.items()})
        self.publish(run_id, "run_started", {"run_id": run_id, "epic": {"title": payload["title"]},
                                             "model": self.llm.model})
        self._spawn(run_id, payload)

    def resume(self, run_id: str, answers: dict[str, str]) -> None:
        self.store.update_run(run_id, status="running")
        self._spawn(run_id, Command(resume=answers))

    def _spawn(self, run_id: str, payload: Any) -> None:
        self.tasks[run_id] = asyncio.create_task(self._drive(run_id, payload))

    async def _drive(self, run_id: str, payload: Any) -> None:
        config = {"configurable": {"thread_id": run_id, "llm": self.llm}}
        finished: dict | None = None
        interrupted: list = []
        try:
            async for mode, chunk in self.graph.astream(payload, config, stream_mode=["custom", "updates"]):
                if mode == "custom":
                    if chunk["type"] == "run_finished":
                        finished = chunk["data"]
                    else:
                        self.publish(run_id, chunk["type"], chunk["data"])
                elif "__interrupt__" in chunk:
                    interrupted.extend(chunk["__interrupt__"])
            if interrupted:
                questions = interrupted[0].value["questions"]
                self.store.update_run(run_id, status="waiting_answers", questions=questions)
                self.publish(run_id, "waiting_answers", {"questions": questions})
                return
            state = (await self.graph.aget_state(config)).values
            self.store.update_run(run_id, status="done", result=state["result"],
                                  questions=state.get("questions", []))
            self.publish(run_id, "run_finished", finished or {})
        except Exception as e:  # граф упал — запуск помечается failed, ошибка уходит на фронт
            log.exception("run %s failed", run_id)
            self.store.update_run(run_id, status="failed", error=str(e))
            self.publish(run_id, "run_failed", {"error": str(e)})
        finally:
            self.tasks.pop(run_id, None)
