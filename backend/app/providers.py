"""Провайдеры моделей: любые OpenAI-совместимые API. Встроенный — из настроек сервера (.env),
остальные добавляются из интерфейса. Ключ хранится только на сервере и наружу не отдаётся."""

import os
from dataclasses import replace

import httpx

from app.config import Settings

ENV_ID = "env"
JSON_MODES = ("json_schema", "json_object", "off")


def api_key(provider: dict) -> str:
    return provider.get("api_key") or os.environ.get(provider.get("api_key_env") or "", "") or "none"


def builtin(settings: Settings, model: str) -> dict:
    return {"id": ENV_ID, "name": "Сервер (.env)", "base_url": settings.llm_base_url,
            "has_key": settings.llm_api_key not in ("", "none"), "api_key_env": None,
            "json_mode": settings.llm_json_mode, "default_model": model, "builtin": True}


def public(provider: dict) -> dict:
    return {k: provider.get(k) for k in ("id", "name", "base_url", "api_key_env", "json_mode", "default_model")} | {
        "has_key": api_key(provider) != "none", "builtin": False}


def provider_settings(settings: Settings, provider: dict, model: str) -> Settings:
    """Настройки вызова модели для прогона: адрес, ключ и режим JSON — от провайдера, остальное — от сервера.
    Дополнительные параметры запроса (LLM_EXTRA_BODY) относятся к серверному провайдеру и не переносятся."""
    return replace(settings, llm_base_url=provider["base_url"], llm_api_key=api_key(provider), llm_model=model,
                   llm_json_mode=provider.get("json_mode") or "json_schema", llm_extra_body={})


async def list_models(base_url: str, key: str) -> list[str]:
    headers = {"Authorization": f"Bearer {key}"} if key and key != "none" else {}
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(f"{base_url.rstrip('/')}/models", headers=headers)
        response.raise_for_status()
    return sorted({m["id"] for m in response.json().get("data", []) if m.get("id")})
