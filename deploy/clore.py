#!/usr/bin/env python3
import argparse
import csv
import io
import json
import math
import os
from pathlib import Path
import re
import secrets
import shlex
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

DEPLOY = Path(__file__).resolve().parent
ROOT = DEPLOY.parent
STATE = DEPLOY / "clore-state.json"
IMAGE = "ghcr.io/ggml-org/llama.cpp@sha256:cabbb32aaee5abc5d8af3ebec89781a722ad2e83a37f409980008579a31fe767"
CUDA = (12, 8)
MODEL = "qwen3.8-27b"
TIMEOUT = 40 * 60
TERMINAL = {"cancelled", "canceled", "expired", "completed", "ended"}


def read_env(path):
    result = {}
    if path.exists():
        for line in path.read_text().splitlines():
            match = re.match(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$", line)
            if match:
                value = match[2].split(" #", 1)[0].strip()
                if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                    value = value[1:-1]
                result[match[1]] = value
    return result


def private_write(path, text):
    temp = path.with_name(path.name + ".tmp")
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as out:
        out.write(text)
    temp.chmod(0o600)
    temp.replace(path)


def update_env(path, changes):
    old = path.read_text() if path.exists() else ""
    backup = path.with_name(path.name + ".bak")
    if path.exists() and not backup.exists():
        private_write(backup, old)
    lines, seen = [], set()
    for line in old.splitlines():
        match = re.match(r"^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)\s*=", line)
        if match and match[2] in changes:
            key = match[2]
            comment = " #" + line.split(" #", 1)[1] if " #" in line else ""
            line = f"{match[1]}{key}={changes[key]}{comment}"
            seen.add(key)
        lines.append(line)
    lines += [f"{k}={v}" for k, v in changes.items() if k not in seen]
    private_write(path, "\n".join(lines) + "\n")


def load_state():
    return json.loads(STATE.read_text()) if STATE.exists() else {"orders": []}


def save_state(state):
    private_write(STATE, json.dumps(state, ensure_ascii=False, indent=2) + "\n")


def redact(value):
    if isinstance(value, dict):
        return {k: ("<скрыто>" if re.search(r"key|password|token|secret|authorization|^env$", k, re.I)
                    else redact(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [redact(v) for v in value]
    if isinstance(value, str):
        return re.sub(r"(--api-key\s+)\S+", r"\1<скрыто>", value)
    return value


def request(url, key="", payload=None, timeout=15, headers=None, raw=False):
    h = {"User-Agent": "Mozilla/5.0", **(headers or {})}
    if key:
        h["Authorization"] = "Bearer " + key
    data = None
    if payload is not None:
        h["Content-Type"] = "application/json"
        data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            body = response.read().decode()
        return body if raw else json.loads(body)
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"HTTP {exc.code}: {urllib.parse.urlsplit(url).path}") from None


class Clore:
    def __init__(self, config):
        self.key = config.get("CLORE_API_KEY", "")
        self.last = 0

    def call(self, endpoint, payload=None):
        if endpoint != "marketplace" and not self.key:
            raise RuntimeError("Укажите CLORE_API_KEY в deploy/.env")
        for attempt in range(6):
            time.sleep(max(0, 1.1 - (time.monotonic() - self.last)))
            self.last = time.monotonic()
            try:
                data = request("https://api.clore.ai/v1/" + endpoint, payload=payload,
                               headers={"auth": self.key} if self.key else {}, timeout=60)
            except (OSError, RuntimeError) as exc:
                if payload is not None:
                    raise RuntimeError("Ответ на платный запрос неизвестен. НЕ повторяйте up: проверьте My Orders "
                                       "в Clore и сохраните id в state; затем down. " + str(exc)) from None
                raise
            if data.get("code") == 0:
                return data
            if data.get("code") != 5:
                error = str(redact(data.get("error", "проверьте API-ключ")))
                if self.key:
                    error = error.replace(self.key, "<скрыто>")
                raise RuntimeError(f"Clore code={data.get('code')}: {error}")
            delay = 2 ** (attempt + 1)
            print(f"Лимит Clore, повтор через {delay} с", flush=True)
            time.sleep(delay)
        raise RuntimeError("Clore: превышен лимит повторов")


def daily_price(server, currency):
    field = {"USD-Blockchain": "on_demand_usd", "CLORE-Blockchain": "on_demand_clore",
             "bitcoin": "on_demand_btc"}[currency]
    price = server.get("price", {}).get("usd", {}).get(field)
    return float(price) if price is not None else math.inf


def eligible(server, currency):
    specs = server.get("specs", {})
    gpu = server.get("gpu_array")
    count = len(gpu) if gpu else int((re.match(r"(\d+)x", specs.get("gpu", "")) or [None, "0"])[1])
    version = tuple(int(v) for v in re.findall(r"\d+", str(server.get("cuda_version", "")))[:2])
    return (count == 1 and not server.get("rented") and server.get("reliability", 0) >= .95
            and server.get("rating", {}).get("avg", 0) >= 4
            and specs.get("net", {}).get("down", 0) >= 200 and specs.get("ram", 0) >= 24
            and specs.get("gpuram", 0) >= 24 and version >= CUDA
            and currency in server.get("allowed_coins", []) and math.isfinite(daily_price(server, currency)))


def find(args, api, currency):
    servers = api.call("marketplace")["servers"]
    for gpu in [args.gpu] if args.gpu else ["RTX 5090", "RTX 4090", "RTX 3090"]:
        matches = sorted((s for s in servers if eligible(s, currency)
                          and gpu.lower() in s.get("specs", {}).get("gpu", "").lower()),
                         key=lambda s: daily_price(s, currency))[:args.top]
        print(f"\n{gpu}: id | $/день | $/час | страна | Мбит/с | надёжность | рейтинг(отзывов) | CUDA")
        for s in matches:
            p, net, rating = daily_price(s, currency), s["specs"]["net"], s["rating"]
            print(f"{s['id']} | {p:.2f} | {p/24:.3f} | {net.get('cc', '?')} | {net['down']} | "
                  f"{s['reliability']:.1%} | {rating['avg']}({rating.get('cnt', 0)}) | {s['cuda_version']}")
        if not matches:
            print("Нет свободных серверов, проходящих все фильтры.")


def order_payload(server, hours, currency, key):
    flags = ["-hf", "unsloth/Qwen3.8-27B-GGUF:UD-Q4_K_M", "--no-mmproj",
             "--host", "0.0.0.0", "--port", "8080", "-ngl", "999", "-c", "98304", "-np", "4",
             "--cache-type-k", "q8_0", "--cache-type-v", "q8_0", "-fa", "on", "--jinja",
             "--reasoning-budget", "0", "--alias", MODEL, "--api-key", key, "--slots", "--metrics"]
    return {"renting_server": server["id"], "type": "on-demand", "currency": currency,
            "image": IMAGE, "ports": {"22": "tcp", "8080": "tcp"},
            "autossh_entrypoint": True, "auto_renew": False, "rental_hours": hours,
            "ssh_password": secrets.token_urlsafe(24),
            # Проверено на живом заказе: с autossh_entrypoint clore выполняет command как стартовый скрипт
            # (без него запускает ENTRYPOINT образа без аргументов). Сервер — в фоне, лог в /root/llama.log.
            "command": "cd /app && nohup ./llama-server " + shlex.join(flags) + " > /root/llama.log 2>&1 &"}


def endpoint(value):
    if not isinstance(value, str) or re.search(r"[\s\"'\\;$]", value):
        raise ValueError("Нужен TCP-адрес host:port, без пути или параметров")
    parsed = urllib.parse.urlsplit(value if "://" in value else "tcp://" + value)
    if (parsed.scheme not in {"tcp", "http"} or not parsed.hostname or not parsed.port
            or parsed.path or parsed.query or parsed.fragment or parsed.username):
        raise ValueError("Нужен TCP-адрес host:port, не HTTPS-прокси")
    return parsed.netloc


def resolve_endpoint(order):
    conn = order.get("connection") or {}
    hosts = order.get("pub_cluster") or conn.get("pub_cluster") or []
    host = hosts[0] if isinstance(hosts, list) and hosts else hosts if isinstance(hosts, str) else None
    for source in (conn.get("ports"), conn.get("tcp_ports"), order.get("tcp_ports"), order.get("ports")):
        if isinstance(source, list):
            source = dict(item.split(":", 1) for item in source if isinstance(item, str) and ":" in item)
        if not isinstance(source, dict):
            continue
        value = source.get("8080", source.get("8080/tcp"))
        if isinstance(value, dict):
            h = value.get("host") or value.get("ip") or host
            p = value.get("public_port") or value.get("port")
            value = f"{h}:{p}" if h and p else None
        if isinstance(value, (str, int)):
            if str(value).isdigit() and host:
                value = f"{host}:{value}"
            try:
                return endpoint(str(value))
            except ValueError:
                pass
    return None


def probe_address(address):
    host = urllib.parse.urlsplit("http://" + address)
    if host.hostname == "host.docker.internal":
        return "127.0.0.1:" + str(host.port)
    return address


def wait_ready(address, key, deadline):
    address = probe_address(address)
    while time.monotonic() < deadline:
        started = time.monotonic()
        try:
            models = request(f"http://{address}/v1/models", key, timeout=5)
            request(f"http://{address}/health", key, timeout=5)
            if not any(m.get("id") == MODEL for m in models.get("data", [])):
                raise RuntimeError(f"Модель {MODEL} отсутствует в /v1/models")
            print(f"Модель готова: {address}", flush=True)
            return
        except (OSError, ValueError, RuntimeError) as exc:
            print(f"Ожидание {address}: {exc}; загрузка GGUF ~17 ГБ, лимит 40 минут", flush=True)
        time.sleep(min(max(0, 15 - (time.monotonic() - started)), max(0, deadline - time.monotonic())))
    raise RuntimeError("Таймаут модели. Заказы НЕ отменены: status / down; проверьте логи Clore.")


def compose(*args):
    result = subprocess.run(["docker", "compose", *args], cwd=DEPLOY, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError("docker compose завершился с ошибкой; проверьте compose ps/logs на сервере")
    return result.stdout


def runtime(command):
    output = compose("exec", "-T", "haproxy", "sh", "-c", 'printf "%s\\n" "$1" | nc -w 2 127.0.0.1 9999', "sh", command)
    if command.startswith("set ") and output.strip():
        raise RuntimeError("HAProxy Runtime API: " + output.strip())
    return output


def stats(show=False):
    text = runtime("show stat")
    rows = list(csv.DictReader(io.StringIO(text.removeprefix("# "))))
    servers = {r["svname"]: r for r in rows if r.get("pxname") == "vllm" and r.get("svname") in {"primary", "backup"}}
    if len(servers) != 2:
        raise RuntimeError("Runtime API не вернул primary/backup")
    if show:
        for name, row in servers.items():
            print(f"HAProxy {name}: {row['status']}, запросов stot={row['stot']}, сессий={row['scur']}")
    return servers


def wait_proxy():
    for _ in range(30):
        rows = stats()
        if rows["primary"]["status"] == "UP" and rows["backup"]["status"] == "UP":
            return
        time.sleep(2)
    raise RuntimeError("HAProxy: модели не перешли в UP; проверьте адреса и API-ключ")


def health(wait=False):
    for attempt in range(60 if wait else 1):
        try:
            data = request("http://127.0.0.1/api/health", timeout=3)
            if data.get("status") not in {None, "ok"}:
                raise RuntimeError("/api/health: статус не ok")
            print("/api/health: " + json.dumps(data, ensure_ascii=False))
            return
        except (OSError, ValueError, RuntimeError):
            if not wait or attempt == 59:
                raise RuntimeError("/api/health недоступен через nginx :80") from None
            time.sleep(2)


def validate_completion(response, structured):
    try:
        text = response["choices"][0]["message"]["content"]
        if not isinstance(text, str) or not text.strip():
            raise ValueError("пустой ответ")
        if structured:
            value = json.loads(text)
            if not isinstance(value, dict) or set(value) != {"ok"} or value["ok"] is not True:
                raise ValueError("JSON не соответствует схеме")
    except (KeyError, IndexError, TypeError, ValueError):
        hint = "; переключите LLM_JSON_MODE=json_object и повторите проверку" if structured else ""
        raise RuntimeError("Невалидный ответ модели" + hint) from None
    return True


def completion(key, structured=False):
    body = {"model": MODEL, "messages": [{"role": "user", "content": 'Return {"ok":true} as JSON.' if structured else "Reply only OK."}],
            "max_tokens": 64, "temperature": 0, "chat_template_kwargs": {"enable_thinking": False}}
    if structured:
        body["response_format"] = {"type": "json_schema", "json_schema": {"name": "probe", "strict": True,
            "schema": {"type": "object", "properties": {"ok": {"type": "boolean", "const": True}},
                       "required": ["ok"], "additionalProperties": False}}}
    start = time.monotonic()
    try:
        data = request("http://127.0.0.1:8081/v1/chat/completions", key, body, timeout=610)
        validate_completion(data, structured)
    except (OSError, ValueError, RuntimeError) as exc:
        if structured:
            raise RuntimeError("JSON schema не работает: переключите LLM_JSON_MODE=json_object; " + str(exc)) from None
        raise
    elapsed = time.monotonic() - start
    tokens = data.get("usage", {}).get("completion_tokens")
    timings = data.get("timings", {})
    speed = timings.get("predicted_per_second")
    rate = f"{speed:.1f} токен/с (генерация)" if isinstance(speed, (float, int)) else (
        f"{tokens/elapsed:.1f} токен/с (весь запрос)" if isinstance(tokens, (float, int)) else "токен/с: нет usage")
    print(f"{'JSON schema' if structured else 'Обычный ответ'} OK: {elapsed:.2f} с; {rate}")


def configure(addresses, key):
    update_env(DEPLOY / ".env", {"LLM_PRIMARY": addresses[0], "LLM_BACKUP": addresses[-1], "LLM_API_KEY": key})
    update_env(ROOT / "backend/.env", {"LLM_MODEL": MODEL, "LLM_API_KEY": key, "LLM_API_KEY_ENV": "",
        "LLM_JSON_MODE": "json_schema", "LLM_EXTRA_BODY": '{"chat_template_kwargs":{"enable_thinking":false}}',
        "LLM_CONCURRENCY": "4", "LLM_TIMEOUT": "600"})
    compose("up", "-d", "--force-recreate", "haproxy", "backend")
    health(wait=True)
    wait_proxy()
    completion(key)
    completion(key, structured=True)
    print("Готово. Откройте пульт и прогоните демо-эпик до публикации в Jira.")


def up(args, api, config, currency):
    state = load_state()
    if state.get("creation_pending"):
        raise RuntimeError("Неопределённый create_order: проверьте My Orders, отмените/сохраните id заказа "
                           "и только затем удалите creation_pending из deploy/clore-state.json")
    if any(not o.get("ended") for o in state["orders"]):
        raise RuntimeError("В state есть заказы. Сначала status/down; повторный up не создаёт дубликаты.")
    key = config.get("LLM_API_KEY")
    if not key or key in {"none", "change-me"}:
        key = state.get("api_key") or secrets.token_urlsafe(32)
    if args.attach:
        if args.primary or args.backup or args.dry_run:
            raise RuntimeError("--attach нельзя сочетать с --primary/--backup/--dry-run")
        addresses = [endpoint(v) for v in args.attach.split(",")]
        if not 1 <= len(addresses) <= 2:
            raise RuntimeError("--attach принимает один или два host:port через запятую")
        state = {"orders": [], "api_key": key, "attached": addresses, "created": time.time()}
        save_state(state)
    else:
        if not args.primary:
            raise RuntimeError("Укажите --primary <id>")
        if not 1 <= args.hours <= 3000:
            raise RuntimeError("--hours должен быть от 1 до 3000")
        servers = {str(s["id"]): s for s in api.call("marketplace")["servers"]}
        selected = []
        for ident in [args.primary] + ([args.backup] if args.backup else []):
            s = servers.get(str(ident))
            if not s or not eligible(s, currency):
                raise RuntimeError(f"Сервер {ident} не проходит фильтры find или уже занят")
            if args.hours > float(s.get("mrl", 0)):
                raise RuntimeError(f"Сервер {ident}: mrl меньше --hours, автопродление отключено")
            selected.append(s)
        if len(selected) == 2 and (selected[0]["id"] == selected[1]["id"] or
                (selected[0].get("owner") is not None and selected[0].get("owner") == selected[1].get("owner"))):
            raise RuntimeError("Для failover выберите разные серверы и разных владельцев")
        payloads = [order_payload(s, args.hours, currency, key) for s in selected]
        cost = sum(daily_price(s, currency) for s in selected) * args.hours / 24
        print(f"Оценка за {args.hours} ч: ${cost:.2f}, без комиссий; цены за ДЕНЬ.")
        if args.dry_run:
            for payload in payloads:
                print(json.dumps(redact(payload), ensure_ascii=False, indent=2))
            print("DRY RUN: заказов и локальных изменений нет.")
            return
        if not api.key:
            raise RuntimeError("Укажите CLORE_API_KEY в deploy/.env")
        state = {"orders": [], "api_key": key, "created": time.time()}
        save_state(state)
        for s, payload in zip(selected, payloads):
            state["creation_pending"] = {"server_id": s["id"], "requested": time.time()}
            save_state(state)
            known = {str(o.get("id")) for o in api.call("my_orders").get("orders", [])}
            result = api.call("create_order", payload)
            ident = result.get("order_id") or result.get("id")
            for _ in range(10):
                if ident is not None:
                    break
                time.sleep(3)
                ident = next((o.get("id") for o in api.call("my_orders").get("orders", [])
                              if o.get("si") == s["id"] and str(o.get("id")) not in known), None)
            if ident is None:
                print("Ответ create_order (секреты скрыты): " + json.dumps(redact(result), ensure_ascii=False))
                raise RuntimeError("Нет order_id/id. Проверьте My Orders в UI; НЕ повторяйте up вслепую.")
            state["orders"].append({"id": ident, "server_id": s["id"], "created": time.time(),
                                    "usd_day": daily_price(s, currency), "ssh_password": payload["ssh_password"]})
            state.pop("creation_pending", None)
            save_state(state)
            print(f"Создан заказ {ident}, сервер {s['id']}", flush=True)
        addresses = []
        deadline = time.monotonic() + TIMEOUT
        for saved in state["orders"]:
            while time.monotonic() < deadline:
                orders = api.call("my_orders")["orders"]
                order = next((o for o in orders if str(o.get("order_id", o.get("id"))) == str(saved["id"])), None)
                if order:
                    if "raw_order" not in saved:
                        saved["raw_order"] = redact(order)
                        save_state(state)
                        print("Первый JSON заказа (секреты скрыты): " + json.dumps(saved["raw_order"], ensure_ascii=False), flush=True)
                    status = str(order.get("status") or ("running" if order.get("online") else "ожидание")).lower()
                    if status in TERMINAL or status in {"failed", "error"}:
                        raise RuntimeError(f"Заказ {saved['id']}: {status}; проверьте Clore, затем down")
                    address = resolve_endpoint(order)
                    print(f"Заказ {saved['id']}: {status}; TCP 8080: {address or 'ещё нет'}", flush=True)
                    if status == "running" and address:
                        saved["endpoint"] = address
                        save_state(state)
                        addresses.append(address)
                        break
                time.sleep(15)
            else:
                raise RuntimeError("Таймаут заказа 40 минут. Заказы сохранены: status / down.")
    deadline = time.monotonic() + TIMEOUT
    for address in addresses:
        wait_ready(address, key, deadline)
    configure(addresses, key)


def status(api, config):
    state = load_state()
    failures = []
    if state.get("creation_pending"):
        failures.append("Неопределённый create_order: проверьте My Orders перед повторной арендой/очисткой state")
    if state["orders"]:
        try:
            orders = api.call("my_orders?return_completed=true")["orders"]
            for saved in state["orders"]:
                order = next((o for o in orders if str(o.get("order_id", o.get("id"))) == str(saved["id"])), {})
                start = float(order.get("started") or order.get("ct") or order.get("created") or saved["created"])
                end = float(saved.get("ended") or order.get("ended") or time.time())
                hours = max(0, end - start) / 3600
                price = saved.get("usd_day")
                spend = (f"${float(order['spend']):.2f} (по данным Clore)" if order.get("spend") is not None
                         else f"${price * hours / 24:.2f} (оценка без комиссий)" if price is not None else "неизвестно")
                state_text = order.get("status") or ("online" if order.get("online") else "нет в ответе")
                print(f"Заказ {saved['id']}: {state_text}; {hours:.2f} ч; "
                      f"$/день={price}; затраты {spend}")
        except (OSError, RuntimeError, ValueError) as exc:
            failures.append(str(exc))
    else:
        print("Активных заказов в state нет; attach не управляет ручной арендой.")
    for action in (lambda: stats(show=True), health):
        try:
            action()
        except (OSError, RuntimeError, ValueError) as exc:
            failures.append(str(exc))
    for name in ("LLM_PRIMARY", "LLM_BACKUP"):
        address = config.get(name, "127.0.0.1:9")
        key = config.get("LLM_API_KEY", "")
        for path in ("/slots", "/metrics"):
            try:
                data = request(f"http://{probe_address(address)}{path}", key, timeout=5, raw=True)
                print(f"{name} {path}: {data[:2000]}")
                break
            except (OSError, ValueError, RuntimeError):
                continue
        else:
            print(f"{name}: /slots и /metrics недоступны (необязательные endpoints)")
    if failures:
        raise RuntimeError("; ".join(failures))


def failover(config):
    if config.get("LLM_PRIMARY") == config.get("LLM_BACKUP"):
        raise RuntimeError("Primary и backup совпадают: реальный failover невозможен")
    before = stats()
    if before["backup"]["status"] != "UP":
        raise RuntimeError("Backup не UP; сначала status")
    runtime("set server vllm/primary state maint")
    stats(show=True)
    try:
        completion(config.get("LLM_API_KEY", ""))
        after = stats(show=True)
        delta = int(after["backup"]["stot"]) - int(before["backup"]["stot"])
        if delta <= 0 or after["primary"]["status"] != "MAINT":
            raise RuntimeError("Счётчики не подтверждают обслуживание через backup")
        print(f"Failover подтверждён: backup stot +{delta}. Primary в MAINT; верните командой restore.")
    except Exception:
        print("Проверка не завершилась: primary остаётся MAINT; выполните restore.")
        raise


def down(args, api):
    state = load_state()
    active = [o for o in state["orders"] if not o.get("ended")]
    if not args.yes and input(f"Отменить заказов: {len(active)}, отключить модели? Введите да: ").strip().lower() != "да":
        raise RuntimeError("Отмена пользователем")
    if active:
        orders = api.call("my_orders?return_completed=true")["orders"]
        for saved in active:
            order = next((o for o in orders if str(o.get("order_id", o.get("id"))) == str(saved["id"])), {})
            if str(order.get("status", "")).lower() not in TERMINAL:
                api.call("cancel_order", {"id": saved["id"]})
            saved["ended"] = time.time()
            save_state(state)
            print(f"Заказ {saved['id']} остановлен")
    hours = sum((o.get("ended", time.time()) - o["created"]) / 3600 for o in state["orders"])
    print(f"Всего GPU-часов по state: {hours:.2f} (не счёт Clore)")
    update_env(DEPLOY / ".env", {"LLM_PRIMARY": "127.0.0.1:9", "LLM_BACKUP": "127.0.0.1:9"})
    compose("up", "-d", "--force-recreate", "haproxy")
    state.pop("attached", None)
    save_state(state)
    print("HAProxy отключён от GPU. Ручные аренды --attach отмените отдельно в Clore UI.")
    if state.get("creation_pending"):
        raise RuntimeError("Неопределённый create_order: возможный дополнительный заказ отмените в My Orders. "
                           "После проверки удалите creation_pending из state; известные заказы уже отменены.")


def parser():
    p = argparse.ArgumentParser(description="GPU для показа Synaps: Clore + llama.cpp + HAProxy")
    p._positionals.title = "команды"
    p._optionals.title = "параметры"
    p._actions[0].help = "показать справку и выйти"
    sub = p.add_subparsers(dest="command", required=True)
    f = sub.add_parser("find", help="найти свободные GPU (только чтение)", description="Цены за день; фильтры качества, CUDA ≥ 12.8")
    f.add_argument("--gpu", help='класс GPU, например "RTX 5090"; по умолчанию 5090/4090/3090')
    f.add_argument("--top", type=int, default=5, help="сколько серверов на класс (по умолчанию 5)")
    u = sub.add_parser("up", help="арендовать GPU и подключить модель")
    u.add_argument("--primary", type=int, help="id основного сервера")
    u.add_argument("--backup", type=int, help="id резервного сервера другого владельца")
    u.add_argument("--hours", type=int, default=6, help="целое число часов аренды (по умолчанию 6)")
    u.add_argument("--dry-run", action="store_true", help="показать payload без секретов; API только marketplace, файлы не меняются")
    u.add_argument("--attach", help=argparse.SUPPRESS)
    sub.add_parser("status", help="заказы, расходы, HAProxy, backend, слоты модели")
    sub.add_parser("failover", help="primary в maintenance, проверить ответ backup")
    sub.add_parser("restore", help="вернуть primary из maintenance в ready")
    d = sub.add_parser("down", help="отменить заказы из state и отключить GPU")
    d.add_argument("--yes", action="store_true", help="не запрашивать подтверждение")
    for child in sub.choices.values():
        child._optionals.title = "параметры"
        child._actions[0].help = "показать справку и выйти"
    return p


def main():
    os.umask(0o077)
    args = parser().parse_args()
    config = read_env(DEPLOY / ".env")
    currency = config.get("CLORE_CURRENCY") or "USD-Blockchain"
    if currency not in {"USD-Blockchain", "CLORE-Blockchain", "bitcoin"}:
        raise RuntimeError("CLORE_CURRENCY: допустимы USD-Blockchain, CLORE-Blockchain, bitcoin")
    api = Clore(config)
    if args.command == "find":
        if args.top < 1:
            raise RuntimeError("--top должен быть положительным")
        find(args, api, currency)
    elif args.command == "up":
        up(args, api, config, currency)
    elif args.command == "status":
        status(api, config)
    elif args.command == "failover":
        failover(config)
    elif args.command == "restore":
        runtime("set server vllm/primary state ready")
        wait_proxy()
        stats(show=True)
    else:
        down(args, api)


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError, KeyError, EOFError) as exc:
        print(f"Ошибка: {exc}", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print("\nПрервано. Аренда НЕ отменяется автоматически: status / down.", file=sys.stderr)
        sys.exit(130)
