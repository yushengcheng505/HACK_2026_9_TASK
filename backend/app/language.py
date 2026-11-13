"""Целевой язык программирования по файлам и тексту. Уверенность < 0.6 — спрашиваем пользователя."""

import re
from collections import defaultdict
from pathlib import PurePath

from app.schemas import Language, Source
from app.sources import InputFile

CONFIDENT = 0.6

EXTENSIONS = {
    ".go": "Go", ".cs": "C#", ".cpp": "C++", ".cc": "C++", ".cxx": "C++", ".hpp": "C++", ".h": "C++",
    ".py": "Python", ".java": "Java", ".kt": "Kotlin", ".ts": "TypeScript", ".tsx": "TypeScript",
    ".js": "JavaScript", ".rs": "Rust", ".php": "PHP", ".rb": "Ruby", ".swift": "Swift",
}
MANIFESTS = {
    "go.mod": "Go", "pyproject.toml": "Python", "requirements.txt": "Python", "package.json": "TypeScript",
    "pom.xml": "Java", "build.gradle": "Java", "cargo.toml": "Rust", "cmakelists.txt": "C++",
}
PROTO_OPTIONS = {
    "go_package": "Go", "csharp_namespace": "C#", "java_package": "Java", "cc_enable_arenas": "C++",
    "php_namespace": "PHP", "ruby_package": "Ruby", "swift_prefix": "Swift",
}
TEXT_HINTS = {
    "Go": r"\(Go\)|\bGolang\b|\bна Go\b",
    "C++": r"C\+\+|\bQt\b",
    "C#": r"C#|\.NET\b",
    "Python": r"\bPython\b",
    "Java": r"\bJava\b(?!Script)",
    "TypeScript": r"\bTypeScript\b|\bNode\.js\b",
    "Rust": r"\bRust\b",
}
WEIGHT = {"file": 3.0, "manifest": 3.0, "proto": 1.0, "text": 0.5}
TEXT_CAP = 1.5


def detect_language(files: list[InputFile], sources: list[Source]) -> Language:
    scores: dict[str, float] = defaultdict(float)
    evidence: dict[str, list[str]] = defaultdict(list)

    def vote(lang: str, kind: str, why: str, cap: float | None = None) -> None:
        if cap is not None and scores[lang] >= cap:
            return
        scores[lang] += WEIGHT[kind]
        evidence[lang].append(why)

    for f in files:
        base = PurePath(f.name).name.lower()
        if base in MANIFESTS:
            vote(MANIFESTS[base], "manifest", f"манифест {f.name}")
        elif f.suffix in EXTENSIONS:
            vote(EXTENSIONS[f.suffix], "file", f"файл {f.name}")
        if f.suffix == ".proto":
            for option, lang in PROTO_OPTIONS.items():
                if re.search(rf"option\s+{option}\b", f.text()):
                    vote(lang, "proto", f"option {option} в {f.name}")
    text_scores: dict[str, float] = defaultdict(float)
    for s in sources:
        if s.kind not in ("epic", "doc"):
            continue
        for lang, pattern in TEXT_HINTS.items():
            if text_scores[lang] < TEXT_CAP and re.search(pattern, s.text):
                text_scores[lang] += WEIGHT["text"]
                scores[lang] += WEIGHT["text"]
                evidence[lang].append(f"упоминание в {s.id}")

    if not scores:
        return Language()
    best = max(scores, key=scores.get)
    total = sum(scores.values())
    confidence = scores[best] / total * min(1.0, scores[best] / 3.0)
    return Language(value=best, confidence=round(confidence, 2), evidence=evidence[best][:6])
