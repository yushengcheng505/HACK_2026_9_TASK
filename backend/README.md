# Агент-декомпозитор — бэкенд

Python 3.12 (uv), FastAPI, LangGraph. Эпик + документы + контракты → требования → вопросы
и пробелы → истории → задачи → проверки кодом → критик → DOCX / XLSX / JSON.

Спецификация: `../docs/superpowers/specs/2026-11-13-backend-mvp-design.md` (там же контракт событий SSE).

```bash
cp .env.example .env        # адрес и модель LLM
uv sync
uv run uvicorn app.main:app --reload --port 8000
uv run pytest               # тесты с поддельной LLM, сеть не нужна
uv run langgraph dev        # граф в LangGraph Studio (нужен пакет langgraph-cli[inmem])
```

## LLM
Любой OpenAI-совместимый endpoint, код не меняется — только `.env`:

| Где | `LLM_BASE_URL` | `LLM_MODEL` | Прочее |
|---|---|---|---|
| llama-server (Bonsai) | `http://localhost:8080/v1` | `local` | `LLM_CONCURRENCY=1` |
| vLLM за HAProxy (Qwen3.8) | `http://haproxy:8000/v1` | `Qwen/Qwen3.8-27B-FP8` | `LLM_EXTRA_BODY={"chat_template_kwargs":{"enable_thinking":false}}`, `LLM_CONCURRENCY=4` |
| Облачный шлюз (разработка) | `https://api.arcmux.net/v1` | `deepseek-v4.1-flash` | `LLM_API_KEY_ENV=ARCMUX_API_KEY` |

`LLM_JSON_MODE`: `json_schema` (по умолчанию), `json_object` или `off` — если сервер
не поддерживает structured output. Схема ответа в любом случае есть в системном промпте,
ответ проверяется Pydantic, при ошибке — до двух повторов с текстом ошибки.

Промпты — `prompts/*.md`. Версия (хеш) каждого промпта сохраняется с запуском.

## Быстрая проверка
```bash
curl -X POST localhost:8000/api/demos/boutique-delivery/run -H 'content-type: application/json' -d '{}'
curl -N localhost:8000/api/runs/<run_id>/events          # живой поток событий
curl -X POST localhost:8000/api/runs/<run_id>/answers -H 'content-type: application/json' -d '{"answers":{}}'
curl -OJ localhost:8000/api/runs/<run_id>/export/docx    # json | xlsx | docx
curl -N 'localhost:8000/api/runs/<run_id>/events?replay=1'  # проигрывание записанного прогона
```

## Структура
```
app/
  config.py     настройки из окружения и .env
  schemas.py    модели результата и ответов LLM
  sources.py    разбор входов в фрагменты с ID (EPIC-n, DOC-n, PROTO:…, API:…, EX-n)
  language.py   эвристика целевого языка
  context.py    отбор фрагментов в бюджет промпта (BM25)
  llm.py        прослойка OpenAI-совместимого API
  prompts.py    загрузка промптов и их версий
  checks.py     проверки кодом и покрытие
  graph.py      граф LangGraph
  exporters.py  JSON / XLSX / DOCX
  store.py      SQLite: запуски, события, версии промптов
  runner.py     запуск графа в фоне, рассылка событий
  demos.py      галерея демо-эпиков (../demo/<id>/demo.json)
  main.py       HTTP API
```
Данные — в `data/` (`app.db` — запуски и события, `checkpoints.db` — состояние графа).
