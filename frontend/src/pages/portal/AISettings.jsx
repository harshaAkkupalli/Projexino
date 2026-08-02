import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Sparkles, KeyRound, Save, Trash2, CheckCircle2, AlertTriangle, Loader2, X, Eye, EyeOff, Zap,
} from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

const PROVIDER_MODELS = {
  openai: [
    { v: "", label: "Default (gpt-5.2)" },
    { v: "gpt-5.2", label: "gpt-5.2" },
    { v: "gpt-4o", label: "gpt-4o" },
    { v: "gpt-4o-mini", label: "gpt-4o-mini" },
  ],
  anthropic: [
    { v: "", label: "Default (claude-sonnet-4-5-20250929)" },
    { v: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5" },
    { v: "claude-opus-4-5", label: "Claude Opus 4.5" },
    { v: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
  ],
  gemini: [
    { v: "", label: "Default (gemini-2.5-flash)" },
    { v: "gemini-2.5-flash", label: "gemini-2.5-flash (fast & cheap)" },
    { v: "gemini-2.5-pro", label: "gemini-2.5-pro (highest quality)" },
    { v: "gemini-2.0-flash", label: "gemini-2.0-flash" },
    { v: "gemini-2.0-flash-lite", label: "gemini-2.0-flash-lite" },
    { v: "gemini-1.5-pro", label: "gemini-1.5-pro" },
    { v: "gemini-1.5-flash", label: "gemini-1.5-flash" },
  ],
  openrouter: [
    { v: "", label: "Default (Llama 3.2 3B · FREE)" },
    { v: "meta-llama/llama-3.2-3b-instruct:free", label: "Llama 3.2 3B · FREE" },
    { v: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B · FREE" },
    { v: "google/gemini-2.0-flash-exp:free", label: "Gemini 2.0 Flash · FREE" },
    { v: "mistralai/mistral-7b-instruct:free", label: "Mistral 7B · FREE" },
    { v: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet (paid)" },
    { v: "openai/gpt-4o", label: "OpenAI GPT-4o (paid)" },
  ],
  ollama: [
    { v: "", label: "Default (llama3.2)" },
    { v: "llama3.2", label: "llama3.2 (3B · ~2 GB)" },
    { v: "llama3.1", label: "llama3.1 (8B · ~5 GB)" },
    { v: "qwen2.5", label: "qwen2.5 (7B · ~4 GB)" },
    { v: "mistral", label: "mistral (7B · ~4 GB)" },
    { v: "phi3", label: "phi3 (3.8B · ~2 GB)" },
    { v: "gemma2", label: "gemma2 (9B · ~5 GB)" },
  ],
  emergent: [{ v: "", label: "Default (Claude Sonnet 4.5 via Emergent)" }],
};

const PROVIDERS = [
  { v: "ollama", label: "Ollama · 100% FREE forever", desc: "Runs locally on your server — no API key, no usage cost ever. Install from ollama.com, then `ollama pull llama3.2`.",
    keyHint: "Base URL — usually http://localhost:11434", url: "https://ollama.com", free: true },
  { v: "openrouter", label: "OpenRouter · free models + paid", desc: "One key, 100+ models including several FREE Llama / Gemini / Mistral models.",
    keyHint: "starts with sk-or-...", url: "https://openrouter.ai/keys", free: true },
  { v: "gemini", label: "Google Gemini · generous free tier", desc: "Free tier at aistudio.google.com — usually enough for self-hosted SMBs.",
    keyHint: "starts with AIza...", url: "https://aistudio.google.com/apikey", free: true },
  { v: "openai", label: "OpenAI (GPT-5.2 / GPT-4)", desc: "Best general-purpose, $5 free credit at platform.openai.com",
    keyHint: "starts with sk-...", url: "https://platform.openai.com/api-keys" },
  { v: "anthropic", label: "Anthropic Claude", desc: "Excellent at writing & reasoning",
    keyHint: "starts with sk-ant-...", url: "https://console.anthropic.com/settings/keys" },
  { v: "emergent", label: "Emergent Universal Key", desc: "Works only on Emergent's preview/cloud — not portable.",
    keyHint: "starts with sk-emergent-...", url: "" },
];

export default function AISettings() {
  const { user } = useAuth();
  const [cfg, setCfg] = useState(null);
  const [form, setForm] = useState({ provider: "openai", api_key: "", model: "" });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const load = async () => {
    try {
      const { data } = await api.get("/ai/config");
      setCfg(data);
      if (data.provider) setForm({ provider: data.provider, api_key: "", model: data.model || "" });
    } catch (e) { toast.error("Failed to load AI config"); }
  };
  useEffect(() => { load(); }, []);

  if (user?.role !== "super_admin") {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-10 text-center">
        <AlertTriangle size={32} className="mx-auto mb-2 text-rose-500" />
        <div className="font-bold text-rose-700">Super Admin only</div>
        <div className="mt-1 text-xs text-rose-600">Only the Super Admin can change the AI provider.</div>
      </div>
    );
  }

  const save = async () => {
    if (!form.api_key) return toast.error("API key required");
    setBusy(true);
    try {
      await api.put("/ai/config", form);
      toast.success("Saved · Xino AI will now use this provider");
      setForm({ ...form, api_key: "" }); // clear from UI
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Failed"); }
    finally { setBusy(false); }
  };

  const clear = async () => {
    if (!window.confirm("Clear the DB-saved AI key? The app will fall back to environment variables.")) return;
    setBusy(true);
    try {
      await api.delete("/ai/config");
      toast.success("Cleared. Falling back to environment keys (if any).");
      load();
    } catch { toast.error("Failed"); }
    finally { setBusy(false); }
  };

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { data } = await api.post("/ai/test", { prompt: "Reply with: AI is working." });
      setTestResult(data);
    } catch (e) {
      setTestResult({ ok: false, error: formatApiError(e.response?.data?.detail) || "Failed" });
    } finally { setTesting(false); }
  };

  const provDef = PROVIDERS.find((p) => p.v === form.provider) || PROVIDERS[0];

  return (
    <div data-testid="page-ai-settings" className="space-y-5">
      {/* Hero */}
      <div className="rounded-3xl border border-violet-100 bg-gradient-to-br from-[#0F2042] via-[#312E81] to-[#7C3AED] p-6 text-white shadow-xl">
        <div className="text-[10px] font-bold uppercase tracking-[0.32em] text-violet-300">// ai · provider</div>
        <h1 className="font-display mt-1 text-3xl font-medium md:text-4xl">AI Settings</h1>
        <p className="mt-1 text-sm text-violet-200">
          The Xino AI, Email-template AI and Campaign-AI all use this provider. Set your own key here so the app keeps working when you self-host —
          no code changes, no .env edits.
        </p>
      </div>

      {/* Status card */}
      {cfg && (
        <div className={`rounded-2xl border p-4 ${cfg.configured ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
          <div className="flex flex-wrap items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-full ${cfg.configured ? "bg-emerald-500" : "bg-rose-500"} text-white`}>
              {cfg.configured ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
            </div>
            <div className="flex-1">
              <div className="font-bold text-[#0F2042]">
                {cfg.configured ? "AI is active" : "No AI configured"}
              </div>
              <div className="text-xs text-slate-600">
                {cfg.configured ? (
                  <>Provider: <b className="capitalize">{cfg.provider}</b>{cfg.model ? <> · Model: <b>{cfg.model}</b></> : null} · Key: <code className="bg-white px-1.5 py-0.5 rounded">{cfg.api_key_masked}</code> · Source: <span className="font-bold">{cfg.source}</span></>
                ) : (
                  <>Set a key below or in your backend .env file.</>
                )}
              </div>
            </div>
            <button onClick={runTest} disabled={testing || !cfg.configured} data-testid="ai-test"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#0F2042] px-4 py-2 text-xs font-bold text-white hover:bg-[#1E3A8A] disabled:opacity-60">
              {testing ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />} Test now
            </button>
          </div>
          {testResult && (
            <div className={`mt-3 rounded-lg p-3 text-xs ${testResult.ok ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
              <b>{testResult.ok ? "✅ Success" : "❌ Failure"}:</b> {testResult.response || testResult.error}
            </div>
          )}
        </div>
      )}

      {/* Form */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#F97316]">// configure key</div>
        <h2 className="font-display mt-1 text-xl font-semibold text-[#0F2042]">Pick a provider</h2>

        <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
          {PROVIDERS.map((p) => (
            <button key={p.v}
              data-testid={`ai-prov-${p.v}`}
              onClick={() => setForm({ ...form, provider: p.v, api_key: p.v === "ollama" ? (form.api_key || "http://localhost:11434") : "" })}
              className={`relative text-left rounded-2xl border-2 p-3 transition ${form.provider === p.v ? "border-[#F97316] bg-orange-50" : "border-slate-200 hover:border-slate-300"}`}>
              {p.free && (
                <span className="absolute right-2 top-2 rounded-full bg-emerald-500 px-2 py-0.5 text-[9px] font-bold text-white shadow">FREE</span>
              )}
              <div className="pr-12 font-bold text-[#0F2042]">{p.label}</div>
              <div className="text-xs text-slate-600">{p.desc}</div>
              {p.url && <a href={p.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                className="mt-1 inline-block text-[10px] font-bold text-[#F97316] underline">
                {p.v === "ollama" ? "Install Ollama →" : "Get key →"}
              </a>}
            </button>
          ))}
        </div>

        <div className="mt-5 space-y-3">
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-slate-500">
              {form.provider === "ollama" ? `Base URL * (${provDef.keyHint})` : `API key * (${provDef.keyHint})`}
            </span>
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 focus-within:border-[#F97316]">
              <KeyRound size={14} className="text-slate-400" />
              <input
                type={form.provider === "ollama" ? "text" : (show ? "text" : "password")}
                value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                data-testid="ai-key"
                placeholder={form.provider === "ollama" ? "http://localhost:11434" : "paste your key"}
                className="w-full bg-transparent text-sm outline-none"
              />
              {form.provider !== "ollama" && (
                <button onClick={() => setShow(!show)} className="text-slate-400 hover:text-[#0F2042]">
                  {show ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              )}
            </div>
            <span className="mt-1 text-[10px] text-slate-500">
              {form.provider === "ollama"
                ? "Ollama runs locally on your server. NO API key, NO usage cost. Install from ollama.com, run `ollama pull llama3.2`, then use http://localhost:11434 (or the IP of your Ollama box)."
                : "Keys are stored encrypted at rest in the database. Never logged."}
            </span>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-slate-500">Model</span>
            <select
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
              data-testid="ai-model"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316]"
            >
              {(PROVIDER_MODELS[form.provider] || PROVIDER_MODELS.openai).map((m) => (
                <option key={m.v || "default"} value={m.v}>{m.label}</option>
              ))}
            </select>
            {form.provider === "gemini" && (
              <span className="mt-1 block text-[10px] text-slate-500">
                Use exact IDs from <a href="https://ai.google.dev/gemini-api/docs/models" target="_blank" rel="noreferrer" className="text-[#F97316] underline">Google AI Studio docs</a>. <code className="rounded bg-slate-100 px-1">Gemini 3</code> isn't available via the public Gemini API yet.
              </span>
            )}
          </label>

          <div className="flex flex-wrap gap-2">
            <button onClick={save} disabled={busy} data-testid="ai-save"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#F97316] to-[#EA580C] px-6 py-2.5 text-sm font-bold text-white shadow disabled:opacity-60">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save &amp; activate
            </button>
            {cfg?.source === "db" && (
              <button onClick={clear} disabled={busy} data-testid="ai-clear"
                className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white px-4 py-2.5 text-sm font-bold text-rose-700 hover:bg-rose-50">
                <Trash2 size={14} /> Clear DB key
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Help */}
      <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-xs text-amber-900">
        <div className="font-bold text-amber-800">When self-hosting outside Emergent:</div>
        <ol className="mt-1 ml-4 list-decimal space-y-0.5">
          <li>Pick any provider above &amp; paste your own API key.</li>
          <li>This key lives in your MongoDB — no Emergent dependency.</li>
          <li>If you also set <code>OPENAI_API_KEY</code> / <code>ANTHROPIC_API_KEY</code> / <code>GEMINI_API_KEY</code> in <code>backend/.env</code>, the <b>DB key takes priority</b>. Clear the DB key to fall back to .env.</li>
        </ol>
      </div>
    </div>
  );
}
