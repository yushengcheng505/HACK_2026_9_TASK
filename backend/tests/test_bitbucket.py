import hashlib
import hmac
import json
import time
from dataclasses import replace
from pathlib import Path

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.bitbucket import BitbucketClient, epic_folders, parse_push, verify_signature
from app.config import get_settings
from app.demos import split_title
from app.main import create_app
from app.tracker import TrackerError
from tests.fake_llm import FakeLLM
from tests.fake_tracker import FakeTracker
from tests.test_api import GatedLLM, wait_status

PUSH = json.loads((Path(__file__).parent / "fixtures/bitbucket_push.json").read_text())
DEMO = Path(__file__).resolve().parents[2] / "demo/boutique-delivery"
FOLDER = "epics/courier"
PREFIX = "/2.0/repositories/team/synaps-epics"


class FakeBitbucket:
    def __init__(self, paths=None):
        self.paths = paths if paths is not None else [f"{FOLDER}/epic.md", f"{FOLDER}/contracts/courier.proto", "README.md"]
        self.files = {"epic.md": (DEMO / "epic.md").read_bytes(), "demo.json": (DEMO / "demo.json").read_bytes()}
        meta = json.loads(self.files["demo.json"])
        for paths in meta["files"].values():
            self.files.update({path: (DEMO / path).read_bytes() for path in paths})
        self.files.update({"docs/product/ignored.PDF": b"%PDF", "README.md": b"ignored"})
        self.requests = []

    def handler(self, request):
        self.requests.append(request)
        assert request.url.host == "api.bitbucket.org"
        path = request.url.path
        if path.startswith(f"{PREFIX}/diffstat/"):
            if request.url.params.get("page") == "2":
                return httpx.Response(200, json={"values": [{"old": {"path": "epics/removed/epic.md"}, "new": None}]})
            values = [{"new": {"path": p}, "old": {"path": p}} for p in self.paths]
            return httpx.Response(200, json={"values": values,
                                           "next": f"https://api.bitbucket.org{path}?page=2"})
        if path == f"{PREFIX}/src/aaa111/{FOLDER}/":
            assert request.url.params["max_depth"] == "3"
            assert request.url.params["pagelen"] == "100"
            names = list(self.files)
            page = int(request.url.params.get("page", "1"))
            selected = names[:2] if page == 1 else names[2:]
            data = {"values": [{"type": "commit_directory", "path": f"{FOLDER}/contracts"}]
                              + [{"type": "commit_file", "path": f"{FOLDER}/{p}"} for p in selected]}
            if page == 1:
                data["next"] = f"https://api.bitbucket.org{path}?max_depth=3&pagelen=100&page=2"
            return httpx.Response(200, json=data)
        file_prefix = f"{PREFIX}/src/aaa111/{FOLDER}/"
        if path.startswith(file_prefix) and path[len(file_prefix):] in self.files:
            return httpx.Response(200, content=self.files[path[len(file_prefix):]])
        return httpx.Response(404, json={"error": {"message": "not found"}})

    def client(self, **kwargs):
        return BitbucketClient(transport=httpx.MockTransport(self.handler), **kwargs)


def test_verify_signature():
    body = b'{"push": {}}\n'
    header = "sha256=" + hmac.new(b"secret", body, hashlib.sha256).hexdigest()
    assert verify_signature("secret", body, header)
    assert not verify_signature("secret", body + b" ", header)
    assert not verify_signature("secret", body, "sha256=bad")
    assert not verify_signature("secret", body, "sha1=bad")
    assert not verify_signature("secret", body, "sha256=é")
    assert not verify_signature("secret", body, None)
    assert not verify_signature("secret", body, "")


def test_parse_push_skips_deleted_branches():
    assert parse_push(PUSH) == [("team/synaps-epics", "aaa111", "bbb222")]
    payload = {"repository": PUSH["repository"], "push": {"changes": [
        {"new": None, "old": PUSH["push"]["changes"][0]["old"]},
        {"new": PUSH["push"]["changes"][0]["new"], "old": None},
    ]}}
    assert parse_push(payload) == [("team/synaps-epics", "aaa111", None)]
    assert parse_push({}) == []


def test_epic_folders():
    assert epic_folders(["epics/a/epic.md", "epics/a/contracts/x.proto", "README.md",
                         "epics/b/docs/product/p.md", "epics", "epics/a", "other/epics/c/epic.md"]) == ["epics/a", "epics/b"]


@pytest.mark.parametrize(("markdown", "expected"), [
    ("\n# Название\n\nТекст", ("Название", "Текст")),
    ("Текст без заголовка", (None, "Текст без заголовка")),
])
def test_split_title(markdown, expected):
    assert split_title(markdown) == expected


