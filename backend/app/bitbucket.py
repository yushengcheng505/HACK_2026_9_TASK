import hashlib
import hmac
import json
from pathlib import PurePosixPath

import httpx

from app.demos import split_title
from app.sources import InputFile

API = "https://api.bitbucket.org/2.0"
ROLE_DIRS = {"docs/product": "product_docs", "docs/external": "external_docs",
             "contracts": "contracts", "examples": "examples"}


def verify_signature(secret: str, body: bytes, header: str | None) -> bool:
    expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected.encode(), (header or "").encode())


def parse_push(payload: dict) -> list[tuple[str, str, str | None]]:
    repo = payload.get("repository", {}).get("full_name")
    if not repo:
        return []
    changes = []
    for change in payload.get("push", {}).get("changes", []):
        new = change.get("new")
        if new is None:
            continue
        old = change.get("old")
        changes.append((repo, new["target"]["hash"], old["target"]["hash"] if old else None))
    return changes


def epic_folders(paths: list[str]) -> list[str]:
    folders = []
    for path in paths:
        parts = path.split("/")
        if len(parts) >= 3 and parts[0] == "epics" and parts[1]:
            folder = "/".join(parts[:2])
            if folder not in folders:
                folders.append(folder)
    return folders


class BitbucketClient:
    def __init__(self, api: str = API, user: str = "", token: str = "",
                 transport: httpx.AsyncBaseTransport | None = None):
        self.api = api.rstrip("/")
        self.auth = httpx.BasicAuth(user, token) if user and token else None
        self.transport = transport

    async def _values(self, client: httpx.AsyncClient, url: str) -> list[dict]:
        values = []
        while url:
            response = await client.get(url)
            response.raise_for_status()
            data = response.json()
            values.extend(data.get("values", []))
            url = data.get("next")
        return values

    async def changed_paths(self, repo: str, new: str, old: str | None) -> list[str]:
        revision = f"{new}..{old}" if old else new
        url = f"{self.api}/repositories/{repo}/diffstat/{revision}"
        async with httpx.AsyncClient(auth=self.auth, transport=self.transport) as client:
            values = await self._values(client, url)
        paths = []
        for value in values:
            for side in ("new", "old"):
                path = (value.get(side) or {}).get("path")
                if path and path not in paths:
                    paths.append(path)
        return paths

    async def load_epic(self, repo: str, commit: str, folder: str) -> tuple[str, str, list[InputFile]] | None:
        """None — в коммите у папки нет epic.md (папку удалили или это не эпик)."""
        base = f"{self.api}/repositories/{repo}/src/{commit}"
        async with httpx.AsyncClient(auth=self.auth, transport=self.transport) as client:
            response = await client.get(f"{base}/{folder}/epic.md")
            if response.status_code == 404:
                return None
            response.raise_for_status()
            heading, text = split_title(response.text)
            title = heading or PurePosixPath(folder).name
            files = []
            values = await self._values(client, f"{base}/{folder}/?max_depth=3&pagelen=100")
            for entry in values:
                if entry["type"] != "commit_file" or not entry["path"].startswith(f"{folder}/"):
                    continue
                path = entry["path"][len(folder) + 1:]
                if path == "epic.md" or path.lower().endswith(".pdf"):
                    continue
                role = next((role for prefix, role in ROLE_DIRS.items() if path.startswith(f"{prefix}/")), None)
                if path != "demo.json" and role is None:
                    continue
                response = await client.get(f"{base}/{entry['path']}")
                response.raise_for_status()
                if path == "demo.json":
                    title = json.loads(response.content).get("title") or title
                else:
                    files.append(InputFile(name=PurePosixPath(path).name, role=role, content=response.content))
        return title, text, files
