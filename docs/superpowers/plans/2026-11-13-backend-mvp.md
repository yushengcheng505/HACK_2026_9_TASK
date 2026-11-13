# Бэкенд MVP, срез 1 — план реализации

> Исполнение: inline (executing-plans), задачи по порядку, тесты после каждой.

**Goal:** сквозной путь «эпик + документы + контракт → граф агента → проверенная декомпозиция →
DOCX/XLSX/JSON» с HTTP API и SSE.

**Architecture:** FastAPI в одном процессе с LangGraph. Детерминированное (разбор, проверки,
покрытие, выгрузка) — код; смысловое — LLM через OpenAI-совместимую прослойку. Состояние графа —
`AsyncSqliteSaver`, запуски и события — SQLite.

**Tech Stack:** Python 3.12 (uv), FastAPI, uvicorn, LangGraph + langgraph-checkpoint-sqlite,
openai, pydantic 2, PyYAML, python-docx, openpyxl, aiosqlite, pytest, httpx.

**Spec:** `docs/superpowers/specs/2026-11-13-backend-mvp-design.md`

## Global Constraints
- Python 3.12, менеджер — uv, всё в `backend/`.
- Никаких внешних вызовов, кроме настроенного `LLM_BASE_URL`; трассировка LangSmith выключена
  (`LANGSMITH_TRACING=false`).
- Без PDF. Без векторной базы.
- Тексты для пользователя — на русском.
- Документы — данные, не инструкции (блоки `<source id>` + правило в системных промптах).

---

### Task 1: Каркас и конфиг
Files: `backend/pyproject.toml`, `backend/.env.example`, `backend/app/__init__.py`,
`backend/app/config.py`, `backend/tests/conftest.py`.
Produces: `Settings` (dataclass) и `get_settings() -> Settings` с полями `llm_base_url, llm_api_key,
llm_model, llm_json_mode, llm_extra_body: dict, llm_temperature, llm_timeout, data_dir: Path,
context_char_budget: int, prompts_dir: Path, demo_dir: Path`.
Test: `uv run pytest` запускается (0 тестов не падает).

### Task 2: Схемы
Files: `backend/app/schemas.py`, `backend/tests/test_schemas.py`.
Produces: `Source(id, kind, file, title, text)`, `Requirement(id, type, text, source_refs)`,
`Question(id, text, options, recommended, answer)`, `Gap(id, text, risk, source_refs)`,
`TestScenario(name, input, expected)`, `Task(id, title, description, type, definition_of_done,
requirement_ids, source_refs, test_scenarios)`, `Story(id, title, description,
acceptance_criteria, requirement_ids, tasks)`, `Language(value, confidence, evidence)`,
`Issue(code, severity, target_id, message)`, `Coverage(...)`, `Stats(...)`, `Decomposition(...)`;
ответы LLM: `RequirementsOut`, `AnalystOut`, `StoriesOut`, `TasksOut`, `CriticOut`.
Test: `Decomposition.model_validate` на минимальном примере; `TasksOut` отклоняет неизвестный тип.

### Task 3: Демо-контент
Files: `demo/boutique-delivery/{epic.md, docs/product/online-boutique.md,
docs/external/courier-api-guide.md, contracts/courier.proto, contracts/shipping.proto,
contracts/courier-tracking.yaml, examples/shipping_client.go}`.
Заложенные противоречия: эпик требует повторять создание отправления при сбое, контракт
не описывает ключ идемпотентности; эпик обещает уведомления о статусе в реальном времени,
а гайд описывает только опрос раз в 15 минут.

