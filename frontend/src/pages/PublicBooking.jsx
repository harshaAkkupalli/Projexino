import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import axios from "axios";
import { Calendar, Clock, User, CheckCircle2, Loader2, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

const PUBLIC = axios.create({ baseURL: `${process.env.REACT_APP_BACKEND_URL}/api` });

export default function PublicBooking() {
  const { slug } = useParams();
  const [page, setPage] = useState(null);
  const [error, setError] = useState("");
  const [day, setDay] = useState(() => new Date());
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [picked, setPicked] = useState(null);
  const [form, setForm] = useState({ guest_name: "", guest_email: "", guest_phone: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(null);

  useEffect(() => {
    PUBLIC.get(`/booking/pages/${slug}/public`).then(({ data }) => setPage(data))
      .catch(() => setError("Booking page not found or archived."));
  }, [slug]);

  useEffect(() => {
    if (!page) return;
    setLoadingSlots(true); setPicked(null);
    const d = day.toISOString().slice(0, 10);
    PUBLIC.get(`/booking/pages/${slug}/slots`, { params: { date: d } })
      .then(({ data }) => setSlots(data.slots || []))
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [day, page, slug]);

  const submit = async () => {
    if (!picked || !form.guest_name || !form.guest_email) { toast.error("Pick a slot + fill required fields"); return; }
    setBusy(true);
    try {
      const { data } = await PUBLIC.post(`/booking/pages/${slug}/book`, { ...form, slot_iso: picked });
      setConfirmed({ ...data, slot_iso: picked });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Booking failed");
    } finally { setBusy(false); }
  };

  if (error) return (
    <Shell><div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
      <AlertTriangle size={32} className="mx-auto text-rose-500" />
      <div className="mt-2 font-bold text-rose-700">{error}</div>
    </div></Shell>
  );
  if (!page) return <Shell><div className="h-64 animate-pulse rounded-2xl bg-slate-100" /></Shell>;

  if (confirmed) return (
    <Shell color={page.color}>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl bg-white p-8 text-center shadow-2xl ring-1 ring-emerald-200">
        <CheckCircle2 size={48} className="mx-auto text-emerald-600" />
        <h2 className="font-display mt-3 text-3xl font-medium text-[#0F2042]">You're booked!</h2>
        <p className="mt-1 text-sm text-slate-600">A confirmation has been emailed to <b>{form.guest_email}</b>.</p>
        <div className="mt-4 rounded-xl bg-slate-50 p-4 text-left">
          <div className="text-xs text-slate-500">{page.title} with {page.owner_name}</div>
          <div className="font-bold text-[#0F2042]">{new Date(confirmed.slot_iso).toLocaleString()}</div>
          <div className="text-xs text-slate-500">{page.duration_minutes} minutes</div>
          {confirmed.meet_link && <a href={confirmed.meet_link} target="_blank" rel="noreferrer"
            className="mt-2 inline-block text-xs font-bold text-emerald-700 underline">Open Google Meet ↗</a>}
        </div>
      </motion.div>
    </Shell>
  );

  return (
    <Shell color={page.color}>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[1fr_1.5fr]">
        {/* Left side — page info */}
        <div className="rounded-3xl bg-white p-6 shadow-2xl">
          <div className="text-[10px] font-bold uppercase tracking-[0.32em]" style={{ color: page.color }}>// book a meeting</div>
          <h1 className="font-display mt-1 text-3xl font-medium text-[#0F2042]">{page.title}</h1>
          <div className="mt-1 text-sm text-slate-600">{page.description}</div>
          <div className="mt-4 space-y-2 text-xs">
            <div className="flex items-center gap-2 text-slate-600"><User size={12} /> {page.owner_name}</div>
            <div className="flex items-center gap-2 text-slate-600"><Clock size={12} /> {page.duration_minutes} minutes</div>
            <div className="flex items-center gap-2 text-slate-600"><Calendar size={12} /> {page.timezone_name}</div>
          </div>
        </div>

        {/* Right side — calendar + slots + form */}
        <div className="rounded-3xl bg-white p-6 shadow-2xl">
          {!picked ? (
            <>
              <div className="flex items-center justify-between">
                <button onClick={() => setDay(new Date(day.getTime() - 86400000))} className="rounded-full bg-slate-100 p-1.5"><ChevronLeft size={14} /></button>
                <div className="font-bold text-[#0F2042]">{day.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</div>
                <button onClick={() => setDay(new Date(day.getTime() + 86400000))} className="rounded-full bg-slate-100 p-1.5"><ChevronRight size={14} /></button>
              </div>
              <input type="date" value={day.toISOString().slice(0, 10)} onChange={(e) => setDay(new Date(e.target.value))}
                data-testid="public-book-date"
                className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
              <div className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Available times</div>
              {loadingSlots ? (
                <div className="mt-2 grid grid-cols-3 gap-2">{[...Array(6)].map((_, i) => <div key={i} className="h-9 animate-pulse rounded-lg bg-slate-100" />)}</div>
              ) : slots.length === 0 ? (
                <div className="mt-4 rounded-xl bg-amber-50 p-3 text-center text-xs text-amber-700">No slots on this day. Try another date.</div>
              ) : (
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {slots.map((s) => (
                    <button key={s} onClick={() => setPicked(s)} data-testid={`public-slot-${s}`}
                      className="rounded-lg border-2 border-slate-200 px-2 py-2 text-xs font-bold text-[#0F2042] transition hover:border-[#F97316] hover:bg-orange-50">
                      {new Date(s).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <button onClick={() => setPicked(null)} className="mb-3 inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-[#0F2042]"><ChevronLeft size={12} /> pick another time</button>
              <div className="rounded-xl bg-orange-50 p-3 text-sm">
                <div className="font-bold text-[#0F2042]">{new Date(picked).toLocaleString()}</div>
                <div className="text-xs text-slate-500">{page.duration_minutes} min · {page.timezone_name}</div>
              </div>
              <div className="mt-3 space-y-2">
                <PubField label="Your full name *" v={form.guest_name} on={(v) => setForm({ ...form, guest_name: v })} testId="public-guest-name" />
                <PubField label="Email *" v={form.guest_email} on={(v) => setForm({ ...form, guest_email: v })} type="email" testId="public-guest-email" />
                <PubField label="Phone (optional)" v={form.guest_phone} on={(v) => setForm({ ...form, guest_phone: v })} testId="public-guest-phone" />
                <label className="block">
                  <span className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-slate-500">Notes (optional)</span>
                  <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    data-testid="public-guest-notes"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
                </label>
                <button onClick={submit} disabled={busy} data-testid="public-book-submit"
                  className="flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-bold text-white shadow disabled:opacity-60"
                  style={{ background: `linear-gradient(135deg, ${page.color}, #EA580C)` }}>
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Confirm booking
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children, color = "#F97316" }) {
  return (
    <div className="min-h-screen p-5"
      style={{ background: `linear-gradient(135deg, #0F2042 0%, ${color} 100%)` }}>
      <div className="mx-auto max-w-5xl py-10">
        <div className="mb-6 text-center text-white">
          <div className="text-[10px] font-bold uppercase tracking-[0.32em] opacity-80">// projexino · scheduling</div>
          <div className="font-display text-2xl">Book a meeting</div>
        </div>
        {children}
      </div>
    </div>
  );
}

function PubField({ label, v, on, type = "text", testId }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</span>
      <input type={type} value={v} onChange={(e) => on(e.target.value)} data-testid={testId}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
    </label>
  );
}
