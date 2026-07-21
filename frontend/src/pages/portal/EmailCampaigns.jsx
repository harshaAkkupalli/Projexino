import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Megaphone, Plus, Send, Trash2, Sparkles, Loader2, Clock, X, ChevronRight,
  Users, Mail, Calendar, Check, AlertCircle, FileText, RefreshCw,
} from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

const STATUS_META = {
  draft:     { color: "#94a3b8", label: "Draft" },
  scheduled: { color: "#0EA5E9", label: "Scheduled" },
  sending:   { color: "#F97316", label: "Sending" },
  sent:      { color: "#22c55e", label: "Sent" },
  partial:   { color: "#f59e0b", label: "Partial" },
  failed:    { color: "#ef4444", label: "Failed" },
};

function StatusPill({ status }) {
  const meta = STATUS_META[status] || { color: "#94a3b8", label: status };
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em]"
      style={{ backgroundColor: `${meta.color}22`, color: meta.color }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
      {meta.label}
    </span>
  );
}

export default function EmailCampaigns() {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const { data } = await api.get("/email/campaigns");
      setCampaigns(data || []);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, []);

  if (user && !["admin","super_admin","manager","hr"].includes(user.role)) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center text-amber-800">
        Mass Email is restricted to Admin / Manager / HR.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.32em] text-[#F97316]">Outbound</div>
          <h1 className="mt-1 flex items-center gap-3 text-3xl font-bold text-[#0F2042]">
            <Megaphone className="text-[#F97316]" /> Mass Email Campaigns
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Broadcast updates, product news and reminders to clients and employees through your connected Gmail accounts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            data-testid="campaign-refresh"
            onClick={refresh}
            className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-[#0F2042] hover:border-[#F97316]"
          >
            <RefreshCw size={14} />
          </button>
          <button
            data-testid="campaign-new"
            onClick={() => setComposerOpen(true)}
            className="flex items-center gap-2 rounded-full bg-gradient-to-r from-[#F97316] to-[#A855F7] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-orange-200 hover:shadow-orange-300"
          >
            <Plus size={16} /> New Campaign
          </button>
        </div>
      </header>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-12 border-b border-slate-100 bg-slate-50 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
          <div className="col-span-4">Campaign</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-2">Recipients</div>
          <div className="col-span-2">Delivered</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>
        {loading ? (
          <div className="p-12 text-center text-sm text-slate-400">Loading…</div>
        ) : campaigns.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-400">
            No campaigns yet. Click <b>New Campaign</b> to send your first broadcast.
          </div>
        ) : campaigns.map((c) => (
          <button
            key={c.id}
            data-testid={`campaign-row-${c.id}`}
            onClick={() => setDetail(c)}
            className="grid w-full grid-cols-12 items-center border-b border-slate-50 px-4 py-3 text-left text-sm hover:bg-orange-50/40"
          >
            <div className="col-span-4 min-w-0">
              <div className="truncate font-semibold text-[#0F172A]">{c.name}</div>
              <div className="truncate text-[11px] text-slate-500">{c.subject}</div>
              <div className="text-[10px] text-slate-400">
                {c.scheduled_at ? <><Calendar size={10} className="inline" /> {new Date(c.scheduled_at).toLocaleString()}</> : new Date(c.created_at).toLocaleString()}
              </div>
            </div>
            <div className="col-span-2"><StatusPill status={c.status} /></div>
            <div className="col-span-2 text-slate-700">
              <Users size={12} className="mr-1 inline text-slate-400" />{c.total_recipients}
            </div>
            <div className="col-span-2 text-slate-700">
              <span className="text-emerald-600 font-semibold">{c.delivered}</span>
              {c.failed > 0 && <span className="ml-2 text-rose-600">· {c.failed} failed</span>}
            </div>
            <div className="col-span-2 flex justify-end text-slate-400">
              <ChevronRight size={16} />
            </div>
          </button>
        ))}
      </div>

      <AnimatePresence>
        {composerOpen && (
          <Composer
            onClose={() => setComposerOpen(false)}
            onCreated={(c) => { setComposerOpen(false); refresh(); toast.success(c.status === "sending" ? "Campaign queued" : c.status === "scheduled" ? "Campaign scheduled" : "Draft saved"); }}
          />
        )}
        {detail && (
          <DetailModal id={detail.id} onClose={() => setDetail(null)} onChange={refresh} />
        )}
      </AnimatePresence>
    </div>
  );
}

