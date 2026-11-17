import base64
import json
import re
from dataclasses import replace

import httpx
import pytest

from app.config import get_settings
from app.schemas import Decomposition, Epic, Requirement, Story, Task, TestScenario
from app.tracker import JiraTracker, TrackerError, tracker_from_settings


class FakeJira:
    def __init__(self, page_size=100):
        self.issues = {}
        self.requests = []
        self.page_size = page_size
        self.search_lag = False

    def handler(self, request):
        self.requests.append(request)
        path = request.url.path
        if path == "/rest/api/2/issue/createmeta/KAN/issuetypes":
            types = [
                {"id": "10006", "name": "Эпик", "hierarchyLevel": 1, "subtask": False},
                {"id": "10010", "name": "Ошибка", "hierarchyLevel": 0, "subtask": False},
                {"id": "10008", "name": "Задание", "hierarchyLevel": 0, "subtask": False},
                {"id": "10009", "name": "История", "hierarchyLevel": 0, "subtask": False},
                {"id": "10007", "name": "Подзадача", "hierarchyLevel": -1, "subtask": True},
            ]
            start = int(request.url.params.get("startAt", "0"))
            return httpx.Response(200, json={"issueTypes": types[start:start + self.page_size],
                                           "startAt": start, "maxResults": self.page_size,
                                           "total": len(types), "isLast": start + self.page_size >= len(types)})
        if path == "/rest/api/3/search/jql":
            assert request.url.params["fields"] == "summary,issuetype"
            jql = request.url.params["jql"]
            assert 'project = "KAN"' in jql
            label = re.search(r'labels = "([^"]+)"', jql)[1]
            issues = [{"key": key, "fields": fields} for key, fields in self.issues.items()
                      if label in fields["labels"] and not self.search_lag]
            start = int(request.url.params.get("nextPageToken", "0"))
            end = start + self.page_size
            return httpx.Response(200, json={"issues": issues[start:end], "isLast": end >= len(issues),
                                           "nextPageToken": str(end)})
        if path == "/rest/api/2/issue" and request.method == "POST":
            fields = json.loads(request.content)["fields"]
            if fields["issuetype"]["id"] == "10007":
                assert fields["parent"]["key"] in self.issues
            key = f"KAN-{len(self.issues) + 1}"
            self.issues[key] = fields
            return httpx.Response(201, json={"key": key})
        if path.startswith("/rest/api/2/issue/") and request.method == "PUT":
            if path.rsplit("/", 1)[1] not in self.issues:
                return httpx.Response(404, json={"errorMessages": ["Issue does not exist"]})
            fields = json.loads(request.content)["fields"]
            assert set(fields) == {"summary", "description", "labels"}
            self.issues[path.rsplit("/", 1)[1]].update(fields)
            return httpx.Response(204)
        raise AssertionError(f"Неожиданный запрос: {request.method} {request.url}")


@pytest.fixture
def decomposition():
    return Decomposition(
        epic=Epic(title="Доставка курьером", text="Доставлять оплаченные заказы.",
                  label="Доставка_курьером_Autogenerate"),
        requirements=[Requirement(id=f"REQ-{i:03}", type="functional", text=f"Требование {i}") for i in (1, 2)],
        stories=[Story(
            id=f"US-{i:03}", title=f"История {i}", description=f"Описание истории {i}",
            acceptance_criteria=["Заказ доставлен"], requirement_ids=[f"REQ-{i:03}"],
            tasks=[Task(
                id=f"TASK-{n:03}", title=f"Задача {n}", description=f"Описание задачи {n}", type="backend",
                definition_of_done=["Тесты проходят"], requirement_ids=[f"REQ-{i:03}"], source_refs=["EPIC"],
                test_scenarios=[TestScenario(name="Доставка", input="Заказ оплачен", expected="Отправлен")],
            ) for n in (i * 2 - 1, i * 2)],
        ) for i in (1, 2)],
    )


