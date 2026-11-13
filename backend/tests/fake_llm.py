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
                          "source_refs": ["EPIC-4", "PROTO:CourierService.CreateShipment"]}]}

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

    return {"requirements": requirements, "analyst": analyst, "stories": stories, "tasks": tasks, "critic": critic}


class FakeLLM:
    model = "fake-model"

    def __init__(self, replies=None):
        self.replies = replies or default_replies()
        self.calls: dict[str, list[str]] = defaultdict(list)

    async def complete_json(self, prompt_name, user, schema, on_token=None):
        self.calls[prompt_name].append(user)
        data = self.replies[prompt_name](user)
        if on_token:
            on_token("{…}", "content")
        return schema.model_validate(data)
