import hashlib
from dataclasses import dataclass
from pathlib import Path

from app.config import get_settings


@dataclass(frozen=True)
class Prompt:
    name: str
    text: str
    version: str


def load_prompt(name: str, prompts_dir: Path | None = None) -> Prompt:
    text = ((prompts_dir or get_settings().prompts_dir) / f"{name}.md").read_text(encoding="utf-8")
    return Prompt(name=name, text=text, version=hashlib.sha256(text.encode()).hexdigest()[:10])


def prompt_snapshot() -> dict[str, Prompt]:
    return {p.stem: load_prompt(p.stem) for p in sorted(get_settings().prompts_dir.glob("*.md"))}
