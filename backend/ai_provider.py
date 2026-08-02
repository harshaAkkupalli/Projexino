"""
ai_provider.py — Portable AI wrapper for Projexino.

Lets the AI Assistant, AI email-template generator, and mass-email AI drafter
work both inside the Emergent platform AND when self-hosted on the customer's
own infrastructure / domain.

Provider resolution order (first match wins):
  1. Runtime config in MongoDB (`ai_runtime_config`) — set via /api/ai/config UI
  2. OPENAI_API_KEY            -> uses the native `openai` SDK
  3. ANTHROPIC_API_KEY         -> uses the native `anthropic` SDK (if installed)
  4. GEMINI_API_KEY            -> uses the native `google.genai` SDK
  5. OPENROUTER_API_KEY        -> uses OpenAI-compatible API (free models available)
  6. OLLAMA_BASE_URL           -> uses a local Ollama server (FREE, no API key)
  7. EMERGENT_LLM_KEY          -> uses `emergentintegrations` (Emergent universal key)

Env-overrideable defaults:
  PROJEXINO_OPENAI_MODEL       (default: gpt-5.2)
  PROJEXINO_ANTHROPIC_MODEL    (default: claude-sonnet-4-5-20250929)
  PROJEXINO_GEMINI_MODEL       (default: gemini-2.5-flash)
  PROJEXINO_OLLAMA_MODEL       (default: llama3.2)
  PROJEXINO_OPENROUTER_MODEL   (default: meta-llama/llama-3.2-3b-instruct:free)
"""
from __future__ import annotations
import os
import logging
from typing import Optional, Dict

log = logging.getLogger("projexino.ai_provider")

OPENAI_MODEL_DEFAULT = os.environ.get("PROJEXINO_OPENAI_MODEL", "gpt-5.2")
ANTHROPIC_MODEL_DEFAULT = os.environ.get(
    "PROJEXINO_ANTHROPIC_MODEL", "claude-sonnet-4-5-20250929"
)
GEMINI_MODEL_DEFAULT = os.environ.get("PROJEXINO_GEMINI_MODEL", "gemini-2.5-flash")
OLLAMA_MODEL_DEFAULT = os.environ.get("PROJEXINO_OLLAMA_MODEL", "llama3.2")
OLLAMA_BASE_URL_DEFAULT = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
OPENROUTER_MODEL_DEFAULT = os.environ.get(
    "PROJEXINO_OPENROUTER_MODEL", "meta-llama/llama-3.2-3b-instruct:free"
)

# Process-local cache so we don't hit MongoDB on every call.
_RUNTIME_CACHE: Dict[str, str] = {}
_RUNTIME_LOADED: bool = False


def set_runtime_config(provider: str, api_key: str, model: Optional[str] = None) -> None:
    """Used by the /api/ai/config endpoint to override env keys at runtime."""
    global _RUNTIME_LOADED
    _RUNTIME_CACHE.clear()
    if provider and api_key:
        _RUNTIME_CACHE["provider"] = provider
        _RUNTIME_CACHE["api_key"] = api_key
        if model:
            _RUNTIME_CACHE["model"] = model
    _RUNTIME_LOADED = True


def clear_runtime_config() -> None:
    global _RUNTIME_LOADED
    _RUNTIME_CACHE.clear()
    _RUNTIME_LOADED = True  # treat as loaded (= no override)


def _effective_provider_and_key():
    """Return (provider, api_key, model) — DB overrides env."""
    if _RUNTIME_CACHE.get("provider") and _RUNTIME_CACHE.get("api_key"):
        return (
            _RUNTIME_CACHE["provider"],
            _RUNTIME_CACHE["api_key"],
            _RUNTIME_CACHE.get("model"),
        )
    if os.environ.get("OPENAI_API_KEY"):
        return ("openai", os.environ["OPENAI_API_KEY"], None)
    if os.environ.get("ANTHROPIC_API_KEY"):
        return ("anthropic", os.environ["ANTHROPIC_API_KEY"], None)
    if os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY"):
        return ("gemini", os.environ.get("GEMINI_API_KEY") or os.environ["GOOGLE_API_KEY"], None)
    if os.environ.get("OPENROUTER_API_KEY"):
        return ("openrouter", os.environ["OPENROUTER_API_KEY"], None)
    # Ollama — free local LLM. Treat any value (even default) as configured if
    # the user set OLLAMA_BASE_URL or PROJEXINO_USE_OLLAMA=1 explicitly.
    if os.environ.get("OLLAMA_BASE_URL") or os.environ.get("PROJEXINO_USE_OLLAMA") == "1":
        return ("ollama", os.environ.get("OLLAMA_BASE_URL", OLLAMA_BASE_URL_DEFAULT), None)
    if os.environ.get("EMERGENT_LLM_KEY"):
        return ("emergent", os.environ["EMERGENT_LLM_KEY"], None)
    return ("none", "", None)


