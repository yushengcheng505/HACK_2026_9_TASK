"""Поддельная LLM для тестов: отвечает по имени промпта, запоминает вызовы."""

import re
from collections import defaultdict


def default_replies():
    def requirements(user):
        return {"requirements": [
            {"id": "R1", "type": "integration", "text": "Создавать отправление после оплаты",
             "source_refs": ["EPIC-3", "PROTO:CourierService.CreateShipment"]},
            {"id": "R2", "type": "functional", "text": "Показывать стоимость доставки",
             "source_refs": ["EPIC-1", "PROTO:CourierService.CalculateRate"]},
        ]}

    def analyst(user):
        return {"questions": [{"text": "Повторять создание отправления?", "options": ["Да, с ключом", "Нет"],
                               "recommended": 0}],
                "gaps": [{"text": "Нет идемпотентности", "risk": "Два отправления",
                          "source_refs": ["EPIC-4", "PROTO:CourierService.CreateShipment"],
                          "evidence": [{"source_id": "PROTO:CourierService.CreateShipment",
                                        "quote": "Каждый вызов создаёт новое отправление"}]}]}

    def stories(user):
        return {"stories": [
            {"title": "Как покупатель, я хочу получить трек-номер, чтобы отследить заказ", "description": "d",
             "acceptance_criteria": ["если оплата прошла, то создаётся отправление"], "requirement_ids": ["REQ-001"]},
            {"title": "Как покупатель, я хочу видеть стоимость доставки, чтобы выбрать способ", "description": "d",
             "acceptance_criteria": ["если адрес введён, то показана цена"], "requirement_ids": ["REQ-002"]},
        ]}

    def tasks(user):
        story = re.search(r"## История (US-\d+)", user).group(1)
        op = "PROTO:CourierService.CreateShipment" if story == "US-001" else "PROTO:CourierService.CalculateRate"
        req = "REQ-001" if story == "US-001" else "REQ-002"
        fixed = "Замечания, которые нужно исправить" in user
        impl_ref = op if (story == "US-001" or fixed) else "PROTO:CourierService.Teleport"
        return {"tasks": [
            {"title": f"Реализовать вызов {op} ({story})", "description": "d", "type": "integration",
             "definition_of_done": ["вызов работает"], "requirement_ids": [req], "source_refs": [impl_ref]},
            {"title": f"Интеграционный тест {op} ({story})", "description": "d", "type": "qa",
             "requirement_ids": [req], "source_refs": [op],
             "test_scenarios": [{"name": "ok", "input": "валидный запрос", "expected": "ответ"}]},
        ]}

    critic_calls = {"n": 0}

    def critic(user):
        critic_calls["n"] += 1
        if critic_calls["n"] == 1:
            return {"notes": [{"story_id": "US-001", "problem": "Нет обработки таймаута"}]}
        return {"notes": []}

    def reviewer(user):
        story = re.search(r"## История (US-\d+)", user).group(1)
        mode = re.search(r"## Режим: (.+)", user).group(1).strip()
        previous = user.split("## Находки прошлого круга", 1)[1].split("## Источники", 1)[0] \
            if "## Находки прошлого круга" in user else ""
        resolutions = [{"finding_id": f, "status": "resolved", "note": "исправлено"}
                       for f in re.findall(r"- \[(F-\d+)\]", previous)]
        findings = []
        task = re.search(r'"id": "(TASK-\d+)"', user)
        if mode == "полная проверка" and story == "US-001" and task:
            findings = [{"kind": "failure_not_handled", "severity": "high", "confidence": 90,
                         "task_ids": [task.group(1)], "scenario": "Повтор CreateShipment создаст второе отправление",
                         "evidence": [{"where": "source", "ref": "PROTO:CourierService.CreateShipment",
                                       "quote": "Каждый вызов создаёт новое отправление"}],
                         "fix": "Добавить ключ идемпотентности"}]
        return {"resolutions": resolutions, "findings": findings}

    def skeptic(user):
        return {"verdicts": [{"finding_id": f, "verdict": "confirmed", "reason": "подтверждаю"}
                             for f in dict.fromkeys(re.findall(r'"id": "(F-\d+)"', user))]}

    return {"requirements": requirements, "analyst": analyst, "stories": stories, "tasks": tasks, "critic": critic,
            "reviewer": reviewer, "junction": lambda user: {"findings": []},
            "simplifier": lambda user: {"findings": []}, "skeptic": skeptic}


class FakeLLM:
    model = "fake-model"

    def __init__(self, replies=None):
        self.replies = replies or default_replies()
        self.calls: dict[str, list[str]] = defaultdict(list)
        self.retry_reasons: dict[str, str] = {}

    async def complete_json(self, prompt_name, user, schema, on_token=None, on_retry=None):
        self.calls[prompt_name].append(user)
        if on_retry and prompt_name in self.retry_reasons:
            on_retry(2, self.retry_reasons[prompt_name])
        data = self.replies[prompt_name](user)
        if on_token:
            on_token("{…}", "content")
        return schema.model_validate(data)
