# SYNAPS — фронтенд

React 19 + TypeScript + Vite + Tailwind CSS 4. Линтер — oxlint.

```bash
npm install
npm run dev      # дев-сервер с HMR
npm run build    # проверка типов (tsc -b) и сборка в dist/
npm run lint
npm run preview  # отдать собранный dist/
```

Отладка анимации: `http://localhost:5173/?t=8.5` останавливает прогон на 8.5 секунде.

Витрина маленьких роботов: `http://localhost:5173/agents/` — каждый из 8 агентов в трёх состояниях
(ожидание, работа, успех), крупно и в натуральную величину. Отдельная точка входа, к бэкенду не обращается.

## Пульт декомпозиции — `/console/`

Вторая страница (отдельная точка входа Vite) для работы с агентом из `../backend`. Лендинг `/` от неё не зависит
и к бэкенду не обращается: сцена с агентами — демонстрация, кнопки «Открыть консоль» и «Попробуй сам» ведут сюда.
Dev-сервер проксирует `/api` на бэкенд `http://localhost:8000` (другой адрес — `API_URL=... npm run dev`).

```bash
cd ../backend && uv run uvicorn app.main:app --port 8000   # бэкенд
npm run dev                                               # http://localhost:5173/console/
```

Маршруты в хеше: `#/` — запуск, `#/runs` — журнал, `#/run/<id>` — прогон (карта, таблица, ОТК, пробелы).
Дизайн и контракт событий: `../docs/superpowers/specs/2026-11-14-console-design.md`.

## Структура

Слои импортируют только «вниз»: `app → pages → widgets → features → entities → shared`.
Каждый срез отдаёт наружу только то, что есть в его `index.ts`.

```
src/
  app/                 точки сборки: App (лендинг), ConsoleApp (пульт), AgentsApp (витрина агентов); стили: index.css, console.css
  pages/home/          главная страница — только компоновка виджетов
  pages/console/       пульт: маршрутизация по хешу
  pages/agents/        витрина маленьких роботов: 8 агентов × 3 состояния
  widgets/
    site-header/       шапка и навигация
    hero/              заголовок страницы
    agent-stage/       сцена: NAPS и 8 агентов в два ряда — декомпозиция и проверка
      model/           геометрия сцены: ряды и масштаб агентов, маршруты самолётиков, руки NAPS
      ui/              тулбар с этапами, консоль NAPS, строка задачи (не интерактивная)
      ui/scene/        SVG-сцена: orchestrator/, agents/ (слот с маленькой моделью AgentFigure и подписью),
                       подписи рядов, маршруты, самолётики; анимации NAPS и маршрутов — классы fx-* в scene.css
    site-footer/
    console-shell/     пульт: боковая панель, статус модели и контура
    launch-panel/      галерея демо-эпиков и форма своего эпика
    runs-list/         журнал запусков
    run-workspace/     экран прогона — компоновка виджетов ниже
    run-header/ run-metrics/ pipeline-rail/   шапка, метрики, рельс конвейера с петлёй критика
    trace-map/         трассировочная карта: источники → требования → истории → задачи, связи в SVG
    inspector/         выбранный узел, его обоснование и текст источника
    telemetry/         поток модели и журнал событий
    questions-panel/   вопросы аналитика, когда граф на паузе
    results-table/ qc-report/ gaps-board/     вкладки: правка, ОТК, пробелы
  features/
    team-run/          логика прогона без отрисовки
      model/timeline.ts        все тайминги: две волны — сначала декомпозиция, потом проверка
      model/scenario.ts        демо-задача и названия этапов
      model/computeRunFrame.ts чистая функция time → состояние страницы
      model/useTeamRun.ts      хук: часы + кадр
    export-result/     кнопки «Скопировать» и «Скачать .md»
    run-stream/        поток SSE прогона → модель (пачки событий раз в кадр)
    launch-run/ answer-questions/ edit-result/   запуск, ответы аналитику, правки результата
  entities/agent/      агенты: типы, список из 8 ролей в двух командах, AgentAvatar — маленькая версия каждого робота
                       с состояниями waiting / working / done (анимации — классы av-* в avatar.css)
  entities/run/        прогон: типы событий и результата, редьюсер applyEvent, цепочки прослеживаемости
  shared/              палитра для SVG, математика кривых, Button, Caret, LogoMark (голова NAPS), BrandName (SYNAPS)
```

## Где искать ошибку

- Неверный статус, текст или момент события — `features/team-run/model/` (не зависит от React,
  можно вызвать `computeRunFrame(t)` для любого `t`).
- Самолётик летит не туда, руки не попадают по клавишам — `widgets/agent-stage/model/`.
- Не так нарисован или анимирован конкретный агент — `entities/agent/ui/AgentAvatar.tsx` и `avatar.css`
  (те же модели и на сцене главной, и на витрине `/agents/`).
  В DOM у групп есть атрибуты `data-agent` и `data-layer`.
- Цвета: токены Tailwind в `app/styles/index.css`, копия для SVG — `shared/config/palette.ts`.
- Пульт показывает не то, что прислал бэкенд — `entities/run/model/applyEvent.ts` (чистая функция
  `applyEvent(view, event)`); связи и подсветка цепочки — `entities/run/model/trace.ts`.
