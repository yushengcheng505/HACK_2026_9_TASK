import json
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BACKEND_DIR.parent


def _load_dotenv(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


@dataclass(frozen=True)
class Settings:
    llm_base_url: str
    llm_api_key: str
    llm_model: str
    llm_json_mode: str
    llm_extra_body: dict
    llm_temperature: float
    llm_timeout: float
    llm_max_tokens: int
    llm_concurrency: int
    critic_rounds: int
    data_dir: Path
    prompts_dir: Path
    demo_dir: Path
    context_char_budget: int
    cors_origins: list[str]
    review_mode: str
    review_skeptic: bool
    review_simplifier: bool


def _flag(value: str) -> bool:
    return value.strip().lower() in ("1", "true", "yes", "on")


@lru_cache
def get_settings() -> Settings:
    _load_dotenv(BACKEND_DIR / ".env")
    os.environ.setdefault("LANGSMITH_TRACING", "false")
    env = os.environ.get
    return Settings(
        llm_base_url=env("LLM_BASE_URL", "http://localhost:8080/v1"),
        llm_api_key=os.environ.get(env("LLM_API_KEY_ENV", ""), "") or env("LLM_API_KEY", "none"),
        llm_model=env("LLM_MODEL", "local"),
        llm_json_mode=env("LLM_JSON_MODE", "json_schema"),
        llm_extra_body=json.loads(env("LLM_EXTRA_BODY", "{}")),
        llm_temperature=float(env("LLM_TEMPERATURE", "0.2")),
        llm_timeout=float(env("LLM_TIMEOUT", "300")),
        llm_max_tokens=int(env("LLM_MAX_TOKENS", "8192")),
        llm_concurrency=int(env("LLM_CONCURRENCY", "1")),
        critic_rounds=min(2, int(env("CRITIC_ROUNDS", "2"))),
        data_dir=Path(env("DATA_DIR", str(BACKEND_DIR / "data"))),
        prompts_dir=Path(env("PROMPTS_DIR", str(BACKEND_DIR / "prompts"))),
        demo_dir=Path(env("DEMO_DIR", str(REPO_DIR / "demo"))),
        context_char_budget=int(env("CONTEXT_CHAR_BUDGET", "24000")),
        cors_origins=env("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(","),
        review_mode=env("REVIEW_MODE", "review"),
        review_skeptic=_flag(env("REVIEW_SKEPTIC", "true")),
        review_simplifier=_flag(env("REVIEW_SIMPLIFIER", "true")),
    )
