# Отчёт по web-исследованию

## Короткий вывод

- В схеме, вероятно, смешаны два названия: **Qwen3-8B** и **Qwen3.8-27B**. На сегодня официальный `Qwen3.8-27B` действительно существует, но в исходном `TASK.md` упоминается модель класса Qwen3 около 8B. Это нужно уточнить у организаторов.
- Для локального ноутбука без CUDA реалистичнее **Ternary Bonsai 2 9B + llama.cpp CPU**. `Qwen3.8-27B` на 31 GB RAM запустится только в сильном 4-bit/GGUF режиме, но будет существенно медленнее.
- Для vLLM нужен NVIDIA GPU. Для `Qwen3.8-27B` практический минимум — RTX 4090/5090, лучше 32 GB VRAM; 32k контекста на 24 GB будет тесно.
- `langgraph dev` полностью запускает локальный Agent Server. Но официальный LangGraph Studio — web UI на `smith.langchain.com`, поэтому для него нужны интернет и, по текущей документации, LangSmith account/API key.
- Jira Cloud Free подходит для демонстрации, но hierarchy нужно строить как **Epic → Story → Sub-task**. Обычный `Task` обычно не является дочерним элементом Story в стандартной иерархии Jira.

---

## 1. Bonsai 2 9B

### Что это

Точное название — **`Ternary-Bonsai-2-9B`** от PrismML.

- Базовая модель: **Qwen3.5-9B**.
- Vision-language model: текст + изображения на входе, текст на выходе.
- Весы языковой модели ternary: `{−1, 0, +1}`; это не обычный INT1-квант, а специальное представление с групповыми FP16-scale.
- Языковая часть: примерно 8.95B параметров; vision tower — ещё около 0.46B.
- Контекст: **262 144 токена**.
- Лицензия: **Apache 2.0**.

