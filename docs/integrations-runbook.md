# Jira, вебхук Bitbucket, Лаборатория, развёртывание — как устроено и как чинить

Записано 15.11 по итогам первой живой проверки. Секретов здесь нет: все они лежат только в `backend/.env`
(файл в `.gitignore`).

## Что где

| Что | Где |
|---|---|
| Адаптер Jira | `backend/app/tracker.py`, тесты — `backend/tests/test_tracker.py` |
| Вебхук Bitbucket | `backend/app/bitbucket.py`, эндпоинт `POST /api/webhooks/bitbucket` в `backend/app/main.py`, тесты — `backend/tests/test_bitbucket.py` |
| Публикация | `publish_run` и `publish_when_done` в `backend/app/main.py`; кнопка «В Jira» — `frontend/src/features/publish-tracker` |
| Лаборатория | `backend/app/lab.py`, промпт `backend/prompts/lab.md`, экран `frontend/src/widgets/lab-panel` |
| Эталоны аналитика | `demo/*/reference.md`, заложенные в них ошибки — `demo/REFERENCES.md` |
| Развёртывание | `deploy/` (compose, HAProxy, nginx), раздел «Запуск в Docker» в `backend/README.md` |
| План, по которому делали | `docs/superpowers/plans/2026-11-15-jira-webhook-lab-deploy.md` |

## Стенд

- **Jira Cloud:** `https://krimax298.atlassian.net`, проект `KAN` (team-managed), аккаунт `krimax298@gmail.com`.
  Типы: Эпик (уровень 1), История и Задание (0), Подзадача (−1). Код выбирает типы по уровню, а не по имени.
- **API-токен Jira** создан 15.11 с именем `synaps-hackathon` и **действует до 22.11.2026**. После этой даты
  публикация будет падать с `Jira 401`: создайте новый токен на
  https://id.atlassian.com/manage-profile/security/api-tokens и замените `JIRA_API_TOKEN` в `backend/.env`.
- **Bitbucket Cloud:** пространство `synaps-hack`, проект `SYN`, публичный репозиторий
  https://bitbucket.org/synaps-hack/synaps-epics. Вебхук `{385d328a-c160-4dca-a88b-27c146270359}`,
  событие `repo:push`, секрет в `BITBUCKET_WEBHOOK_SECRET`.
- **Раскладка эпика в репозитории** — как в `demo/<id>/`: `epics/<имя>/epic.md` (обязательно), `demo.json`
  (название), `docs/product/`, `docs/external/`, `contracts/`, `examples/`.
- **Модель для прогонов из вебхука** — модель сервера из `backend/.env`: сейчас arcmux `deepseek-v4.1-flash`,
  ключ берётся из переменной окружения `ARCMUX_API_KEY` (`LLM_API_KEY_ENV`).

Переменные `backend/.env` (имена; значения есть только в самом файле):
`LLM_BASE_URL`, `LLM_API_KEY_ENV`, `LLM_MODEL`, `JIRA_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT`,
`BITBUCKET_WEBHOOK_SECRET`. Без Jira-переменных кнопка «В Jira» скрыта, без секрета вебхук не проверяет подпись.

## Как проверить каждое звено

```bash
# 1. Бэкенд жив и видит Jira
curl -s localhost:8000/api/health
curl -s localhost:8000/api/tracker            # configured: true

# 2. Токен Jira работает (значение не печатается)
cd backend && uv run python -c "
import httpx; e=dict(l.split('=',1) for l in open('.env').read().splitlines() if '=' in l and not l.startswith('#'))
print(httpx.get(e['JIRA_URL']+'/rest/api/3/myself', auth=(e['JIRA_EMAIL'], e['JIRA_API_TOKEN'])).status_code)"

# 3. Публикация готового прогона (то же, что кнопка «В Jira»; повтор не создаёт дублей)
curl -s -X POST localhost:8000/api/runs/<run_id>/publish

# 4. Туннель доходит до бэкенда: без подписи должен быть 401 «Неверная подпись Bitbucket»
curl -s -X POST <публичный-адрес>/api/webhooks/bitbucket -H 'X-Event-Key: repo:push' -d '{}'

# 5. Публичный API Bitbucket отдаёт репозиторий без авторизации
curl -s -o /dev/null -w '%{http_code}\n' https://api.bitbucket.org/2.0/repositories/synaps-hack/synaps-epics
```

Ход прогона можно смотреть прямо в базе, даже если HTTP не отвечает:

```bash
cd backend && python3 -c "
import sqlite3; db=sqlite3.connect('file:data/app.db?mode=ro', uri=True)
print(db.execute(\"select id, origin, status, error from runs order by created_at desc limit 5\").fetchall())
print(db.execute(\"select type, count(*) from events where run_id='<run_id>' and type!='token' group by type\").fetchall())"
```

