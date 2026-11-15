import asyncio
import re
import time
from typing import Literal, Protocol

import httpx
from pydantic import BaseModel

from app.config import Settings
from app.schemas import Decomposition, Story, Task


ATTEMPTS = 3
RETRY_STATUSES = {429, 502, 503, 504}


class TrackerError(RuntimeError):
    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


class PublishedIssue(BaseModel):
    local_id: str
    key: str
    url: str
    kind: Literal["epic", "story", "subtask"]
    action: Literal["created", "updated"]


class Publication(BaseModel):
    tracker: str = "jira"
    project: str
    label: str
    epic_key: str
    epic_url: str
    created: int
    updated: int
    stale: list[str] = []
    issues: list[PublishedIssue]
    published_at: float


class Tracker(Protocol):
    name: str

    async def publish(self, d: Decomposition, known: dict[str, str] | None = None) -> Publication: ...


def story_description(story: Story) -> str:
    return (story.description + "\n\nКритерии приёмки:\n"
            + "\n".join(f"* {criterion}" for criterion in story.acceptance_criteria)
            + "\n\nТребования: " + ", ".join(story.requirement_ids))


def task_description(task: Task) -> str:
    return (task.description + f"\n\nТип: {task.type}\n\nDefinition of Done:\n"
            + "\n".join(f"* {item}" for item in task.definition_of_done)
            + "\n\nТест-сценарии:\n"
            + "\n".join(f"* {test.name}: {test.input} → {test.expected}" for test in task.test_scenarios)
            + "\n\nТребования: " + ", ".join(task.requirement_ids)
            + "\n\nИсточники: " + ", ".join(task.source_refs))


