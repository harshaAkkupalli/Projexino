/** OutreachBlast.jsx — Email-blast composer (template + playbooks + blogs) and per-campaign analytics modal. */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  X, Loader2, Send, BookOpen, Newspaper, FileText, RefreshCw, MailOpen,
  MousePointerClick, Reply, AlertTriangle, Paperclip, PlayCircle,
} from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";

export function EmailBlastModal({ leadIds, onClose, onSent }) {
  const [templates, setTemplates] = useState([]);
  const [playbooks, setPlaybooks] = useState([]);
  const [blogs, setBlogs] = useState([]);
  const [templateId, setTemplateId] = useState("");
  const [pbSel, setPbSel] = useState(new Set());
  const [blogSel, setBlogSel] = useState(new Set());
  const [batchSize, setBatchSize] = useState(300);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/email/templates").then(({ data }) => setTemplates(data || [])).catch(() => {});
    api.get("/playbooks").then(({ data }) => setPlaybooks(data || [])).catch(() => {});
    api.get("/blog/posts", { params: { limit: 50 } }).then(({ data }) => setBlogs(data.items || [])).catch(() => {});
  }, []);

  const toggle = (setter) => (key) => setter((prev) => {
    const n = new Set(prev);
    n.has(key) ? n.delete(key) : n.add(key);
    return n;
  });
  const togglePb = toggle(setPbSel);
  const toggleBlog = toggle(setBlogSel);

  const send = async () => {
    if (!templateId) { toast.error("Pick an email template first"); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/outreach/leads/email-blast", {
        lead_ids: leadIds,
        template_id: templateId,
        playbook_slugs: [...pbSel],
        blog_ids: [...blogSel],
        batch_size: Math.min(300, Math.max(1, Number(batchSize) || 300)),
      });
      toast.success(`Blast queued to ${data.queued ?? leadIds.length} lead(s)`, {
        description: data.note || "Sending in the background via your connected Gmail.",
      });
      onSent && onSent(data);
      onClose();
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };

  const tpl = templates.find((t) => t.id === templateId);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onClick={onClose} data-testid="email-blast-modal">
      <motion.div initial={{ scale: 0.97, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between bg-[#0F2042] px-5 py-4 text-white">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/70">// bulk outreach</div>
            <div className="font-display text-lg font-bold">Email blast · {leadIds.length} lead(s)</div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10"><X size={18} /></button>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400"><FileText size={11} /> Email template *</div>
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} data-testid="blast-template"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#F97316]">
              <option value="">— pick a template —</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {tpl?.subject && <div className="mt-1 truncate text-[11px] text-slate-500">Subject: {tpl.subject}</div>}
          </div>

          <div>
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400"><BookOpen size={11} /> Attach playbooks (PDF)</div>
            {playbooks.length === 0 ? <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-400">No playbooks yet — create some in the Playbooks page.</div> : (
              <div className="grid max-h-36 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
                {playbooks.map((p) => (
                  <label key={p.slug} data-testid={`blast-pb-${p.slug}`}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-xs transition ${pbSel.has(p.slug) ? "border-[#F97316] bg-orange-50" : "border-slate-200 hover:border-slate-300"}`}>
                    <input type="checkbox" checked={pbSel.has(p.slug)} onChange={() => togglePb(p.slug)} />
                    <span className="truncate font-bold text-[#0F2042]">{p.title}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400"><Newspaper size={11} /> Link blog posts (added as "Recommended reading")</div>
            {blogs.length === 0 ? <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-400">No published blogs found.</div> : (
              <div className="grid max-h-36 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
                {blogs.map((b) => (
                  <label key={b.id} data-testid={`blast-blog-${b.slug}`}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-xs transition ${blogSel.has(b.id) ? "border-violet-500 bg-violet-50" : "border-slate-200 hover:border-slate-300"}`}>
                    <input type="checkbox" checked={blogSel.has(b.id)} onChange={() => toggleBlog(b.id)} />
                    <span className="truncate font-bold text-[#0F2042]">{b.title}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Batch size (max 300)</div>
              <input type="number" min={1} max={300} value={batchSize} onChange={(e) => setBatchSize(e.target.value)}
                data-testid="blast-batch-size"
                className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
            </div>
            <p className="flex-1 text-[11px] leading-relaxed text-slate-400">
              Sends throttled (~1 email/sec) via your connected Gmail with a plain-text alternative and List-Unsubscribe header for inbox deliverability. Daily cap: 2,000.
            </p>
          </div>
        </div>
        <footer className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
          <div className="text-[11px] text-slate-500">
            <Paperclip size={11} className="mr-1 inline" />{pbSel.size} playbook(s) · {blogSel.size} blog link(s)
          </div>
          <button onClick={send} disabled={busy || !templateId} data-testid="blast-send"
            className="inline-flex items-center gap-1.5 rounded-full bg-[#F97316] px-5 py-2 text-sm font-bold text-white shadow hover:bg-orange-600 disabled:opacity-50">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Send blast
          </button>
        </footer>
      </motion.div>
    </div>
  );
}

const KIND_META = {
  sent: { label: "Sent", icon: Send, cls: "text-emerald-600 bg-emerald-50" },
  opened: { label: "Opened", icon: MailOpen, cls: "text-violet-600 bg-violet-50" },
  clicked: { label: "Clicked", icon: MousePointerClick, cls: "text-sky-600 bg-sky-50" },
  replied: { label: "Replied", icon: Reply, cls: "text-orange-600 bg-orange-50" },
};

export function CampaignAnalyticsModal({ campaign, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState("");

  const load = async () => {
    try { const { data: d } = await api.get(`/outreach/campaigns/${campaign.id}/analytics`); setData(d); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [campaign.id]);

  const act = async (key, path, okMsg) => {
    setBusy(key);
    try {
      const { data: r } = await api.post(`/outreach/campaigns/${campaign.id}/${path}`);
      toast.success(okMsg(r));
      await load();
      onChanged && onChanged();
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy("");
  };

  const s = data?.stats || {};
  const u = data?.unique || {};
  const r = data?.rates || {};
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onClick={onClose} data-testid="campaign-analytics-modal">
      <motion.div initial={{ scale: 0.97, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between bg-[#0F2042] px-5 py-4 text-white">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/70">// campaign analytics</div>
            <div className="truncate font-display text-lg font-bold">{campaign.name}</div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10"><X size={18} /></button>
        </header>
        {!data ? (
          <div className="flex justify-center p-12"><Loader2 size={24} className="animate-spin text-slate-300" /></div>
        ) : (
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" data-testid="analytics-stats">
              {[
                ["Audience", s.to || 0, ""],
                ["Sent", s.sent || 0, ""],
                ["Opened", u.opened || s.opened || 0, `${r.open_rate || 0}%`],
                ["Clicked", u.clicked || s.clicked || 0, `${r.click_rate || 0}%`],
                ["Replied", u.replied || s.replied || 0, `${r.reply_rate || 0}%`],
                ["Bounced", s.bounced ?? s.failed ?? 0, ""],
              ].map(([l, n, rate]) => (
                <div key={l} className="rounded-xl bg-slate-50 p-2.5 text-center">
                  <div className="font-display text-lg font-bold text-[#0F2042]">{n}</div>
                  <div className="text-[9px] uppercase tracking-wider text-slate-500">{l}{rate ? ` · ${rate}` : ""}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${data.campaign.status === "completed" ? "bg-emerald-100 text-emerald-700" : data.campaign.status === "active" ? "bg-sky-100 text-sky-700" : "bg-amber-100 text-amber-700"}`}>
                {data.campaign.status}{data.pending ? ` · ${data.pending} pending` : ""}
              </span>
              {data.pending > 0 && (
                <button onClick={() => act("batch", "send-batch", (x) => `Next batch queued (${x.queued} pending)`)}
                  disabled={busy === "batch"} data-testid="analytics-send-batch"
                  className="inline-flex items-center gap-1 rounded-full bg-[#F97316] px-3 py-1 text-[11px] font-bold text-white disabled:opacity-50">
                  {busy === "batch" ? <Loader2 size={11} className="animate-spin" /> : <PlayCircle size={11} />} Send next batch
                </button>
              )}
              <button onClick={() => act("sync", "sync-replies", (x) => `${x.new_replies} new repl${x.new_replies === 1 ? "y" : "ies"} found (total ${x.total_replied})`)}
                disabled={busy === "sync"} data-testid="analytics-sync-replies"
                className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 text-[11px] font-bold text-slate-600 hover:border-[#F97316] disabled:opacity-50">
                {busy === "sync" ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} Sync replies from Gmail
              </button>
              <button onClick={load} className="ml-auto rounded-full border border-slate-200 p-1.5 text-slate-400 hover:text-[#0F2042]" title="Refresh"><RefreshCw size={12} /></button>
            </div>

            {(data.failures || []).length > 0 && (
              <div className="rounded-xl border border-rose-100 bg-rose-50/60 p-3" data-testid="analytics-failures">
                <div className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase text-rose-600"><AlertTriangle size={11} /> Bounces / failures ({data.failures.length})</div>
                <div className="max-h-28 space-y-1 overflow-y-auto">
                  {data.failures.map((f, i) => (
                    <div key={i} className="text-[11px] text-rose-700"><b>{f.email}</b> — {f.error}</div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">Event feed</div>
              {(data.events || []).length === 0 ? (
                <div className="rounded-xl bg-slate-50 p-6 text-center text-xs text-slate-400">No events yet — launch the campaign first.</div>
              ) : (
                <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-100" data-testid="analytics-events">
                  {data.events.map((e, i) => {
                    const m = KIND_META[e.kind] || { label: e.kind, icon: Send, cls: "text-slate-500 bg-slate-50" };
                    return (
                      <div key={i} className="flex items-center gap-2 border-b border-slate-50 px-3 py-1.5 text-xs">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${m.cls}`}><m.icon size={9} />{m.label}</span>
                        <span className="truncate font-bold text-[#0F2042]">{e.lead_name || e.lead_email}</span>
                        <span className="hidden truncate text-slate-400 sm:inline">{e.company}</span>
                        <span className="ml-auto shrink-0 text-[10px] text-slate-400">{(e.at || "").slice(0, 16).replace("T", " ")}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
