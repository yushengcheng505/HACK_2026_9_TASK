# Агент-декомпозитор — бэкенд

Python 3.12 (uv), FastAPI, LangGraph. Эпик + документы + контракты → требования → вопросы
и пробелы → истории → задачи → проверки кодом → критик → DOCX / XLSX / JSON.

Спецификация: `../docs/superpowers/specs/2026-11-13-backend-mvp-design.md` (там же контракт событий SSE).

```bash
cp .env.example .env        # адрес и модель LLM
uv sync
uv run uvicorn app.main:app --reload --port 8000 --timeout-graceful-shutdown 2
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

Провайдер из `.env` — по умолчанию (id `env`). Другие провайдеры добавляются в интерфейсе
(раздел «Модели») и хранятся в `data/app.db`; ключ наружу не отдаётся. Провайдер и модель
выбираются при запуске и записываются в прогон.

Промпты — `prompts/*.md`. Правки из интерфейса (раздел «Промпты») лежат в `data/prompt_overrides/`
и действуют на следующие прогоны; исходники не меняются, сброс удаляет правку.
Версия (хеш) каждого промпта сохраняется с запуском.

Сколько запросов к модели идёт одновременно, задаётся при запуске и меняется во время прогона
(в том числе на паузе) — `PUT /api/runs/<id>/concurrency`, 1–32. `LLM_CONCURRENCY` — значение
по умолчанию. Новый лимит действует сразу: идущие запросы доживают, следующие ждут по новому.

## Проверка результата
`REVIEW_MODE=review` (по умолчанию): рецензент на каждую историю, редактор стыков, упрощатель,
фильтр находок кодом и скептик; подробности — `../docs/superpowers/specs/2026-11-14-review-workflow-design.md`.
`REVIEW_MODE=critic` — прежний один критик (для сравнения). `REVIEW_SKEPTIC` и `REVIEW_SIMPLIFIER`
(`true`/`false`) включают скептика и упрощателя. Журнал находок с вердиктами — поле `findings`
результата и лист «Проверка» в XLSX.

## Архитектор
`ARCHITECT=true` (по умолчанию; `false` или `architect` в `configurable` графа выключают) — шаг между историями и задачами:
Архитектор один раз на эпик составляет план интеграции — какой сервис вызывает какой внешний метод,
связи между сервисами, хранилища, общие правила (таймауты, повторы). Код проверяет план
(`app/architecture.py`: у внешнего метода один вызывающий сервис, методы — из контрактов или помечены
новыми) и один раз возвращает ошибки на исправление. План попадает в блок решений, обязательный для
генераторов задач и проверяющих, и в поле `architecture` результата. Включён по умолчанию;
сравнение с прогоном без него — вариант бенчмарка `review-architect` против `review`.

## Мини-бенчмарк проверки
Сравнивает варианты проверки на той же модели. Вариант (`bench/harness.py`, `VARIANTS`) — это
роли (`critic`, со скептиком и упрощателем или без), лимит токенов и правки промптов поверх
`prompts/`; изменённые промпты варианта кладутся в `<out>/_prompts/<вариант>`.
```bash
uv run python -m bench e2e    --out bench/results/<метка> [--variants a,b]   # полные прогоны демо-эпика
uv run python -m bench review --out bench/results/<метка> [--extended]       # дефекты M1–M7 (+M8–M9) и контроль
uv run python -m bench report --out bench/results/<метка>                    # отчёт report.md
```
Дефекты внедряются в итоговые результаты прогонов из `data/app.db` (`bench/mutations.py`),
готовые прогоны при перезапуске не повторяются, сорванные провайдером (429, 5xx, обрыв) —
не сохраняются. Результаты и выводы: `bench/results/2026-11-14*/report.md`.
Методика и сравнение вариантов — в [отчёте исследования](../docs/review-benchmark.md).

## Быстрая проверка
```bash
curl -X POST localhost:8000/api/demos/boutique-delivery/run -H 'content-type: application/json' -d '{}'
curl -N localhost:8000/api/runs/<run_id>/events          # живой поток событий
curl -X POST localhost:8000/api/runs/<run_id>/answers -H 'content-type: application/json' -d '{"answers":{}}'
curl -OJ localhost:8000/api/runs/<run_id>/export/docx    # json | xlsx | docx
curl -OJ localhost:8000/api/runs/<run_id>/bundle         # ZIP: входы, промпты, шаги, события и результат; любой статус
curl -N 'localhost:8000/api/runs/<run_id>/events?replay=1'  # проигрывание записанного прогона
curl -X POST localhost:8000/api/runs/<run_id>/pause         # пауза; /resume — продолжить с контрольной точки
curl -X PUT localhost:8000/api/runs/<run_id>/concurrency -H 'content-type: application/json' -d '{"value":4}'
curl localhost:8000/api/providers                            # провайдеры; /providers/<id>/models — список моделей
curl localhost:8000/api/prompts                              # промпты; PUT/DELETE /prompts/<имя> — правка и сброс
curl localhost:8000/api/bench                                # отчёты бенчмарка: сводка и серии
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
  prompts.py    загрузка промптов, их версий и правок из интерфейса
  providers.py  провайдеры моделей: встроенный из .env и сохранённые
  limiter.py    лимит параллельных запросов к модели, меняется на лету
  checks.py     проверки кодом и покрытие
  graph.py      граф LangGraph
  architecture.py  план интеграции Архитектора: проверка кодом и блок для промптов
  exporters.py  JSON / XLSX / DOCX
  store.py      SQLite: запуски, события, версии промптов
  runner.py     запуск графа в фоне, рассылка событий
  demos.py      галерея демо-эпиков (../demo/<id>/demo.json)
  main.py       HTTP API