@pytest.mark.parametrize("old, suffix", [("bbb222", "aaa111..bbb222"), (None, "aaa111")])
async def test_changed_paths_paginates_and_includes_old_paths(old, suffix):
    fake = FakeBitbucket()
    paths = await fake.client().changed_paths("team/synaps-epics", "aaa111", old)
    assert paths == [f"{FOLDER}/epic.md", f"{FOLDER}/contracts/courier.proto", "README.md", "epics/removed/epic.md"]
    assert fake.requests[0].url.path == f"{PREFIX}/diffstat/{suffix}"
    assert len(fake.requests) == 2
    assert all("Authorization" not in r.headers for r in fake.requests)


async def test_load_epic_maps_roles():
    fake = FakeBitbucket()
    title, text, files = await fake.client(user="user", token="token").load_epic("team/synaps-epics", "aaa111", FOLDER)
    assert title == "Интеграция с курьерской службой «Курьер-Экспресс»"
    assert text and not text.startswith("# ")
    assert {f.role for f in files} == {"contracts", "external_docs", "product_docs", "examples"}
    assert len(files) == 6
    assert next(f for f in files if f.name == "courier.proto").content == (DEMO / "contracts/courier.proto").read_bytes()
    assert all(not str(r.url).lower().endswith((".pdf", "readme.md")) for r in fake.requests)
    assert all(r.headers["Authorization"] == "Basic dXNlcjp0b2tlbg==" for r in fake.requests)


@pytest.mark.parametrize(("markdown", "title", "text"), [
    (b"# Heading\n\nBody", "Heading", "Body"),
    (b"Body", "courier", "Body"),
])
async def test_load_epic_title_without_metadata(markdown, title, text):
    fake = FakeBitbucket()
    del fake.files["demo.json"]
    fake.files["epic.md"] = markdown
    actual_title, actual_text, _ = await fake.client().load_epic("team/synaps-epics", "aaa111", FOLDER)
    assert (actual_title, actual_text) == (title, text)


def post_push(client):
    return client.post("/api/webhooks/bitbucket", json=PUSH, headers={"X-Event-Key": "repo:push"})


def wait_publication(client, run_id):
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        run = client.get(f"/api/runs/{run_id}").json()
        if run.get("publication"):
            return run
        time.sleep(0.02)
    raise AssertionError("Публикация не завершилась")


def test_webhook_starts_run_and_publishes():
    fake = FakeBitbucket(paths=[f"{FOLDER}/epic.md"])
    def handler(request):
        if "/diffstat/" in request.url.path:
            return httpx.Response(200, json={"values": [{"new": {"path": f"{FOLDER}/epic.md"}}]})
        return fake.handler(request)

    tracker = FakeTracker()
    llm = GatedLLM()
    app = create_app(llm=llm, tracker=tracker, bitbucket=BitbucketClient(transport=httpx.MockTransport(handler)))
    with TestClient(app) as client:
        response = post_push(client)
        assert response.status_code == 202
        [started] = response.json()["runs"]
        assert started["folder"] == FOLDER
        assert app.state.webhook_tasks and tracker.calls == 0
        llm.release.set()
        run = wait_status(client, started["run_id"], ("done", "failed"), timeout=5)
        assert run["status"] == "done", run.get("error")
        assert run["origin"] == "webhook" and run["demo_id"] is None
        assert wait_publication(client, started["run_id"])["publication"]["epic_key"] == "KAN-1"
        assert tracker.calls == 1
        assert any(e.type == "published" for e in app.state.store.events(started["run_id"]))


@pytest.mark.parametrize("headers", [{}, {"X-Hub-Signature": "sha256=bad"}])
def test_webhook_rejects_bad_signature(monkeypatch, headers):
    settings = replace(get_settings(), bitbucket_webhook_secret="secret")
    monkeypatch.setattr("app.main.get_settings", lambda: settings)
    fake = FakeBitbucket(paths=[])
    with TestClient(create_app(llm=FakeLLM(), bitbucket=fake.client())) as client:
        response = client.post("/api/webhooks/bitbucket", json=PUSH, headers={"X-Event-Key": "repo:push", **headers})
        assert response.status_code == 401
        assert fake.requests == []
        body = json.dumps(PUSH).encode()
        signature = "sha256=" + hmac.new(b"secret", body, hashlib.sha256).hexdigest()
        response = client.post("/api/webhooks/bitbucket", content=body,
                               headers={"X-Event-Key": "repo:fork", "X-Hub-Signature": signature})
        assert response.status_code == 200 and response.json() == {"runs": []}


