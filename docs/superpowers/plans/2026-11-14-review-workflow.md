# Проверяющие агенты — план реализации (этап 1 из 4)

> **Для исполнителя:** план выполняется inline тем же агентом (superpowers:executing-plans),
> субагенты не запускаются без явной просьбы владельца. Шаги — чекбоксы `- [ ]`. TDD: тест →
> красный → код → зелёный. Коммиты — только по просьбе владельца (правило сессии), поэтому шаг
> «Commit» заменён на «полный прогон тестов».

**Цель:** заменить одного критика на рецензентов историй, редактора стыков, упрощателя
и скептика с фильтром доказательств, сортировкой по серьёзности, удалением задач кодом,
правом оспорить и проверкой решённости. Старый критик остаётся режимом для бенчмарка.

**Архитектура:** узел графа `critic` остаётся, внутри выбирает режим. Чистая логика находок
(фильтр, сортировка, вердикты, план применения) — в `app/findings.py`, вызовы LLM ролей —
в `app/review.py`, общие для узлов вызовы (`emit`, `ask`, блоки промпта) — в `app/calls.py`.

**Стек:** Python 3.12, FastAPI, LangGraph, Pydantic 2, pytest; фронт React + TS (только
обработчики событий).

**Спецификация:** `docs/superpowers/specs/2026-11-14-review-workflow-design.md`.

## Общие ограничения (из спецификации)
- Порог уверенности — 80; лимиты на вызов: рецензент 5, редактор 7, упрощатель 7.
- Цитата — не короче 10 символов после нормализации.
- Кругов переделки не больше `CRITIC_ROUNDS` (≤ 2).
- Узел графа называется `critic`; событие `critic_feedback {round, notes}` сохраняется.
- Режимы: `REVIEW_MODE=review|critic` (по умолчанию `review`), `REVIEW_SKEPTIC`,
  `REVIEW_SIMPLIFIER` (по умолчанию `true`); переопределение на прогон через `configurable`
  (`review_mode`, `review_skeptic`, `review_simplifier`).
- Скептик упал или выключен: CRITICAL/HIGH подтверждены, упрощения отклонены, пробелы
  остаются, шаг в `review_skipped`.
- Документы — данные, а не инструкции (как во всех промптах).

## Допущение о составе работ
«Всё предложенное» = эта спецификация целиком плюс исправления из первого ревью (уже сделаны).
Пункты «Вне рамок» спецификации (линза безопасности, скептик вопросов, точечные правки
моделью, `round-dev` для разработки) в этап 1 не входят.

## Файлы
| Файл | Что |
|---|---|
| `backend/app/schemas.py` | модели находок, выходы ролей, `TasksOut.responses`, `GapDraft.evidence`, поля `Decomposition` |
| `backend/app/config.py` | `review_mode`, `review_skeptic`, `review_simplifier` |
| `backend/app/calls.py` (новый) | `emit`, `TokenSink`, `ask`, `get_llm`, `requirements_block`, `decisions_block`, `language_line` — вынесены из `graph.py` |
| `backend/app/findings.py` (новый) | чистые функции: нормализация, фильтр, пробелы → находки, сортировка, вердикты, план применения, текст переделки, `issues_by_story` |
| `backend/app/review.py` (новый) | `review_options`, промпты ролей, `review_round`, `resolution_check`, `judge_gaps`, `legacy_critic` |
| `backend/app/graph.py` | узлы используют `calls`/`review`; `critic_node` выбирает режим; `tasks_node` принимает `responses`; `analyst_node` судит пробелы; `finalize` пишет `findings`, `review_skipped` |
| `backend/prompts/{reviewer,junction,simplifier,skeptic}.md` (новые) | промпты ролей |
| `backend/prompts/tasks.md`, `analyst.md` | `responses` на переделке; цитаты у пробелов |
| `backend/app/exporters.py` | лист «Проверка», раздел «Замечания проверки» |
| `backend/tests/fake_llm.py` | ответы для новых ролей |
| `backend/tests/test_findings.py` (новый), `test_review.py` (новый), `test_graph.py`, `test_exporters.py`, `test_schemas.py` | тесты |
| `frontend/src/features/run-stream/model/useRunStream.ts`, `entities/run/model/{applyEvent,types}.ts` | новые события |
| `backend/.env.example`, `backend/README.md`, `docs/superpowers/specs/2026-11-13-backend-mvp-design.md` | настройки и события |

