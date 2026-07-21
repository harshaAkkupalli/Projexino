/**
 * TestimonialsHub.jsx — admin panel for client feedback / testimonials.
 *
 * Three tabs:
 *   • Dashboard  — analytics + quick actions
 *   • Submissions — full CRUD + approve/reject + feature toggle + video preview
 *   • Requests   — outstanding feedback requests (manual reminder + cancel)
 *
 * URL: /app/testimonials
 */
import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { api, formatApiError } from "@/lib/api";
import {
  Star, CheckCircle2, XCircle, Trash2, Send, Plus, Loader2, X,
  Sparkles, ListChecks, Mail, BadgeCheck, Video as VideoIcon,
  RefreshCw, Eye, Copy, MessageSquare, Search, MessageCircle,
} from "lucide-react";
import Avatar3D from "@/components/Avatar3D";
import { WhatsAppSendModal } from "@/components/WhatsAppSendModal";

const VIDEO_BASE = `${process.env.REACT_APP_BACKEND_URL}/api/uploads/testimonials`;

function Stars({ rating = 5, size = 13 }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={size}
          className={i < rating ? "fill-[#FBBF24] text-[#FBBF24]" : "text-slate-300"}
        />
      ))}
    </div>
  );
}

const TABS = [
  { v: "dashboard", l: "Dashboard", icon: Sparkles },
  { v: "submissions", l: "Submissions", icon: ListChecks },
  { v: "requests", l: "Requests", icon: Mail },
];