Источники: [официальная карточка Bonsai 2 9B](https://docs.prismml.com/models/bonsai-2-9b), [GGUF-карточка Hugging Face](https://huggingface.co/prism-ml/Ternary-Bonsai-2-9B-gguf).

### Форматы и запуск

Доступны:

- GGUF:
  - `PTQ1_0` — около 2.00 GB;
  - `PQ2_0` — около 2.42 GB;
  - `Q2_0` — около 2.56 GB;
  - отдельный vision projector `mmproj`.
- MLX: `prism-ml/Ternary-Bonsai-2-9B-mlx-2bit`, около 3.46 GB.

Практически:

- `PTQ1_0` и `PQ2_0` требуют **PrismML fork llama.cpp**.
- `Q2_0` поддерживается upstream llama.cpp начиная примерно с `b11556`.
- MLX предназначен для Apple Silicon и не подходит для AMD/Linux.
- Есть CPU, CUDA, Vulkan и ROCm/HIP-сборки в demo-репозитории. Однако это не означает, что старый Radeon R7 будет пригоден для ROCm: конкретная поддержка этой старой GPU не подтверждена.

Источники: [Bonsai-demo](https://github.com/PrismML-Eng/Bonsai-demo), [backend compatibility](https://github.com/PrismML-Eng/Bonsai-demo/blob/main/BACKEND-SUPPORT.md).

### Ваш ноутбук

Конфигурация: 16 CPU-ядер, 31 GB RAM, без CUDA, старый AMD Radeon R7.

- **CPU-only запуск возможен**.
- Модель и KV-cache поместятся в RAM.
- Старый Radeon R7 разумно считать неиспользуемым; используйте CPU-сборку.
- 262k — это верхняя граница модели, а не практический режим для ноутбука. Для MVP я бы начинал с `-c 8192` или `-c 16384`, затем проверил 32k.
- У thinking-режима даже простой запрос может потреблять тысячи output-токенов; для JSON-декомпозиции лучше ограничить reasoning budget или выключить thinking.

### Скорость

Прямого опубликованного benchmark для **Bonsai 2 9B на аналогичном старом 16-ядерном CPU** я не нашёл.

Осторожная инженерная оценка для планирования — **единицы или низкие десятки токенов/с**, но это не подтверждённое число. Реальная скорость сильно зависит от CPU, AVX-расширений, числа потоков, KV-cache и размера контекста. Проверять нужно локальным `llama-bench`.

В официальной таблице есть ориентиры для других платформ: например, Bonsai/Ternary 8B выдаёт десятки токенов/с даже на старых GPU, но это не является CPU-бенчмарком вашего ноутбука. См. [community benchmarks](https://github.com/PrismML-Eng/Bonsai-demo/tree/main/community-benchmarks).

### OpenAI-compatible API и structured output

Да, через `llama-server`:

```bash
llama-server \
  -m Ternary-Bonsai-2-9B-PQ2_0.gguf \
  --mmproj Ternary-Bonsai-2-9B-mmproj-Q8_0.gguf \
  -c 32768 \
  --port 8080
```

API:

```text
http://localhost:8080/v1/chat/completions
```

Карточка Bonsai прямо показывает OpenAI-style image input и tool calling.

Текущий upstream `llama-server` подтверждённо поддерживает:

- OpenAI-compatible Chat Completions;
- `response_format`;
- JSON Schema;
- BNF/grammar-constrained decoding;
- function/tool calling.

Источники: [Bonsai GGUF card](https://huggingface.co/prism-ml/Ternary-Bonsai-2-9B-gguf), [upstream llama-server README](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md).

Оговорка: карточка Bonsai не фиксирует конкретную версию PrismML fork, на которой проверялся каждый вариант `response_format`. Поэтому для MVP нужно закрепить версию бинарника и отдельно протестировать ваш JSON Schema. Функциональность upstream подтверждена, но compatibility именно pinned PrismML build нужно проверить.

---

## 2. Qwen 3.8 27B

### Существует ли модель

Да. Каноническое имя — **`Qwen3.8-27B`**, без пробела.

Официальный репозиторий:

- [`Qwen/Qwen3.8-27B`](https://huggingface.co/Qwen/Qwen3.8-27B)
- официальный FP8-вариант: [`Qwen/Qwen3.8-27B-FP8`](https://huggingface.co/Qwen/Qwen3.8-27B-FP8)

Также существуют:

- [`Qwen/Qwen3.5-27B`](https://huggingface.co/Qwen/Qwen3.5-27B)
- [`Qwen/Qwen3.6-27B`](https://huggingface.co/Qwen/Qwen3.6-27B)

Официальный список моделей и дат выпуска: [QwenLM/Qwen3.8](https://github.com/QwenLM/Qwen3.8).

Важно: если на диаграмме написано «Qwen 3.8», организаторы могли иметь в виду **Qwen3 8B**, то есть `Qwen/Qwen3-8B`. Название `Qwen3.8-27B` — уже другая, более крупная модель.

### Основные характеристики

- 27B dense parameters.
- Native vision-language model: текст, изображения, видео.
- 64 слоя.
- Hybrid attention: Gated DeltaNet + обычные attention-слои.
- Контекст: **262 144 токена**.
- Через YaRN заявлено расширение до **1M токенов**.
- Thinking включён по умолчанию.
- Можно отключить через `enable_thinking: false`.
- `reasoning_effort`: `xhigh`, `medium`, `low`.
- `preserve_thinking`: сохраняет reasoning-контекст между сообщениями; по умолчанию включён.
- Лицензия: **Apache 2.0** — [LICENSE](https://huggingface.co/Qwen/Qwen3.8-27B/raw/main/LICENSE).

Источник: [официальная карточка Qwen3.8-27B](https://huggingface.co/Qwen/Qwen3.8-27B).

### Квантованные форматы

Подтверждённые варианты:

- Официальный HF checkpoint — BF16/safetensors.
- Официальный FP8 — [`Qwen/Qwen3.8-27B-FP8`](https://huggingface.co/Qwen/Qwen3.8-27B-FP8).
- Community GGUF:
  - [`bartowski/Qwen3.8-27B-GGUF`](https://huggingface.co/bartowski/Qwen3.8-27B-GGUF)
  - [`unsloth/Qwen3.8-27B-GGUF`](https://huggingface.co/unsloth/Qwen3.8-27B-GGUF)

У Bartowski есть:

- `Q4_K_M` — около **17.44 GB**;
- `Q5_K_M` — около 20.92 GB;
- `Q6_K`, `Q8_0` и другие GGUF-варианты;
- vision projector.

Подтверждённого **официального Qwen AWQ/GPTQ 4-bit репозитория** я не нашёл. Встречаются community-производные и Unsloth NVFP4, но это не то же самое, что стандартный AWQ/GPTQ.

### vLLM

vLLM официально указан Qwen как один из рекомендуемых серверов:

```bash
vllm serve Qwen/Qwen3.8-27B \
  --port 8000 \
  --tensor-parallel-size 4 \
  --max-model-len 262144 \
  --reasoning-parser qwen3 \
  --enable-auto-tool-choice \
  --tool-call-parser qwen3_coder
```

Источник: [Qwen3.8 GitHub deployment instructions](https://github.com/QwenLM/Qwen3.8).

vLLM поддерживает:

- AWQ;
- GPTQ;
- INT4/W4A16;
- FP8;
- GGUF, но через отдельный `vllm-gguf-plugin`.

Источник: [vLLM quantization support](https://docs.vllm.ai/en/latest/features/quantization/).

#### GGUF в vLLM

Поддержка есть, но официальная документация прямо называет её **highly experimental and under-optimized**; рекомендует устанавливать `vllm-gguf-plugin`.

Источник: [vLLM GGUF documentation](https://docs.vllm.ai/en/latest/features/quantization/gguf.html).

Для MVP:

- **vLLM + AWQ/GPTQ/FP8** — предпочтительный путь, если найден совместимый checkpoint.
- **GGUF + llama.cpp** — более предсказуемый путь для community-кванта.
- Не рассчитывать на полноценную multimodal-функциональность Qwen3.8 через экспериментальный GGUF backend vLLM без отдельного теста.

### Оценка памяти для 32k контекста

Для `Q4_K_M`:

- веса: около 17.4 GB;
- KV-cache FP16 для 32k: ориентировочно около 2 GB для этой hybrid-архитектуры;
- runtime buffers, vision tower, allocator overhead: ещё несколько GB.

Практическая оценка:

- **RTX 4090 24 GB**: может запуститься в 4-bit при одном запросе, но запас небольшой; 32k и vision могут привести к OOM.
- **RTX 5090 32 GB**: гораздо реалистичнее для одного процесса и 32k.
- **A100 40/80 GB**: комфортно.
- Для нескольких параллельных запросов или длинного reasoning нужен больший запас либо KV-cache quantization.

Это оценка по размеру модели и архитектуре, а не официальный benchmark vLLM. Для конкретного checkpoint нужно измерять через `--gpu-memory-utilization` и реальный prompt.

### JSON Schema, streaming и tools

vLLM поддерживает structured output:

```json
{
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "decomposition",
      "schema": {}
    }
  }
}
```

Поддерживаются также `choice`, `regex`, `grammar`, `structural_tag`.

Источник: [vLLM structured outputs](https://docs.vllm.ai/en/latest/features/structured_outputs.html).

Streaming Chat Completions поддерживается; structured output применяется сервером во время генерации, а клиент получает потоковые chunks.

Для Qwen3.8 официальная команда vLLM использует:

```text
--reasoning-parser qwen3
--enable-auto-tool-choice
--tool-call-parser qwen3_coder
```

То есть tool calling для этой модели официально предусмотрен. Нужно тестировать:

- `tool_choice: auto`;
- параллельные tool calls;
- tools вместе с thinking;
- streaming tool-call arguments;
- JSON Schema одновременно с reasoning.

---

## 3. Clore.ai

### GPU и цены

Clore — marketplace, где цены задают владельцы серверов. Это не фиксированный облачный тариф.

Официальный snapshot marketplace показывает примерно:

| GPU | Ориентир on-demand |
|---|---:|
| RTX 4090 24 GB | $0.14–0.42/GPU-hour, median около $0.21 на одном snapshot |
| RTX 5090 32 GB | $0.25–0.77/hour, median около $0.29 |
| RTX PRO 6000 Blackwell 96 GB | около $1.21/hour |
| H100 NVL 94 GB | около $1.04/hour |
| L40S 48 GB | около $0.50/hour |
| A6000 48 GB | около $0.36/hour |

Важная оговорка: на указанном официальном snapshot **A100, H200 и B200 на обычном marketplace отсутствовали**. Datacenter GPU продаются отдельно как bare metal.

Источники: [официальная статистика цен Clore](https://docs.clore.ai/guides/getting-started/pricing), [страница RTX 4090](https://clore.ai/rent-4090.html).

Цены меняются; перед демонстрацией нужно проверять live marketplace.

### Docker и публичный HTTP

Да, можно запустить Docker image:

```text
vllm/vllm-openai
```

Clore прямо перечисляет его среди community images:

- HTTP port: `8000`;
- command: `python -m vllm.entrypoints.openai.api_server ... --host 0.0.0.0`.

Можно использовать собственный публичный image из:

- Docker Hub;
- GHCR;
- NVIDIA NGC;
- GCR.

Источники: [Available Docker Images](https://docs.clore.ai/for-renters/docker-images), [Docker deployment guide](https://docs.clore.ai/guides/getting-started/docker-images).

### Практические ограничения

1. Сервер должен слушать `0.0.0.0`, а не `127.0.0.1`.
2. В order form нужно явно указать порт `8000`.
3. Публичный API нельзя оставлять без authentication/API key.
4. Большие images, особенно больше 10 GB, дольше скачиваются.
5. Модель лучше скачивать в persistent `/workspace` или другой volume.
6. `/tmp` нельзя считать постоянным хранилищем.
7. Billing идёт по минутам; скачивание модели тоже может расходовать время аренды.
8. Spot-rental может быть прерван более высокой ставкой; для демо лучше on-demand.
9. Нужно подобрать CUDA/PyTorch image под GPU. Для RTX 50-series Clore рекомендует CUDA 12.8+ и современные PyTorch images.

---

## 4. LangGraph Studio и локальный запуск

### `langgraph dev`

Да, `langgraph dev` предназначен именно для локальной разработки:

```bash
pip install "langgraph-cli[inmem]"
langgraph dev
```

Характеристики:

- без Docker;
- hot reload;
- локальный Agent Server;
- стандартный порт `2024`;
- локальное состояние;
- debugging через DAP;
- API доступен локально.

Источники: [Local development & testing](https://docs.langchain.com/langgraph-platform/local-server), [langgraph-cli README](https://github.com/langchain-ai/langgraph-cli).

### Нужен ли LangSmith

Разделение важное:

- **Сам граф и локальный Agent Server** могут работать локально с вашим локальным vLLM/llama.cpp API.
- Для custom frontend, который обращается прямо к `http://127.0.0.1:2024`, LangSmith account не нужен, если отключить tracing, например `LANGSMITH_TRACING=false`.
- Официальный LangGraph Studio — web UI, обычно открываемый как `https://smith.langchain.com/studio/?baseUrl=http://127.0.0.1:2024`.
- Для этого UI нужен интернет; текущая документация local development также указывает LangSmith API key как prerequisite.
- Полностью standalone/offline-версию Studio без LangSmith я официально не подтвердил.

Источники: [Studio](https://docs.langchain.com/langgraph-platform/studio), [local server guide](https://docs.langchain.com/langgraph-platform/local-server).

Итого: для hackathon лучше использовать **свой frontend**, а Studio оставить инструментом отладки при наличии доступа к LangSmith.

### Streaming API

Локальный Agent Server предоставляет streaming через SDK и REST/SSE:

- `values` — полное состояние графа после каждого super-step;
- `updates` — изменения состояния после каждого node;
- `messages` / `messages-tuple` — токены LLM и metadata;
- `custom` — пользовательские события из node;
- `events` — полный поток событий;
- дополнительно `debug` — максимально подробный поток.

REST endpoints:

```text
POST /threads/{thread_id}/runs/stream
GET  /threads/{thread_id}/stream
```

Есть resumable streaming через `Last-Event-ID`.

Источник: [Streaming API](https://docs.langchain.com/langgraph-platform/streaming).

Для вашего UI это позволяет показывать:

- текущий node;
- прогресс анализа документов;
- поток reasoning/answer;
- generated stories;
- события валидации JSON;
- запрос human approval перед Jira.

---

## 5. Конкуренты и существующие решения

### Коммерческие продукты

| Решение | Что делает | Размещение / цена | Ограничения |
|---|---|---|---|
| **Atlassian Jira + Rovo** | Rovo умеет создавать work items и делать work breakdown: summaries/descriptions превращаются в управляемые tasks | Cloud. Jira Free — $0 до 10 пользователей; AI/Rovo entitlement зависит от тарифа и rollout | Не локально; API contracts, `.proto`, полный repo-traceability и DOCX/XLSX-export не подтверждены |
| **GitHub Copilot** | Ask/Plan/Agent mode, анализ repo, implementation plans, coding tasks | Cloud. Free; Pro $10/user/month; Pro+ $39; Max $100 | Не специализированный epic→Jira hierarchy продукт; нет локального LLM | 
| **Azure Boards + Copilot/MCP** | Azure Boards имеет Epic/Feature/User Story/Task hierarchy; Azure DevOps MCP позволяет natural-language создавать feature и child stories | Cloud и Azure DevOps Server для Boards; Basic: первые 5 пользователей бесплатно, далее около $6/user/month | AI/MCP workflow не равен готовому on-prem decomposer; API contracts/repo traceability нужно собирать самостоятельно |
| **ClickUp Brain / Brain²** | Использует контекст tasks, docs, conversations; создаёт work artifacts, задачи, dashboards, workflows | Cloud. Free; Core $9/user/month при annual billing, Business $17, Max $100 | Нет локального/on-prem режима; точная декомпозиция Epic→Story→Sub-task не является основной моделью |
| **Linear AI** | Создаёт issues из conversation, планирует следующий cycle, делает summaries, triage, cloud coding agent | Cloud; AI/agent workflows включены в тарифные планы, точная текущая стоимость зависит от плана | Нет Jira hierarchy; не локально; repo/API-contract ingestion не равен вашему workflow |
| **StoriesOnBoard AI** | Story mapping: goals → steps → stories, MVP slice, acceptance criteria; AI Assist и MCP beta | Cloud; есть free start, точная paid AI-цена на текущей странице не раскрыта | Очень близко к product planning, но не полноценный local code/API-aware decomposer |
| **Jira Marketplace apps** | Различные apps с названиями вроде AI Story Generator / Story Writer генерируют stories, acceptance criteria, test cases и записывают их в Jira | Обычно Cloud app, vendor-specific pricing/trial | Marketplace — не единый продукт; текущие названия, цены, Data Center support и качество нужно проверять по каждой карточке |

Источники: [Atlassian Jira AI](https://www.atlassian.com/software/jira/ai), [Jira pricing](https://www.atlassian.com/software/jira/pricing), [GitHub Copilot docs](https://docs.github.com/en/copilot/using-github-copilot/copilot-chat/asking-github-copilot-questions-in-your-ide), [Copilot pricing](https://github.com/features/copilot/plans), [Azure hierarchy and MCP examples](https://learn.microsoft.com/en-us/azure/devops/boards/backlogs/define-features-epics), [ClickUp AI](https://clickup.com/ai), [ClickUp pricing](https://clickup.com/pricing), [Linear AI](https://linear.app/ai), [Linear pricing](https://linear.app/pricing), [StoriesOnBoard AI](https://storiesonboard.ai/), [Marketplace search](https://marketplace.atlassian.com/search?query=AI%20Story%20Generator).

### Open-source проекты на GitHub

1. [EpicToSprintPlanner](https://github.com/RishabhSinha07/EpicToSprintPlanner)  
   Документы до 1000+ страниц, chunking, INVEST stories, acceptance criteria, story points, dependency mapping, Jira-ready JSON. Архитектура на AWS Lambda + Bedrock, то есть это не полностью локальный LLM-проект.

2. [LLM-Jira-Automation](https://github.com/Sumeet7170/LLM-Jira-Automation)  
   Генерирует Epic, Feature, User Story, Task, Subtask, acceptance criteria; использует RAG, LangChain, Azure AI Search, OpenAI/Azure и Jira REST API. Ближайший функциональный аналог, но облачная Azure/OpenAI-зависимость.

3. [prd-to-jira-agent](https://github.com/sadasib/prd-to-jira-agent)  
   Markdown PRD → JSON/Markdown с Epics, User Stories и BDD criteria. Jira API и clarifying feedback loop обозначены как roadmap, а не полностью реализованная функция.

4. [ai-prd-story-generator](https://github.com/dperezandre/ai-prd-story-generator)  
   Feature idea → PRD → Epics/Stories → INVEST review → Gherkin. Экспортирует Azure DevOps CSV и Jira CSV. Прямое создание через API пока в roadmap. MIT license.

5. [context4ai/workflow](https://github.com/context4ai/workflow)  
   Offline-oriented knowledge graph для PRD/Plan/user stories/source code и traceability до кода. Это не Jira decomposer, но хороший соседний пример требования «story → implementation → source».

### Реалистичные differentiators вашего решения

Не стоит заявлять «первый в мире». Реальные отличия:

- полностью локальный/on-prem inference через vLLM/llama.cpp;
- исходный код, API contracts и документы не уходят во внешний LLM;
- входы: epic + PDF/DOCX/Markdown + OpenAPI + gRPC `.proto` + repository;
- traceability: каждая story/task ссылается на источник, endpoint, message или code symbol;
- разделение business stories и typed technical tasks: backend/frontend/QA/DevOps;
- JSON Schema/grammar-constrained output;
- экспорт одновременно в DOCX/XLSX/JSON;
- Jira hierarchy, labels, issue links и human approval;
- Bitbucket webhook;
- versioned prompt и сравнение результата с эталонным backlog;
- локальный feedback loop: «что было исправлено человеком» → рекомендации по prompt;
- поддержка русского языка и локальных инженерных стандартов.

---

## 6. Jira Cloud Free, REST и Bitbucket

### Jira Cloud Free

Подтверждено:

- до **10 пользователей**;
- Free forever;
- отсутствие гибко настраиваемых permissions в Free;
- максимум **100 email notifications/day**;
- Jira Free может деактивироваться за длительную неактивность;
- pricing page указывает 2 GB storage.

Источники: [Jira pricing](https://www.atlassian.com/software/jira/pricing), [Free Jira Cloud plan](https://support.atlassian.com/jira-cloud-administration/docs/what-is-the-free-jira-cloud-plan/).

По automation:

- официальная service-limit page подтверждает до **5 одновременно выполняющихся flows** на Free;
- до 50 новых subtasks за одну automation action;
- до 100 email action в 24 часа;
- текущая документация, которую удалось проверить, **не подтверждает явно месячный лимит rule runs**. Часто цитируемый лимит «100 automation runs/month» может зависеть от версии/типа automation и его не следует жёстко зашивать без проверки в конкретном сайте Jira.

Источник: [Automation service limits](https://support.atlassian.com/cloud-automation/docs/automation-service-limits/).

### REST v2 и v3

Оба API доступны:

```text
POST /rest/api/3/issue
POST /rest/api/2/issue
```

Для новой интеграции предпочтительнее **v3**. Главное различие — форматы отдельных полей; например, rich-text description в v3 использует Atlassian Document Format.

Источники: [REST v3 issues](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/), [REST v2 issues](https://developer.atlassian.com/cloud/jira/platform/rest/v2/api-group-issues/).

Пример Epic:

```json
{
  "fields": {
    "project": {"key": "DEMO"},
    "issuetype": {"name": "Epic"},
    "summary": "Agent decomposer demo",
    "labels": ["AgentDecomposer_Autogenerate"]
  }
}
```

Пример Story под Epic:

```json
{
  "fields": {
    "project": {"key": "DEMO"},
    "issuetype": {"name": "Story"},
    "summary": "Как пользователь...",
    "parent": {"key": "DEMO-1"},
    "labels": ["AgentDecomposer_Autogenerate"]
  }
}
```

Пример technical sub-task под Story:

```json
{
  "fields": {
    "project": {"key": "DEMO"},
    "issuetype": {"name": "Sub-task"},
    "summary": "Реализовать endpoint...",
    "parent": {"key": "DEMO-2"},
    "labels": ["AgentDecomposer_Autogenerate"]
  }
}
```

Оговорка: доступность `parent` и названия issue types зависят от типа проекта и его схемы. Перед созданием нужно получить create metadata и не хардкодить IDs.

### Hierarchy и issue links

Стандартная Jira hierarchy:

```text
Epic
 └── Story / Task
      └── Sub-task
```

Поэтому для требуемой схемы **Epic → Story → Task** технический Task лучше создавать как **Sub-task**. Обычный стандартный `Task` обычно нельзя сделать дочерним элементом Story без дополнительной hierarchy-конфигурации.

Generic issue links создаются отдельным запросом:

```text
POST /rest/api/3/issueLink
```

Например, для `blocks`, `relates to`, `duplicates`.

Источник: [REST v3 issue links](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-links/).

Практическая рекомендация:

- parent relationship — через `parent`;
- semantic dependency — через `issueLink`;
- label — через `labels`;
- legacy `Epic Link` использовать только как fallback, если конкретный проект не принимает современный `parent`. ID custom field нельзя считать универсальным.

### Доступность из России

Официальные найденные страницы Atlassian/Bitbucket **не подтверждают**, что Jira Cloud или Bitbucket Cloud гарантированно заблокированы в России, и не подтверждают обязательность VPN.

Поэтому корректный вывод:

- VPN может понадобиться из-за сетевой доступности, платежей или региональных ограничений;
- официально подтвердить «работает без VPN» или «заблокировано» не удалось;
- проверять нужно из реальной сети демонстрации: signup, login, Jira API и Bitbucket webhook delivery.

Bitbucket Cloud поддерживает webhooks:

- repository push — trigger по умолчанию;
- pull request и другие события;
- до 50 webhooks на repository;
- рекомендуется secret и проверка HMAC-SHA256.

Источник: [Bitbucket Cloud webhooks](https://support.atlassian.com/bitbucket-cloud/docs/manage-webhooks/).

Для MVP webhook endpoint должен быть публичным HTTPS URL, а подпись необходимо проверять до запуска декомпозиции.