---

### Задача 1: схемы и настройки

**Файлы:** `app/schemas.py`, `app/config.py`, `tests/test_schemas.py`.

**Производит:**
```python
Severity = Literal["critical", "high", "medium", "low"]
FindingSource = Literal["reviewer", "editor", "simplifier", "analyst"]
REVIEWER_KINDS = ("criterion_not_covered", "contradicts_decision", "wrong_requirement",
                  "contract_mismatch", "failure_not_handled")
EDITOR_KINDS = ("duplicate", "gap_between_stories")
SIMPLIFIER_KINDS = ("unneeded_task", "reuse_existing", "platform_covers", "merge_tasks")

class Evidence(BaseModel):
    where: Literal["criterion", "decision", "requirement", "source", "task"]
    ref: str = ""
    quote: str

class FindingDraft(BaseModel):
    kind: str
    severity: Severity = "medium"
    confidence: int = Field(0, ge=0, le=100)
    story_ids: list[str] = []
    task_ids: list[str] = []
    scenario: str
    evidence: list[Evidence] = []
    fix: str = ""

class ReviewerFinding(FindingDraft):   kind: Literal[*REVIEWER_KINDS]
class EditorFinding(FindingDraft):     kind: Literal[*EDITOR_KINDS]
class SimplifierFinding(FindingDraft): kind: Literal[*SIMPLIFIER_KINDS]

class Finding(FindingDraft):
    id: str
    source: FindingSource
    round: int = 0
    verdict: Literal["pending", "confirmed", "downgraded", "rejected", "rejected_by_filter",
                     "deferred"] = "pending"
    verdict_reason: str = ""
    resolution: Literal["fixed", "disputed", "resolved", "not_resolved"] | None = None
    resolution_note: str = ""

class ResolutionDraft(BaseModel): finding_id: str; status: Literal["resolved", "not_resolved"]; note: str = ""
class ReviewerOut(BaseModel): resolutions: list[ResolutionDraft] = []; findings: list[ReviewerFinding] = []
class EditorOut(BaseModel): findings: list[EditorFinding] = []
class SimplifierOut(BaseModel): findings: list[SimplifierFinding] = []
class VerdictDraft(BaseModel):
    finding_id: str; verdict: Literal["confirmed", "downgraded", "rejected"]
    severity: Severity | None = None; reason: str = ""
class SkepticOut(BaseModel): verdicts: list[VerdictDraft] = []
class TaskResponse(BaseModel): finding_id: str; status: Literal["fixed", "disputed"]; note: str = ""
# TasksOut: + responses: list[TaskResponse] = []
class GapEvidence(BaseModel): source_id: str; quote: str
# GapDraft: + evidence: list[GapEvidence] = []
class ReviewSkip(BaseModel): step: str; story_id: str | None = None; reason: str
# Decomposition: + findings: list[Finding] = []; review_skipped: list[ReviewSkip] = []
```
`Settings`: `review_mode: str` (`REVIEW_MODE`, по умолчанию `review`), `review_skeptic: bool`,
`review_simplifier: bool` (`REVIEW_SKEPTIC`, `REVIEW_SIMPLIFIER`, по умолчанию `true`;
истина — `1|true|yes|on`).

- [ ] Тест: `ReviewerFinding(kind="duplicate", …)` падает с `ValidationError`, `EditorFinding`
  с тем же видом проходит; `Decomposition` без `findings` валидна (старые результаты в базе);
  `TasksOut` без `responses` валиден.
- [ ] Красный → модели и настройки → зелёный, `pytest -q` целиком зелёный.

### Задача 2: вынос общих вызовов в `app/calls.py`
Рефакторинг без изменения поведения: `emit`, `TokenSink`, `ask`, `get_llm`, `_default_llm`,
`requirements_block(reqs)`, `decisions_block(state)`, `language_line(state)` переезжают из
`graph.py`; `graph.py` импортирует их. Константа `DECISIONS_HEADING` — туда же.
- [ ] `pytest -q` зелёный до и после (поведение не меняется, новых тестов не нужно).

