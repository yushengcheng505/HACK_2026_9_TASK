"""Специальные проблемы: дефекты, внедряемые в итоговый результат прогона, и проверки их исправления."""

import re
from collections.abc import Callable
from dataclasses import dataclass, field

from app.findings import ReviewContext, normalize, sole_cover, task_text
from app.schemas import Requirement, Source, Story, Task

TIMEOUT = re.compile(r"тайм-?аут\w*|дедлайн\w*|timeout\w*|deadline\w*", re.I)
POLL_ASSUMPTION = ("Статус отправления опрашивается не чаще одного раза в 15 минут: «Курьер-Экспресс» "
                   "обновляет статусы пакетно.")
KAFKA_TASK = {
    "id": "TASK-902", "type": "devops",
    "title": "Развернуть Kafka-кластер и Schema Registry для журнала обращений к «Курьер-Экспресс»",
    "description": "Поднять кластер Kafka из трёх брокеров, Schema Registry и Kafka Connect; все сервисы пишут "
                   "события обращений к курьерской службе в топик courier-calls, оттуда они попадают в журнал.",
    "definition_of_done": ["Кластер Kafka из трёх брокеров развёрнут в Kubernetes",
                           "Схема событий courier-calls зарегистрирована в Schema Registry"],
    "source_refs": [], "test_scenarios": [],
}

# Куда внедрять дефекты в каждой основе (номера историй и задач из записанных результатов).
TARGETS = {
    "affbf77db561": {"poll": ("US-006", "TASK-099"), "track": "US-004",
                     "dup": ("TASK-078", "US-007", "REQ-011"), "log": ("US-008", "REQ-012", "TASK-055", "REQ-011"),
                     "rate": "US-001", "contract": "TASK-078", "add_assumption": True},
    "8ed2ce672494": {"poll": ("US-005", "TASK-104"), "track": "US-004",
                     "dup": ("TASK-063", "US-006", "REQ-013"), "log": ("US-007", "REQ-015", "TASK-047", "REQ-013"),
                     "rate": "US-001", "contract": "TASK-063", "add_assumption": False},
}


@dataclass
class Mutation:
    id: str
    title: str
    story_id: str
    keys: list[str]
    kinds: list[str]
    task_ids: list[str] = field(default_factory=list)
    fixed: Callable[[list[Story]], bool] = lambda stories: False


def _stories(state: dict) -> list[Story]:
    return [Story.model_validate(s) for s in state["stories"]]


def _story(stories: list[Story], story_id: str) -> Story | None:
    return next((s for s in stories if s.id == story_id), None)


def _task(stories: list[Story], task_id: str):
    return next(((s, t) for s in stories for t in s.tasks if t.id == task_id), (None, None))


def story_text(stories: list[Story], story_id: str) -> str:
    """Текст задач истории (без критериев приёмки) — по нему проверяется исправление."""
    story = _story(stories, story_id)
    return normalize("\n".join(task_text(t) for t in story.tasks)) if story else ""


NEGATION = re.compile(r"(?<!\w)(нет|не|без|отсутству\w*|убра\w*|удал\w*|запрещ\w*|нельзя)(?!\w)")


def mentioned(text: str, key: str) -> bool:
    """Есть ли предложение, где key упомянут не в отрицании («поля X нет», «без X» — не в счёт)."""
    key = normalize(key)
    for sentence in re.split(r"(?<=[.!?;])\s+|\n", normalize(text)):
        if key in sentence and not NEGATION.search(sentence):
            return True
    return False


def tasks_text(stories: list[Story], story_id: str) -> str:
    story = _story(stories, story_id)
    return "\n".join(task_text(t) for t in story.tasks) if story else ""


def strip_matching(text: str, pattern: re.Pattern) -> str:
    return " ".join(s for s in re.split(r"(?<=[.!?])\s+", text) if not pattern.search(s))


def _strip_story(state: dict, story_id: str, pattern: re.Pattern) -> None:
    """Вычистить упоминания из задач истории; задачи, у которых это в названии, — удалить, если можно."""
    stories = _stories(state)
    ctx = ReviewContext(stories, [Requirement.model_validate(r) for r in state["requirements"]],
                        [Source.model_validate(s) for s in state["sources"]], "")
    story = _story(stories, story_id)
    removed: set[str] = set()
    kept = []
    for t in story.tasks:
        if pattern.search(t.title) and not sole_cover(ctx, t.id, removed):
            removed.add(t.id)
            continue
        t.title = re.sub(r"\s{2,}", " ", pattern.sub("", t.title)).strip(" ,")
        t.description = strip_matching(t.description, pattern)
        t.definition_of_done = [d for d in t.definition_of_done if not pattern.search(d)]
        t.test_scenarios = [s for s in t.test_scenarios if not pattern.search(f"{s.name} {s.input} {s.expected}")]
        kept.append(t)
    story.tasks = kept
    state["stories"] = [s.model_dump() for s in stories]