def jql_string(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


class JiraTracker:
    name = "jira"

    def __init__(self, url: str, email: str, token: str, project: str,
                 transport: httpx.AsyncBaseTransport | None = None):
        self.url = url.rstrip("/")
        self.project = project
        self.auth = httpx.BasicAuth(email, token)
        self.transport = transport

    async def _request(self, client: httpx.AsyncClient, method: str, path: str, **kwargs) -> dict:
        """Разовые сбои сети и 429/5xx повторяются. Создание задачи (POST) после отправки не повторяется:
        Jira могла её уже создать — тогда повторная публикация найдёт задачу по метке, а не создаст дубль."""
        for attempt in range(1, ATTEMPTS + 1):
            try:
                response = await client.request(method, path, **kwargs)
            except httpx.HTTPError as exc:
                not_sent = isinstance(exc, (httpx.ConnectError, httpx.ConnectTimeout))
                if attempt < ATTEMPTS and (method != "POST" or not_sent):
                    await asyncio.sleep(attempt)
                    continue
                raise TrackerError(f"Jira: сеть недоступна ({type(exc).__name__}), повторите публикацию — "
                                   "уже созданные задачи обновятся, дублей не будет") from exc
            if response.status_code in RETRY_STATUSES and attempt < ATTEMPTS:
                retry_after = response.headers.get("Retry-After", "")
                await asyncio.sleep(int(retry_after) if retry_after.isdigit() else attempt)
                continue
            break
        if response.is_error:
            try:
                body = response.json()
                messages = body.get("errorMessages", [])
                errors = body.get("errors", {})
                detail = "; ".join([*messages, *(f"{key}: {value}" for key, value in errors.items())])
            except (ValueError, AttributeError, TypeError):
                detail = ""
            raise TrackerError(f"Jira {response.status_code}: {detail or response.text}", response.status_code)
        return response.json() if response.content else {}

    async def _issue_types(self, client: httpx.AsyncClient) -> dict[str, str]:
        types, start = [], 0
        while True:
            page = await self._request(client, "GET", f"/rest/api/2/issue/createmeta/{self.project}/issuetypes",
                                       params={"startAt": start})
            values = page.get("issueTypes", page.get("values", []))
            types.extend(values)
            start += len(values)
            if page.get("isLast") or not values or start >= page.get("total", start):
                break
        epic = next((t for t in types if t.get("hierarchyLevel") == 1), None)
        stories = [t for t in types if t.get("hierarchyLevel") == 0
                   and t["name"].casefold() not in ("bug", "ошибка")]
        story = next((t for t in stories if t["name"].casefold() in ("story", "история")),
                     stories[0] if stories else None)
        subtask = next((t for t in types if t.get("hierarchyLevel") == -1), None)
        if not all((epic, story, subtask)):
            raise TrackerError("Jira: в проекте нужны типы эпик, история и подзадача")
        return {"epic": epic["id"], "story": story["id"], "subtask": subtask["id"]}

    async def _existing(self, client: httpx.AsyncClient, label: str) -> list[dict]:
        issues = []
        params = {"jql": f"project = {jql_string(self.project)} AND labels = {jql_string(label)}",
                  "fields": "summary,issuetype"}
        while True:
            page = await self._request(client, "GET", "/rest/api/3/search/jql", params=params)
            issues.extend(page["issues"])
            if page.get("isLast"):
                return issues
            params["nextPageToken"] = page["nextPageToken"]

    async def publish(self, d: Decomposition, known: dict[str, str] | None = None) -> Publication:
        """known — ключи прошлой публикации этого запуска: поиск Jira видит новые задачи с задержкой."""
        async with httpx.AsyncClient(base_url=self.url, auth=self.auth, transport=self.transport,
                                     timeout=30.0) as client:
            types = await self._issue_types(client)
            existing = await self._existing(client, d.epic.label)
            by_id = dict(known or {})
            for issue in existing:
                if match := re.match(r"^\[([A-Z]+-?\d*)\]", issue["fields"]["summary"]):
                    by_id[match[1]] = issue["key"]
            issues = []

            async def upsert(local_id: str, title: str, description: str,
                             kind: Literal["epic", "story", "subtask"], parent: str | None = None) -> str:
                fields = {"summary": f"[{local_id}] {title}"[:255], "description": description,
                          "labels": [d.epic.label]}
                key, action = by_id.get(local_id), "updated"
                if key:
                    try:
                        await self._request(client, "PUT", f"/rest/api/2/issue/{key}", json={"fields": fields})
                    except TrackerError as exc:
                        if exc.status != 404:
                            raise
                        key = None
                if not key:
                    fields.update(project={"key": self.project}, issuetype={"id": types[kind]})
                    if parent:
                        fields["parent"] = {"key": parent}
                    result = await self._request(client, "POST", "/rest/api/2/issue", json={"fields": fields})
                    key, action = result["key"], "created"
                issues.append(PublishedIssue(local_id=local_id, key=key, url=f"{self.url}/browse/{key}",
                                             kind=kind, action=action))
                return key

            epic_key = await upsert("EPIC", d.epic.title, d.epic.text[:30000], "epic")
            for story in d.stories:
                story_key = await upsert(story.id, story.title, story_description(story), "story", epic_key)
                for task in story.tasks:
                    await upsert(task.id, task.title, task_description(task), "subtask", story_key)
            used_keys = {issue.key for issue in issues}
            return Publication(project=self.project, label=d.epic.label, epic_key=epic_key,
                               epic_url=f"{self.url}/browse/{epic_key}",
                               created=sum(issue.action == "created" for issue in issues),
                               updated=sum(issue.action == "updated" for issue in issues),
                               stale=[issue["key"] for issue in existing if issue["key"] not in used_keys],
                               issues=issues, published_at=time.time())


def tracker_from_settings(settings: Settings) -> Tracker | None:
    if not all((settings.jira_url, settings.jira_email, settings.jira_token, settings.jira_project)):
        return None
    return JiraTracker(settings.jira_url, settings.jira_email, settings.jira_token, settings.jira_project)
