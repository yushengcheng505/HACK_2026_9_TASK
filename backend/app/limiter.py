"""Ограничение одновременных запросов к модели, которое можно менять во время прогона."""

import asyncio

MIN_CONCURRENCY = 1
MAX_CONCURRENCY = 32


class Limiter:
    """Как asyncio.Semaphore, но лимит меняется на лету: уже идущие запросы доживают,
    новые ждут, пока активных станет меньше лимита."""

    def __init__(self, limit: int):
        self.limit = clamp(limit)
        self.active = 0
        self._cond = asyncio.Condition()

    async def set(self, limit: int) -> None:
        async with self._cond:
            self.limit = clamp(limit)
            self._cond.notify_all()

    async def __aenter__(self) -> None:
        async with self._cond:
            await self._cond.wait_for(lambda: self.active < self.limit)
            self.active += 1

    async def __aexit__(self, *exc) -> None:
        async with self._cond:
            self.active -= 1
            self._cond.notify_all()


def clamp(limit: int) -> int:
    return max(MIN_CONCURRENCY, min(MAX_CONCURRENCY, int(limit)))
