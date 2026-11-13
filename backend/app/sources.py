"""Разбор входов в фрагменты с устойчивыми ID — на них ссылаются требования и задачи."""

import io
import json
import re
from dataclasses import dataclass
from pathlib import PurePath

import yaml

from app.schemas import CONTRACT_OP_KINDS, InputRole, Source

HTTP_METHODS = ("get", "post", "put", "patch", "delete", "head", "options")
EXAMPLE_TEXT_LIMIT = 4000
TXT_CHUNK = 1200


@dataclass
class InputFile:
    name: str
    role: InputRole
    content: bytes

    @property
    def suffix(self) -> str:
        return PurePath(self.name).suffix.lower()

    def text(self) -> str:
        return self.content.decode("utf-8", errors="replace")


class _Collector:
    def __init__(self) -> None:
        self.sources: list[Source] = []
        self.counters: dict[str, int] = {}
        self.ids: set[str] = set()

    def numbered(self, prefix: str, **fields) -> None:
        self.counters[prefix] = self.counters.get(prefix, 0) + 1
        self.add(f"{prefix}-{self.counters[prefix]}", **fields)

    def add(self, id: str, **fields) -> None:
        self.ids.add(id)
        self.sources.append(Source(id=id, **fields))

    def unique(self, id: str, qualifier: str) -> str:
        if id not in self.ids:
            return id
        prefix, _, name = id.partition(":")
        return f"{prefix}:{qualifier}.{name}"


def parse_inputs(epic_text: str, files: list[InputFile]) -> list[Source]:
    c = _Collector()
    for block in _epic_blocks(epic_text):
        c.numbered("EPIC", kind="epic", file="epic", title=_short(block), text=block)
    for f in files:
        if f.suffix == ".proto":
            _parse_proto(c, f.name, f.text())
        elif (spec := _load_openapi(f)) is not None:
            _parse_openapi(c, f.name, spec)
        elif f.role == "examples":
            c.numbered("EX", kind="example", file=f.name, title=f.name, text=f.text()[:EXAMPLE_TEXT_LIMIT])
        else:
            for title, text in _doc_sections(f):
                c.numbered("DOC", kind="doc", file=f.name, title=title, text=text)
    return c.sources


def contract_ops(sources: list[Source]) -> list[str]:
    return [s.id for s in sources if s.kind in CONTRACT_OP_KINDS]


def _short(text: str, limit: int = 80) -> str:
    line = " ".join(text.split())
    line = re.sub(r"^[-*\d.)\s]+", "", line)
    return line if len(line) <= limit else line[: limit - 1] + "…"


def _epic_blocks(text: str) -> list[str]:
    blocks: list[str] = []
    current: list[str] = []

    def flush() -> None:
        if current:
            blocks.append("\n".join(current).strip())
            current.clear()

    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            flush()
        elif re.match(r"^([-*]|\d+[.)])\s", stripped):
            flush()
            current.append(stripped)
        elif stripped.startswith("#"):
            flush()
        else:
            current.append(stripped)
    flush()
    return [b for b in blocks if b]


def _parse_proto(c: _Collector, name: str, text: str) -> None:
    package = (m.group(1) if (m := re.search(r"^\s*package\s+([\w.]+)\s*;", text, re.M)) else "")
    qualifier = package.split(".")[0] if package else PurePath(name).stem
    for block_type, block_name, body, comment in _proto_blocks(text):
        if block_type == "service":
            for rpc in re.finditer(
                r"((?:[ \t]*//[^\n]*\n)*)[ \t]*rpc\s+(\w+)\s*\(\s*(stream\s+)?([\w.]+)\s*\)\s*returns\s*\(\s*(stream\s+)?([\w.]+)\s*\)",
                body,
            ):
                rpc_comment = " ".join(l.strip().lstrip("/").strip() for l in rpc.group(1).splitlines() if l.strip())
                signature = f"rpc {rpc.group(2)}({rpc.group(3) or ''}{rpc.group(4)}) returns ({rpc.group(5) or ''}{rpc.group(6)})"
                id = c.unique(f"PROTO:{block_name}.{rpc.group(2)}", qualifier)
                details = f"service {block_name} (package {package})\n{signature}"
                if rpc_comment:
                    details += f"\n// {rpc_comment}"
                c.add(id, kind="proto_rpc", file=name, title=signature, text=details)
        else:
            id = c.unique(f"PROTO:{block_name}", qualifier)
            prefix = f"// {comment}\n" if comment else ""
            c.add(id, kind="proto_message", file=name, title=f"{block_type} {block_name}",
                  text=f"{prefix}{block_type} {block_name} {{{body}}}")


