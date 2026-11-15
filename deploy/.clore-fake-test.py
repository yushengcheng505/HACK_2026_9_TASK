import importlib.util
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
import time

spec = importlib.util.spec_from_file_location("clore", Path(__file__).with_name("clore.py"))
clore = importlib.util.module_from_spec(spec)
spec.loader.exec_module(clore)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, data, status=200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def authorized(self):
        key = clore.load_state().get("api_key", "")
        return bool(key) and self.headers.get("Authorization") == "Bearer " + key

    def do_GET(self):
        if self.path != "/health" and not self.authorized():
            return self.reply({"error": "unauthorized"}, 401)
        if self.path == "/v1/models":
            return self.reply({"data": [{"id": "qwen3.8-27b", "object": "model"}]})
        if self.path == "/health":
            return self.reply({"status": "ok"})
        if self.path == "/slots":
            return self.reply([{"id": n, "is_processing": False} for n in range(4)])
        return self.reply({}, 404)

    def do_POST(self):
        if not self.authorized():
            return self.reply({"error": "unauthorized"}, 401)
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        assert body["model"] == "qwen3.8-27b"
        assert body["chat_template_kwargs"]["enable_thinking"] is False
        content = '{"ok":true}' if "response_format" in body else "OK"
        if "response_format" in body:
            assert body["response_format"]["type"] == "json_schema"
        self.reply({"choices": [{"message": {"content": content}}], "usage": {"completion_tokens": 4},
                    "timings": {"predicted_per_second": 42}, "fake_port": self.server.server_port})


for port in (18101, 18102):
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
while True:
    time.sleep(60)
