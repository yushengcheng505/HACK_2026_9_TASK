import atexit
import os
import shutil
import tempfile

DATA_DIR = tempfile.mkdtemp(prefix="decomposer-test-")
atexit.register(shutil.rmtree, DATA_DIR, ignore_errors=True)

os.environ.update({
    "LLM_BASE_URL": "http://llm.test/v1",
    "LLM_MODEL": "test-model",
    "LLM_API_KEY": "test",
    "LLM_API_KEY_ENV": "",
    "LLM_JSON_MODE": "json_schema",
    "LLM_EXTRA_BODY": "{}",
    "LLM_CONCURRENCY": "1",
    "CRITIC_ROUNDS": "2",
    "DATA_DIR": DATA_DIR,
})