def _proto_blocks(text: str):
    """Блоки верхнего уровня: service, message, enum — с телом и комментарием перед ними."""
    for m in re.finditer(r"((?:[ \t]*//[^\n]*\n)*)^[ \t]*(service|message|enum)\s+(\w+)\s*\{", text, re.M):
        depth, i = 1, m.end()
        while i < len(text) and depth:
            depth += {"{": 1, "}": -1}.get(text[i], 0)
            i += 1
        comment = " ".join(l.strip().lstrip("/").strip() for l in m.group(1).splitlines() if l.strip())
        if _depth_at(text, m.start(2)) == 0:
            yield m.group(2), m.group(3), text[m.end(): i - 1], comment


def _depth_at(text: str, pos: int) -> int:
    clean = re.sub(r"//[^\n]*", "", text[:pos])
    return clean.count("{") - clean.count("}")


def _load_openapi(f: InputFile) -> dict | None:
    if f.suffix not in (".yaml", ".yml", ".json"):
        return None
    try:
        data = json.loads(f.text()) if f.suffix == ".json" else yaml.safe_load(f.text())
    except (ValueError, yaml.YAMLError):
        return None
    if isinstance(data, dict) and ("openapi" in data or "swagger" in data) and isinstance(data.get("paths"), dict):
        return data
    return None


def _parse_openapi(c: _Collector, name: str, spec: dict) -> None:
    for path, item in spec["paths"].items():
        if not isinstance(item, dict):
            continue
        for method in HTTP_METHODS:
            op = item.get(method)
            if not isinstance(op, dict):
                continue
            signature = f"{method.upper()} {path}"
            summary = op.get("summary") or op.get("operationId") or ""
            details = yaml.safe_dump(op, allow_unicode=True, sort_keys=False)[:1500]
            c.add(c.unique(f"API:{signature}", PurePath(name).stem), kind="openapi_op", file=name,
                  title=f"{signature} — {summary}" if summary else signature, text=f"{signature}\n{details}")


def _doc_sections(f: InputFile) -> list[tuple[str, str]]:
    if f.suffix == ".docx":
        return _docx_sections(f)
    if f.suffix in (".md", ".markdown"):
        return _markdown_sections(f.name, f.text())
    return _txt_sections(f.name, f.text())


def _markdown_sections(name: str, text: str) -> list[tuple[str, str]]:
    sections: list[tuple[str, list[str]]] = [(name, [])]
    in_code = False
    for line in text.splitlines():
        if line.strip().startswith("```"):
            in_code = not in_code
        heading = None if in_code else re.match(r"^#{1,4}\s+(.+)$", line)
        if heading:
            sections.append((heading.group(1).strip(), []))
        else:
            sections[-1][1].append(line)
    result = [(title, "\n".join(body).strip()) for title, body in sections]
    return [(t, b) for t, b in result if b]


def _txt_sections(name: str, text: str) -> list[tuple[str, str]]:
    chunks: list[str] = []
    for para in re.split(r"\n\s*\n", text):
        para = para.strip()
        if not para:
            continue
        if chunks and len(chunks[-1]) + len(para) < TXT_CHUNK:
            chunks[-1] += "\n\n" + para
        else:
            chunks.append(para)
    return [(f"{name}: {_short(chunk, 60)}", chunk) for chunk in chunks]


def _docx_sections(f: InputFile) -> list[tuple[str, str]]:
    from docx import Document

    doc = Document(io.BytesIO(f.content))
    sections: list[tuple[str, list[str]]] = [(f.name, [])]
    for p in doc.paragraphs:
        style = (p.style.name or "") if p.style is not None else ""
        if style.startswith("Heading") or style.startswith("Заголовок") or style == "Title":
            sections.append((p.text.strip() or f.name, []))
        elif p.text.strip():
            sections[-1][1].append(p.text.strip())
    for table in doc.tables:
        rows = [" | ".join(cell.text.strip() for cell in row.cells) for row in table.rows]
        sections[-1][1].append("\n".join(rows))
    return [(t, "\n".join(b)) for t, b in sections if b]