export default function TestimonialsHub() {
  const [params, setParams] = useSearchParams();
  const initial = params.get("tab") || "dashboard";
  const [tab, setTab] = useState(TABS.some((t) => t.v === initial) ? initial : "dashboard");
  const onTab = (v) => {
    setTab(v);
    setParams((p) => { p.set("tab", v); return p; }, { replace: true });
  };
  return (
    <div className="space-y-5" data-testid="page-testimonials">
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-orange-50/30 to-violet-50/30 p-6 md:p-7 shadow-sm">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.32em] text-[#F97316]">// social proof · client voice</div>
          <h1 className="font-display mt-1 text-3xl font-medium text-[#0F2042] md:text-4xl">Client Feedback &amp; Testimonials</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Request reviews, manage submissions, approve testimonials and feature the best ones on the website.
          </p>
        </div>
        <div className="mt-5 inline-flex flex-wrap gap-1 rounded-full bg-white p-1 shadow-sm ring-1 ring-slate-200">
          {TABS.map((t) => (
            <button key={t.v} onClick={() => onTab(t.v)} data-testid={`tm-tab-${t.v}`}
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition ${tab === t.v ? "bg-[#0F2042] text-white shadow" : "text-slate-500 hover:text-[#0F2042]"}`}>
              <t.icon size={12} /> {t.l}
            </button>
          ))}
        </div>
      </div>
      {tab === "dashboard" && <DashboardTab onJump={onTab} />}
      {tab === "submissions" && <SubmissionsTab />}
      {tab === "requests" && <RequestsTab />}
    </div>
  );
}

function DashboardTab({ onJump }) {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    api.get("/testimonials/analytics").then(({ data }) => setStats(data)).catch(() => {});
  }, []);
  if (!stats) return <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-[#F97316]"/></div>;
  const cards = [
    { l: "Total submissions", v: stats.total, color: "orange", icon: ListChecks, jump: "submissions" },
    { l: "Approved", v: stats.approved, color: "emerald", icon: BadgeCheck, jump: "submissions" },
    { l: "Pending review", v: stats.pending, color: "rose", icon: Eye, jump: "submissions" },
    { l: "With video", v: stats.with_video, color: "violet", icon: VideoIcon, jump: "submissions" },
    { l: "Avg rating", v: `${stats.avg_rating}★`, color: "orange", icon: Star, jump: "submissions" },
    { l: "Approval rate", v: `${stats.approval_rate}%`, color: "emerald", icon: CheckCircle2, jump: "submissions" },
    { l: "Requests sent", v: stats.requests_total, color: "violet", icon: Send, jump: "requests" },
    { l: "Response rate", v: `${stats.response_rate}%`, color: "rose", icon: MessageSquare, jump: "requests" },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="tm-dashboard">
      {cards.map((c) => (
        <button key={c.l} type="button" onClick={() => onJump && onJump(c.jump)}
          data-testid={`tm-stat-${c.l.replace(/\s+/g, "-").toLowerCase()}`}
          className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-[#F97316] hover:shadow-md">
          <div className="flex items-center gap-3">
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl bg-${c.color}-100 text-${c.color}-700`}
              style={{ background: tone(c.color, 0.15), color: tone(c.color, 1) }}>
              <c.icon size={18} />
            </span>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{c.l}</div>
              <div className="font-display text-xl font-bold text-[#0F2042]">{c.v}</div>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

function tone(c, alpha) {
  const map = { orange: "#F97316", emerald: "#10B981", violet: "#7C3AED", rose: "#EF4444" };
  const hex = map[c] || "#0F2042";
  if (alpha === 1) return hex;
  return `${hex}26`;
}

/* ============================================================
 * Submissions
 * ============================================================ */
function SubmissionsTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");   // "" pending approved rejected
  const [q, setQ] = useState("");
  const [preview, setPreview] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [showRequest, setShowRequest] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/testimonials", { params: { status: filter, q, limit: 500 } });
      setItems(data.items || []);
    } catch (e) { toast.error(formatApiError(e)); }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  const approve = async (t) => {
    try { await api.patch(`/testimonials/${t.id}`, { status: "approved" }); toast.success("Approved"); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const reject = async (t) => {
    try { await api.patch(`/testimonials/${t.id}`, { status: "rejected" }); toast.success("Rejected"); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const toggleFeature = async (t) => {
    try { await api.patch(`/testimonials/${t.id}`, { featured: !t.featured }); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const remove = async (t) => {
    if (!window.confirm(`Delete testimonial from ${t.client_name}?`)) return;
    try { await api.delete(`/testimonials/${t.id}`); toast.success("Deleted"); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex gap-1 rounded-full bg-slate-100 p-1">
          {[
            { v: "", l: "All" },
            { v: "pending", l: "Pending" },
            { v: "approved", l: "Approved" },
            { v: "rejected", l: "Rejected" },
          ].map((opt) => (
            <button key={opt.v || "all"} onClick={() => setFilter(opt.v)}
              data-testid={`tm-filter-${opt.v || "all"}`}
              className={`rounded-full px-3 py-1 text-xs font-bold transition ${filter === opt.v ? "bg-[#0F2042] text-white shadow" : "text-slate-500 hover:text-[#0F2042]"}`}>{opt.l}</button>
          ))}
        </div>
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="Search name, company, message…"
            data-testid="tm-search"
            className="rounded-full border border-slate-200 bg-white py-1.5 pl-7 pr-3 text-xs outline-none focus:border-[#F97316]"/>
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={() => setShowRequest(true)} data-testid="tm-request-cta"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-[#F97316] hover:text-[#F97316]">
            <Send size={12} /> Request feedback
          </button>
          <button onClick={() => setShowNew(true)} data-testid="tm-add-cta"
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#F97316] to-[#FB923C] px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white shadow">
            <Plus size={12} /> Add testimonial
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-[#F97316]"/></div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center text-sm text-slate-500" data-testid="tm-empty">
          No testimonials match this filter.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((t) => (
            <motion.div key={t.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              data-testid={`tm-card-${t.id}`}
              className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:shadow-md">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2.5">
                  <Avatar3D name={t.client_name} src={t.avatar_path} size={40} />
                  <div className="min-w-0">
                    <div className="font-display truncate text-sm font-bold text-[#0F2042]">{t.client_name}</div>
                    {t.designation && <div className="truncate text-[10px] font-bold text-[#F97316]">{t.designation}</div>}
                    <div className="truncate text-[10px] text-slate-500">{[t.company, t.project_name].filter(Boolean).join(" · ") || "—"}</div>
                    <div className="mt-1"><Stars rating={t.rating || 5} /></div>
                  </div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                  t.status === "approved" ? "bg-emerald-100 text-emerald-700" :
                  t.status === "rejected" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"
                }`}>{t.status}</span>
              </div>
              {t.message && <p className="mt-3 line-clamp-3 text-xs text-slate-600">&ldquo;{t.message}&rdquo;</p>}
              {t.video_path && (
                <button onClick={() => setPreview(t)} data-testid={`tm-video-${t.id}`}
                  className="mt-3 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-200">
                  <VideoIcon size={11}/> Watch video
                </button>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3 text-xs">
                {t.status !== "approved" && (
                  <button onClick={() => approve(t)} data-testid={`tm-approve-${t.id}`}
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-700 hover:bg-emerald-200">
                    <CheckCircle2 size={10}/> Approve
                  </button>
                )}
                {t.status !== "rejected" && (
                  <button onClick={() => reject(t)} data-testid={`tm-reject-${t.id}`}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-200">
                    <XCircle size={10}/> Reject
                  </button>
                )}
                {t.status === "approved" && (
                  <button onClick={() => toggleFeature(t)} data-testid={`tm-feature-${t.id}`}
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ${t.featured ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
                    <Sparkles size={10}/> {t.featured ? "Featured" : "Feature"}
                  </button>
                )}
                <button onClick={() => remove(t)} data-testid={`tm-delete-${t.id}`}
                  className="ml-auto rounded-full p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                  <Trash2 size={12}/>
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {preview && <VideoPreviewModal t={preview} onClose={() => setPreview(null)} />}
      {showNew && <NewTestimonialModal onClose={() => setShowNew(false)} onSaved={load} />}
      {showRequest && <RequestModal onClose={() => setShowRequest(false)} onSent={load} />}
    </div>
  );
}

function VideoPreviewModal({ t, onClose }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-3xl rounded-3xl bg-white p-3 shadow-2xl" onClick={(e) => e.stopPropagation()} data-testid="tm-video-modal">
        <button onClick={onClose} className="absolute right-3 top-3 z-10 rounded-full bg-white/90 p-1.5 text-slate-700 shadow"><X size={14}/></button>
        <video src={`${VIDEO_BASE}/${t.video_path}`} controls autoPlay className="aspect-video w-full rounded-2xl bg-black"/>
        <div className="mt-3 px-2 pb-2">
          <div className="font-display text-sm font-bold text-[#0F2042]">{t.client_name} · {t.company}</div>
          <p className="mt-1 text-xs text-slate-600">&ldquo;{t.message}&rdquo;</p>
        </div>
      </div>
    </div>
  );
}

function NewTestimonialModal({ onClose, onSaved }) {
  const [form, setForm] = useState({
    client_name: "", company: "", designation: "", project_name: "", email: "",
    rating: 5, message: "", format: "text", status: "approved",
  });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!form.client_name.trim() || form.message.trim().length < 4) {
      toast.error("Name + message required"); return;
    }
    setBusy(true);
    try {
      await api.post("/testimonials", form);
      toast.success("Testimonial added");
      onSaved(); onClose();
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base font-semibold text-[#0F2042]">Add testimonial manually</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100"><X size={16}/></button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Input label="Client name *" v={form.client_name} on={(v) => setForm({ ...form, client_name: v })} test="tm-add-name"/>
          <Input label="Company" v={form.company} on={(v) => setForm({ ...form, company: v })} test="tm-add-company"/>
          <Input label="Designation" v={form.designation} on={(v) => setForm({ ...form, designation: v })} test="tm-add-designation"/>
          <Input label="Project" v={form.project_name} on={(v) => setForm({ ...form, project_name: v })} test="tm-add-project"/>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Rating</span>
            <div className="mt-1 flex gap-1" data-testid="tm-add-rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => setForm({ ...form, rating: n })} data-testid={`tm-add-rating-${n}`}>
                  <Star size={20} className={n <= form.rating ? "fill-[#FBBF24] text-[#FBBF24]" : "text-slate-300"}/>
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Status</span>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
              data-testid="tm-add-status"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="approved">Approved (visible on site)</option>
              <option value="pending">Pending</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>
        <label className="mt-3 block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Message *</span>
          <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={4}
            data-testid="tm-add-message"
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-[#F97316]"/>
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-bold text-slate-600">Cancel</button>
          <button onClick={save} disabled={busy} data-testid="tm-add-save"
            className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#F97316] to-[#FB923C] px-4 py-1.5 text-xs font-bold uppercase text-white">
            {busy ? <Loader2 size={12} className="animate-spin"/> : <Plus size={12}/>} Save
          </button>
        </div>
      </div>
    </div>
  );
}

function RequestModal({ onClose, onSent }) {
  const [form, setForm] = useState({ client_name: "", company: "", email: "", project_name: "", send_email: true });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const submit = async () => {
    if (!form.client_name.trim() || !form.email.trim()) { toast.error("Name + email required"); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/testimonial-requests", form);
      setResult(data);
      if (data.email_sent) toast.success("Request sent");
      else toast.message("Request created — Gmail not connected, copy the link to share manually.");
      onSent && onSent();
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base font-semibold text-[#0F2042]">Request client feedback</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100"><X size={16}/></button>
        </div>
        {result ? (
          <div className="mt-4 space-y-3 text-sm" data-testid="request-result">
            <p className="rounded-lg bg-emerald-50 p-3 text-emerald-700">
              {result.email_sent
                ? "✅ Request emailed. You can also share the link below via WhatsApp, SMS or any other channel."
                : "Request created. Gmail isn't connected — share this link directly with the client."}
            </p>
            <div className="flex gap-2">
              <input readOnly value={result.link} data-testid="request-link"
                onFocus={(e) => e.target.select()}
                className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none"/>
              <button onClick={() => { navigator.clipboard.writeText(result.link); toast.success("Copied"); }}
                data-testid="request-link-copy"
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-xs font-bold hover:border-[#F97316] hover:text-[#F97316]"><Copy size={11}/> Copy</button>
            </div>
            <div className="flex flex-wrap gap-2">
              <a target="_blank" rel="noreferrer" data-testid="request-share-whatsapp"
                href={`https://wa.me/?text=${encodeURIComponent(`Hi! We'd love your feedback — please share a quick review here: ${result.link}`)}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#25D366] px-3 py-1.5 text-xs font-bold text-white shadow hover:opacity-90">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.1-1.6-.8-1.9-.9-.3-.1-.4-.1-.6.1-.2.3-.7.9-.8 1-.2.1-.3.2-.5 0-.3-.1-1.1-.4-2.1-1.3-.8-.7-1.3-1.6-1.4-1.8-.1-.2 0-.3.1-.5l.4-.4c.1-.2.2-.3.3-.5 0-.2 0-.4-.1-.5-.1-.1-.6-1.5-.8-2-.2-.5-.5-.5-.6-.5h-.6c-.2 0-.5.1-.7.4-.3.3-1 .9-1 2.3s1 2.7 1.2 2.9c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.3.2 1.8.1.6-.1 1.6-.7 1.9-1.3.2-.6.2-1.2.1-1.3 0-.1-.2-.2-.5-.3zM12 0C5.4 0 0 5.4 0 12c0 2.1.5 4.1 1.5 5.8L0 24l6.4-1.7c1.6.9 3.5 1.4 5.6 1.4 6.6 0 12-5.4 12-12S18.6 0 12 0zm0 21.9c-1.9 0-3.7-.5-5.3-1.4l-.4-.2-3.9 1 1-3.8-.2-.4c-1-1.5-1.5-3.3-1.5-5.2 0-5.5 4.5-10 10-10s10 4.5 10 10c.1 5.6-4.4 10-9.7 10z"/></svg>
                WhatsApp
              </a>
              <a target="_blank" rel="noreferrer" data-testid="request-share-email"
                href={`mailto:?subject=${encodeURIComponent("We'd love your feedback")}&body=${encodeURIComponent(`Hi,%0A%0AWe'd really appreciate a short review of working with us. It takes ~2 minutes:%0A%0A${result.link}%0A%0AThank you!`)}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-[#F97316] hover:text-[#F97316]">
                <Mail size={11}/> Email
              </a>
              <a target="_blank" rel="noreferrer" data-testid="request-share-linkedin"
                href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(result.link)}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#0A66C2] px-3 py-1.5 text-xs font-bold text-white shadow hover:opacity-90">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 2h-17C2.7 2 2 2.7 2 3.5v17c0 .8.7 1.5 1.5 1.5h17c.8 0 1.5-.7 1.5-1.5v-17c0-.8-.7-1.5-1.5-1.5zM8 19H5V8h3v11zM6.5 6.7c-1 0-1.7-.8-1.7-1.7s.8-1.7 1.7-1.7c1 0 1.7.8 1.7 1.7s-.7 1.7-1.7 1.7zM19 19h-3v-5.6c0-1.4-.5-2.3-1.7-2.3-1.4 0-2.1 1-2.1 2.3V19H9.3V8h2.9v1.3c.4-.8 1.5-1.5 3-1.5 3.2 0 3.8 2.1 3.8 4.8V19z"/></svg>
                LinkedIn
              </a>
            </div>
            <div className="text-right">
              <button onClick={onClose} className="text-xs font-bold text-[#F97316] hover:underline" data-testid="request-close">Done</button>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Input label="Client name *" v={form.client_name} on={(v) => setForm({ ...form, client_name: v })} test="req-name"/>
              <Input label="Email *" v={form.email} on={(v) => setForm({ ...form, email: v })} test="req-email" type="email"/>
              <Input label="Company" v={form.company} on={(v) => setForm({ ...form, company: v })} test="req-company"/>
              <Input label="Project" v={form.project_name} on={(v) => setForm({ ...form, project_name: v })} test="req-project"/>
            </div>
            <label className="mt-3 flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={form.send_email} onChange={(e) => setForm({ ...form, send_email: e.target.checked })} data-testid="req-send-email"/>
              Send the invitation email immediately via the connected Gmail
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={onClose} className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-bold text-slate-600">Cancel</button>
              <button onClick={submit} disabled={busy} data-testid="req-submit"
                className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#F97316] to-[#FB923C] px-4 py-1.5 text-xs font-bold uppercase text-white">
                {busy ? <Loader2 size={12} className="animate-spin"/> : <Send size={12}/>} Send request
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Input({ label, v, on, test, type = "text", cls = "" }) {
  return (
    <label className={`block ${cls}`}>
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <input type={type} value={v} onChange={(e) => on(e.target.value)} data-testid={test}
        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316]"/>
    </label>
  );
}

/* ============================================================
 * Requests Tab
 * ============================================================ */
function RequestsTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRequest, setShowRequest] = useState(false);
  const [shareTarget, setShareTarget] = useState(null);  // open the share modal for an existing row
  const [wa, setWa] = useState(null);

  const openWa = async (r) => {
    try {
      const { data } = await api.post(`/testimonial-requests/${r.id}/whatsapp`);
      setWa({ text: data.wa_text, phone: data.phone, name: r.client_name });
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/testimonial-requests", { params: { limit: 500 } });
      setItems(data.items || []);
    } catch (e) { toast.error(formatApiError(e)); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const remind = async (r) => {
    try {
      const { data } = await api.post(`/testimonial-requests/${r.id}/remind`);
      if (data.ok) toast.success("Reminder sent");
      else toast.error("Could not send — Gmail probably not connected");
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };
  const cancel = async (r) => {
    if (!window.confirm("Cancel this feedback request?")) return;
    try { await api.delete(`/testimonial-requests/${r.id}`); toast.success("Cancelled"); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const linkFor = (r) => `${window.location.origin}/testimonial/${r.token}`;
  const copyLink = (r) => {
    navigator.clipboard.writeText(linkFor(r));
    toast.success("Link copied");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">Auto reminders fire on Day 2 / 5 / 10 after the initial send. Use Send reminder for an immediate manual nudge.</p>
        <button onClick={() => setShowRequest(true)} data-testid="req-new-cta"
          className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#F97316] to-[#FB923C] px-3 py-1.5 text-xs font-bold uppercase text-white shadow">
          <Plus size={12}/> New request
        </button>
      </div>
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-[#F97316]"/></div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center text-sm text-slate-500" data-testid="req-empty">No feedback requests yet.</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Client</th>
                <th className="px-3 py-2 text-left">Email</th>
                <th className="px-3 py-2 text-left">Project</th>
                <th className="px-3 py-2 text-left">Sent</th>
                <th className="px-3 py-2 text-left">Reminders</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((r) => (
                <tr key={r.id} data-testid={`req-row-${r.id}`}>
                  <td className="px-3 py-2 font-semibold text-[#0F2042]">{r.client_name}<div className="text-[10px] text-slate-500">{r.company || "—"}</div></td>
                  <td className="px-3 py-2 text-slate-600">{r.email}</td>
                  <td className="px-3 py-2 text-slate-600">{r.project_name || "—"}</td>
                  <td className="px-3 py-2 text-slate-500">{new Date(r.sent_at).toLocaleDateString()}</td>
                  <td className="px-3 py-2 text-slate-600">{r.reminders_sent || 0}/3</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                      r.status === "submitted" ? "bg-emerald-100 text-emerald-700" :
                      r.status === "cancelled" ? "bg-slate-200 text-slate-600" : "bg-amber-100 text-amber-700"
                    }`}>{r.status}</span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => setShareTarget(r)}
                        data-testid={`req-share-${r.id}`}
                        title="Share this request via WhatsApp / Email / LinkedIn / Copy link"
                        className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#F97316] to-[#FB923C] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow hover:opacity-90">
                        <Send size={10}/> Share
                      </button>
                      <button onClick={() => copyLink(r)} title="Copy link" data-testid={`req-copy-${r.id}`}
                        className="grid h-7 w-7 place-items-center rounded-full border border-slate-200 text-slate-700 hover:border-[#F97316] hover:text-[#F97316]"><Copy size={11}/></button>
                      <a onClick={(e) => { e.preventDefault(); openWa(r); }} href="#wa" title="Send request via WhatsApp"
                        data-testid={`req-whatsapp-${r.id}`}
                        className="grid h-7 w-7 cursor-pointer place-items-center rounded-full bg-[#25D366] text-white hover:opacity-90">
                        <MessageCircle size={12} />
                      </a>
                      {r.status === "pending" && (
                        <>
                          <button onClick={() => remind(r)} title="Send reminder via Gmail" data-testid={`req-remind-${r.id}`}
                            className="grid h-7 w-7 place-items-center rounded-full border border-slate-200 text-slate-700 hover:border-[#F97316] hover:text-[#F97316]"><RefreshCw size={11}/></button>
                          <button onClick={() => cancel(r)} title="Cancel request" data-testid={`req-cancel-${r.id}`}
                            className="grid h-7 w-7 place-items-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={11}/></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showRequest && <RequestModal onClose={() => setShowRequest(false)} onSent={load} />}
      {shareTarget && <ShareLinkModal request={shareTarget} onClose={() => setShareTarget(null)} onWhatsApp={(r) => { setShareTarget(null); openWa(r); }} />}
      {wa && <WhatsAppSendModal title="Feedback request · WhatsApp" subtitle={`To ${wa.name}`} text={wa.text} onTextChange={(t) => setWa({ ...wa, text: t })} phone={wa.phone} onClose={() => setWa(null)} />}
    </div>
  );
}


/* Reusable share modal — opens for any existing row's "Share" button.
 * Same UX as the result view of RequestModal, but available on demand. */
function ShareLinkModal({ request, onClose, onWhatsApp }) {
  const link = `${window.location.origin}/testimonial/${request.token}`;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()} data-testid="share-modal">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base font-semibold text-[#0F2042]">Share feedback link · {request.client_name}</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100"><X size={16}/></button>
        </div>
        <p className="mt-3 rounded-lg bg-violet-50 p-3 text-xs text-violet-700">
          Send this link to your client through any channel — WhatsApp, email, LinkedIn DM or just copy and paste.
        </p>
        <div className="mt-3 flex gap-2">
          <input readOnly value={link} data-testid="share-link"
            onFocus={(e) => e.target.select()}
            className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none"/>
          <button onClick={() => { navigator.clipboard.writeText(link); toast.success("Copied"); }}
            data-testid="share-link-copy"
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-xs font-bold hover:border-[#F97316] hover:text-[#F97316]">
            <Copy size={11}/> Copy
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => onWhatsApp(request)} data-testid="share-whatsapp"
            className="inline-flex items-center gap-1.5 rounded-full bg-[#25D366] px-3 py-1.5 text-xs font-bold text-white shadow hover:opacity-90">
            <MessageCircle size={12} />
            WhatsApp
          </button>
          <a target="_blank" rel="noreferrer" data-testid="share-email"
            href={`mailto:${request.email || ""}?subject=${encodeURIComponent("We'd love your feedback")}&body=${encodeURIComponent(`Hi ${request.client_name},\n\nWe'd really appreciate a short review of working with us — it takes ~2 minutes:\n\n${link}\n\nThank you!`)}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-[#F97316] hover:text-[#F97316]">
            <Mail size={11}/> Email
          </a>
          <a target="_blank" rel="noreferrer" data-testid="share-linkedin"
            href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#0A66C2] px-3 py-1.5 text-xs font-bold text-white shadow hover:opacity-90">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 2h-17C2.7 2 2 2.7 2 3.5v17c0 .8.7 1.5 1.5 1.5h17c.8 0 1.5-.7 1.5-1.5v-17c0-.8-.7-1.5-1.5-1.5zM8 19H5V8h3v11zM6.5 6.7c-1 0-1.7-.8-1.7-1.7s.8-1.7 1.7-1.7c1 0 1.7.8 1.7 1.7s-.7 1.7-1.7 1.7zM19 19h-3v-5.6c0-1.4-.5-2.3-1.7-2.3-1.4 0-2.1 1-2.1 2.3V19H9.3V8h2.9v1.3c.4-.8 1.5-1.5 3-1.5 3.2 0 3.8 2.1 3.8 4.8V19z"/></svg>
            LinkedIn
          </a>
        </div>
        <div className="mt-5 text-right">
          <button onClick={onClose} className="text-xs font-bold text-[#F97316] hover:underline" data-testid="share-close">Done</button>
        </div>
      </div>
    </div>
  );
}
