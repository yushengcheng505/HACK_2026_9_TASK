"""Запуск графа в фоне: события из узлов сохраняются в SQLite и рассылаются подписчикам SSE."""

import asyncio
import logging
from typing import Any

from langgraph.types import Command

from app.limiter import Limiter
from app.llm import LLM
from app.prompts import prompt_snapshot
from app.store import Event, Store

log = logging.getLogger(__name__)


class Runner:
    def __init__(self, store: Store, graph, llm: LLM, concurrency: int = 1):
        self.store = store
        self.graph = graph
        self.llm = llm
        self.subscribers: dict[str, set[asyncio.Queue]] = {}
        self.tasks: dict[str, asyncio.Task] = {}
        self.pausing: set[str] = set()
        # Модель, выбранная для прогона при запуске; без выбора — серверная по умолчанию.
        self.llms: dict[str, LLM] = {}
        # Сколько запросов к модели прогон шлёт одновременно; меняется во время прогона.
        self.concurrency = concurrency
        self.limiters: dict[str, Limiter] = {}

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

    def start(self, run_id: str, payload: dict, llm: LLM | None = None) -> None:
        llm = self.llms[run_id] = llm or self.llm
        prompts = prompt_snapshot()
        self.store.save_prompts(prompts)
        self.store.update_run(run_id, model=llm.model,
                              prompt_versions={name: p.version for name, p in prompts.items()})
        self.publish(run_id, "run_started", {"run_id": run_id, "epic": {"title": payload["title"]},
                                             "model": llm.model, "concurrency": self.limiter(run_id).limit})
        self._spawn(run_id, payload)

    def resume(self, run_id: str, answers: dict[str, str], llm: LLM | None = None) -> None:
        self.llms[run_id] = llm or self.llms.get(run_id, self.llm)
        self.store.update_run(run_id, status="running")
        self._spawn(run_id, Command(resume=answers))

    def pause(self, run_id: str) -> bool:
        """Останавливает фоновую задачу. Граф сохраняет состояние после каждого шага — прерванный шаг
        при продолжении выполнится заново."""
        task = self.tasks.get(run_id)
        if task is None or task.done():
            return False
        self.pausing.add(run_id)
        task.cancel()
        return True

    def unpause(self, run_id: str, llm: LLM | None = None) -> None:
        self.llms[run_id] = llm or self.llms.get(run_id, self.llm)
        self.store.update_run(run_id, status="running")
        self.publish(run_id, "run_resumed", {"concurrency": self.limiter(run_id).limit})
        self._spawn(run_id, None)

    def limiter(self, run_id: str) -> Limiter:
        if run_id not in self.limiters:
            run = self.store.get_run(run_id) or {}
            self.limiters[run_id] = Limiter(run.get("concurrency") or self.concurrency)
        return self.limiters[run_id]

    async def set_concurrency(self, run_id: str, value: int) -> int:
        """Новый лимит действует сразу: идущие запросы доживают, следующие ждут по новому лимиту."""
        limiter = self.limiters.get(run_id)
        if limiter is not None:
            await limiter.set(value)
            value = limiter.limit
        self.store.update_run(run_id, concurrency=value)
        self.publish(run_id, "concurrency_changed", {"concurrency": value})
        return value

    def _spawn(self, run_id: str, payload: Any) -> None:
        self.tasks[run_id] = asyncio.create_task(self._drive(run_id, payload))

    async def _drive(self, run_id: str, payload: Any) -> None:
        config = {"configurable": {"thread_id": run_id, "llm": self.llms.get(run_id, self.llm),
                                   "limiter": self.limiter(run_id)}}
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
        except asyncio.CancelledError:
            if run_id not in self.pausing:
                raise
            self.pausing.discard(run_id)
            self.store.update_run(run_id, status="paused")
            self.publish(run_id, "run_paused", {})
        except Exception as e:  # граф упал — запуск помечается failed, ошибка уходит на фронт
            log.exception("run %s failed", run_id)
            self.store.update_run(run_id, status="failed", error=str(e))
            self.publish(run_id, "run_failed", {"error": str(e)})
        finally:
            self.tasks.pop(run_id, None)
            self.llms.pop(run_id, None)
            self.limiters.pop(run_id, None)