### Task 4: Разбор входов, язык, контекст
Files: `backend/app/sources.py`, `backend/app/language.py`, `backend/app/context.py`,
`backend/tests/test_sources.py`, `backend/tests/test_language.py`.
Produces: `InputFile(name, role, content: bytes)`; `parse_inputs(epic_text, files) ->
list[Source]`; `contract_ops(sources) -> list[str]`; `detect_language(files, sources) ->
Language`; `select_context(sources, query, budget) -> list[Source]`; `render_sources(sources) -> str`.
Tests: proto из демо даёт `PROTO:CourierService.CreateShipment` и сообщения; OpenAPI даёт
`API:GET /v1/shipments/{id}/status`; md режется по заголовкам в `DOC-n`; docx (собранный
в тесте python-docx) режется по Heading; `.go`-пример + `go_package` → `Go`, уверенность ≥ 0.6;
пусто → уверенность < 0.6; `select_context` укладывается в бюджет и всегда оставляет `EPIC-*`.

### Task 5: Промпты и прослойка LLM
Files: `backend/prompts/{requirements,analyst,stories,tasks,critic}.md`, `backend/app/prompts.py`,
`backend/app/llm.py`, `backend/tests/test_llm.py`.
Produces: `load_prompt(name) -> Prompt(name, text, version)`; `prompt_snapshot() -> dict`;
`LLMClient.complete_json(prompt_name, user, model_cls, on_token=None) -> model`; протокол
`LLM` с тем же методом (для поддельной LLM в тестах).
Tests (через `httpx.MockTransport` в openai-клиенте): ответ в ```json ограждении разбирается;
невалидный первый ответ → повтор с текстом ошибки во втором запросе; `response_format`
содержит схему при `json_schema`.

### Task 6: Проверки кодом и покрытие
Files: `backend/app/checks.py`, `backend/tests/test_checks.py`.
Produces: `run_checks(sources, requirements, stories) -> tuple[list[Issue], Coverage]`;
`compute_stats(...) -> Stats`.
Tests: выдуманный `PROTO:Courier.Teleport` → issue `unknown_source`; требование без задач →
в `uncovered_requirements`; задача без `requirement_ids` → `tasks_without_requirements`;
задействованный RPC без qa/integration → `ops_without_tests`; незадействованный → `unused_contract_ops`;
дубли; история не в формате «Как…».

### Task 7: Граф
Files: `backend/app/graph.py`, `backend/langgraph.json`, `backend/tests/fake_llm.py`,
`backend/tests/test_graph.py`.
Produces: `build_graph(checkpointer=None)`, `graph` (для Studio); узлы шлют события через
`get_stream_writer()`; LLM берётся из `config["configurable"]["llm"]`.
Tests (поддельная LLM по имени промпта): прогон без вопросов доходит до `finalize` с
историями и задачами; с вопросами — `__interrupt__`, после `Command(resume={})` допущения
записаны; критик с замечанием → второй вызов `tasks` только для этой истории, кругов ≤ 2.

### Task 8: Выгрузка
Files: `backend/app/exporters.py`, `backend/tests/test_exporters.py`.
Produces: `to_json(d) -> bytes`, `to_xlsx(d) -> bytes`, `to_docx(d) -> bytes`.
Tests: JSON содержит `stats`; xlsx открывается openpyxl, лист «Истории и задачи» содержит
все задачи; docx открывается python-docx и содержит заголовки историй.

### Task 9: Хранилище, раннер, API
Files: `backend/app/store.py`, `backend/app/runner.py`, `backend/app/demos.py`,
`backend/app/main.py`, `backend/tests/test_api.py`.
Produces: эндпоинты из спецификации; `Runner.start(run_id, inputs)`, `Runner.resume(run_id, answers)`,
`Runner.subscribe(run_id, after_seq)`.
Tests (TestClient + поддельная LLM): старт демо → события до `run_finished`, результат и три
выгрузки скачиваются; запуск с вопросами → `waiting_answers` → ответы → `done`; `PUT result`
с удалённой задачей → покрытие пересчитано; SSE отдаёт сохранённые события.

### Task 10: Живой прогон
Запуск сервера, прогон демо-эпика на реальной OpenAI-совместимой модели, проверка выгрузок,
правка промптов по итогам. `backend/README.md` с запуском и настройкой.