def active_provider() -> str:
    """Return the name of the provider that will be used. Useful for /health endpoints."""
    return _effective_provider_and_key()[0]


def ai_configured() -> bool:
    return active_provider() != "none"


async def chat_completion(
    *,
    system_message: str,
    user_message: str,
    session_id: Optional[str] = None,
    temperature: float = 0.6,
) -> str:
    """
    Provider-agnostic single-shot chat completion.

    Returns the assistant's response text. Raises RuntimeError on misconfiguration
    or provider failure.
    """
    provider, api_key, model = _effective_provider_and_key()
    if provider == "none":
        raise RuntimeError(
            "No AI provider configured. Set one of OPENAI_API_KEY, ANTHROPIC_API_KEY, "
            "GEMINI_API_KEY, or EMERGENT_LLM_KEY — or configure via the AI Settings page."
        )

    try:
        if provider == "openai":
            return await _call_openai(system_message, user_message, temperature, api_key, model)
        if provider == "anthropic":
            return await _call_anthropic(system_message, user_message, temperature, api_key, model)
        if provider == "gemini":
            return await _call_gemini(system_message, user_message, temperature, api_key, model)
        if provider == "openrouter":
            return await _call_openrouter(system_message, user_message, temperature, api_key, model)
        if provider == "ollama":
            # For Ollama, `api_key` actually carries the base URL.
            return await _call_ollama(system_message, user_message, temperature, api_key, model)
        # emergent
        return await _call_emergent(system_message, user_message, session_id, api_key)
    except RuntimeError:
        raise
    except Exception as e:
        log.exception("AI provider %s failed", provider)
        raise RuntimeError(f"AI provider '{provider}' failed: {e}") from e


# --- OpenAI direct (most ubiquitous self-hosted key) ---
async def _call_openai(system: str, user_text: str, temperature: float, api_key: str, model: Optional[str]) -> str:
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=api_key)
    model = model or OPENAI_MODEL_DEFAULT
    # GPT-5 family does not accept a custom temperature value
    extra = {} if model.startswith("gpt-5") else {"temperature": temperature}
    resp = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user_text},
        ],
        **extra,
    )
    return (resp.choices[0].message.content or "").strip()


# --- Anthropic direct (if customer prefers Claude) ---
async def _call_anthropic(system: str, user_text: str, temperature: float, api_key: str, model: Optional[str]) -> str:
    try:
        from anthropic import AsyncAnthropic
    except ImportError as e:
        raise RuntimeError(
            "ANTHROPIC_API_KEY is set but the `anthropic` package is not installed. "
            "Run: pip install anthropic"
        ) from e
    client = AsyncAnthropic(api_key=api_key)
    msg = await client.messages.create(
        model=model or ANTHROPIC_MODEL_DEFAULT,
        max_tokens=2048,
        temperature=temperature,
        system=system,
        messages=[{"role": "user", "content": user_text}],
    )
    parts = []
    for block in msg.content:
        if getattr(block, "type", None) == "text":
            parts.append(block.text)
    return "".join(parts).strip()


# --- Gemini direct (Google AI Studio key) ---
GEMINI_VALID_MODELS = {
    "gemini-2.5-flash", "gemini-2.5-pro",
    "gemini-2.0-flash", "gemini-2.0-flash-lite",
    "gemini-1.5-flash", "gemini-1.5-pro", "gemini-1.5-flash-8b",
}


def _normalize_gemini_model(model: Optional[str]) -> str:
    """Accept common user inputs and normalize to Gemini's required format.

    Examples that all map to 'gemini-2.5-flash':
      'Gemini 2.5 Flash', 'gemini 2.5 flash', 'models/gemini-2.5-flash',
      'Gemini-2.5-Flash', ' GEMINI-2.5-flash '
    """
    if not model:
        return GEMINI_MODEL_DEFAULT
    m = model.strip().lower()
    # Strip Google's optional 'models/' prefix (rejected by new SDK)
    if m.startswith("models/"):
        m = m[len("models/"):]
    # Replace spaces / underscores with hyphens
    m = m.replace("_", "-").replace(" ", "-")
    # Collapse repeated hyphens
    while "--" in m:
        m = m.replace("--", "-")
    # Common alias fixes
    aliases = {
        "gemini-pro": "gemini-1.5-pro",
        "gemini-flash": "gemini-2.5-flash",
        "gemini-3-flash": "gemini-2.5-flash",
        "gemini-3-pro": "gemini-2.5-pro",
        "gemini-3": "gemini-2.5-pro",
    }
    if m in aliases:
        m = aliases[m]
    return m