def test_webhook_skips_deleted_epic_folder():
    fake = FakeBitbucket()
    with TestClient(create_app(llm=FakeLLM(), bitbucket=fake.client())) as client:
        response = post_push(client)
        assert response.status_code == 202
        assert [r["folder"] for r in response.json()["runs"]] == [FOLDER]
        assert any(r.url.path.endswith("/epics/removed/epic.md") for r in fake.requests)


def test_webhook_ignores_other_events_and_non_epic_pushes():
    def handler(request):
        assert "/diffstat/" in request.url.path
        return httpx.Response(200, json={"values": [{"new": {"path": "README.md"}}]})

    bitbucket = BitbucketClient(transport=httpx.MockTransport(handler))
    with TestClient(create_app(llm=FakeLLM(), bitbucket=bitbucket)) as client:
        response = client.post("/api/webhooks/bitbucket", json=PUSH, headers={"X-Event-Key": "repo:fork"})
        assert response.status_code == 200 and response.json() == {"runs": []}
        response = post_push(client)
        assert response.status_code == 202 and response.json() == {"runs": []}


@pytest.mark.parametrize("failure", [None, TrackerError("Jira 401: bad token"),
                                    HTTPException(503, "Jira не настроена"), RuntimeError("Ошибка публикации")])
def test_webhook_publication_skips_unconfigured_and_records_errors(failure):
    class BrokenTracker(FakeTracker):
        async def publish(self, d, known=None):
            raise failure

    fake = FakeBitbucket()
    def handler(request):
        if "/diffstat/" in request.url.path:
            return httpx.Response(200, json={"values": [{"new": {"path": f"{FOLDER}/epic.md"}}]})
        return fake.handler(request)

    app = create_app(llm=FakeLLM(), tracker=BrokenTracker() if failure else None,
                     bitbucket=BitbucketClient(transport=httpx.MockTransport(handler)))
    with TestClient(app) as client:
        response = post_push(client)
        assert response.status_code == 202
        run_id = response.json()["runs"][0]["run_id"]
        assert wait_status(client, run_id, ("done", "failed"), timeout=5)["status"] == "done"
        deadline = time.monotonic() + 5
        while app.state.webhook_tasks and time.monotonic() < deadline:
            time.sleep(0.02)
        assert not app.state.webhook_tasks
        errors = [e.data["error"] for e in app.state.store.events(run_id) if e.type == "publish_failed"]
        assert errors == ([failure.detail if isinstance(failure, HTTPException) else str(failure)] if failure else [])
        assert client.get("/api/health").status_code == 200


def test_webhook_bitbucket_error_is_readable_and_hides_credentials():
    bitbucket = BitbucketClient(user="private-user", token="private-token", transport=httpx.MockTransport(
        lambda request: httpx.Response(401, text="private-token")
    ))
    with TestClient(create_app(llm=FakeLLM(), bitbucket=bitbucket)) as client:
        response = post_push(client)
        assert response.status_code == 502
        assert "Bitbucket" in response.json()["detail"] and "private" not in response.text


def test_webhook_rejects_invalid_json():
    with TestClient(create_app(llm=FakeLLM(), bitbucket=FakeBitbucket().client())) as client:
        response = client.post("/api/webhooks/bitbucket", content=b"{", headers={"X-Event-Key": "repo:push"})
        assert response.status_code == 422


def test_webhook_does_not_publish_failed_run():
    class BrokenLLM(FakeLLM):
        async def complete_json(self, prompt_name, user, schema, on_token=None, on_retry=None):
            raise RuntimeError("Модель недоступна")

    fake = FakeBitbucket()
    def handler(request):
        if "/diffstat/" in request.url.path:
            return httpx.Response(200, json={"values": [{"new": {"path": f"{FOLDER}/epic.md"}}]})
        return fake.handler(request)

    tracker = FakeTracker()
    app = create_app(llm=BrokenLLM(), tracker=tracker,
                     bitbucket=BitbucketClient(transport=httpx.MockTransport(handler)))
    with TestClient(app) as client:
        response = post_push(client)
        assert response.status_code == 202
        run_id = response.json()["runs"][0]["run_id"]
        assert wait_status(client, run_id, ("done", "failed"), timeout=5)["status"] == "failed"
        deadline = time.monotonic() + 5
        while app.state.webhook_tasks and time.monotonic() < deadline:
            time.sleep(0.02)
        assert not app.state.webhook_tasks
        assert tracker.calls == 0
        assert not any(e.type in ("published", "publish_failed") for e in app.state.store.events(run_id))
