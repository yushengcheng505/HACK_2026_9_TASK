import hashlib
from dataclasses import dataclass
from pathlib import Path

from app.config import get_settings


@dataclass(frozen=True)
class Prompt:
    name: str
    text: str
    version: str


def overrides_dir() -> Path:
    """Правки промптов из интерфейса: лежат поверх исходников, сами исходники в prompts/ не меняются."""
    return get_settings().data_dir / "prompt_overrides"


def _make(name: str, text: str) -> Prompt:
    return Prompt(name=name, text=text, version=hashlib.sha256(text.encode()).hexdigest()[:10])


def default_prompt(name: str) -> Prompt:
    return _make(name, (get_settings().prompts_dir / f"{name}.md").read_text(encoding="utf-8"))


def load_prompt(name: str, prompts_dir: Path | None = None) -> Prompt:
    """Промпт роли. Для основного каталога действует правка из интерфейса; варианты бенчмарка — как есть."""
    settings = get_settings()
    base = prompts_dir or settings.prompts_dir
    override = overrides_dir() / f"{name}.md"
    path = override if base == settings.prompts_dir and override.is_file() else base / f"{name}.md"
    return _make(name, path.read_text(encoding="utf-8"))


def prompt_names() -> list[str]:
    return [p.stem for p in sorted(get_settings().prompts_dir.glob("*.md"))]


def prompt_snapshot() -> dict[str, Prompt]:
    return {name: load_prompt(name) for name in prompt_names()}


def save_override(name: str, text: str) -> Prompt:
    """Текст, совпадающий с исходным, правкой не считается — правка удаляется."""
    if text == default_prompt(name).text:
        reset_override(name)
    else:
        overrides_dir().mkdir(parents=True, exist_ok=True)
        (overrides_dir() / f"{name}.md").write_text(text, encoding="utf-8")
    return load_prompt(name)


def reset_override(name: str) -> None:
    (overrides_dir() / f"{name}.md").unlink(missing_ok=True)
