/**
 * Leave.jsx — Iter 37 · Leave / PTO workspace
 *
 * Tabs:
 *   • My Leave    — balance tile, submit modal, my requests timeline
 *   • Approvals   — pending requests across the org (manager / admin / HR)
 *   • Policies    — annual allowance matrix (admin only)
 *
 * Backed by /api/leave/* endpoints.
 */
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar, CalendarDays, Plus, Loader2, X, CheckCircle2, XCircle,
  Hourglass, Plane, ThermometerSnowflake, Briefcase, Coffee,
  ThumbsUp, ThumbsDown, AlertTriangle, Settings, Wallet, Trash2,
} from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";

const PRIV_ROLES = new Set(["super_admin", "admin", "manager", "hr"]);
const LEAVE_TYPES = [
  { key: "pto", label: "PTO", color: "violet", icon: Plane },
  { key: "sick", label: "Sick", color: "rose", icon: ThermometerSnowflake },
  { key: "casual", label: "Casual", color: "amber", icon: Coffee },
  { key: "unpaid", label: "Unpaid", color: "slate", icon: Briefcase },
];

const STATUS_BADGE = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-rose-100 text-rose-700",
};

export default function Leave() {
  const [tab, setTab] = useState("my");
  const [me, setMe] = useState(null);
  useEffect(() => { api.get("/auth/me").then(({ data }) => setMe(data)).catch(() => {}); }, []);
  const isPriv = me && PRIV_ROLES.has(me.role);
  const tabs = [
    { v: "my", label: "My Leave", icon: Calendar },
    ...(isPriv ? [{ v: "approvals", label: "Approvals Queue", icon: Hourglass }] : []),
    ...(me?.role === "super_admin" || me?.role === "admin" ? [{ v: "policy", label: "Policies", icon: Settings }] : []),
  ];
  return (
    <div className="space-y-5" data-testid="page-leave">
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-orange-50/30 to-violet-50/30 p-6 md:p-7 shadow-sm">
        <div className="text-[10px] font-bold uppercase tracking-[0.32em] text-[#F97316]">// people · time-off</div>
        <h1 className="font-display mt-1 text-3xl font-medium text-[#0F2042] md:text-4xl">Leave &amp; Time-Off</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Request PTO, sick or casual leave. Manager approval decrements your balance and marks the days as out-of-office —
          which auto-blocks new task assignments during that window.
        </p>
        <div className="relative mt-5 inline-flex flex-wrap gap-1 rounded-full bg-white p-1 shadow-sm ring-1 ring-slate-200">
          {tabs.map((t) => (
            <button key={t.v} onClick={() => setTab(t.v)} data-testid={`leave-tab-${t.v}`}
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition ${tab === t.v ? "bg-[#0F2042] text-white shadow" : "text-slate-500 hover:text-[#0F2042]"}`}>
              <t.icon size={12}/> {t.label}
            </button>
          ))}
        </div>
      </div>
      {tab === "my" && <MyLeaveTab me={me}/>}
      {tab === "approvals" && <ApprovalsTab/>}
      {tab === "policy" && <PolicyTab/>}
    </div>
  );
}

/* ============== MY LEAVE ============== */
function MyLeaveTab({ me }) {
  const [bal, setBal] = useState(null);
  const [mine, setMine] = useState([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [b, m] = await Promise.all([
        api.get("/leave/balance"),
        api.get("/leave/requests"),
      ]);
      setBal(b.data); setMine(m.data || []);
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail) || "Load failed"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const withdraw = async (r) => {
    if (!window.confirm(`Withdraw your ${r.leave_type.toUpperCase()} request for ${r.days} day(s)?`)) return;
    try {
      await api.delete(`/leave/requests/${r.id}`);
      toast.success("Withdrawn — balance restored if previously approved");
      load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail) || "Withdraw failed"); }
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-[#F97316]"/></div>;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {LEAVE_TYPES.map((lt) => {
          const allowance = bal?.allowance?.[lt.key] ?? 0;
          const remaining = bal?.remaining?.[lt.key] ?? 0;
          const consumed = bal?.consumed?.[lt.key] ?? 0;
          return (
            <div key={lt.key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid={`bal-card-${lt.key}`}>
              <div className="flex items-center justify-between">
                <div className={`rounded-xl p-2 bg-${lt.color}-50 text-${lt.color}-700`}><lt.icon size={18}/></div>
                <span className="font-mono-pj text-[10px] uppercase text-slate-500">{lt.label}</span>
              </div>
              <div className="mt-3 font-display text-3xl font-bold text-[#0F2042]" data-testid={`bal-${lt.key}-remaining`}>
                {remaining}<span className="text-base text-slate-400"> / {allowance}</span>
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">{consumed} consumed · {remaining} remaining</div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-end">
        <button onClick={() => setShow(true)} className="btn-primary text-xs" data-testid="leave-new"><Plus size={14}/> Request leave</button>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="text-[10px] font-bold uppercase tracking-wider text-[#F97316]">// my requests</div>
        {mine.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">No requests yet.</div>
        ) : (
          <ul className="mt-3 space-y-2">
            {mine.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3" data-testid={`req-row-${r.id}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold uppercase text-[#0F2042]">{r.leave_type}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_BADGE[r.status]}`}>{r.status}</span>
                    <span className="text-[11px] text-slate-500">{r.days} day(s) · {r.start_date} → {r.end_date}</span>
                  </div>
                  {r.reason && <div className="mt-0.5 truncate text-[11px] text-slate-500">📝 {r.reason}</div>}
                  {r.decision_reason && r.status === "rejected" && (
                    <div className="mt-0.5 text-[11px] text-rose-600">↪ {r.decision_reason}</div>
                  )}
                </div>
                {r.status === "pending" && (
                  <button onClick={() => withdraw(r)} className="rounded border border-slate-200 p-1 text-rose-500 hover:bg-rose-50" data-testid={`req-withdraw-${r.id}`} title="Withdraw"><Trash2 size={12}/></button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {show && <NewRequestModal bal={bal} onClose={() => setShow(false)} onSaved={load} />}
    </div>
  );
}

function NewRequestModal({ bal, onClose, onSaved }) {
  const [leaveType, setLeaveType] = useState("pto");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const days = useMemo(() => {
    if (!start || !end) return 0;
    const s = new Date(start), e = new Date(end);
    if (e < s) return 0;
    return Math.floor((e - s) / 86400000) + 1;
  }, [start, end]);

  const remaining = bal?.remaining?.[leaveType] ?? 0;
  const overAllocated = leaveType !== "unpaid" && days > remaining;
  const errorText = overAllocated
    ? `Error: Insufficient leave balance. You only have ${remaining} day${remaining === 1 ? "" : "s"} remaining.`
    : "";

  const submit = async () => {
    if (overAllocated) return;
    if (!start || !end || days < 1) { toast.error("Pick a valid date range"); return; }
    setBusy(true);
    try {
      await api.post("/leave/requests", { leave_type: leaveType, start_date: start, end_date: end, reason });
      toast.success("Request submitted — manager has been notified");
      onSaved(); onClose();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Submit failed");
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" data-testid="leave-modal">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h3 className="font-display text-base font-semibold text-[#0F2042]">Request leave</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100"><X size={16}/></button>
        </div>
        <div className="space-y-3 p-5">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Type</label>
            <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)}
              data-testid="leave-type"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
              {LEAVE_TYPES.map((lt) => (
                <option key={lt.key} value={lt.key}>{lt.label} — {bal?.remaining?.[lt.key] ?? 0} day(s) remaining</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Start</label>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)}
                data-testid="leave-start"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"/>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">End</label>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)}
                data-testid="leave-end"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"/>
            </div>
          </div>
          {days > 0 && (
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${overAllocated ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`} data-testid="leave-day-counter">
              {overAllocated ? <AlertTriangle size={12}/> : <CheckCircle2 size={12}/>}
              <span><b>{days}</b> day{days === 1 ? "" : "s"} requested · {remaining} remaining</span>
            </div>
          )}
          {errorText && <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700" data-testid="leave-error">{errorText}</div>}
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Reason (optional)"
            data-testid="leave-reason"
            className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs outline-none focus:border-[#F97316]"/>
          <button onClick={submit} disabled={busy || days < 1 || overAllocated}
            data-testid="leave-submit"
            className="w-full rounded-xl bg-gradient-to-r from-[#F97316] to-[#FB923C] py-2 text-sm font-bold text-white shadow disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? <Loader2 size={14} className="inline animate-spin"/> : "Submit request"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ============== APPROVALS (manager / admin / hr) ============== */
function ApprovalsTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rejectFor, setRejectFor] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/leave/requests", { params: { status: "pending" } });
      setItems(data || []);
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail) || "Load failed"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const approve = async (r) => {
    try {
      const { data } = await api.post(`/leave/requests/${r.id}/approve`);
      toast.success(`Approved · ${data.ooo_days_logged} OOO day(s) logged`);
      load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail) || "Approve failed"); }
  };
  const reject = async () => {
    if (!rejectReason.trim()) { toast.error("Add a reason"); return; }
    try {
      await api.post(`/leave/requests/${rejectFor.id}/reject`, { reason: rejectReason.trim() });
      toast.success("Rejected · employee notified");
      setRejectFor(null); setRejectReason(""); load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail) || "Reject failed"); }
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-[#F97316]"/></div>;
  return (
    <div className="space-y-3" data-testid="leave-approvals">
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center text-sm text-slate-500">No pending leave requests.</div>
      ) : items.map((r) => (
        <div key={r.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid={`approval-row-${r.id}`}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="font-display text-base font-semibold text-[#0F2042]">
                {r.employee.name || r.employee.email}
                <span className="ml-2 text-[10px] uppercase tracking-wider text-slate-500">{r.employee.role}</span>
              </div>
              <div className="text-xs text-slate-600">
                <b>{r.days}</b> day(s) {r.leave_type.toUpperCase()} · {r.start_date} → {r.end_date}
              </div>
              {r.reason && <div className="mt-1 text-[11px] text-slate-500">📝 {r.reason}</div>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setRejectFor(r)} className="inline-flex items-center gap-1 rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50" data-testid={`approval-reject-${r.id}`}>
                <ThumbsDown size={12}/> Reject
              </button>
              <button onClick={() => approve(r)} className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700" data-testid={`approval-approve-${r.id}`}>
                <ThumbsUp size={12}/> Approve
              </button>
            </div>
          </div>
        </div>
      ))}
      <AnimatePresence>
        {rejectFor && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" onClick={() => setRejectFor(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" data-testid="reject-modal">
              <h3 className="font-display text-base font-semibold text-[#0F2042]">Reject leave request</h3>
              <p className="mt-1 text-xs text-slate-500">Tell {rejectFor.employee.name || rejectFor.employee.email} why their {rejectFor.days}-day {rejectFor.leave_type.toUpperCase()} request is being declined.</p>
              <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} placeholder="e.g. Conflicts with sprint demo — please pick a later date"
                data-testid="reject-reason-input"
                className="mt-3 w-full rounded-xl border border-slate-200 p-2 text-xs outline-none focus:border-rose-400"/>
              <button onClick={reject} disabled={!rejectReason.trim()} data-testid="reject-submit"
                className="mt-3 w-full rounded-xl bg-rose-600 py-2 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50">
                Send rejection
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ============== POLICIES (admin) ============== */
function PolicyTab() {
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/leave/policies");
      setData(data); setDraft(data.matrix);
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail) || "Load failed"); }
  };
  useEffect(() => { load(); }, []);

  const setVal = (role, type, v) => {
    setDraft((p) => ({ ...p, [role]: { ...(p[role] || {}), [type]: Math.max(0, parseInt(v || "0", 10) || 0) } }));
  };
  const save = async () => {
    setBusy(true);
    try {
      await api.put("/leave/policies", { matrix: draft });
      toast.success("Policies updated — applies to new accounts. Use /leave/balance/seed to retroactively reset existing balances.");
      load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail) || "Save failed"); }
    setBusy(false);
  };

  if (!data) return <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-[#F97316]"/></div>;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5" data-testid="leave-policy">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#F97316]">// annual allowances</div>
          <h3 className="font-display text-base font-semibold text-[#0F2042]">Days per role per leave type</h3>
        </div>
        <button onClick={save} disabled={busy} className="btn-primary text-xs" data-testid="policy-save">
          {busy ? <Loader2 size={12} className="animate-spin"/> : <Wallet size={12}/>} Save policy
        </button>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-sm">
          <thead className="text-left text-[10px] uppercase tracking-wider text-slate-500">
            <tr><th className="py-2">Role</th>{LEAVE_TYPES.map((lt) => <th key={lt.key} className="py-2">{lt.label}</th>)}</tr>
          </thead>
          <tbody>
            {data.roles.map((r) => (
              <tr key={r} className="border-t border-slate-100">
                <td className="py-2 font-bold uppercase text-[#0F2042]">{r}</td>
                {LEAVE_TYPES.map((lt) => (
                  <td key={lt.key} className="py-1 pr-3">
                    <input type="number" min={0} value={draft?.[r]?.[lt.key] ?? 0}
                      onChange={(e) => setVal(r, lt.key, e.target.value)}
                      data-testid={`policy-${r}-${lt.key}`}
                      className="w-20 rounded border border-slate-200 px-2 py-1 text-sm"/>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
