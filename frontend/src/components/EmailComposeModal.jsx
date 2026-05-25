import { useEffect, useState } from "react";
import { Send, Mail, X, Loader2, Sparkles, Eye } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";

/**
 * Manual email sender. Drop anywhere; pass `defaults` to prefill template/variables/to.
 *
 * Props:
 *   open: boolean
 *   onClose: () => void
 *   defaults: {
 *     to?: string[] | string,             // emails — prefilled into To field
 *     cc?: string[] | string,              // emails — prefilled into Cc field
 *     templateSlug?: string,               // pick template by slug
 *     subject?: string,
 *     variables?: Record<string,string>,
 *     contextLabel?: string,               // e.g. "Project: Apollo"
 *   }
 */
export default function EmailComposeModal({ open, onClose, defaults = {} }) {
  const [templates, setTemplates] = useState([]);
  const [status, setStatus] = useState(null);
  const [tplId, setTplId] = useState("");
  const [to, setTo] = useState(Array.isArray(defaults.to) ? defaults.to.join(", ") : (defaults.to || ""));
  const [cc, setCc] = useState(Array.isArray(defaults.cc) ? defaults.cc.join(", ") : (defaults.cc || ""));
  const [subject, setSubject] = useState(defaults.subject || "");
  const [bodyHtml, setBodyHtml] = useState("");
  const [vars, setVars] = useState(defaults.variables || {});
  const [busy, setBusy] = useState(false);
  const [previewOn, setPreviewOn] = useState(false);

  // Re-sync internal fields whenever the modal is opened with new defaults
  useEffect(() => {
    if (!open) return;
    setTo(Array.isArray(defaults.to) ? defaults.to.join(", ") : (defaults.to || ""));
    setCc(Array.isArray(defaults.cc) ? defaults.cc.join(", ") : (defaults.cc || ""));
    setSubject(defaults.subject || "");
    setVars(defaults.variables || {});
    setTplId("");
    setBodyHtml("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaults.to, defaults.cc, defaults.subject, defaults.templateSlug]);

  useEffect(() => {
    if (!open) return;
    Promise.all([api.get("/email/templates"), api.get("/email/status")])
      .then(([{ data: tpl }, { data: st }]) => {
        setTemplates(tpl);
        setStatus(st);
        // pre-select template by slug if provided
        if (defaults.templateSlug) {
          const m = tpl.find((t) => t.slug === defaults.templateSlug);
          if (m) {
            setTplId(m.id);
            setSubject(defaults.subject || m.subject || "");
            setBodyHtml(m.body_html || "");
          }
        }
      })
      .catch((e) => toast.error(formatApiError(e)));
  }, [open]);

  if (!open) return null;

  const onPickTemplate = (id) => {
    setTplId(id);
    const tpl = templates.find((t) => t.id === id);
    if (tpl) {
      setSubject(tpl.subject || "");
      setBodyHtml(tpl.body_html || "");
    }
  };

  const send = async () => {
    const toList = to.split(/[,\s;]+/).filter(Boolean);
    const ccList = cc.split(/[,\s;]+/).filter(Boolean);
    if (!toList.length) { toast.error("Add at least one recipient"); return; }
    if (!subject && !tplId) { toast.error("Subject or template required"); return; }
    setBusy(true);
    try {
      const payload = {
        to: toList,
        cc: ccList,
        subject,
        variables: vars,
        template_id: tplId || undefined,
        body_html: tplId ? undefined : bodyHtml,
      };
      await api.post("/email/send", payload);
      const totalCount = toList.length + ccList.length;
      toast.success(`Email sent to ${totalCount} recipient${totalCount > 1 ? "s" : ""}${ccList.length ? ` (incl. ${ccList.length} CC)` : ""}`);
      onClose();
    } catch (e) {
      toast.error(formatApiError(e));
    }
    setBusy(false);
  };

  const renderPreview = (s) => {
    let out = s || "";
    Object.entries(vars || {}).forEach(([k, v]) => {
      out = out.replace(new RegExp(`{{\\s*${k}\\s*}}`, "g"), v || "");
    });
    return out;
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-[#0F2042] to-[#1E293B] px-5 py-3 text-white">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold"><Mail size={16} /> Send email</div>
            {defaults.contextLabel && (
              <div className="mt-0.5 text-[11px] text-slate-300">{defaults.contextLabel}</div>
            )}
          </div>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-white/10"><X size={18} /></button>
        </header>

        {!status?.connected && (
          <div className="border-b border-amber-200 bg-amber-50 px-5 py-2 text-xs text-amber-800">
            Gmail isn't connected yet — ask an admin to connect Gmail in <a href="/app/settings" className="underline font-semibold">Settings</a>.
          </div>
        )}

        <div className="space-y-3 overflow-y-auto p-5">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Template</label>
            <select
              data-testid="email-compose-template"
              value={tplId}
              onChange={(e) => onPickTemplate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#F97316]"
            >
              <option value="">— Plain message —</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">To</label>
            <input
              data-testid="email-compose-to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="user@example.com, another@example.com"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#F97316]"
            />
            {to && (
              <div className="mt-1 text-[10px] text-slate-400">
                Auto-filled from context · {to.split(/[,\s;]+/).filter(Boolean).length} recipient(s)
              </div>
            )}
          </div>

          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Cc <span className="font-normal text-slate-400">(optional)</span></label>
            <input
              data-testid="email-compose-cc"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="manager@example.com"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#F97316]"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Subject</label>
            <input
              data-testid="email-compose-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#F97316]"
            />
          </div>

          {Object.keys(vars).length > 0 && (
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Variables</label>
              <div className="mt-1 grid gap-2 sm:grid-cols-2">
                {Object.entries(vars).map(([k, v]) => (
                  <div key={k}>
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">{k}</div>
                    <input
                      value={v || ""}
                      onChange={(e) => setVars((p) => ({ ...p, [k]: e.target.value }))}
                      data-testid={`email-var-${k}`}
                      className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-[#F97316]"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {!tplId && (
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Body (HTML)</label>
              <textarea
                data-testid="email-compose-body"
                rows={8}
                value={bodyHtml}
                onChange={(e) => setBodyHtml(e.target.value)}
                placeholder="<p>Hi {{name}},</p>..."
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs outline-none focus:border-[#F97316]"
              />
            </div>
          )}

          {previewOn && (
            <div className="rounded-xl border border-slate-200">
              <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Preview</div>
              <iframe title="preview" srcDoc={renderPreview(bodyHtml || (templates.find((t) => t.id === tplId)?.body_html || ""))} className="h-64 w-full" />
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-5 py-3">
          <button
            onClick={() => setPreviewOn((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-[#F97316] hover:text-[#F97316]"
          >
            <Eye size={13} /> {previewOn ? "Hide" : "Preview"}
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-500 hover:text-[#0F2042]">Cancel</button>
            <button
              data-testid="email-compose-send"
              onClick={send}
              disabled={busy || !status?.connected}
              className="inline-flex items-center gap-2 rounded-lg bg-[#F97316] px-5 py-2 text-sm font-bold text-white shadow hover:bg-orange-600 disabled:opacity-60"
            >
              {busy ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />} Send email
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
