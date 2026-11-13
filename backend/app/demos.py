import json
import re
from dataclasses import dataclass
from pathlib import Path

from app.config import get_settings
from app.sources import InputFile


@dataclass
class Demo:
    id: str
    title: str
    summary: str
    epic_text: str
    files: list[InputFile]


def list_demos(root: Path | None = None) -> list[Demo]:
    root = root or get_settings().demo_dir
    if not root.is_dir():
        return []
    return [load_demo(p.name, root) for p in sorted(root.iterdir()) if (p / "demo.json").is_file()]


def load_demo(demo_id: str, root: Path | None = None) -> Demo:
    root = root or get_settings().demo_dir
    base = root / demo_id
    meta = json.loads((base / "demo.json").read_text(encoding="utf-8"))
    epic = (base / "epic.md").read_text(encoding="utf-8")
    epic = re.sub(r"\A\s*#\s+[^\n]*\n", "", epic).strip()
    files = [
        InputFile(name=Path(rel).name, role=role, content=(base / rel).read_bytes())
        for role, paths in meta.get("files", {}).items()
        for rel in paths
    ]
    return Demo(id=demo_id, title=meta["title"], summary=meta.get("summary", ""), epic_text=epic, files=files)
