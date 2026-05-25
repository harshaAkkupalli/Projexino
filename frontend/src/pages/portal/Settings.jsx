import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Bell, Sparkles, Trash2, Edit3, Plus, Volume2, Send, Check, X as XIcon, Loader2, ExternalLink, PlayCircle, Smartphone, BellRing, BellOff } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { playRingtone } from "@/lib/ringtone";
import { useAuth } from "@/context/AuthContext";
import { requestAndRegisterToken, unregisterToken, fcmPermissionState } from "@/lib/fcm";

const RINGTONE_OPTIONS = ["chime", "bell", "ding", "pop", "soft", "alert", "none"];

const EVENT_LABELS = {
  task_assigned: "Task assigned",
  project_assigned: "Project assigned",
  issue_assigned: "Issue / Error assigned",
  badge_awarded: "Badge awarded",
  document_verified: "Document verified",
  document_rejected: "Document rejected",
  welcome_employee: "Welcome — new employee",
  welcome_intern: "Welcome — new intern",
  chat_mention: "Chat mention",
};

export default function Settings() {
  const { user } = useAuth();
  const [tab, setTab] = useState("gmail");

  if (!(["admin","super_admin"].includes(user?.role))) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center text-amber-800">
        Settings are admin-only.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.32em] text-[#F97316]">Workspace</div>
          <h1 className="mt-1 text-3xl font-bold text-[#0F2042]">Admin Settings</h1>
          <p className="mt-1 text-sm text-slate-500">
            Connect Gmail, design email templates, and customise how every role receives notifications.
          </p>
        </div>
      </header>

      <div className="flex gap-2 border-b border-slate-200">
        <TabBtn active={tab === "gmail"} onClick={() => setTab("gmail")} icon={Mail} label="Gmail Connection" testid="settings-tab-gmail" />
        <TabBtn active={tab === "templates"} onClick={() => setTab("templates")} icon={Sparkles} label="Email Templates" testid="settings-tab-templates" />
        <TabBtn active={tab === "notifications"} onClick={() => setTab("notifications")} icon={Bell} label="Notifications & Ringtones" testid="settings-tab-notifications" />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
        >
          {tab === "gmail" && <GmailPane />}
          {tab === "templates" && <TemplatesPane />}
          {tab === "notifications" && <NotificationsPane />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function TabBtn({ active, onClick, icon: Icon, label, testid }) {
  return (
    <button
      data-testid={testid}
      onClick={onClick}
      className={`relative -mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition ${
        active ? "border-[#F97316] text-[#0F2042]" : "border-transparent text-slate-500 hover:text-[#0F2042]"
      }`}
    >
      <Icon size={16} />
      {label}
    </button>
  );
}

// ─── Gmail pane ─────────────────────────────────────────────
function GmailPane() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [fromName, setFromName] = useState("");
  const [replyTo, setReplyTo] = useState("");

  const fetchStatus = async () => {
    try {
      const { data } = await api.get("/email/status");
      setStatus(data);
      setFromName(data.from_name || "");
      setReplyTo(data.reply_to || "");
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };
  useEffect(() => {
    fetchStatus();
    const params = new URLSearchParams(window.location.search);
    if (params.get("gmail")) {
      const status = params.get("gmail");
      if (status === "connected") {
        toast.success("Gmail connected!");
      } else {
        const reason = params.get("reason") || "unknown";
        const detail = params.get("detail");
        toast.error(`Gmail connection failed: ${reason}${detail ? " — " + detail.replace(/_/g, " ") : ""}`, { duration: 10000 });
      }
      window.history.replaceState({}, "", "/app/settings");
    }
  }, []);

  const connect = async () => {
    setBusy(true);
    try {
      const { data } = await api.get("/oauth/gmail/login");
      window.location.href = data.auth_url;
    } catch (e) {
      toast.error(formatApiError(e));
      setBusy(false);
    }
  };
  const removeAccount = async (id, email) => {
    if (!window.confirm(`Disconnect ${email}? You can reconnect later.`)) return;
    try {
      await api.delete(`/email/accounts/${encodeURIComponent(id)}`);
      toast.success(`${email} disconnected`);
      await fetchStatus();
    } catch (e) { toast.error(formatApiError(e)); }
  };
  const setAsDefault = async (id, email) => {
    try {
      await api.post(`/email/accounts/${encodeURIComponent(id)}/default`);
      toast.success(`${email} is now the default sender`);
      await fetchStatus();
    } catch (e) { toast.error(formatApiError(e)); }
  };
  const saveProfile = async () => {
    try {
      const { data } = await api.patch("/email/status", { from_name: fromName, reply_to: replyTo });
      setStatus(data);
      toast.success("Saved");
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr,1fr]">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.28em] text-[#F97316]">Connected accounts</div>
            <h2 className="mt-1 text-xl font-bold text-[#0F2042]">Gmail senders</h2>
          </div>
          <button
            data-testid="gmail-connect-btn"
            onClick={connect}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-[#F97316] px-4 py-2 text-sm font-bold text-white shadow hover:bg-orange-600 disabled:opacity-60"
          >
            {busy ? <Loader2 className="animate-spin" size={14} /> : <Mail size={14} />}
            Connect another Gmail
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Connect multiple Gmail accounts (e.g. billing@, hr@, hello@) and pick which one sends each transactional email.
        </p>
        <div className="mt-5 space-y-2">
          {!status ? (
            <div className="text-sm text-slate-400">Loading…</div>
          ) : (status.accounts || []).length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
              No Gmail accounts connected yet — click <b>Connect another Gmail</b> to authorise the first one.
            </div>
          ) : (
            status.accounts.map((a) => (
              <div key={a.id} className={`flex items-center gap-3 rounded-xl border p-3 ${a.default ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200 bg-white"}`}>
                {a.picture ? <img src={a.picture} alt="" className="h-10 w-10 rounded-full" /> :
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0F2042] text-sm font-bold text-white">{a.email?.[0]?.toUpperCase()}</div>}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 truncate text-sm font-semibold text-[#0F2042]">
                    {a.name || a.email}
                    {a.default && <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">DEFAULT</span>}
                  </div>
                  <div className="truncate text-xs text-slate-500">{a.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  {!a.default && (
                    <button data-testid={`set-default-${a.email}`} onClick={() => setAsDefault(a.id, a.email)}
                      className="rounded-md border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:border-[#F97316] hover:text-[#F97316]">
                      Make default
                    </button>
                  )}
                  <button data-testid={`disconnect-${a.email}`} onClick={() => removeAccount(a.id, a.email)}
                    className="rounded-md border border-rose-200 px-3 py-1.5 text-[11px] font-semibold text-rose-500 hover:bg-rose-50">
                    Disconnect
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-xs font-bold uppercase tracking-[0.28em] text-[#F97316]">Default sender</div>
        <h2 className="mt-1 text-xl font-bold text-[#0F2042]">From / Reply-to</h2>
        <p className="mt-1 text-xs text-slate-500">Customises the header of automatic emails sent from the default account.</p>
        <label className="mt-5 block text-xs font-semibold uppercase tracking-wider text-slate-500">From name</label>
        <input
          data-testid="settings-from-name"
          value={fromName}
          onChange={(e) => setFromName(e.target.value)}
          placeholder="Projexino HR"
          className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]"
        />
        <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-slate-500">Reply-to</label>
        <input
          data-testid="settings-reply-to"
          value={replyTo}
          onChange={(e) => setReplyTo(e.target.value)}
          placeholder="hr@projexino.com"
          className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]"
        />
        <button
          data-testid="settings-save-sender"
          onClick={saveProfile}
          disabled={!status?.connected}
          className="mt-5 rounded-lg bg-[#0F2042] px-5 py-2 text-sm font-medium text-white hover:bg-[#1E293B] disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  );
}

// ─── Templates pane ─────────────────────────────────────────────
function TemplatesPane() {
  const [templates, setTemplates] = useState([]);
  const [active, setActive] = useState(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/email/templates");
      setTemplates(data);
      if (!active && data[0]) setActive(data[0]);
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };
  useEffect(() => { load(); }, []);

  const save = async (tpl) => {
    try {
      const { data } = await api.patch(`/email/templates/${tpl.id}`, {
        name: tpl.name, subject: tpl.subject, body_html: tpl.body_html, category: tpl.category, variables_hint: tpl.variables_hint,
      });
      setTemplates((p) => p.map((t) => t.id === data.id ? { ...t, ...data } : t));
      setActive((a) => a && a.id === data.id ? { ...a, ...data } : a);
      toast.success("Template saved");
    } catch (e) { toast.error(formatApiError(e)); }
  };
  const del = async (tpl) => {
    if (tpl.is_default) { toast.error("Default templates can't be deleted (edit instead)."); return; }
    if (!window.confirm(`Delete template "${tpl.name}"?`)) return;
    try {
      await api.delete(`/email/templates/${tpl.id}`);
      setTemplates((p) => p.filter((t) => t.id !== tpl.id));
      if (active?.id === tpl.id) setActive(templates[0] || null);
      toast.success("Deleted");
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="grid gap-4 md:grid-cols-[280px,1fr]">
      <aside className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 p-3">
          <div className="text-xs font-bold uppercase tracking-[0.24em] text-slate-500">Templates</div>
          <div className="flex gap-1">
            <button
              data-testid="ai-template-open-btn"
              onClick={() => setAiOpen(true)}
              title="AI generate"
              className="rounded-md p-1.5 text-[#A855F7] hover:bg-purple-50"
            >
              <Sparkles size={14} />
            </button>
            <button
              data-testid="new-template-btn"
              onClick={() => setNewOpen(true)}
              title="New blank template"
              className="rounded-md p-1.5 text-[#F97316] hover:bg-orange-50"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
        <ul className="max-h-[60vh] overflow-y-auto">
          {templates.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => setActive(t)}
                data-testid={`tpl-row-${t.slug}`}
                className={`flex w-full items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5 text-left text-sm hover:bg-slate-50 ${active?.id === t.id ? "bg-orange-50" : ""}`}
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-[#0F2042]">{t.name}</div>
                  <div className="truncate text-[11px] text-slate-500">{t.category}</div>
                </div>
                {t.is_default && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[9px] font-bold text-slate-600">DEFAULT</span>}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {active ? (
        <TemplateEditor key={active.id} template={active} onSave={save} onDelete={() => del(active)} />
      ) : (
        <div className="flex items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-sm text-slate-500">
          Select a template
        </div>
      )}

      {aiOpen && <AiTemplateModal onClose={() => setAiOpen(false)} onCreated={(t) => { setTemplates((p) => [t, ...p]); setActive(t); setAiOpen(false); }} />}
      {newOpen && <NewTemplateModal onClose={() => setNewOpen(false)} onCreated={(t) => { setTemplates((p) => [t, ...p]); setActive(t); setNewOpen(false); }} />}
    </div>
  );
}

function TemplateEditor({ template, onSave, onDelete }) {
  const [name, setName] = useState(template.name);
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body_html);
  const [category, setCategory] = useState(template.category || "general");
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex-1">
          <input
            data-testid="tpl-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-transparent text-xl font-bold text-[#0F2042] outline-none"
          />
          <input
            data-testid="tpl-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject (supports {{variables}})"
            className="mt-1 w-full bg-transparent text-sm text-slate-500 outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            data-testid="tpl-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-28 rounded-md border border-slate-200 px-2 py-1 text-xs"
          />
          <button
            data-testid="tpl-save-btn"
            onClick={() => onSave({ ...template, name, subject, body_html: body, category })}
            className="rounded-lg bg-[#F97316] px-4 py-2 text-sm font-bold text-white shadow hover:bg-orange-600"
          >Save</button>
          {!template.is_default && (
            <button onClick={onDelete} title="Delete template" className="rounded-lg border border-rose-200 p-2 text-rose-600 hover:bg-rose-50">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <label className="text-xs font-bold uppercase tracking-[0.24em] text-slate-500">HTML body</label>
          <textarea
            data-testid="tpl-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={22}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed outline-none focus:border-[#F97316]"
          />
          <div className="mt-2 text-[11px] text-slate-500">
            Variables: <code className="rounded bg-slate-100 px-1.5 py-0.5">{"{{name}}"}</code>{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5">{"{{task_title}}"}</code> etc.
          </div>
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-[0.24em] text-slate-500">Live preview</label>
          <iframe
            title="preview"
            srcDoc={body}
            className="mt-1 h-[480px] w-full rounded-lg border border-slate-200 bg-white"
          />
        </div>
      </div>
    </div>
  );
}

function NewTemplateModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("<p>Hi {{name}},</p><p>...</p>");
  const [category, setCategory] = useState("general");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name || !subject) { toast.error("Name & subject required"); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/email/templates", { name, subject, body_html: body, category });
      onCreated(data);
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };
  return (
    <Modal onClose={onClose} title="New email template">
      <div className="space-y-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name" className="modal-input" />
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="modal-input" />
        <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category" className="modal-input" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} className="modal-input font-mono text-xs" />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">Cancel</button>
          <button data-testid="new-tpl-save" onClick={save} disabled={busy} className="rounded-lg bg-[#F97316] px-4 py-2 text-sm font-bold text-white">Create</button>
        </div>
      </div>
    </Modal>
  );
}

function AiTemplateModal({ onClose, onCreated }) {
  const [prompt, setPrompt] = useState("");
  const [name, setName] = useState("");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const generate = async (save = false) => {
    if (prompt.trim().length < 8) { toast.error("Give more detail (min 8 chars)"); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/email/templates/ai-generate", { prompt, name, save });
      setPreview(data);
      if (save) { toast.success("Template saved"); onCreated(data); }
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };
  return (
    <Modal onClose={onClose} title="AI-design an email template" wide>
      <div className="space-y-3">
        <textarea
          data-testid="ai-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder='Example: "An invoice-paid receipt with order ID, amount, and a thank-you note"'
          rows={4}
          className="modal-input"
        />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name (optional)" className="modal-input" />
        <div className="flex gap-2">
          <button data-testid="ai-preview" onClick={() => generate(false)} disabled={busy} className="rounded-lg border border-[#A855F7] px-4 py-2 text-sm font-semibold text-[#A855F7] hover:bg-purple-50">
            {busy ? <Loader2 className="animate-spin inline" size={14} /> : <Sparkles size={14} className="inline" />} Preview
          </button>
          <button data-testid="ai-save" onClick={() => generate(true)} disabled={busy || !prompt} className="rounded-lg bg-[#A855F7] px-4 py-2 text-sm font-bold text-white hover:bg-purple-600">
            Generate & Save
          </button>
        </div>
        {preview && (
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">Subject</div>
            <div className="mb-2 text-sm font-semibold text-[#0F2042]">{preview.subject}</div>
            <iframe title="ai-preview" srcDoc={preview.body_html} className="h-72 w-full rounded-lg border border-slate-200 bg-white" />
          </div>
        )}
      </div>
    </Modal>
  );
}

function Modal({ onClose, title, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className={`w-full ${wide ? "max-w-3xl" : "max-w-lg"} rounded-2xl bg-white p-5 shadow-2xl`}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold text-[#0F2042]">{title}</h3>
          <button onClick={onClose}><XIcon size={18} /></button>
        </div>
        <style>{`.modal-input{width:100%;border:1px solid #E2E8F0;background:#F8FAFC;border-radius:10px;padding:8px 12px;font-size:14px;outline:none}.modal-input:focus{border-color:#F97316;box-shadow:0 0 0 1px #F97316}`}</style>
        {children}
      </div>
    </div>
  );
}

// ─── Notifications pane ─────────────────────────────────────────────
function NotificationsPane() {
  const [s, setS] = useState(null);
  const update = async (patch) => {
    try {
      const { data } = await api.patch("/notification-settings", patch);
      setS(data);
      toast.success("Saved");
    } catch (e) { toast.error(formatApiError(e)); }
  };
  useEffect(() => {
    api.get("/notification-settings").then(({ data }) => setS(data)).catch(() => {});
  }, []);
  if (!s) return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading…</div>;

  return (
    <div className="space-y-5">
      <PushNotificationsCard />
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-bold text-[#0F2042]">Global preferences</h2>
        <p className="text-xs text-slate-500">These apply to every role in the workspace.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <ToggleRow label="Sound enabled" value={s.sound_enabled} onChange={(v) => update({ sound_enabled: v })} testid="setting-sound" />
          <ToggleRow label="Desktop popup" value={s.desktop_popup} onChange={(v) => update({ desktop_popup: v })} testid="setting-popup" />
          <div>
            <label className="text-xs font-bold uppercase tracking-[0.24em] text-slate-500">Volume {Math.round((s.volume ?? 0.6) * 100)}%</label>
            <input
              type="range" min={0} max={1} step={0.05}
              data-testid="setting-volume"
              defaultValue={s.volume ?? 0.6}
              onChange={(e) => setS({ ...s, volume: parseFloat(e.target.value) })}
              onMouseUp={(e) => update({ volume: parseFloat(e.target.value) })}
              onTouchEnd={(e) => update({ volume: parseFloat(e.target.value) })}
              className="mt-2 w-full accent-[#F97316]"
            />
          </div>
        </div>
        <div className="mt-5">
          <label className="text-xs font-bold uppercase tracking-[0.24em] text-slate-500">Default ringtone</label>
          <div className="mt-2 flex items-center gap-2">
            <select
              data-testid="setting-default-ringtone"
              value={s.default_ringtone}
              onChange={(e) => update({ default_ringtone: e.target.value })}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
            >
              {RINGTONE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <button
              onClick={() => playRingtone(s.default_ringtone, s.volume ?? 0.6)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs hover:border-[#F97316] hover:text-[#F97316]"
            >
              <PlayCircle size={14} /> Test
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-bold text-[#0F2042]">Per-event preferences</h2>
        <p className="text-xs text-slate-500">Decide which events fire in-app sounds and which fire emails.</p>
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left">Event</th>
                <th className="px-4 py-2 text-center">In-app</th>
                <th className="px-4 py-2 text-center">Email</th>
                <th className="px-4 py-2 text-left">Ringtone</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(EVENT_LABELS).map((ev) => {
                const e = (s.events || {})[ev] || { in_app: true, email: true };
                const tone = (s.ringtones || {})[ev] || s.default_ringtone;
                return (
                  <tr key={ev} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium text-[#0F2042]">{EVENT_LABELS[ev]}</td>
                    <td className="px-4 py-2 text-center">
                      <Toggle value={e.in_app} onChange={(v) => update({ events: { [ev]: { in_app: v } } })} testid={`ev-${ev}-inapp`} />
                    </td>
                    <td className="px-4 py-2 text-center">
                      <Toggle value={e.email} onChange={(v) => update({ events: { [ev]: { email: v } } })} testid={`ev-${ev}-email`} />
                    </td>
                    <td className="px-4 py-2">
                      <select
                        data-testid={`ev-${ev}-ringtone`}
                        value={tone}
                        onChange={(v) => update({ ringtones: { [ev]: v.target.value } })}
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                      >
                        {RINGTONE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => playRingtone(tone, s.volume ?? 0.6)}
                        className="rounded-md p-1.5 text-slate-500 hover:text-[#F97316]"
                        title="Preview ringtone"
                      >
                        <Volume2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({ label, value, onChange, testid }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3">
      <span className="text-sm font-medium text-[#0F2042]">{label}</span>
      <Toggle value={value} onChange={onChange} testid={testid} />
    </div>
  );
}

function Toggle({ value, onChange, testid }) {
  return (
    <button
      data-testid={testid}
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${value ? "bg-[#F97316]" : "bg-slate-300"}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${value ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}


// ─── Push notifications opt-in card ─────────────────────────────────
function PushNotificationsCard() {
  const [permission, setPermission] = useState("default");
  const [status, setStatus] = useState({ configured: false, my_tokens: 0 });
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  const refresh = async () => {
    setPermission(fcmPermissionState());
    try {
      const { data } = await api.get("/fcm/status");
      setStatus(data);
    } catch {}
  };

  useEffect(() => { refresh(); }, []);

  const enable = async () => {
    setBusy(true);
    await requestAndRegisterToken();
    setBusy(false);
    refresh();
  };

  const disable = async () => {
    setBusy(true);
    await unregisterToken();
    toast.success("Push notifications disabled on this device");
    setBusy(false);
    refresh();
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      const { data } = await api.post("/fcm/test");
      toast.success(data.sent > 0 ? `Test sent to ${data.sent} device(s)` : "No active devices — enable push first");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Test failed");
    } finally { setTesting(false); }
  };

  const enabled = permission === "granted" && status.my_tokens > 0;
  const unsupported = permission === "unsupported";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6" data-testid="settings-push-card">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#F97316] to-[#A855F7] text-white">
          <Smartphone size={22} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-[#0F2042]">Push notifications</h2>
          <p className="mt-1 text-xs text-slate-500">
            Get a tap-to-open alert on this device whenever you receive a Projexino notification — even when the app isn't open.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px]">
            <Pill ok={!unsupported} label={unsupported ? "Browser unsupported" : "Browser supports push"} />
            <Pill ok={permission === "granted"} label={permission === "granted" ? "Permission granted" : permission === "denied" ? "Permission blocked" : "Permission pending"} />
            <Pill ok={enabled} label={enabled ? `Active on ${status.my_tokens} device(s)` : "Not enabled here"} />
            <Pill ok={status.configured} label={status.configured ? "Server ready to send" : "Backend not yet configured"} />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {!enabled && !unsupported && (
              <button
                data-testid="push-enable"
                onClick={enable}
                disabled={busy || permission === "denied"}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#F97316] to-[#A855F7] px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-orange-200 disabled:opacity-50"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <BellRing size={14} />}
                Enable on this device
              </button>
            )}
            {enabled && (
              <>
                <button
                  data-testid="push-test"
                  onClick={sendTest}
                  disabled={testing || !status.configured}
                  className="inline-flex items-center gap-2 rounded-full bg-[#0F2042] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                >
                  {testing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Send test push
                </button>
                <button
                  data-testid="push-disable"
                  onClick={disable}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:border-rose-300 hover:text-rose-600 disabled:opacity-50"
                >
                  <BellOff size={14} /> Disable here
                </button>
              </>
            )}
          </div>

          {permission === "denied" && (
            <p className="mt-3 text-[11px] text-rose-500">
              Notifications are blocked in your browser settings. Open the site settings → Notifications → Allow, then reload.
            </p>
          )}
          {!status.configured && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-700">
              <b>Heads-up:</b> the backend Firebase service-account JSON isn't installed yet, so pushes won't actually be sent to your device until that's configured. Token registration will still work — pushes will begin flowing automatically once the key is added.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Pill({ ok, label }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold ${
      ok ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
    }`}>
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-500" : "bg-slate-400"}`} />
      {label}
    </span>
  );
}
