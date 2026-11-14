# Магазин «Полка»: архитектура

Магазин — набор сервисов на Python (FastAPI), общаются по REST внутри кластера Kubernetes.

## Сервисы

- **frontend** — страницы магазина, вызывает orderservice и paymentservice.
- **orderservice** — заказы: создание, статусы (`NEW`, `PAID`, `CANCELLED`, `REFUNDED`),
  хранит заказы в PostgreSQL (таблица `orders`).
- **paymentservice** — всё, что связано с деньгами: сейчас принимает оплату картой через
  платёжный шлюз и хранит платежи в своей таблице `payments` (PostgreSQL). Внутренний API —
  `payments-internal.yaml`. Другие сервисы к платёжным системам напрямую не обращаются.
- **notificationservice** — письма покупателям, вызывается по REST.

## Оплата картой сейчас

1. frontend вызывает `POST /payments/card` в paymentservice с номером заказа и суммой.
2. paymentservice проводит оплату и вызывает `POST /orders/{id}/paid` в orderservice.
3. orderservice переводит заказ в `PAID` и просит notificationservice отправить письмо.

## Эксплуатация

- Секреты — Kubernetes Secrets, в сервисы попадают через переменные окружения.
- Логи — stdout в формате JSON, собираются в Loki.
- Текущий p95 открытия страницы оплаты — около 400 мс.
