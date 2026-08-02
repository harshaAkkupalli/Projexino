/** WhatsAppOutreach — click-to-chat WhatsApp tab for Lead Management (Option A).
 *  Pick a lead list → see mobile numbers → pick a template → wa.me opens WhatsApp
 *  with the personalised message from the user's own logged-in number. */
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle, Loader2, Plus, Trash2, PencilLine, X, Check, Send, Phone,
  ChevronRight, Sparkles, Rocket,
} from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";

const VARS = ["{{FirstName}}", "{{CompanyName}}", "{{Industry}}", "{{Country}}"];

const normalizePhone = (raw) => {
  let d = (raw || "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("0")) d = "91" + d.slice(1);
  if (d.length === 10) d = "91" + d;
  return d;
};

const personalize = (body, lead) =>
  (body || "")
    .replaceAll("{{FirstName}}", (lead?.name || "there").split(" ")[0])
    .replaceAll("{{CompanyName}}", lead?.company || "your company")
    .replaceAll("{{Industry}}", lead?.industry || "your industry")
    .replaceAll("{{Country}}", lead?.country || "your region");

export function WhatsAppTab() {
  const [lists, setLists] = useState([]);
  const [listId, setListId] = useState("");
  const [leads, setLeads] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState("");
  const [lastContacted, setLastContacted] = useState({});
  const [manage, setManage] = useState(false);
  const [quickPhone, setQuickPhone] = useState("");

  useEffect(() => {
    api.get("/outreach/lead-lists").then(({ data }) => setLists(data)).catch(() => {});
    api.get("/outreach/wa-templates").then(({ data }) => {
      setTemplates(data);
      if (data[0]) setTemplateId((t) => t || data[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!listId) { setLeads(null); return; }
    setLeads(null);
    Promise.all([
      api.get(`/outreach/lead-lists/${listId}/leads`),
      api.get(`/outreach/wa-log?list_id=${listId}`),
    ]).then(([l, g]) => {
      const members = Array.isArray(l.data) ? l.data : (l.data?.leads || []);
      setLeads(members.filter((x) => normalizePhone(x.phone).length >= 11));
      setLastContacted(g.data.last_contacted || {});
    }).catch((e) => { toast.error(formatApiError(e)); setLeads([]); });
  }, [listId]);

  const template = templates.find((t) => t.id === templateId);

  const openChat = async (lead, phoneOverride) => {
    const phone = normalizePhone(phoneOverride || lead?.phone);
    if (phone.length < 11) { toast.error("No valid mobile number"); return; }
    const msg = personalize(template?.body || "", lead);
    window.open(`https://wa.me/${phone}${msg ? `?text=${encodeURIComponent(msg)}` : ""}`, "_blank", "noopener");
    try {
      await api.post("/outreach/wa-log", { lead_id: lead?.id || "", list_id: listId, template_id: templateId, phone });
      const key = lead?.id || phone;
      setLastContacted((p) => ({ ...p, [key]: new Date().toISOString() }));
    } catch { /* logging is best-effort */ }
  };

  const nextUnsent = () => {
    const lead = (leads || []).find((l) => !lastContacted[l.id]);
    if (!lead) { toast.info("Everyone in this list has been contacted 🎉"); return; }
    openChat(lead);
  };

  const sentCount = useMemo(() => (leads || []).filter((l) => lastContacted[l.id]).length, [leads, lastContacted]);

  return (
    <div className="space-y-4" data-testid="wa-tab">
      {/* header controls */}
      <div className="rounded-3xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block min-w-[200px] flex-1">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Lead list</span>
            <select data-testid="wa-list-select" value={listId} onChange={(e) => setListId(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#25D366]">
              <option value="">— Select a lead list —</option>
              {lists.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.lead_count})</option>)}
            </select>
          </label>
          <label className="block min-w-[200px] flex-1">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">WhatsApp template</span>
            <select data-testid="wa-template-select" value={templateId} onChange={(e) => setTemplateId(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#25D366]">
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <button data-testid="wa-manage-templates" onClick={() => setManage((m) => !m)}
            className={`rounded-full px-4 py-2 text-xs font-bold transition ${manage ? "bg-[#0F2042] text-white" : "border border-slate-300 text-slate-600 hover:border-[#0F2042]"}`}>
            <PencilLine size={12} className="mr-1 inline" /> Manage templates
          </button>
          {listId && leads?.length > 0 && (
            <button data-testid="wa-next-unsent" onClick={nextUnsent}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#25D366] px-5 py-2 text-xs font-bold text-white hover:bg-[#1EBE5A]">
              <Rocket size={13} /> Next unsent <ChevronRight size={12} />
            </button>
          )}
        </div>
        {template && (
          <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-3" data-testid="wa-template-preview">
            <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Message preview</div>
            <p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-slate-600">{personalize(template.body, (leads || [])[0])}</p>
          </div>
        )}
        {/* quick chat any number */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Phone size={13} className="text-slate-400" />
          <input data-testid="wa-quick-phone" value={quickPhone} onChange={(e) => setQuickPhone(e.target.value)}
            placeholder="Chat with any number… e.g. 98765 43210"
            className="w-56 rounded-full border border-slate-300 px-3.5 py-1.5 text-xs outline-none focus:border-[#25D366]" />
          <button data-testid="wa-quick-open" onClick={() => { if (normalizePhone(quickPhone).length < 11) { toast.error("Enter a valid number"); return; } openChat(null, quickPhone); setQuickPhone(""); }}
            className="inline-flex items-center gap-1 rounded-full bg-[#25D366] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#1EBE5A]">
            <MessageCircle size={12} /> Open chat
          </button>
          <span className="ml-auto text-[10px] text-slate-400">Chats open in WhatsApp with your own number — media & docs shareable there. In-portal inbox available later via WhatsApp Business API.</span>
        </div>
      </div>

      <AnimatePresence>{manage && <TemplateManager templates={templates} setTemplates={setTemplates} onClose={() => setManage(false)} />}</AnimatePresence>

      {/* leads */}
      {!listId ? (
        <div className="rounded-3xl border-2 border-dashed border-slate-200 p-12 text-center" data-testid="wa-empty">
          <MessageCircle size={32} className="mx-auto mb-2 text-[#25D366]" />
          <p className="text-sm font-bold text-slate-500">Select a lead list to see mobile numbers</p>
          <p className="text-xs text-slate-400">Only leads with a valid mobile number are shown.</p>
        </div>
      ) : !leads ? (
        <div className="flex justify-center py-12"><Loader2 size={22} className="animate-spin text-slate-300" /></div>
      ) : leads.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-slate-200 p-10 text-center text-xs text-slate-400" data-testid="wa-no-phones">
          No leads in this list have a mobile number. Add phone numbers in Lead Management first.
        </div>
      ) : (
        <div className="rounded-3xl border border-slate-200 bg-white" data-testid="wa-leads">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{leads.length} numbers · {sentCount} contacted</div>
            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-[#25D366] transition-all" style={{ width: `${leads.length ? (sentCount / leads.length) * 100 : 0}%` }} />
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {leads.map((l) => {
              const sent = lastContacted[l.id];
              return (
                <div key={l.id} data-testid={`wa-lead-${l.id}`} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <div className="min-w-[140px] flex-1">
                    <div className="text-sm font-bold text-[#0F2042]">{l.name || "—"}</div>
                    <div className="text-[11px] text-slate-400">{[l.company, l.industry].filter(Boolean).join(" · ") || "—"}</div>
                  </div>
                  <span className="rounded-lg bg-slate-50 px-2.5 py-1 font-mono text-xs font-bold text-slate-600" data-testid={`wa-phone-${l.id}`}>
                    +{normalizePhone(l.phone)}
                  </span>
                  {sent && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold uppercase text-emerald-700" data-testid={`wa-sent-${l.id}`}>
                      <Check size={9} /> Sent {new Date(sent).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </span>
                  )}
                  <button data-testid={`wa-chat-${l.id}`} onClick={() => openChat(l)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#25D366] px-4 py-1.5 text-[11px] font-bold text-white hover:bg-[#1EBE5A]">
                    <MessageCircle size={12} /> {sent ? "Chat again" : "Chat on WhatsApp"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function TemplateManager({ templates, setTemplates, onClose }) {
  const [editing, setEditing] = useState(null); // null | {} | template
  const [form, setForm] = useState({ name: "", body: "" });
  const [busy, setBusy] = useState(false);

  const startEdit = (t) => { setEditing(t || {}); setForm({ name: t?.name || "", body: t?.body || "" }); };

  const save = async () => {
    if (!form.name.trim() || !form.body.trim()) { toast.error("Name and message are required"); return; }
    setBusy(true);
    try {
      if (editing?.id) {
        const { data } = await api.patch(`/outreach/wa-templates/${editing.id}`, form);
        setTemplates((p) => p.map((t) => (t.id === data.id ? data : t)));
      } else {
        const { data } = await api.post("/outreach/wa-templates", form);
        setTemplates((p) => [data, ...p]);
      }
      setEditing(null);
      toast.success("Template saved");
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };

  const del = async (t) => {
    if (!window.confirm(`Delete template "${t.name}"?`)) return;
    await api.delete(`/outreach/wa-templates/${t.id}`);
    setTemplates((p) => p.filter((x) => x.id !== t.id));
  };

  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden" data-testid="wa-template-manager">
      <div className="rounded-3xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">// whatsapp templates</div>
          <div className="flex gap-1.5">
            <button data-testid="wa-tpl-new" onClick={() => startEdit(null)}
              className="inline-flex items-center gap-1 rounded-full bg-[#0F2042] px-3.5 py-1.5 text-[11px] font-bold text-white"><Plus size={11} /> New</button>
            <button onClick={onClose} className="rounded-full border border-slate-200 p-1.5 text-slate-400"><X size={13} /></button>
          </div>
        </div>
        {editing !== null && (
          <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-3">
            <input data-testid="wa-tpl-name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Template name" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#25D366]" />
            <textarea data-testid="wa-tpl-body" rows={4} value={form.body} onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))}
              placeholder="Hi {{FirstName}}! …" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#25D366]" />
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {VARS.map((v) => (
                <button key={v} onClick={() => setForm((p) => ({ ...p, body: p.body + v }))}
                  className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100">{v}</button>
              ))}
              <button data-testid="wa-tpl-save" onClick={save} disabled={busy}
                className="ml-auto inline-flex items-center gap-1 rounded-full bg-[#25D366] px-4 py-1.5 text-[11px] font-bold text-white disabled:opacity-50">
                {busy ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />} Save
              </button>
              <button onClick={() => setEditing(null)} className="rounded-full px-3 py-1.5 text-[11px] font-bold text-slate-500">Cancel</button>
            </div>
          </div>
        )}
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {templates.map((t) => (
            <div key={t.id} className="rounded-2xl border border-slate-200 p-3" data-testid={`wa-tpl-${t.id}`}>
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-[#0F2042]">{t.name}</div>
                <div className="flex gap-1">
                  <button onClick={() => startEdit(t)} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:border-[#0F2042]"><PencilLine size={11} /></button>
                  <button onClick={() => del(t)} className="rounded-lg border border-rose-200 p-1.5 text-rose-400 hover:bg-rose-50"><Trash2 size={11} /></button>
                </div>
              </div>
              <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[11px] leading-relaxed text-slate-500">{t.body}</p>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
