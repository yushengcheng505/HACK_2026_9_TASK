import importlib.util
import json
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "deploy/clore.py"


@pytest.fixture
def clore():
    assert SCRIPT.exists(), "CLI аренды ещё не реализован"
    spec = importlib.util.spec_from_file_location("clore", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def server():
    return {
        "id": 10, "owner": 20, "rented": False, "mrl": 72,
        "gpu_array": ["RTX 5090"], "reliability": 0.95,
        "rating": {"avg": 4, "cnt": 2}, "cuda_version": "12.8",
        "allowed_coins": ["USD-Blockchain"],
        "specs": {"gpu": "1x NVIDIA GeForce RTX 5090", "gpuram": 32,
                  "ram": 24, "net": {"down": 200, "cc": "DE"}},
        "price": {"usd": {"on_demand_usd": 12, "on_demand_clore": 8},
                  "on_demand": {"USD-Blockchain": 12}},
    }


def test_market_filters_boundaries_and_currency_daily_price(clore):
    s = server()
    assert clore.eligible(s, "USD-Blockchain")
    assert clore.daily_price(s, "USD-Blockchain") == 12
    for field, value in [("rented", True), ("reliability", .949),
                         ("cuda_version", "12.7"), ("gpu_array", ["5090", "5090"]),
                         ("allowed_coins", ["bitcoin"])]:
        assert not clore.eligible({**s, field: value}, "USD-Blockchain")
    for field, value in [("ram", 23), ("gpuram", 23), ("net", {"down": 199})]:
        assert not clore.eligible({**s, "specs": {**s["specs"], field: value}}, "USD-Blockchain")


@pytest.mark.parametrize("order,want", [
    ({"connection": {"ports": {"8080": "tcp://node.example:12000"}}}, "node.example:12000"),
    ({"connection": {"tcp_ports": {"8080": {"host": "node.example", "port": 12000}}}}, "node.example:12000"),
    ({"pub_cluster": ["n1.example", "n2.example"], "tcp_ports": ["22:10000", "8080:12000"]}, "n1.example:12000"),
    ({"connection": {"ports": {"8080": "https://proxy.example"}}}, None),
    ({"pub_cluster": ["node.example"], "tcp_ports": ["22:10000"]}, None),
])
def test_public_tcp_mapping(clore, order, want):
    assert clore.resolve_endpoint(order) == want


def test_env_edit_keeps_comments_other_secrets_and_first_backup(clore, tmp_path):
    path = tmp_path / ".env"
    original = "# keep\nJIRA_API_TOKEN=untouched\nLLM_MODEL=old # comment\nLLM_MODEL=duplicate\n"
    path.write_text(original)
    clore.update_env(path, {"LLM_MODEL": "qwen3.8-27b", "LLM_TIMEOUT": "600"})
    first = path.read_text()
    assert "# keep\nJIRA_API_TOKEN=untouched\n" in first
    assert "LLM_MODEL=qwen3.8-27b # comment" in first
    assert clore.read_env(path)["LLM_TIMEOUT"] == "600"
    assert clore.read_env(path)["LLM_MODEL"] == "qwen3.8-27b"
    clore.update_env(path, {"LLM_TIMEOUT": "601"})
    assert path.with_name(".env.bak").read_text() == original
    assert path.stat().st_mode & 0o077 == 0


def test_launch_payload_is_explicit_script_and_redacted(clore):
    p = clore.order_payload(server(), 6, "USD-Blockchain", "private-key")
    assert p["ports"]["8080"] == "tcp"
    assert p["autossh_entrypoint"] is True
    assert p["rental_hours"] == 6 and p["auto_renew"] is False
    assert p["command"].startswith("cd /app && nohup ./llama-server ")
    assert p["command"].endswith("> /root/llama.log 2>&1 &")
    assert "--reasoning-budget 0" in p["command"]
    assert "--dry-multiplier 0.8" in p["command"]
    assert "--no-mmproj" in p["command"]
    assert "-hf unsloth/Qwen3.8-27B-GGUF:UD-Q4_K_M" in p["command"]
    assert "private-key" not in json.dumps(clore.redact(p))


def test_json_warmup_rejects_wrong_schema(clore):
    assert clore.validate_completion({"choices": [{"message": {"content": '{"ok":true}'}}]}, True)
    with pytest.raises(RuntimeError, match="json_object"):
        clore.validate_completion({"choices": [{"message": {"content": '{"ok":"true"}'}}]}, True)
    with pytest.raises(RuntimeError):
        clore.validate_completion({"choices": [{"message": {"content": ""}}]}, False)
    with pytest.raises(RuntimeError, match="json_object"):
        clore.validate_completion({"choices": [{"message": {"content": '{"ok":1}'}}]}, True)


def test_pending_creation_prevents_second_rental(clore, monkeypatch):
    monkeypatch.setattr(clore, "load_state", lambda: {"orders": [], "creation_pending": {"server_id": 10}})
    with pytest.raises(RuntimeError, match="My Orders"):
        clore.up(None, None, {}, "USD-Blockchain")


def test_api_uses_auth_header_and_rate_limit_backoff(clore, monkeypatch):
    responses = iter([{"code": 5}, {"code": 0, "servers": []}])
    calls = []
    waits = []

    def request(url, **kwargs):
        calls.append((url, kwargs))
        return next(responses)

    monkeypatch.setattr(clore, "request", request)
    monkeypatch.setattr(clore.time, "sleep", waits.append)
    assert clore.Clore({"CLORE_API_KEY": "secret"}).call("marketplace") == {"code": 0, "servers": []}
    assert calls[0][1]["headers"] == {"auth": "secret"}
    assert calls[1][0] == "https://api.clore.ai/v1/marketplace"
    assert 2 in waits


def test_ambiguous_create_is_not_retried(clore, monkeypatch):
    calls = []

    def request(url, **kwargs):
        calls.append(url)
        raise OSError("network unavailable")

    monkeypatch.setattr(clore, "request", request)
    with pytest.raises(RuntimeError, match="НЕ повторяйте up"):
        clore.Clore({"CLORE_API_KEY": "secret"}).call("create_order", {"renting_server": 10})
    assert len(calls) == 1
