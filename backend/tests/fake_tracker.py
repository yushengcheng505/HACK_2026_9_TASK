import time

from app.schemas import Decomposition
from app.tracker import Publication, PublishedIssue


class FakeTracker:
    name = "fake"

    def __init__(self):
        self.calls = 0

    async def publish(self, d: Decomposition, known: dict[str, str] | None = None) -> Publication:
        self.calls += 1
        self.known = known
        return Publication(
            tracker=self.name, project="KAN", label=d.epic.label, epic_key="KAN-1",
            epic_url="https://jira.test/browse/KAN-1", created=1, updated=0,
            issues=[PublishedIssue(local_id="EPIC", key="KAN-1", url="https://jira.test/browse/KAN-1",
                                   kind="epic", action="created")], published_at=time.time(),
        )