def tracker(jira):
    return JiraTracker("https://jira.test/", "user@test", "secret-token", "KAN",
                       transport=httpx.MockTransport(jira.handler))


async def test_first_publish_creates_hierarchy(decomposition):
    jira = FakeJira()
    result = await tracker(jira).publish(decomposition)
    assert (result.created, result.updated) == (7, 0)
    assert result.project == "KAN" and result.label == "Доставка_курьером_Autogenerate"
    assert result.epic_key == "KAN-1" and result.epic_url == "https://jira.test/browse/KAN-1"
    assert result.published_at > 0
    by_id = {issue.local_id: issue for issue in result.issues}
    for story in decomposition.stories:
        fields = jira.issues[by_id[story.id].key]
        assert fields["parent"] == {"key": result.epic_key}
        assert fields["issuetype"] == {"id": "10009"}
        assert fields["description"] == (f"Описание истории {story.id[-1]}\n\nКритерии приёмки:\n"
                                         f"* Заказ доставлен\n\nТребования: {story.requirement_ids[0]}")
        for task in story.tasks:
            fields = jira.issues[by_id[task.id].key]
            assert fields["parent"] == {"key": by_id[story.id].key}
            assert fields["issuetype"] == {"id": "10007"}
            assert "Тип: backend" in fields["description"]
            assert "Definition of Done:\n* Тесты проходят" in fields["description"]
            assert "* Доставка: Заказ оплачен → Отправлен" in fields["description"]
            assert "Источники: EPIC" in fields["description"]
    assert jira.issues[result.epic_key]["issuetype"] == {"id": "10006"}
    assert all(f["labels"] == ["Доставка_курьером_Autogenerate"] for f in jira.issues.values())
    assert all(issue.action == "created" for issue in result.issues)
    assert {issue.kind for issue in result.issues} == {"epic", "story", "subtask"}
    assert jira.requests[0].headers["authorization"] == "Basic " + base64.b64encode(b"user@test:secret-token").decode()


async def test_republish_updates_without_duplicates(decomposition):
    jira = FakeJira(page_size=2)
    client = tracker(jira)
    await client.publish(decomposition)
    decomposition.stories[0].title = "Изменённая история"
    result = await client.publish(decomposition)
    assert (result.created, result.updated) == (0, 7)
    assert len(jira.issues) == 7
    assert jira.issues["KAN-2"]["summary"] == "[US-001] Изменённая история"
    assert all(issue.action == "updated" for issue in result.issues)


async def test_republish_uses_known_keys_while_search_lags(decomposition):
    jira = FakeJira()
    client = tracker(jira)
    first = await client.publish(decomposition)
    jira.search_lag = True
    result = await client.publish(decomposition, {i.local_id: i.key for i in first.issues})
    assert (result.created, result.updated) == (0, 7)
    assert len(jira.issues) == 7


async def test_known_key_deleted_in_jira_is_recreated(decomposition):
    jira = FakeJira()
    client = tracker(jira)
    first = await client.publish(decomposition)
    known = {i.local_id: i.key for i in first.issues}
    del jira.issues[known["TASK-004"]]
    result = await client.publish(decomposition, known)
    assert (result.created, result.updated) == (1, 6)
    assert len(jira.issues) == 7


async def test_removed_story_reported_as_stale(decomposition):
    jira = FakeJira()
    client = tracker(jira)
    await client.publish(decomposition)
    decomposition.stories.pop()
    result = await client.publish(decomposition)
    assert result.stale == ["KAN-5", "KAN-6", "KAN-7"]
    assert (result.created, result.updated) == (0, 4)
    assert len(jira.issues) == 7


@pytest.mark.parametrize("body,expected", [
    ({"errorMessages": ["bad token"]}, "bad token"),
    ({"errors": {"parent": "Нужен родитель"}}, "Нужен родитель"),
    (None, "Ошибка сервера"),
])
async def test_http_error_is_readable(decomposition, body, expected):
    def handler(request):
        return httpx.Response(401, json=body) if body else httpx.Response(401, text=expected)

    client = JiraTracker("https://jira.test", "user@test", "secret-token", "KAN",
                         transport=httpx.MockTransport(handler))
    with pytest.raises(TrackerError) as exc:
        await client.publish(decomposition)
    assert "401" in str(exc.value) and expected in str(exc.value)
    assert "secret-token" not in str(exc.value)


