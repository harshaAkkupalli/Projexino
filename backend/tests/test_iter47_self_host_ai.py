"""
Iter 47 — Self-Host AI provider tests.

Covers:
- /api/ai/config GET/PUT/DELETE round-trip (super_admin)
- env_providers_detected contains 'emergent' on this tenant
- ai_provider env-detection priority (ollama, openrouter)
- ai_provider error surface: ollama unreachable -> RuntimeError 'Could not reach Ollama'
- ai_provider openrouter dispatch -> clean RuntimeError (auth 401) not crash
- /api/ai/test endpoint returns well-formed JSON (no crash)
"""
import os
import sys
import asyncio
import importlib

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Frontend env is the source of truth in this repo
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

ADMIN_EMAIL = "admin@projexino.com"
ADMIN_PASSWORD = "Projexino@2026"

sys.path.insert(0, "/app/backend")


# ───────────────────────── Fixtures ─────────────────────────
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=20,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    d = r.json()
    return d.get("access_token") or d.get("token")


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ───────────────────────── HTTP — /api/ai/config ─────────────────────────
class TestAIConfigEndpoint:
    def test_get_ai_config_baseline(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/ai/config", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "env_providers_detected" in data
        assert isinstance(data["env_providers_detected"], list)
        # subset of supported providers
        allowed = {"openai", "anthropic", "gemini", "openrouter", "ollama", "emergent"}
        assert set(data["env_providers_detected"]).issubset(allowed)
        # In this tenant EMERGENT_LLM_KEY is set
        assert "emergent" in data["env_providers_detected"]
        assert "source" in data and data["source"] in ("db", "env", "none")
        assert "configured" in data

    def test_put_ollama_override_and_persist(self, admin_headers):
        payload = {"provider": "ollama", "api_key": "http://localhost:11434", "model": "llama3.2"}
        r = requests.put(f"{BASE_URL}/api/ai/config", headers=admin_headers, json=payload, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("provider") == "ollama"

        # GET should reflect the override
        r2 = requests.get(f"{BASE_URL}/api/ai/config", headers=admin_headers, timeout=15)
        assert r2.status_code == 200
        d = r2.json()
        assert d["source"] == "db"
        assert d["provider"] == "ollama"
        assert d["model"] == "llama3.2"
        # api_key_masked for ollama starts with 'http' or the masking shows part of url
        assert isinstance(d.get("api_key_masked"), str) and len(d["api_key_masked"]) > 0

    def test_delete_clears_override(self, admin_headers):
        r = requests.delete(f"{BASE_URL}/api/ai/config", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert r.json().get("ok") is True

        r2 = requests.get(f"{BASE_URL}/api/ai/config", headers=admin_headers, timeout=15)
        d = r2.json()
        # back to env
        assert d["source"] in ("env", "none")
        # since EMERGENT_LLM_KEY is set on this tenant
        assert d["source"] == "env"

    def test_ai_test_endpoint_returns_clean_json(self, admin_headers):
        # /api/ai/test always returns 200 JSON with ok=true|false (never crashes)
        r = requests.post(
            f"{BASE_URL}/api/ai/test",
            headers=admin_headers,
            json={"prompt": "Say hi in 3 words."},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "ok" in data
        assert "provider" in data
        assert isinstance(data["ok"], bool)
        # either response or error must be present
        assert "response" in data or "error" in data


# ───────────────────── Module-level ai_provider tests ─────────────────────
class TestAIProviderModule:
    def _reload(self):
        import ai_provider  # noqa
        importlib.reload(ai_provider)
        return ai_provider

    def test_active_provider_resolves_ollama(self, monkeypatch):
        # Clear all other higher-priority env vars
        for k in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY",
                  "GOOGLE_API_KEY", "OPENROUTER_API_KEY"):
            monkeypatch.delenv(k, raising=False)
        monkeypatch.setenv("OLLAMA_BASE_URL", "http://localhost:11434")
        ai_provider = self._reload()
        ai_provider.clear_runtime_config()
        assert ai_provider.active_provider() == "ollama"

    def test_active_provider_resolves_openrouter(self, monkeypatch):
        for k in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY",
                  "GOOGLE_API_KEY", "OLLAMA_BASE_URL", "PROJEXINO_USE_OLLAMA"):
            monkeypatch.delenv(k, raising=False)
        monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-test-key")
        ai_provider = self._reload()
        ai_provider.clear_runtime_config()
        assert ai_provider.active_provider() == "openrouter"

    def test_ollama_unreachable_raises_runtime_error(self):
        import ai_provider
        importlib.reload(ai_provider)
        ai_provider.set_runtime_config(
            provider="ollama", api_key="http://127.0.0.1:9", model="llama3.2"
        )
        with pytest.raises(RuntimeError) as exc:
            asyncio.run(ai_provider.chat_completion(
                system_message="sys", user_message="hello"
            ))
        msg = str(exc.value)
        assert "Could not reach Ollama" in msg or "ollama" in msg.lower()
        ai_provider.clear_runtime_config()

    def test_openrouter_invalid_key_raises_clean_runtime_error(self):
        import ai_provider
        importlib.reload(ai_provider)
        ai_provider.set_runtime_config(
            provider="openrouter",
            api_key="sk-or-test-not-real",
            model="meta-llama/llama-3.2-3b-instruct:free",
        )
        with pytest.raises(RuntimeError) as exc:
            asyncio.run(ai_provider.chat_completion(
                system_message="sys", user_message="ping"
            ))
        msg = str(exc.value).lower()
        # Must be a RuntimeError mentioning openrouter / auth — NOT a raw httpx/openai exception type
        assert "openrouter" in msg or "auth" in msg or "401" in msg or "key" in msg or "unauthor" in msg or "user" in msg
        ai_provider.clear_runtime_config()

    def test_openrouter_module_uses_correct_base_url(self):
        """Inspect the _call_openrouter source to ensure correct base_url."""
        import ai_provider
        import inspect
        src = inspect.getsource(ai_provider._call_openrouter)
        assert "openrouter.ai/api/v1" in src