def mutate(state: dict, base_id: str) -> list[Mutation]:
    """Внедрить все дефекты в state (на месте). Возвращает описания дефектов с проверками."""
    tg = TARGETS[base_id]
    stories = _stories(state)
    poll_story, poll_task = tg["poll"]
    src_task_id, dup_story, dup_req = tg["dup"]
    log_story, log_req, wrong_task, wrong_req = tg["log"]

    _, poll = _task(stories, poll_task)
    poll.description += " Интервал опроса — каждые 30 секунд для всех активных отправлений."
    poll.definition_of_done.append("Опрос статусов выполняется каждые 30 секунд")
    if tg["add_assumption"]:
        state["assumptions"] = [*state["assumptions"], POLL_ASSUMPTION]

    _story(stories, tg["track"]).acceptance_criteria.append(
        "Покупатель может скачать PDF-этикетку отправления по ссылке из письма-подтверждения.")

    _, original = _task(stories, src_task_id)
    copy = original.model_copy(deep=True, update={"id": "TASK-901", "requirement_ids": [dup_req]})
    _story(stories, dup_story).tasks.append(copy)

    _story(stories, log_story).tasks.append(
        Task.model_validate(KAFKA_TASK | {"requirement_ids": [log_req]}))
    _, wrong = _task(stories, wrong_task)
    wrong.requirement_ids = [wrong_req]

    _, contract = _task(stories, tg["contract"])
    contract.description += " Передавать в CreateShipmentRequest поле courier_priority=HIGH для срочных заказов."
    contract.definition_of_done.append("В запрос CreateShipment передаётся courier_priority")

    state["stories"] = [s.model_dump() for s in stories]
    _strip_story(state, tg["rate"], TIMEOUT)
    assert not TIMEOUT.search(story_text(_stories(state), tg["rate"])), "таймауты вычищены не полностью"

    copy_title = normalize(original.title)
    contract_story = _task(_stories(state), tg["contract"])[0].id
    return [
        Mutation("M1", "противоречие решению: опрос каждые 30 секунд", poll_story, ["30 секунд", "30 с "],
                 ["contradicts_decision"], [poll_task],
                 lambda ss: not mentioned(tasks_text(ss, poll_story), "30 секунд")),
        Mutation("M2", "непокрытый критерий: PDF-этикетка", tg["track"], ["этикет", "printlabel"],
                 ["criterion_not_covered"], [],
                 lambda ss: any(k in story_text(ss, tg["track"]) for k in ("этикет", "printlabel"))),
        Mutation("M3", "дубль между историями: копия клиента CreateShipment", dup_story, ["TASK-901"],
                 ["duplicate", "reuse_existing"], ["TASK-901"],
                 lambda ss: not any(t.id == "TASK-901" or normalize(t.title) == copy_title
                                    for t in (_story(ss, dup_story) or Story(id="", title="", description="")).tasks)),
        Mutation("M4", "переусложнение: Kafka и Schema Registry", log_story, ["kafka", "TASK-902"],
                 ["unneeded_task", "platform_covers"], ["TASK-902"],
                 lambda ss: not mentioned(tasks_text(ss, log_story), "kafka")),
        Mutation("M5", f"не то требование: {wrong_task} → {wrong_req}", log_story, [wrong_req],
                 ["wrong_requirement"], [wrong_task],
                 lambda ss: not any(wrong_req in t.requirement_ids
                                    for t in (_story(ss, log_story) or Story(id="", title="", description="")).tasks)),
        Mutation("M6", "не обработан отказ: без таймаутов в расчёте стоимости", tg["rate"],
                 ["таймаут", "тайм-аут", "дедлайн", "timeout", "deadline"],
                 ["failure_not_handled", "contract_mismatch", "criterion_not_covered"], [],
                 lambda ss: bool(TIMEOUT.search(story_text(ss, tg["rate"])))),
        Mutation("M7", "расхождение с контрактом: поле courier_priority", contract_story, ["courier_priority"],
                 ["contract_mismatch"], [tg["contract"]],
                 lambda ss: not mentioned(tasks_text(ss, contract_story), "courier_priority")),
    ]
