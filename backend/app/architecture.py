"""План интеграции от Архитектора: проверка кодом и блок для промптов остальных ролей."""

from collections import defaultdict

from langchain_core.runnables import RunnableConfig

from app.config import get_settings
from app.findings import MIN_QUOTE, normalize
from app.schemas import CONTRACT_OP_KINDS, ArchitectureOut, GapEvidence, Requirement, Source

ARCHITECTURE_HEADING = "Архитектура интеграции (обязательна для всех задач)"


def architect_enabled(config: RunnableConfig) -> bool:
    return (config.get("configurable") or {}).get("architect", get_settings().architect)


def plan_problems(plan: ArchitectureOut, sources: list[Source], requirements: list[Requirement],
                  story_ids: list[str]) -> list[str]:
    """Структурные ошибки плана: у внешнего вызова один владелец, методы — из контрактов или помечены новыми,
    каждая операция контракта из требований кем-то вызывается, у общей работы есть история, которая её делает."""
    ops = {s.id for s in sources if s.kind in CONTRACT_OP_KINDS}
    services = {s.name for s in plan.services}
    problems: list[str] = []

    def known(name: str, where: str) -> None:
        if name not in services:
            problems.append(f"{where}: сервиса {name} нет в списке services")

    def built_by(story: str, where: str) -> None:
        if story not in story_ids:
            problems.append(f"{where}: в story укажи историю, которая это делает ({', '.join(story_ids)})")

    owners: dict[str, set[str]] = defaultdict(set)
    for call in plan.external_calls:
        if call.op not in ops:
            problems.append(f"{call.op}: такой операции нет в контрактах")
        known(call.service, call.op)
        built_by(call.story, call.op)
        owners[call.op].add(call.service)
    for op, names in owners.items():
        if len(names) > 1:
            problems.append(f"{op}: несколько вызывающих сервисов ({', '.join(sorted(names))}) — нужен один")
    linked = set()
    for link in plan.links:
        where = f"связь {link.caller} → {link.callee}"
        known(link.caller, where)
        known(link.callee, where)
        if not link.new and link.method not in ops:
            problems.append(f"{where}: метода {link.method} нет в контрактах — укажи существующий или new: true")
        if link.new:
            built_by(link.story, f"{where}, новый метод {link.method}")
        linked.add(link.method)
    for store in plan.stores:
        known(store.service, f"хранилище {store.name}")
        built_by(store.story, f"хранилище {store.name}")
    used = sorted({ref for r in requirements for ref in r.source_refs if ref in ops})
    for op in used:
        if op not in owners and op not in linked:
            problems.append(f"{op}: нужен по требованиям, но в плане не сказано, кто его вызывает")
    return problems


def ground(plan: ArchitectureOut, sources: list[Source]) -> ArchitectureOut:
    """Оставляет в основаниях только цитаты, которые код нашёл в указанном источнике."""
    texts = {s.id: normalize(f"{s.title}\n{s.text}") for s in sources}

    def found(basis: list[GapEvidence]) -> list[GapEvidence]:
        return [e for e in basis if len(normalize(e.quote)) >= MIN_QUOTE and normalize(e.quote) in texts.get(e.source_id, "")]

    for item in [*plan.services, *plan.external_calls, *plan.links, *plan.stores]:
        item.basis = found(item.basis)
    return plan


def _src(basis: list[GapEvidence]) -> str:
    """Решение с подтверждённым источником обязательно; без него — предположение, его можно оспорить."""
    if basis:
        return f" [источник: {', '.join(dict.fromkeys(e.source_id for e in basis))}]"
    return " [предположение Архитектора, без источника — можно оспорить]"


def _built(story: str, what: str) -> str:
    return f"; {what} делает {story}, остальные истории только ссылаются" if story else ""


def architecture_block(plan: ArchitectureOut) -> str:
    lines = ["Сервисы:", *(f"- {s.name} — {s.role}{_src(s.basis)}" for s in plan.services)]
    if plan.external_calls:
        lines.append("Внешние вызовы — вызывает только указанный сервис, остальные идут через него:")
        for c in plan.external_calls:
            retry = "повтор безопасен" if c.retry == "safe" else "повторять нельзя без проверки результата"
            lines.append(f"- {c.op} → {c.service}; таймаут {c.timeout_ms} мс; {retry}" + (f"; {c.note}" if c.note else "")
                         + _built(c.story, "клиент") + _src(c.basis))
    if plan.links:
        lines.append("Связи между сервисами:")
        for link in plan.links:
            new = " (новый метод — нужна задача на его создание)" if link.new else ""
            lines.append(f"- {link.caller} → {link.callee}: {link.method}{new} — {link.purpose}"
                         + (_built(link.story, "метод") if link.new else "") + _src(link.basis))
    if plan.stores:
        lines.append("Хранилища:")
        lines += [f"- {s.name} ({s.service}): {s.data}" + _built(s.story, "хранилище") + _src(s.basis)
                  for s in plan.stores]
    if plan.rules:
        lines.append("Общие правила:")
        lines += [f"- {r}" for r in plan.rules]
    return "\n".join(lines)