### Задача 3: `app/findings.py` — фильтр доказательств
**Производит:**
```python
MIN_CONFIDENCE = 80; MIN_QUOTE = 10
LIMITS = {"reviewer": 5, "editor": 7, "simplifier": 7}
SEVERITY_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3}
REMOVAL_KINDS = {"duplicate", "unneeded_task", "reuse_existing"}

def normalize(text: str) -> str            # нижний регистр, «»“”„' → ", ё → е, пробелы схлопнуты
@dataclass
class ReviewContext:
    stories: list[Story]; requirements: list[Requirement]; sources: list[Source]; decisions: str
    def task_index(self) -> dict[str, tuple[Story, Task]]
def task_text(task: Task) -> str
def sole_cover(ctx: ReviewContext, task_id: str, excluded: set[str] = frozenset()) -> list[str]
    # требования, операции контракта, нужные требованиям, и «тест OP», которые без задачи
    # (и без excluded) остаются без задач
def filter_findings(findings: list[Finding], ctx: ReviewContext, limit: int | None = None) -> None
    # ставит verdict="rejected_by_filter" и причину; затем режет сверх limit (по уровню, уверенности)
def gap_findings(gaps: list[GapDraft], sources: list[Source], first_id: int) -> list[Finding]
    # пробел → Finding(kind="gap", source="analyst", severity="high", confidence=100);
    # несуществующий source_ref или ни одной найденной цитаты → rejected_by_filter
```
Правила фильтра (по порядку, первая сработавшая — причина):
1. уверенность < 80;
2. несуществующие номера историй или задач;
3. вид из `{contradicts_decision, wrong_requirement, duplicate, merge_tasks, unneeded_task,
   reuse_existing, platform_covers}` без задачи;
4. `duplicate`/`merge_tasks` — меньше двух разных задач;
5. нет доказательства или хоть одна цитата не найдена (поиск по `ref`, иначе по всем текстам
   того же вида);
6. `unneeded_task`, задача единственная для требования, нужной операции или её теста.

Тесты (`tests/test_findings.py`, контекст: 2 истории, 3 требования, источник `PROTO:Courier.Create`
с текстом «Каждый вызов создаёт новое отправление», решение «Опрашивать статус раз в 15 минут»):
- [ ] цитата из решения с другим регистром, «ё» и лишними пробелами проходит;
- [ ] выдуманная цитата → `rejected_by_filter`, причина содержит «цитата не найдена»;
- [ ] `ref` с опечаткой, но цитата есть в другом источнике → проходит;
- [ ] уверенность 79 → отсекается; цитата короче 10 символов → отсекается;
- [ ] `TASK-999` → «несуществующие номера»; `duplicate` с одной задачей → отсекается;
- [ ] `unneeded_task` для единственной задачи REQ-003 → отсекается, причина называет REQ-003;
  для задачи, у которой требование покрыто другой задачей, — проходит;
- [ ] лимит 2 из 3 находок: остаются две с наибольшим уровнем, третья — «лимит роли»;
- [ ] `gap_findings`: несуществующий источник → отсекается; одна из двух цитат найдена → проходит.

### Задача 4: `app/findings.py` — сортировка, вердикты, план применения
**Производит:**
```python
def triage(findings: list[Finding]) -> list[Finding]
    # pending: упрощения и пробелы → скептику; critical/high → скептику; medium/low → "deferred"
def apply_verdicts(findings: list[Finding], verdicts: list[VerdictDraft] | None, reason: str = "") -> None
    # confirmed/downgraded(уровень ниже high, по умолчанию medium)/rejected;
    # нет вердикта или verdicts=None → упрощение rejected, остальное confirmed, с причиной
@dataclass
class Actions:
    removals: list[tuple[str, str, str]]      # (story_id, task_id, finding_id)
    redo: dict[str, list[Finding]]            # история → подтверждённые + её отложенные
def plan_actions(findings: list[Finding], ctx: ReviewContext) -> Actions
def apply_removals(stories: list[Story], removals) -> list[Story]
def redo_text(findings: list[Finding]) -> str
def issues_by_story(stories, requirements, issues: list[Issue], skip: tuple[str, ...]) -> dict[str, list[str]]
    # перенос _issues_by_story из graph.py
```
Правила `plan_actions`:
- подтверждённые `duplicate`: удаляется задача с наибольшим `(story_id, task_id)`;
  `unneeded_task`/`reuse_existing` — `task_ids[0]`; если `sole_cover(…, excluded=уже удалённые)`
  не пуст — не удаляем, находка уходит в `redo` её истории; удалённой находке
  `resolution="fixed"`, `resolution_note="задача удалена кодом"`;