```
Данные — в `data/` (`app.db` — запуски и события, `checkpoints.db` — состояние графа).

## Запуск в Docker
Нужен Docker Compose ≥2.24; из корня: `cd deploy && cp .env.example .env && docker compose up -d --build`.
В `deploy/.env` задайте `LLM_PRIMARY` и `LLM_BACKUP` как `host:port`; оба должны отвечать 200 на `/v1/models`.
Пример: модели на хосте `host.docker.internal:8080` и `host.docker.internal:8090`. На Debian это работает без настройки;
если включён `ufw`, разрешите доступ из сети Docker: `sudo ufw allow from 172.16.0.0/12 to any port 8080,8090 proto tcp`.
Адрес и порт интерфейса — `WEB_BIND` и `WEB_PORT` в `deploy/.env` (по умолчанию `0.0.0.0:18080`).
Настройки модели и секреты — в необязательном `backend/.env`; адрес LLM заменяется на `http://haproxy:8081/v1`.
Интерфейсы: http://localhost:18080/, `/console/`, `/agents/`; API: `curl localhost:18080/api/health`.
backend:8000 наружу не публикуется — к нему ходит nginx (`/api`), в том числе вебхук Bitbucket.
Статистика HAProxy: http://localhost:8404/; прокси моделей: http://localhost:8081/v1/models (только localhost).
Проверка: `docker compose config -q`; конфиг HAProxy: `docker compose exec haproxy haproxy -c -f /usr/local/etc/haproxy/haproxy.cfg`.
Для демонстрации резерва создайте две временные папки с `v1/models`: `{"data":[{"id":"primary"}]}` и `{"data":[{"id":"backup"}]}`.
Запустите `python3 -m http.server 8080 --directory <primary>` и `python3 -m http.server 8090 --directory <backup>`.
`curl localhost:8081/v1/models` → primary; остановите primary, подождите 5 с: тот же curl → backup, в статистике primary DOWN.
После демонстрации остановите обе заглушки и удалите временные папки; для реальной работы настройте адреса моделей.
Остановка: `docker compose down`; данные SQLite сохраняются в томе `backend-data`, демо подключены read-only.