function Composer({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [emails, setEmails] = useState(""); // CSV
  const [includeAllEmployees, setIncludeAllEmployees] = useState(false);
  const [employeeIds, setEmployeeIds] = useState([]);
  const [includeAllClients, setIncludeAllClients] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [sendNow, setSendNow] = useState(true);

  const [accounts, setAccounts] = useState([]);
  const [fromTokenId, setFromTokenId] = useState("");
  const [fromName, setFromName] = useState("");
  const [replyTo, setReplyTo] = useState("");

  const [employees, setEmployees] = useState([]);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiTone, setAiTone] = useState("professional");
  const [aiAudience, setAiAudience] = useState("clients");
  const [aiBusy, setAiBusy] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/email/accounts");
        setAccounts(data || []);
        const def = (data || []).find((a) => a.default) || (data || [])[0];
        if (def) {
          setFromTokenId(def.id);
          setFromName(def.from_name || "");
          setReplyTo(def.reply_to || def.email || "");
        }
      } catch {}
      try {
        const { data } = await api.get("/members/directory");
        setEmployees(data || []);
      } catch {}
    })();
  }, []);

  const toggleEmployee = (id) =>
    setEmployeeIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const aiDraft = async () => {
    if (!aiPrompt.trim()) return toast.error("Add an AI prompt first");
    setAiBusy(true);
    try {
      const { data } = await api.post("/email/campaigns/ai-draft", {
        prompt: aiPrompt, tone: aiTone, audience: aiAudience,
      });
      setSubject(data.subject || "");
      setBody(data.body_html || "");
      toast.success("AI draft ready — review & edit before sending");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "AI draft failed");
    } finally {
      setAiBusy(false);
    }
  };

  const submit = async () => {
    if (!name.trim()) return toast.error("Name your campaign");
    if (!subject.trim() || !body.trim()) return toast.error("Subject and body are required");
    const emailsArr = (emails || "")
      .split(/[\n,;]+/).map((s) => s.trim()).filter((e) => /@/.test(e));
    const payload = {
      name, subject, body_html: body,
      from_token_id: fromTokenId, from_name: fromName, reply_to: replyTo,
      emails: emailsArr, employee_ids: employeeIds,
      include_all_employees: includeAllEmployees, include_all_clients: includeAllClients,
      scheduled_at: scheduledAt || null,
      send_now: !scheduledAt && sendNow,
    };
    setBusy(true);
    try {
      const { data } = await api.post("/email/campaigns", payload);
      onCreated(data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to create campaign");
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
        className="grid max-h-[90vh] w-full max-w-5xl grid-cols-1 overflow-hidden rounded-2xl bg-white shadow-2xl md:grid-cols-[1.2fr_1fr]">
        {/* LEFT: Composer */}
        <div className="overflow-y-auto p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-bold text-[#0F2042]">New Email Campaign</h3>
            <button data-testid="composer-close" onClick={onClose} className="text-slate-400 hover:text-[#0F2042]"><X size={18} /></button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Internal name</label>
              <input data-testid="composer-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#F97316] focus:outline-none" placeholder="May product newsletter" />
            </div>

            <div className="rounded-xl border border-dashed border-purple-200 bg-purple-50/40 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[#A855F7]">
                <Sparkles size={14} /> AI Compose
              </div>
              <textarea data-testid="composer-ai-prompt" rows={2} value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="Describe the email you want to send…" className="w-full rounded-lg border border-purple-200 bg-white p-2 text-sm focus:outline-none" />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select value={aiAudience} onChange={(e) => setAiAudience(e.target.value)} className="rounded-lg border border-purple-200 bg-white px-2 py-1 text-xs">
                  <option value="clients">Clients</option>
                  <option value="employees">Employees</option>
                  <option value="mixed">Mixed</option>
                </select>
                <select value={aiTone} onChange={(e) => setAiTone(e.target.value)} className="rounded-lg border border-purple-200 bg-white px-2 py-1 text-xs">
                  <option value="professional">Professional</option>
                  <option value="friendly">Friendly</option>
                  <option value="enthusiastic">Enthusiastic</option>
                  <option value="formal">Formal</option>
                </select>
                <button data-testid="composer-ai-generate" onClick={aiDraft} disabled={aiBusy} className="ml-auto flex items-center gap-1 rounded-lg bg-[#A855F7] px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700 disabled:opacity-50">
                  {aiBusy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  {aiBusy ? "Generating…" : "Generate"}
                </button>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Subject</label>
              <input data-testid="composer-subject" value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#F97316] focus:outline-none" />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Body (HTML)</label>
                <InsertBookingLink onInsert={(html) => setBody((b) => (b || "") + html)} />
              </div>
              <textarea data-testid="composer-body" rows={10} value={body} onChange={(e) => setBody(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs focus:border-[#F97316] focus:outline-none" placeholder="<p>Hi,</p>..." />
            </div>
          </div>
        </div>

        {/* RIGHT: Recipients + delivery */}
        <div className="overflow-y-auto border-l border-slate-100 bg-slate-50/40 p-6">
          <h4 className="mb-3 text-sm font-bold text-[#0F2042]">From</h4>
          <select data-testid="composer-from" value={fromTokenId} onChange={(e) => setFromTokenId(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            <option value="">— No Gmail connected —</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.email}{a.default ? " (default)" : ""}</option>
            ))}
          </select>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input data-testid="composer-from-name" value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="From name" className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs" />
            <input data-testid="composer-reply-to" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="Reply-to" className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs" />
          </div>

          <h4 className="mb-2 mt-5 text-sm font-bold text-[#0F2042]">Recipients</h4>
          <label className="flex items-center gap-2 rounded-lg bg-white p-2 text-xs">
            <input data-testid="composer-all-clients" type="checkbox" checked={includeAllClients} onChange={(e) => setIncludeAllClients(e.target.checked)} />
            <Mail size={12} /> All client emails (from Finance projects)
          </label>
          <label className="mt-2 flex items-center gap-2 rounded-lg bg-white p-2 text-xs">
            <input data-testid="composer-all-employees" type="checkbox" checked={includeAllEmployees} onChange={(e) => setIncludeAllEmployees(e.target.checked)} />
            <Users size={12} /> All employees
          </label>

          <div className="mt-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Manual emails (comma / newline separated)</div>
            <textarea data-testid="composer-manual-emails" rows={3} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="alice@x.com, bob@y.com" className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs focus:border-[#F97316] focus:outline-none" />
          </div>

          {employees.length > 0 && !includeAllEmployees && (
            <div className="mt-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Pick employees ({employeeIds.length} selected)</div>
              <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                {employees.map((m) => (
                  <label key={m.id} className="flex cursor-pointer items-center gap-2 border-b border-slate-50 px-2 py-1.5 text-xs hover:bg-orange-50">
                    <input type="checkbox" checked={employeeIds.includes(m.id)} onChange={() => toggleEmployee(m.id)} />
                    <span className="font-medium text-[#0F172A]">{m.name}</span>
                    <span className="ml-auto text-slate-400">{m.email}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <h4 className="mb-2 mt-5 text-sm font-bold text-[#0F2042]">Delivery</h4>
          <div className="space-y-2 rounded-lg bg-white p-3">
            <label className="flex items-center gap-2 text-xs">
              <input data-testid="composer-send-now" type="radio" checked={!scheduledAt} onChange={() => setScheduledAt("")} />
              <Send size={12} /> Send immediately
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input data-testid="composer-schedule" type="radio" checked={!!scheduledAt} onChange={() => setScheduledAt(new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16))} />
              <Clock size={12} /> Schedule for later
            </label>
            {scheduledAt && (
              <input data-testid="composer-schedule-input" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
            )}
          </div>

          <div className="mt-5 flex gap-2">
            <button data-testid="composer-save-draft" onClick={() => { setSendNow(false); setScheduledAt(""); submit(); }} disabled={busy}
              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-[#0F2042] disabled:opacity-50">
              <FileText size={12} className="mr-1 inline" /> Save Draft
            </button>
            <button data-testid="composer-submit" onClick={submit} disabled={busy}
              className="flex-[1.4] rounded-lg bg-gradient-to-r from-[#F97316] to-[#A855F7] px-3 py-2 text-xs font-semibold text-white shadow-md hover:shadow-lg disabled:opacity-50">
              {busy ? <Loader2 size={12} className="mr-1 inline animate-spin" /> : <Send size={12} className="mr-1 inline" />}
              {scheduledAt ? "Schedule" : "Send Now"}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function DetailModal({ id, onClose, onChange }) {
  const [c, setC] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const { data } = await api.get(`/email/campaigns/${id}`);
        if (mounted) setC(data);
      } catch {}
    };
    load();
    const id2 = setInterval(load, 6000);
    return () => { mounted = false; clearInterval(id2); };
  }, [id]);

  const send = async () => {
    setBusy(true);
    try {
      await api.post(`/email/campaigns/${id}/send`);
      toast.success("Sending queued");
      onChange();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Delete this campaign?")) return;
    setBusy(true);
    try {
      await api.delete(`/email/campaigns/${id}`);
      onChange();
      onClose();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    } finally {
      setBusy(false);
    }
  };

  if (!c) return null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        className="grid max-h-[90vh] w-full max-w-4xl grid-cols-1 overflow-hidden rounded-2xl bg-white shadow-2xl md:grid-cols-[1.4fr_1fr]">
        <div className="overflow-y-auto p-6">
          <div className="mb-3 flex items-start justify-between">
            <div>
              <h3 className="text-lg font-bold text-[#0F2042]">{c.name}</h3>
              <div className="text-xs text-slate-500">{c.subject}</div>
            </div>
            <button data-testid="detail-close" onClick={onClose} className="text-slate-400 hover:text-[#0F2042]"><X size={18} /></button>
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            <StatusPill status={c.status} />
            <span>· Created {new Date(c.created_at).toLocaleString()}</span>
            {c.scheduled_at && <span>· Scheduled {new Date(c.scheduled_at).toLocaleString()}</span>}
            {c.sent_at && <span>· Sent {new Date(c.sent_at).toLocaleString()}</span>}
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Preview</div>
            <iframe data-testid="detail-preview" title="preview" srcDoc={c.body_html} className="mt-2 h-[420px] w-full rounded-lg border border-slate-200 bg-white" />
          </div>
        </div>
        <div className="overflow-y-auto border-l border-slate-100 bg-slate-50/40 p-6">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-white p-2"><div className="text-[10px] uppercase text-slate-500">Recipients</div><div className="mt-1 text-xl font-bold text-[#0F2042]">{c.total_recipients}</div></div>
            <div className="rounded-lg bg-white p-2"><div className="text-[10px] uppercase text-slate-500">Delivered</div><div className="mt-1 text-xl font-bold text-emerald-600">{c.delivered}</div></div>
            <div className="rounded-lg bg-white p-2"><div className="text-[10px] uppercase text-slate-500">Failed</div><div className="mt-1 text-xl font-bold text-rose-600">{c.failed}</div></div>
          </div>
          <div className="mt-4 flex gap-2">
            {(c.status === "draft" || c.status === "failed") && (
              <button data-testid="detail-send" onClick={send} disabled={busy}
                className="flex-1 rounded-lg bg-gradient-to-r from-[#F97316] to-[#A855F7] px-3 py-2 text-xs font-semibold text-white hover:shadow-md disabled:opacity-50">
                <Send size={12} className="mr-1 inline" /> Send Now
              </button>
            )}
            <button data-testid="detail-delete" onClick={remove} disabled={busy}
              className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50">
              <Trash2 size={12} />
            </button>
          </div>

          <h4 className="mb-2 mt-5 text-sm font-bold text-[#0F2042]">Deliveries</h4>
          {(c.deliveries || []).length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-4 text-center text-xs text-slate-400">
              Not sent yet.
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white">
              {(c.deliveries || []).map((d, i) => (
                <div key={i} className="flex items-center gap-2 border-b border-slate-50 px-2 py-1.5 text-[11px]">
                  {d.ok ? <Check size={12} className="text-emerald-600" /> : <AlertCircle size={12} className="text-rose-600" />}
                  <span className="truncate font-medium text-[#0F172A]">{d.email}</span>
                  {d.error && <span className="ml-auto truncate text-rose-500" title={d.error}>{d.error.slice(0, 40)}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function InsertBookingLink({ onInsert }) {
  const [pages, setPages] = useState([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    api.get("/booking/pages").then(({ data }) => setPages(data || [])).catch(() => {});
  }, []);
  if (pages.length === 0) return null;
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)}
        data-testid="composer-insert-booking"
        className="rounded-full bg-cyan-100 px-3 py-1 text-[10px] font-bold text-cyan-700 hover:bg-cyan-200">
        📅 Insert booking link
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 max-h-60 w-72 overflow-auto rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          {pages.map((p) => {
            const url = `${window.location.origin}/book/${p.slug}`;
            const html = `\n<p style="text-align:center;margin:18px 0;"><a href="${url}" style="background:linear-gradient(135deg,${p.color || "#F97316"},#EA580C);color:white;padding:12px 24px;border-radius:9999px;text-decoration:none;font-weight:800;display:inline-block;">📅 Book a meeting →</a></p>\n`;
            return (
              <button key={p.slug} type="button"
                onClick={() => { onInsert(html); setOpen(false); toast.success("Booking link inserted"); }}
                data-testid={`composer-insert-booking-${p.slug}`}
                className="block w-full rounded-lg px-2 py-1.5 text-left text-xs hover:bg-cyan-50">
                <div className="font-bold text-[#0F2042]">{p.title}</div>
                <div className="truncate text-[10px] text-slate-500">{url}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

