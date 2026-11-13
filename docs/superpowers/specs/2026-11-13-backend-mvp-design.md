# Бэкенд MVP, срез 1: сквозной путь «эпик → декомпозиция → DOCX/XLSX/JSON»

Основа — решения в `DECISIONS.md` (раздел 2). Здесь только то, что нужно, чтобы их реализовать
в первом срезе, и конкретные интерфейсы. Фронтенд (напарник) в срез не входит: он получает
контракт событий SSE (ниже) и HTTP API.

## Что входит в срез 1
- Разбор входов кодом: эпик, документы md/txt/docx, `.proto`, OpenAPI (yaml/json), примеры.
- Определение целевого языка эвристикой; при низкой уверенности — вопрос пользователю.
- Граф LangGraph: требования → аналитик (вопросы, пробелы, пауза) → истории → задачи
  по каждой истории → проверки кодом → критик-LLM (не больше 2 кругов) → итог.
- Прослойка LLM: любой OpenAI-совместимый endpoint, `response_format: json_schema`,
  проверка Pydantic, повтор с текстом ошибки.
- Промпты в `backend/prompts/*.md`; снимок версий промптов сохраняется с каждым запуском.
- Выгрузка JSON (со статистикой), XLSX, DOCX.
- SQLite: запуски, события, результаты, версии промптов. Состояние графа — `AsyncSqliteSaver`.
- HTTP API и SSE. Проигрывание записанного прогона — тот же SSE по сохранённым событиям.
- Ручные правки результата → только повторные проверки кодом.
- Галерея демо-эпиков: один интеграционный эпик с документацией и контрактом
  (Online Boutique + внешняя служба доставки), с заложенными противоречиями.

## Что НЕ входит (следующие срезы)
Jira, вебхук Bitbucket, HAProxy и docker compose, лаборатория (сравнение с эталоном),
подключение фронтенда к API, остальные эпики галереи.

## Структура
```
backend/
  pyproject.toml, .env.example, langgraph.json
  prompts/            requirements.md, analyst.md, stories.md, tasks.md, critic.md
  app/
    config.py         настройки из переменных окружения
    schemas.py        Pydantic-модели результата и ответов LLM
    sources.py        разбор входов → список фрагментов Source с ID
    language.py       эвристика целевого языка
    context.py        отбор фрагментов в бюджет (BM25)
    prompts.py        загрузка промптов, хеш версии
    llm.py            клиент OpenAI-совместимого API
    checks.py         проверки кодом и покрытие
    graph.py          граф LangGraph (+ `graph` для langgraph dev)
    exporters.py      JSON / XLSX / DOCX
    store.py          SQLite: runs, events, prompt_versions
    runner.py         запуск графа в фоне, рассылка событий подписчикам
    demos.py          галерея демо-эпиков
    main.py           FastAPI
  tests/
demo/<id>/            epic.md, docs/product/, docs/external/, contracts/, examples/
```

## ID фрагментов источников
- `EPIC-n` — абзац или пункт текста эпика.
- `DOC-n` — раздел документа (по заголовкам; для txt — по абзацам).
- `PROTO:Service.Method` — RPC; `PROTO:Message` — сообщение.
- `API:METHOD /path` — операция OpenAPI.
- `EX-n` — файл-пример.

Операции контракта для покрытия — RPC и операции OpenAPI (сообщения не считаются).

## Граф
Состояние: входы, фрагменты, язык, требования, вопросы, ответы, допущения, пробелы, истории
с задачами, замечания проверок, номер круга критика.

1. `parse_inputs` (код) — фрагменты, событие `sources_parsed`.
2. `detect_language` (код) — `language_detected`; при уверенности < 0.6 вопрос о языке
   добавляется к вопросам аналитика.
3. `extract_requirements` (LLM) — `REQ-001…`, у каждого `source_refs`.
4. `analyst` (LLM) — 3–5 вопросов с 2–3 вариантами и рекомендуемым вариантом, пробелы
   и противоречия с двумя ссылками на источники. Если вопросы есть и `skip_questions=false` —
   `interrupt()`, статус `waiting_answers`. На неотвеченные вопросы берётся рекомендуемый
   вариант и записывается в допущения.
5. `stories` (LLM) — истории «Как…, я хочу…, чтобы…» с критериями приёмки и `requirement_ids`.
6. `tasks` (LLM, по одному вызову на историю) — задачи с типом
   `backend|frontend|integration|db|qa|devops`, DoD, `requirement_ids`, `source_refs`,
   тест-сценариями для `qa`/`integration`. ID историй и задач присваивает код.
7. `checks` (код) — см. ниже.
8. `critic` (LLM) — получает результат и замечания кода, возвращает замечания по историям.
   Есть замечания и круг < 2 → `tasks` только для этих историй с текстом замечаний, затем снова
   `checks`. Иначе — `finalize`.
