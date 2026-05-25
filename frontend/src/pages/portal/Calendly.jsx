import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar, Plus, Copy, Trash2, X, Save, Loader2, Globe, Clock, ExternalLink, Mail, CalendarCheck,
} from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function Calendly() {
  const [pages, setPages] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [p, b] = await Promise.all([api.get("/booking/pages"), api.get("/booking/my-bookings")]);
      setPages(p.data); setBookings(b.data);
    } catch { toast.error("Failed"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const remove = async (slug) => {
    if (!window.confirm("Delete this booking page? Existing bookings stay.")) return;
    await api.delete(`/booking/pages/${slug}`);
    toast.success("Deleted"); load();
  };

  const copyLink = (slug) => {
    const url = `${window.location.origin}/book/${slug}`;
    navigator.clipboard.writeText(url).then(() => toast.success("Booking link copied"));
  };

  const upcoming = useMemo(() =>
    bookings.filter((b) => b.status === "confirmed" && b.starts_at >= new Date().toISOString()).slice(0, 8),
  [bookings]);

  return (
    <div data-testid="page-calendly" className="space-y-5">
      <div className="rounded-3xl border border-blue-100 bg-gradient-to-br from-[#0F2042] via-[#1E3A8A] to-[#2563EB] p-6 text-white shadow-xl">
        <div className="text-[10px] font-bold uppercase tracking-[0.32em] text-blue-300">// scheduling</div>
        <h1 className="font-display mt-1 text-3xl font-medium md:text-4xl">Booking pages</h1>
        <p className="mt-1 text-sm text-blue-200">Calendly-style. Share a link, guests pick a slot, event auto-created on your Google Calendar (if Gmail connected) with a Meet link.</p>
        <button onClick={() => setEditor({})} data-testid="cal-new-page"
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#F97316] to-[#EA580C] px-5 py-2.5 text-sm font-bold shadow">
          <Plus size={14} /> New booking page
        </button>
      </div>

      {/* Pages list */}
      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {[...Array(2)].map((_, i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-100" />)}
        </div>
      ) : pages.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-slate-200 p-12 text-center text-sm text-slate-400">
          No booking pages yet. Click <b>New booking page</b> to create your first one.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {pages.map((p) => {
            const url = `${window.location.origin}/book/${p.slug}`;
            return (
              <motion.div key={p.id} data-testid={`cal-page-${p.slug}`}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full" style={{ background: p.color || "#F97316" }} />
                      <div className="text-lg font-bold text-[#0F2042]">{p.title}</div>
                    </div>
                    <div className="text-xs text-slate-500">{p.description || "—"}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wider">
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700"><Clock size={10} className="-mt-0.5 mr-0.5 inline" /> {p.duration_minutes} min</span>
                      <span className="rounded-full bg-violet-50 px-2 py-0.5 text-violet-700">{p.timezone_name}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{(p.working_hours || []).length} workdays</span>
                      {p.featured && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">⭐ Featured</span>}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-1.5">
                  <code className="flex-1 truncate rounded-lg bg-slate-50 px-2 py-1 font-mono text-[10px] text-slate-600">{url}</code>
                  <button onClick={() => copyLink(p.slug)} data-testid={`cal-copy-${p.slug}`}
                    className="rounded-lg bg-[#0F2042] p-1.5 text-white hover:bg-[#1E3A8A]"><Copy size={11} /></button>
                  <a href={`/book/${p.slug}`} target="_blank" rel="noreferrer"
                    data-testid={`cal-open-${p.slug}`} className="rounded-lg bg-emerald-600 p-1.5 text-white hover:bg-emerald-700"><ExternalLink size={11} /></a>
                </div>

                <div className="mt-3 flex gap-1.5">
                  <button onClick={() => setEditor(p)} data-testid={`cal-edit-${p.slug}`}
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-slate-100 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-200">Edit</button>
                  <button onClick={() => remove(p.slug)}
                    className="rounded-lg bg-rose-50 p-1.5 text-rose-600 hover:bg-rose-100"><Trash2 size={11} /></button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Upcoming */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#F97316]">// upcoming bookings</div>
        <h2 className="font-display mt-1 text-xl font-semibold text-[#0F2042]">Next on your calendar</h2>
        {upcoming.length === 0 ? (
          <div className="mt-3 text-sm text-slate-400">No upcoming bookings.</div>
        ) : (
          <ul className="mt-3 space-y-2">
            {upcoming.map((b) => (
              <li key={b.id} data-testid={`cal-booking-${b.id}`}
                className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-sm">
                <CalendarCheck size={16} className="text-emerald-600" />
                <div className="flex-1">
                  <div className="font-bold text-[#0F2042]">{b.page_title} · {b.guest_name}</div>
                  <div className="text-[10px] text-slate-500">{b.guest_email} · {b.starts_at?.slice(0, 16).replace("T", " ")}</div>
                </div>
                {b.meet_link && <a href={b.meet_link} target="_blank" rel="noreferrer" className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">Meet ↗</a>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <AnimatePresence>
        {editor && <PageEditor page={editor} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); load(); }} />}
      </AnimatePresence>
    </div>
  );
}

function PageEditor({ page, onClose, onSaved }) {
  const isNew = !page.id;
  const [form, setForm] = useState({
    title: page.title || "30-min meeting",
    description: page.description || "",
    duration_minutes: page.duration_minutes || 30,
    buffer_minutes: page.buffer_minutes || 5,
    timezone_name: page.timezone_name || "Asia/Kolkata",
    color: page.color || "#F97316",
    advance_days: page.advance_days || 21,
    min_notice_minutes: page.min_notice_minutes || 60,
    featured: !!page.featured,
    working_hours: page.working_hours || [
      { day_of_week: 0, start: "09:00", end: "17:00" },
      { day_of_week: 1, start: "09:00", end: "17:00" },
      { day_of_week: 2, start: "09:00", end: "17:00" },
      { day_of_week: 3, start: "09:00", end: "17:00" },
      { day_of_week: 4, start: "09:00", end: "17:00" },
    ],
  });
  const [busy, setBusy] = useState(false);

  const toggleDay = (idx) => {
    const hasDay = form.working_hours.find((w) => w.day_of_week === idx);
    if (hasDay) {
      setForm({ ...form, working_hours: form.working_hours.filter((w) => w.day_of_week !== idx) });
    } else {
      setForm({ ...form, working_hours: [...form.working_hours, { day_of_week: idx, start: "09:00", end: "17:00" }] });
    }
  };
  const setDayTime = (idx, k, v) => {
    setForm({ ...form, working_hours: form.working_hours.map((w) => w.day_of_week === idx ? { ...w, [k]: v } : w) });
  };

  const save = async () => {
    setBusy(true);
    try {
      if (isNew) await api.post("/booking/pages", form);
      else await api.patch(`/booking/pages/${page.slug}`, form);
      toast.success("Saved"); onSaved();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Failed"); }
    finally { setBusy(false); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur">
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="font-display text-xl font-semibold text-[#0F2042]">{isNew ? "New booking page" : "Edit booking page"}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-[#0F2042]"><X size={18} /></button>
        </div>
        <div className="max-h-[78vh] space-y-3 overflow-y-auto p-6">
          <TF label="Title *" v={form.title} on={(v) => setForm({ ...form, title: v })} testId="cal-form-title" />
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-slate-500">Description</span>
            <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              data-testid="cal-form-desc" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
          </label>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <TF label="Duration (min) *" type="number" v={form.duration_minutes} on={(v) => setForm({ ...form, duration_minutes: parseInt(v) || 30 })} testId="cal-form-dur" />
            <TF label="Buffer (min)" type="number" v={form.buffer_minutes} on={(v) => setForm({ ...form, buffer_minutes: parseInt(v) || 0 })} testId="cal-form-buf" />
            <TF label="Advance days" type="number" v={form.advance_days} on={(v) => setForm({ ...form, advance_days: parseInt(v) || 21 })} testId="cal-form-adv" />
            <TF label="Min notice (min)" type="number" v={form.min_notice_minutes} on={(v) => setForm({ ...form, min_notice_minutes: parseInt(v) || 60 })} testId="cal-form-not" />
          </div>
          <TF label="Timezone" v={form.timezone_name} on={(v) => setForm({ ...form, timezone_name: v })} testId="cal-form-tz" />

          <label className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
            <input type="checkbox" checked={!!form.featured} onChange={(e) => setForm({ ...form, featured: e.target.checked })}
              data-testid="cal-form-featured" />
            <span><b>Feature on public contact page</b> — guests can book without logging in.</span>
          </label>

          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Working days &amp; hours</div>
            <div className="mt-2 grid grid-cols-1 gap-2">
              {DOW.map((d, i) => {
                const w = form.working_hours.find((h) => h.day_of_week === i);
                return (
                  <div key={d} className="flex items-center gap-2">
                    <button onClick={() => toggleDay(i)} data-testid={`cal-form-day-${i}`}
                      className={`w-12 rounded-full px-2 py-1 text-[10px] font-bold ${w ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                      {d}
                    </button>
                    {w && (
                      <>
                        <input type="time" value={w.start} onChange={(e) => setDayTime(i, "start", e.target.value)}
                          data-testid={`cal-form-start-${i}`}
                          className="rounded border border-slate-200 px-2 py-1 text-xs" />
                        <span className="text-xs text-slate-400">→</span>
                        <input type="time" value={w.end} onChange={(e) => setDayTime(i, "end", e.target.value)}
                          data-testid={`cal-form-end-${i}`}
                          className="rounded border border-slate-200 px-2 py-1 text-xs" />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <button onClick={save} disabled={busy} data-testid="cal-form-save"
            className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#F97316] to-[#EA580C] py-3 text-sm font-bold text-white disabled:opacity-60">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {isNew ? "Create" : "Save"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function TF({ label, v, on, type = "text", testId }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</span>
      <input type={type} value={v} onChange={(e) => on(e.target.value)} data-testid={testId}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
    </label>
  );
}
