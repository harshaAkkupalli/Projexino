import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Send, Sparkles, Code2, FileText, MessageSquare, Trash2 } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import PageInfographic from "@/components/PageInfographic";
import XinoLogo from "@/components/XinoLogo";

const MODES = [
  { id: "code", label: "Code", icon: Code2, hint: "Pair-program & debug" },
  { id: "doc", label: "Docs", icon: FileText, hint: "Write & polish docs" },
  { id: "general", label: "General", icon: MessageSquare, hint: "Ask anything" },
];

export default function AIAssist() {
  const [sessions, setSessions] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  const refreshSessions = async () => {
    const { data } = await api.get("/ai/sessions");
    setSessions(data);
    if (data.length && !active) setActive(data[0]);
  };
  useEffect(() => { refreshSessions(); }, []);

  useEffect(() => {
    if (!active) return;
    api.get(`/ai/sessions/${active.id}/messages`).then(({ data }) => {
      setMessages(data);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 30);
    });
  }, [active?.id]);

  const newSession = async (mode) => {
    const { data } = await api.post("/ai/sessions", { title: `${mode} chat`, mode });
    await refreshSessions();
    setActive(data);
    setMessages([]);
  };

  const send = async (e) => {
    e?.preventDefault?.();
    if (!active || !text.trim() || busy) return;
    const message = text;
    setText("");
    setBusy(true);
    // optimistic
    const optimistic = { id: "tmp", role: "user", content: message, created_at: new Date().toISOString() };
    setMessages((p) => [...p, optimistic]);
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 30);
    try {
      const { data } = await api.post("/ai/send", {
        session_id: active.id, message, mode: active.mode,
      });
      setMessages((p) => [...p.filter((m) => m.id !== "tmp"), data.user, data.assistant]);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 30);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "AI failed");
      setMessages((p) => p.filter((m) => m.id !== "tmp"));
    } finally { setBusy(false); }
  };

  const deleteSession = async (id) => {
    await api.delete(`/ai/sessions/${id}`);
    if (active?.id === id) { setActive(null); setMessages([]); }
    await refreshSessions();
  };

  return (
    <div data-testid="portal-ai" className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-orange-50/50 to-blue-50/30 p-6 shadow-sm">
        <div className="relative grid items-center gap-6 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <div className="text-xs font-bold uppercase tracking-[0.25em] text-[#F97316]">// projexino ai · claude sonnet 4.5</div>
            <h1 className="font-display mt-2 text-3xl font-medium leading-tight text-[#0F2042] md:text-4xl">
              Pair-program with AI.
            </h1>
            <p className="mt-3 text-sm text-slate-600">
              Ask code questions, refactor snippets, generate documentation, and onboard interns faster — all inside the portal.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {MODES.map((m) => (
                <button key={m.id} data-testid={`ai-new-${m.id}`} onClick={() => newSession(m.id)}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#0F2042] hover:border-[#F97316] hover:text-[#F97316]">
                  <m.icon size={12} /> {m.label}
                </button>
              ))}
            </div>
          </div>
          <div className="lg:col-span-3">
            <PageInfographic variant="ai" className="h-56 w-full" />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 lg:col-span-1">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Sessions</div>
            <button data-testid="ai-new-session" onClick={() => newSession("general")} className="rounded-lg p-1 text-[#F97316] hover:bg-orange-50">
              <Plus size={14} />
            </button>
          </div>
          <div className="space-y-1">
            {sessions.length === 0 ? <div className="text-xs text-slate-400">No sessions yet.</div> :
              sessions.map((s) => (
                <div key={s.id} className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${active?.id === s.id ? "bg-orange-50 text-[#F97316]" : "hover:bg-slate-50 text-slate-700"}`}>
                  <button onClick={() => setActive(s)} className="flex flex-1 items-center gap-2 truncate">
                    <Sparkles size={12} /> <span className="truncate">{s.title}</span>
                  </button>
                  <button onClick={() => deleteSession(s.id)} className="opacity-0 group-hover:opacity-100">
                    <Trash2 size={12} className="text-slate-400 hover:text-red-500" />
                  </button>
                </div>
              ))}
          </div>
        </aside>

        <section className="flex h-[600px] flex-col rounded-2xl border border-slate-200 bg-white lg:col-span-3">
          {!active ? (
            <div className="m-auto max-w-sm text-center text-sm text-slate-400">
              <Sparkles size={28} className="mx-auto mb-3 text-[#F97316]" />
              Pick a mode above to start a new conversation.
            </div>
          ) : (
            <>
              <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div>
                  <div className="font-display text-base font-semibold text-[#0F172A]">{active.title}</div>
                  <div className="text-[11px] uppercase tracking-[0.2em] text-[#F97316]">Mode: {active.mode}</div>
                </div>
                <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold uppercase text-[#F97316]">claude sonnet 4.5</span>
              </header>
              <div className="flex-1 space-y-4 overflow-y-auto p-4">
                {messages.length === 0 && (
                  <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                    Hi 👋 I'm Xino AI. Ask me anything — code snippets, docs, debugging hints, anything.
                  </div>
                )}
                {messages.map((m) => (
                  <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-sm ${m.role === "user" ? "bg-[#0F2042] text-white" : "bg-orange-50 text-slate-800"}`}>
                      {m.role !== "user" && <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#F97316]">Xino AI</div>}
                      <pre className="whitespace-pre-wrap break-words font-sans">{m.content}</pre>
                    </div>
                  </div>
                ))}
                {busy && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-2 rounded-2xl bg-orange-50 px-4 py-2 text-sm">
                      <XinoLogo size={28} animated />
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#F97316]">Xino AI is thinking…</span>
                    </div>
                  </div>
                )}
                <div ref={endRef} />
              </div>
              <form onSubmit={send} className="flex items-center gap-2 border-t border-slate-100 p-3">
                <input data-testid="ai-input" value={text} onChange={(e) => setText(e.target.value)}
                  placeholder="Ask Xino AI…"
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
                <button data-testid="ai-send-btn" disabled={busy || !text.trim()} type="submit" className="btn-primary text-sm">
                  <Send size={14} />
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