- остальные `confirmed` и находки с `resolution="not_resolved"` → `redo` истории первой
  задачи, иначе `story_ids[0]`; без истории — `resolution_note="не к чему применить"`;
- `deferred`/`downgraded` добавляются в `redo` только своей истории, если она уже там.

`redo_text`: блок «Находки проверки — по каждой [F-…] верни в responses fixed или disputed
с причиной», строки `- [F-3] HIGH · contradicts_decision · TASK-091: сценарий. Исправить: … .
Доказательство: «…»`; затем блок «Необязательно» для отложенных.

Тесты:
- [ ] `triage`: high → скептику, low → `deferred`, упрощение medium → скептику;
- [ ] `apply_verdicts`: downgraded с уровнем high становится medium; `None` → упрощение
  отклонено, high подтверждена, причина записана;
- [ ] `plan_actions`: дубль US-001/TASK-002 и US-002/TASK-005 → удаляется TASK-005;
  удаление единственной задачи требования превращается в `redo`; две находки на одну задачу —
  одно удаление; отложенная едет только вместе с подтверждённой своей истории;
- [ ] `redo_text` содержит `[F-3]`, «Необязательно» и цитату.

### Задача 5: промпты ролей
Новые `reviewer.md`, `junction.md`, `simplifier.md`, `skeptic.md` по спецификации (роли, виды,
уровни, порог 80, лимиты, «известное и принятое — не сообщать», цитаты дословно, жёсткие
ограничения упрощателя, позиция скептика «опровергнуть»). Режимы рецензента задаются строкой
во входе: `## Режим: полная проверка` / `## Режим: изменения и решённость` /
`## Режим: только решённость`. `tasks.md`: правило про `responses`. `analyst.md`: у каждого
пробела `evidence` — дословные цитаты из указанных источников.
- [ ] `test_schemas` / `prompt_snapshot` видит новые промпты; `pytest -q` зелёный.

### Задача 6: `app/review.py` — роли и круг проверки
**Производит:**
```python
@dataclass
class ReviewOptions: mode: str; skeptic: bool; simplifier: bool; rounds: int
def review_options(config: RunnableConfig) -> ReviewOptions
def context_from_state(state) -> ReviewContext
async def review_round(state, config, round_: int) -> dict
async def resolution_check(state, config) -> dict
async def judge_gaps(state, config, gaps: list[GapDraft]) -> tuple[list[GapDraft], list[Finding], list[ReviewSkip]]
async def legacy_critic(state, config) -> dict          # нынешний critic_node без изменений поведения
```
`review_round` (круг 1 — все истории, редактор, упрощатель если включён; круг 2 — только
`state["redone"]`, без редактора и упрощателя):
1. вызовы ролей параллельно под семафором `LLM_CONCURRENCY`; упавший вызов → `ReviewSkip`
   и событие `review_skipped`;
2. находки → `Finding(id=f"F-{n}", source, round)`, у рецензента пустые `story_ids` = его
   история; `filter_findings(…, limit=LIMITS[role])` на каждый вызов; `resolutions`
   рецензента → `resolution` открытых находок; событие `findings_collected`;
3. `triage` → скептик (если включён), `apply_verdicts`; событие `findings_judged`
   (`error` при падении);
4. `plan_actions` по новым и `not_resolved`; удаления → `apply_removals`, событие
   `tasks_removed`, повторный `run_checks`;
5. переделка: `redo_text` + строки ошибок кода (`issues_by_story`, пропуская
   `NOT_FIXABLE_BY_TASKS + ADVISORY_ISSUES`); событие `critic_feedback {round, notes, error}`;
6. возвращает `findings`, `redo`, `redone=list(redo)`, `critic_round`, `stories`, `issues`,
   `coverage`, `review_skipped`.