async def _call_gemini(system: str, user_text: str, temperature: float, api_key: str, model: Optional[str]) -> str:
    try:
        from google import genai
        from google.genai import types as gtypes
    except ImportError as e:
        raise RuntimeError(
            "GEMINI_API_KEY is set but `google-genai` is not installed."
        ) from e
    normalized = _normalize_gemini_model(model)
    if normalized not in GEMINI_VALID_MODELS:
        # Surface a clear hint instead of Gemini's cryptic INVALID_ARGUMENT
        valid = ", ".join(sorted(GEMINI_VALID_MODELS))
        raise RuntimeError(
            f"Unknown Gemini model '{model}'. "
            f"Valid model IDs are: {valid}. "
            "(Tip: leave the Model field blank to use the default.)"
        )
    client = genai.Client(api_key=api_key)
    # Run blocking SDK in a thread so we stay async-friendly.
    import asyncio
    def _go():
        resp = client.models.generate_content(
            model=normalized,
            contents=user_text,
            config=gtypes.GenerateContentConfig(
                system_instruction=system,
                temperature=temperature,
            ),
        )
        return (resp.text or "").strip()
    return await asyncio.to_thread(_go)


# --- Emergent universal key fallback (works only on Emergent platform) ---
async def _call_emergent(system: str, user_text: str, session_id: Optional[str], api_key: str) -> str:
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except ImportError as e:
        raise RuntimeError(
            "EMERGENT_LLM_KEY is set but `emergentintegrations` is not installed."
        ) from e
    chat = LlmChat(
        api_key=api_key,
        session_id=session_id or "projexino",
        system_message=system,
    ).with_model("anthropic", ANTHROPIC_MODEL_DEFAULT)
    response = await chat.send_message(UserMessage(text=user_text))
    return str(response).strip()


# --- OpenRouter (single API, 100+ models, generous FREE tier) ---
# Compatible with the OpenAI SDK — only need to override base_url.
async def _call_openrouter(system: str, user_text: str, temperature: float,
                           api_key: str, model: Optional[str]) -> str:
    from openai import AsyncOpenAI
    client = AsyncOpenAI(
        api_key=api_key,
        base_url="https://openrouter.ai/api/v1",
    )
    model = model or OPENROUTER_MODEL_DEFAULT
    resp = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user_text},
        ],
        temperature=temperature,
        extra_headers={
            "HTTP-Referer": os.environ.get("PROJEXINO_PUBLIC_URL", "https://projexino.local"),
            "X-Title": "Projexino",
        },
    )
    return (resp.choices[0].message.content or "").strip()


# --- Ollama — FREE local LLM, NO API KEY needed ever ---
# Works out-of-the-box once the user installs Ollama (https://ollama.com) and
# pulls a model (e.g. `ollama pull llama3.2`).  ZERO ongoing cost forever.
async def _call_ollama(system: str, user_text: str, temperature: float,
                       base_url: str, model: Optional[str]) -> str:
    import httpx
    url = (base_url or OLLAMA_BASE_URL_DEFAULT).rstrip("/") + "/api/chat"
    model = model or OLLAMA_MODEL_DEFAULT
    payload = {
        "model": model,
        "stream": False,
        "options": {"temperature": float(temperature)},
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_text},
        ],
    }
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            r = await client.post(url, json=payload)
            if r.status_code == 404:
                raise RuntimeError(
                    f"Ollama returned 404 — the model '{model}' is not pulled. "
                    f"Run `ollama pull {model}` on the host where Ollama is installed."
                )
            r.raise_for_status()
            data = r.json()
    except httpx.ConnectError as e:
        raise RuntimeError(
            f"Could not reach Ollama at {url}. Is the Ollama daemon running? "
            f"Install it from https://ollama.com and start it with `ollama serve`."
        ) from e
    msg = (data.get("message") or {}).get("content", "")
    return (msg or "").strip()
