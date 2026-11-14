# Магазин «Полка»: каталог

## Сервисы

- **storefront** — страницы магазина (каталог, карточка товара), получает данные
  из catalogservice по REST.
- **catalogservice** (Java 21, Spring Boot) — товары и цены в рублях (`catalog-api.yaml`).
  Хранит товары в PostgreSQL, держит кэш в Redis. Цены в рублях — поле `price_kopecks`.

## Как сейчас открывается каталог

1. storefront вызывает `GET /products?page=…` или `GET /products/{id}` в catalogservice.
2. catalogservice отдаёт товары из кэша Redis, при промахе — из PostgreSQL.
3. Текущий p95 ответа `GET /products` — около 120 мс.

## Эксплуатация

- Логи — stdout в формате JSON, собираются в Loki.
- Выход в интернет из кластера разрешён только для внешних адресов, перечисленных в
  egress-политике; добавление адреса — отдельная заявка в эксплуатацию (1–2 дня).