async def test_publish_truncates_jira_fields(decomposition):
    jira = FakeJira()
    decomposition.epic.title = "Э" * 300
    decomposition.epic.text = "Т" * 31000
    await tracker(jira).publish(decomposition)
    assert len(jira.issues["KAN-1"]["summary"]) == 255
    assert len(jira.issues["KAN-1"]["description"]) == 30000


async def test_network_error_is_wrapped(decomposition, no_sleep):
    def handler(request):
        raise httpx.ConnectError("connection failed", request=request)

    client = JiraTracker("https://jira.test", "user@test", "secret-token", "KAN",
                         transport=httpx.MockTransport(handler))
    with pytest.raises(TrackerError, match="ConnectError"):
        await client.publish(decomposition)


@pytest.fixture
def no_sleep(monkeypatch):
    waits = []

    async def sleep(seconds):
        waits.append(seconds)

    monkeypatch.setattr("app.tracker.asyncio.sleep", sleep)
    return waits


def flaky(jira, fail):
    """Первый запрос, на котором fail(request) вернёт исключение или ответ, падает один раз."""
    state = {"failed": False}

    def handler(request):
        if not state["failed"]:
            outcome = fail(request)
            if outcome is not None:
                state["failed"] = True
                if isinstance(outcome, Exception):
                    raise outcome
                return outcome
        return jira.handler(request)

    return handler


async def test_transient_network_error_is_retried(decomposition, no_sleep):
    jira = FakeJira()
    handler = flaky(jira, lambda r: httpx.ReadTimeout("timed out", request=r) if r.method == "PUT" else None)
    client = JiraTracker("https://jira.test", "user@test", "secret-token", "KAN", transport=httpx.MockTransport(handler))
    await tracker(jira).publish(decomposition)
    result = await client.publish(decomposition)
    assert (result.created, result.updated) == (0, 7)
    assert no_sleep


async def test_create_is_retried_only_when_request_was_not_sent(decomposition, no_sleep):
    jira = FakeJira()
    handler = flaky(jira, lambda r: httpx.ConnectError("refused", request=r) if r.method == "POST" else None)
    client = JiraTracker("https://jira.test", "user@test", "secret-token", "KAN", transport=httpx.MockTransport(handler))
    result = await client.publish(decomposition)
    assert result.created == 7 and len(jira.issues) == 7

    jira = FakeJira()
    handler = flaky(jira, lambda r: httpx.ReadTimeout("timed out", request=r) if r.method == "POST" else None)
    client = JiraTracker("https://jira.test", "user@test", "secret-token", "KAN", transport=httpx.MockTransport(handler))
    with pytest.raises(TrackerError, match="ReadTimeout") as exc:
        await client.publish(decomposition)
    assert "повторите публикацию" in str(exc.value)
    assert len(jira.issues) == 0


async def test_rate_limit_and_unavailable_are_retried(decomposition, no_sleep):
    jira = FakeJira()
    handler = flaky(jira, lambda r: httpx.Response(429, headers={"Retry-After": "3"}) if r.method == "POST" else None)
    client = JiraTracker("https://jira.test", "user@test", "secret-token", "KAN", transport=httpx.MockTransport(handler))
    assert (await client.publish(decomposition)).created == 7
    assert 3 in no_sleep


def test_tracker_from_settings_requires_all_fields():
    settings = replace(get_settings(), jira_url="https://jira.test", jira_email="user@test",
                       jira_token="secret-token", jira_project="KAN")
    assert isinstance(tracker_from_settings(settings), JiraTracker)
    for field in ("jira_url", "jira_email", "jira_token", "jira_project"):
        assert tracker_from_settings(replace(settings, **{field: ""})) is None
