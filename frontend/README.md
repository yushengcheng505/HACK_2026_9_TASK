# Стая — фронтенд

React 19 + TypeScript + Vite + Tailwind CSS 4. Линтер — oxlint.

```bash
npm install
npm run dev      # дев-сервер с HMR
npm run build    # проверка типов (tsc -b) и сборка в dist/
npm run lint
npm run preview  # отдать собранный dist/
```

Отладка анимации: `http://localhost:5173/?t=8.5` останавливает прогон на 8.5 секунде.

## Структура

Слои импортируют только «вниз»: `app → pages → widgets → features → entities → shared`.
Каждый срез отдаёт наружу только то, что есть в его `index.ts`.

```
src/
  app/                 точка сборки: App, глобальные стили и дизайн-токены (styles/index.css)
  pages/home/          главная страница — только компоновка виджетов
  widgets/
    site-header/       шапка и навигация
    hero/              заголовок страницы
    agent-stage/       сцена с агентами
      model/           геометрия сцены: позиции агентов, маршруты самолётиков, руки Ядра
      ui/              тулбар с этапами, консоль Ядра, форма задачи
      ui/scene/        SVG-сцена: orchestrator/, agents/ (по файлу на робота), маршруты, самолётики
    run-result/        блок «Финальный результат»: карточки агентов, статус, итог
    site-footer/
  features/
    team-run/          логика прогона без отрисовки
      model/timeline.ts        все тайминги
      model/scenario.ts        демо-тексты (заменятся данными с бэкенда)
      model/computeRunFrame.ts чистая функция time → состояние страницы
      model/useTeamRun.ts      хук: часы + задача + кадр
    export-result/     кнопки «Скопировать» и «Скачать .md»
  entities/agent/      агенты: типы, список, аватар
  shared/              палитра для SVG, математика кривых, печать текста, Button, Caret, LogoMark
```

## Где искать ошибку

- Неверный статус, текст или момент события — `features/team-run/model/` (не зависит от React,
  можно вызвать `computeRunFrame(t)` для любого `t`).
- Самолётик летит не туда, руки не попадают по клавишам — `widgets/agent-stage/model/`.
- Не так нарисован конкретный агент — `widgets/agent-stage/ui/scene/agents/<Name>Bot.tsx`.
  В DOM у групп есть атрибуты `data-agent` и `data-layer`.
- Цвета: токены Tailwind в `app/styles/index.css`, копия для SVG — `shared/config/palette.ts`.