Полезные события прогона: `llm_retry` (повтор запроса к модели и причина), `review_skipped` (шаг проверки
пропущен после 3 неудач), `published` / `publish_failed` (итог автопубликации после вебхука).

## Сбои, которые уже случались

**«Jira: в проекте нужны типы эпик, история и подзадача».** `createmeta/{project}/issuetypes` возвращает типы
в поле `issueTypes`, а не `values`. Исправлено; если сообщение вернулось — проверьте ответ этого запроса
и что в проекте есть типы с уровнями 1, 0 и −1.

**Дубли в Jira при быстрой повторной публикации.** Поиск Jira видит новые задачи с задержкой. Поэтому ключи
прошлой публикации прогона хранятся в `runs.publication` и используются вместе с поиском по метке.
Задача, удалённая в Jira вручную, при следующей публикации создаётся заново (PUT → 404 → POST).
Между разными прогонами одного эпика задачи сопоставляются по метке и префиксу `[US-001]` в названии.

**Вебхук: прогон закончился, а в Jira пусто.** Автопубликация идёт фоновой задачей в процессе сервера.
Если сервер перезапустился между концом прогона и публикацией (например, `--reload` после правки кода),
она теряется без события `publish_failed`. Лечение — кнопка «В Jira» или `POST /api/runs/<id>/publish`.

**Сервер разработки перестал отвечать после правки кода.** `uvicorn --reload` перед перезапуском ждёт,
пока закроются все соединения, а SSE-поток открытой вкладки пульта не закрывается сам. Прогон в старом
процессе при этом продолжается (видно по базе), новые HTTP-запросы висят. Закройте вкладки пульта или
запускайте dev-сервер с `--timeout-graceful-shutdown 3`. Не правьте `backend/app/*.py`, пока идёт прогон.

**Шаг агента «Сбой», в «Мыслях» одно и то же повторяется по кругу.** Модель потратила весь лимит токенов
на рассуждения: в событиях `llm_retry` причина `пустой ответ (finish_reason=length)`, после трёх попыток —
`review_skipped`. Прогон не падает, но шаг пропущен. Лечение: поднять `LLM_MAX_TOKENS` (сейчас 8192)
или выключить рассуждения модели через `LLM_EXTRA_BODY`. Повторы `Expecting ',' delimiter` —
JSON обрезан по той же причине.

**Push в Bitbucket был, прогона нет.** По порядку:
1. Туннель жив? Проверка 4 выше. Быстрые туннели без аккаунта нестабильны:
   - cloudflared quick tunnel: при сбоях QUIC (`failed to dial to edge with quic`) запускать с
     `--protocol http2` и `--url http://127.0.0.1:8000` (не `localhost`); после переподключения адрес
     может умереть с ошибкой 530 — тогда только перезапуск и новый адрес;
   - localhost.run (`ssh -R 80:127.0.0.1:8000 nokey@localhost.run`) периодически меняет адрес.
2. Адрес вебхука совпадает с текущим адресом туннеля? После смены адреса его нужно обновить
   (Bitbucket → репозиторий → Repository settings → Webhooks, или скриптом ниже).
3. Push затронул `epics/<имя>/…`? Изменения вне `epics/` игнорируются; папка без `epic.md` в этом
   коммите (например, удалённая) пропускается.
4. 401 — секрет в `.env` и в вебхуке разный. Подпись: `X-Hub-Signature: sha256=<HMAC тела>`.
5. 502 «Не удалось получить файлы из Bitbucket» — API Bitbucket недоступен или репозиторий стал приватным
   (тогда нужны `BITBUCKET_USER` и `BITBUCKET_TOKEN`).

Изменённые файлы берутся из `diffstat/{new}..{old}` — порядок проверен на живом репозитории
(обратный порядок даёт пустой список).

**Docker: HAProxy не видит модели на хосте.** На NixOS контейнеры к хосту не пускает файрвол
(Layer4 timeout в статистике HAProxy). На Debian работает без настройки; если включён `ufw` —
команда есть в `backend/README.md`. Статистика HAProxy — `http://localhost:8404/`.

## Обновить адрес вебхука

Через интерфейс: https://bitbucket.org/synaps-hack/synaps-epics/admin/webhooks → вебхук → URL
`<новый адрес>/api/webhooks/bitbucket`. Секрет при смене адреса не сбрасывается.

## Перезапустить вебхук без правки эпика

Bitbucket не повторяет доставку сам. Самый простой способ — новый коммит в папку эпика (например,
пустая строка в конце `epic.md`) через веб-интерфейс Bitbucket или git.
