"""Отбор фрагментов в бюджет промпта: эпик и операции контракта — всегда, остальное по BM25."""

import math
import re
from collections import Counter

from app.schemas import CONTRACT_OP_KINDS, Source

ALWAYS = ("epic", *CONTRACT_OP_KINDS)


def _tokens(text: str) -> list[str]:
    return [w[:6] for w in re.findall(r"\w+", text.lower()) if len(w) > 2]


def bm25_scores(query: str, docs: list[str], k1: float = 1.5, b: float = 0.75) -> list[float]:
    tokenized = [_tokens(d) for d in docs]
    if not tokenized:
        return []
    avg = sum(map(len, tokenized)) / len(tokenized) or 1
    df = Counter(t for doc in tokenized for t in set(doc))
    n = len(tokenized)
    scores = []
    for doc in tokenized:
        tf = Counter(doc)
        score = 0.0
        for term in set(_tokens(query)):
            if term not in tf:
                continue
            idf = math.log(1 + (n - df[term] + 0.5) / (df[term] + 0.5))
            score += idf * tf[term] * (k1 + 1) / (tf[term] + k1 * (1 - b + b * len(doc) / avg))
        scores.append(score)
    return scores


def select_context(sources: list[Source], query: str, budget: int) -> list[Source]:
    if sum(len(s.text) for s in sources) <= budget:
        return list(sources)
    chosen = {s.id for s in sources if s.kind in ALWAYS}
    used = sum(len(s.text) for s in sources if s.id in chosen)
    rest = [s for s in sources if s.id not in chosen]
    ranked = sorted(zip(bm25_scores(query, [f"{s.title}\n{s.text}" for s in rest]), range(len(rest))), reverse=True)
    for _, i in ranked:
        if used + len(rest[i].text) <= budget:
            chosen.add(rest[i].id)
            used += len(rest[i].text)
    return [s for s in sources if s.id in chosen]


def story_context(sources: list[Source], ref_ids: set[str], query: str, budget: int) -> list[Source]:
    """Для одной истории: источники её требований, операции контракта и их сообщения, затем BM25."""
    must = {s.id for s in sources if s.id in ref_ids or s.kind in CONTRACT_OP_KINDS}
    signatures = " ".join(s.title for s in sources if s.id in must and s.kind == "proto_rpc")
    words = set(re.findall(r"\w+", signatures))
    must |= {s.id for s in sources if s.kind == "proto_message" and s.id.split(":", 1)[1].split(".")[-1] in words}
    used = sum(len(s.text) for s in sources if s.id in must)
    rest = [s for s in sources if s.id not in must and s.kind != "epic"]
    chosen = set(must)
    ranked = sorted(zip(bm25_scores(query, [f"{s.title}\n{s.text}" for s in rest]), range(len(rest))), reverse=True)
    for score, i in ranked:
        if score > 0 and used + len(rest[i].text) <= budget:
            chosen.add(rest[i].id)
            used += len(rest[i].text)
    return [s for s in sources if s.id in chosen]


def render_sources(sources: list[Source]) -> str:
    return "\n\n".join(
        f'<source id="{s.id}" kind="{s.kind}" file="{s.file}" title="{s.title}">\n{s.text}\n</source>'
        for s in sources
    )
