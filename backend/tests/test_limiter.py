import asyncio

from app.limiter import MAX_CONCURRENCY, Limiter


def test_limiter_respects_limit_and_resizes():
    async def scenario():
        limiter = Limiter(2)
        active, peak = 0, []
        release = asyncio.Event()

        async def job():
            nonlocal active
            async with limiter:
                active += 1
                peak.append(active)
                await release.wait()
                active -= 1

        tasks = [asyncio.create_task(job()) for _ in range(6)]
        await asyncio.sleep(0.01)
        assert active == 2
        await limiter.set(5)
        await asyncio.sleep(0.01)
        assert active == 5
        release.set()
        await asyncio.gather(*tasks)
        assert max(peak) == 5 and limiter.active == 0

    asyncio.run(scenario())


def test_limiter_clamps():
    assert Limiter(0).limit == 1
    assert Limiter(1000).limit == MAX_CONCURRENCY