`resolution_check`: рецензенты для `state["redone"]` в режиме «только решённость», без
скептика и новых находок; событие `findings_resolution`; возвращает `redo={}`.

Тесты (`tests/test_review.py`, поддельная LLM, состояние собирается из демо через граф
до `tasks`):
- [ ] круг 1: вызовов `reviewer` = число историй, `junction` и `simplifier` по одному,
  `skeptic` один; `REVIEW_SIMPLIFIER=false` → `simplifier` не вызывается;
- [ ] high от рецензента подтверждена → история в `redo`, текст содержит `[F-1]`;
- [ ] low → `deferred`, переделки нет;
- [ ] подтверждённый дубль удаляет задачу без вызова `tasks`, событие `tasks_removed`;
- [ ] упрощатель с выдуманной цитатой → `rejected_by_filter`, скептик его не видит;
- [ ] скептик бросает `LLMError` → high подтверждена, упрощение отклонено, `review_skipped`
  содержит `skeptic`;
- [ ] `review_skeptic=False` в `configurable` → скептик не вызывается, high подтверждена;
- [ ] рецензент бросает `LLMError` → `review_skipped` с `story_id`, прогон идёт.

### Задача 7: граф
- `critic_node`: `opts.mode == "critic"` → `legacy_critic`; иначе `critic_round >= rounds` →
  `resolution_check`, иначе `review_round(round+1)`. Метка узла «Проверка, круг N».
- `tasks_node`: `out.responses` → `resolution`/`resolution_note` находок по `finding_id`;
  возвращает `findings`.
- `analyst_node` в режиме `review`: `judge_gaps`; в `gaps` и события `gap_found` идут только
  подтверждённые (GAP-1…k); находки пробелов — в `findings`.
- `finalize_node`: `findings`, `review_skipped` в `Decomposition`.
- Существующие тесты графа, проверяющие критика, получают `configurable.review_mode="critic"`.

Тесты (`tests/test_graph.py`):
- [ ] полный прогон в режиме `review` на поддельной LLM: результат валиден, `findings`
  непустой, `critic_feedback` пришёл, после последней переделки был `findings_resolution`;
- [ ] `responses` генератора записываются в `resolution` находки (`disputed` с причиной);
- [ ] пробел с выдуманной цитатой не попадает в `gaps`, но есть в `findings`;
- [ ] режим `critic` проходит старые тесты без изменений поведения.

### Задача 8: фронт
`EVENT_TYPES` + обработчики: `tasks_removed` убирает задачи из истории и пишет строку журнала;
`findings_collected`, `findings_judged`, `findings_resolution`, `review_skipped` — строки
журнала (число находок, подтверждено/понижено/отклонено, решено/не решено, что не проверено).
Типы: `Finding`, `ReviewSkip`, `Decomposition.findings?`, `review_skipped?`.
- [ ] `npx tsc -p tsconfig.app.json --noEmit` и `npx oxlint src` чистые.

### Задача 9: выгрузки
XLSX — лист «Проверка» (ID, круг, роль, вид, уровень, истории, задачи, сценарий, исправление,
вердикт, обоснование, решено); DOCX — раздел «Замечания проверки»: нерешённые подтверждённые,
пожелания (отложенные и пониженные), «Не проверено».
- [ ] тест: результат с находками → в XLSX есть лист «Проверка» со строкой `F-1`; в DOCX есть
  заголовок «Замечания проверки».

### Задача 10: документация и проверка целиком
- `.env.example`, `README.md` — `REVIEW_MODE`, `REVIEW_SKEPTIC`, `REVIEW_SIMPLIFIER`;
  `2026-11-13-backend-mvp-design.md` — узел `critic` и новые события.
- [ ] `pytest -q`, `tsc`, `oxlint` зелёные.
- [ ] Живой прогон демо на `deepseek-v4.1-flash` в режиме `review` (порт 8001, та же база):
  прогон `done`, нет падения ролей из-за формата, в `findings` есть вердикты, число задач
  и переделок записано. Временные процессы и логи убраны.

---

## Этапы 2–4 (отдельный план после этапа 1)
2. **Полноценные прогоны** демо по вариантам: `critic`; `review` без скептика; `review`
   полный; `review` без упрощателя — по 2 прогона.