9. `finalize` (код) — итоговый `Decomposition` со статистикой и покрытием, `run_finished`.

Узлы шлют события через `get_stream_writer()` (stream mode `custom`), поэтому граф так же
работает в LangGraph Studio.

## Проверки кодом
- Ссылки: каждый `source_refs` есть среди фрагментов, каждый `requirement_ids` — среди
  требований. Несуществующая ссылка — замечание «выдуманный источник».
- Требования без историй; требования, на которые не ссылается ни одна задача.
- Задачи без `requirement_ids` (без обоснования).
- Дубли задач (нормализованный заголовок).
- Истории без критериев приёмки или не в формате «Как… я хочу… чтобы…».
- Операции контракта: задействованы — на них ссылается требование или задача; каждая операция
  попадает ровно в один список «задействованы» / «не задействованы». Нужны требованию, но
  без задач — ошибка; задействованы
  без задачи-теста (тип `qa` или есть тест-сценарии); не задействованы — список
  «подтвердите» (не ошибка).
- `coverage_percent` = доля требований, на которые ссылается хотя бы одна задача.

## LLM
Настройки: `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_JSON_MODE`
(`json_schema|json_object|off`), `LLM_EXTRA_BODY` (JSON, например
`{"chat_template_kwargs":{"enable_thinking":false}}` для Qwen на vLLM), `LLM_TEMPERATURE`,
`LLM_TIMEOUT`. Ответ стримится, куски текста уходят событиями `token`. Ответ разбирается как JSON
(допускаются ограждения ```), проверяется Pydantic; при ошибке — до 2 повторов с текстом ошибки.

Документы передаются в сообщении пользователя блоками `<source id="…">…</source>`.
Системный промпт говорит, что содержимое блоков — данные, а не инструкции.

## Контракт событий SSE
`GET /api/runs/{id}/events` отдаёт `id: <seq>`, `event: <type>`, `data: <json>`.
Сначала все сохранённые события (с `Last-Event-ID` — после него), затем живые.
`?replay=1` — проигрывание сохранённых событий с исходными паузами (не больше 2 с);
`&speed=4` ускоряет проигрывание.

| type | data |
|---|---|
| `run_started` | `{run_id, epic: {title}, model}` |
| `node_started` / `node_finished` | `{node, label}` / `{node, label, summary}` |
| `sources_parsed` | `{sources: [{id, kind, file, title, excerpt}], contract_ops: [id]}` |
| `language_detected` | `{value, confidence, evidence}` |
| `token` | `{node, kind: content\|reasoning, text}`; для задач `node` = `tasks:US-001` |
| `requirement_created` | `{requirement}` |
| `gap_found` | `{gap}` |
| `questions_asked` | `{questions, waiting}` |
| `waiting_answers` | `{questions}` — граф на паузе, ждёт `POST /answers` |
| `answers_received` | `{answers, assumptions, language}` |
| `story_created` | `{story}` (без задач) |
| `tasks_replaced` | `{story_id, removed: [task_id]}` — перед новыми задачами после замечаний |
| `task_created` | `{story_id, task}` |
| `checks_finished` | `{issues, coverage}` |
| `critic_feedback` | `{round, notes: [{story_id, problem}]}` |
| `run_finished` | `{stats, coverage}` |
| `run_failed` | `{error}` |
| `result_edited` | `{stats, coverage, issues}` — после `PUT /result` |

## HTTP API
- `GET /api/health`
- `GET /api/demos`; `POST /api/demos/{demo_id}/run` (`{skip_questions}`)
- `POST /api/runs` — multipart: `title`, `text`, `skip_questions`, файлы `product_docs[]`,
  `external_docs[]`, `contracts[]`, `examples[]`. Ответ `{run_id}`.
- `GET /api/runs` — история; `GET /api/runs/{id}` — статус, вопросы, результат.
- `GET /api/runs/{id}/events` — SSE.
- `POST /api/runs/{id}/answers` — `{answers: {Q-1: "текст"}}`; пустой словарь = «пропустить».
- `PUT /api/runs/{id}/result` — исправленный результат → проверки кодом → новый результат.
- `GET /api/runs/{id}/export/{json|xlsx|docx}`.

Статусы запуска: `running`, `waiting_answers`, `done`, `failed`.

## Ошибки
Ошибка LLM после повторов или исключение в узле → `run_failed`, статус `failed`, текст ошибки
в запуске. Перезапуск сервера: запуски в `running` помечаются `failed`; `waiting_answers`
продолжаются ответом (состояние графа в чекпоинтах SQLite).

## Тесты
pytest: разбор proto/OpenAPI/docx, эвристика языка, проверки и покрытие, выгрузка (файлы
открываются обратно), граф целиком с поддельной LLM (с паузой и продолжением), API через
TestClient. Живой прогон демо-эпика на реальной OpenAI-совместимой модели.