3. **Специальные проблемы** из итоговых результатов прогонов: внедрение дефектов
   в сохранённое состояние (противоречие решению в описании, удалённая единственная задача
   критерия, дубль в другой истории, лишний механизм, ссылка не на то требование, убранная
   обработка таймаута, неверное поле контракта) — как мутационное тестирование,
   с разметкой «что должно быть найдено и исправлено».
4. **Мини-бенчмарк:** запуск только круга проверки с внедрённым состоянием
   (`aupdate_state(as_node="tasks")`) для каждого варианта, 2–3 повтора; метрики —
   найдено, исправлено, побочный ущерб (потерянные покрытия, удалённые нужные задачи),
   ложные подтверждения, вызовы, символы, время; отчёт таблицей.

---

# Этапы 2–4 — мини-бенчмарк (детали)

**Код:** `backend/bench/` — `harness.py` (счётчик вызовов LLM, прогоны графа в процессе),
`bases.py` (основы из записанных прогонов), `mutations.py` (дефекты и проверки),
`score.py` (метрики), `__main__.py` (CLI: `e2e`, `review`, `report`). Сырые результаты —
`backend/bench/results/<метка>/*.json` (не в git), отчёт — `report.md` там же.

**Варианты:** `critic` (старый критик), `review-noskeptic`, `review` (полный),
`review-nosimplifier`. Модель и настройки одинаковые: `deepseek-v4.1-flash`,
`LLM_CONCURRENCY=4`, `LLM_MAX_TOKENS=16384`, `CRITIC_ROUNDS=2`.

**Этап 2, полные прогоны (`e2e`):** демо-эпик без ответов на вопросы, по 2 прогона
на вариант. Метрики: время, вызовы по ролям, символы входа и выхода (ответ и рассуждения),
повторы, сбои ролей, истории, задачи, пробелы, сохранено ли заложенное противоречие
«минута против 15 минут», ошибки кода в итоге, возможные дубли, нерешённые находки.

**Этап 3, специальные проблемы:** 7 дефектов, внедрённых в итоговые результаты прогонов
`affbf77db561` (основа A) и `8ed2ce672494` (основа B). Каждый — в свою историю, с ключами
обнаружения и проверкой исправления:
| ID | Дефект | Как внедряется | Исправлено, если в итоговой истории |
|---|---|---|---|
| M1 | противоречие решению | задаче опроса статуса — «каждые 30 секунд» при допущении «не чаще раза в 15 минут» | нет «30 секунд» |
| M2 | непокрытый критерий | истории трек-номера — критерий «скачать PDF-этикетку по ссылке из письма» | есть «этикет»/`PrintLabel` |
| M3 | дубль между историями | копия задачи клиента `CreateShipment` в историю отмены (TASK-901) | нет TASK-901 и задачи с тем же названием |
| M4 | переусложнение | в историю журнала — Kafka-кластер и Schema Registry (TASK-902) | нет «Kafka» |
| M5 | не то требование | задаче журнала — требование отмены | ни одна задача не ссылается на это требование |
| M6 | не обработан отказ | из истории расчёта стоимости вычищены таймауты и дедлайны | есть «таймаут»/«дедлайн» |
| M7 | расхождение с контрактом | задаче `CreateShipment` — несуществующее поле `courier_priority` | нет `courier_priority` |
Плюс **контроль**: та же основа без дефектов — сколько система «чинит» то, что не сломано.

**Этап 4, круг проверки (`review`):** состояние подставляется после узла `tasks`
(`aupdate_state(as_node="tasks")`), дальше граф идёт как обычно (проверки → проверяющие →
переделки → итог). 2 основы × (дефекты + контроль) × 4 варианта × 2 повтора = 32 прогона.
Метрики на дефект: **найден** (в замечаниях на доработку его истории есть ключ дефекта или
задача удалена кодом), **поднят** (для `review*` — была находка с ключом, даже если её
отсеял фильтр или отклонил скептик), **исправлен** (проверка итогового состояния).
Побочный ущерб: прирост непокрытых требований и ошибок кода, задачи, удалённые кодом не по
дефектам, переделанные истории; в контроле — то же как «шум». Стоимость — как в этапе 2.
