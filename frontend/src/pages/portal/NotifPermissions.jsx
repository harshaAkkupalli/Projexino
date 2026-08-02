import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Bell, Save, Loader2, Crown, ToggleLeft, ToggleRight, Search, X, Plus, Lock,
} from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

const ROLE_OPTIONS = ["super_admin", "admin", "manager", "hr", "team_member", "intern"];

export default function NotifPermissions() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [rules, setRules] = useState({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");

  const load = async () => {
    try {
      const { data } = await api.get("/notif-permissions");
      setData(data);
      // Ensure every known event has a rule entry
      const base = {};
      data.events.forEach((e) => {
        base[e.key] = data.rules[e.key] || { roles: [], users: [], active: true };
      });
      setRules(base);
      setDirty(false);
    } catch { toast.error("Failed to load"); }
  };
  useEffect(() => { load(); }, []);

  const events = useMemo(() => {
    if (!data) return [];
    return data.events.filter(
      (e) => e.label.toLowerCase().includes(query.toLowerCase()) || e.key.includes(query.toLowerCase())
    );
  }, [data, query]);

  if (user?.role !== "super_admin") {
    return (
      <div data-testid="np-blocked" className="rounded-2xl border border-rose-200 bg-rose-50 p-10 text-center">
        <Lock size={32} className="mx-auto mb-2 text-rose-500" />
        <div className="font-bold text-rose-700">Super Admin only</div>
        <div className="mt-1 text-xs text-rose-600">Only the Super Admin can manage notification permissions.</div>
      </div>
    );
  }

  if (!data) return <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />;

  const toggleRole = (eventKey, role) => {
    const cur = rules[eventKey] || { roles: [], users: [], active: true };
    const inList = cur.roles.includes(role);
    const next = { ...cur, roles: inList ? cur.roles.filter((r) => r !== role) : [...cur.roles, role] };
    setRules({ ...rules, [eventKey]: next });
    setDirty(true);
  };
  const toggleUser = (eventKey, userId) => {
    const cur = rules[eventKey] || { roles: [], users: [], active: true };
    const inList = cur.users.includes(userId);
    const next = { ...cur, users: inList ? cur.users.filter((u) => u !== userId) : [...cur.users, userId] };
    setRules({ ...rules, [eventKey]: next });
    setDirty(true);
  };
  const toggleActive = (eventKey) => {
    const cur = rules[eventKey] || { roles: [], users: [], active: true };
    setRules({ ...rules, [eventKey]: { ...cur, active: !cur.active } });
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/notif-permissions", { rules });
      toast.success("Rules saved");
      setDirty(false);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Save failed"); }
    finally { setSaving(false); }
  };

  // Group events by category
  const grouped = events.reduce((m, e) => {
    (m[e.category] = m[e.category] || []).push(e);
    return m;
  }, {});

  return (
    <div data-testid="page-notif-permissions" className="space-y-5">
      {/* Hero */}
      <div className="rounded-3xl border border-indigo-100 bg-gradient-to-br from-white via-indigo-50/40 to-violet-50/40 p-5 md:p-7">
        <div className="text-[10px] font-bold uppercase tracking-[0.32em] text-indigo-600">// notifications · permissions</div>
        <h1 className="font-display mt-1 text-3xl font-medium text-[#0F2042] md:text-4xl">Notification Permissions</h1>
        <p className="mt-1 text-sm text-slate-600">
          For every event, decide which <b>roles</b> and which <b>specific users</b> are notified.
          <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
            <Crown size={10} /> Super admins are always notified
          </span>
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-full bg-white px-3 py-1.5 ring-1 ring-slate-200">
            <Search size={12} className="text-slate-400" />
            <input data-testid="np-search" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter events..."
              className="w-full bg-transparent text-xs outline-none" />
          </div>
          <button onClick={save} disabled={!dirty || saving} data-testid="np-save"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#F97316] to-[#EA580C] px-5 py-1.5 text-xs font-bold text-white shadow disabled:opacity-50">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save rules
          </button>
        </div>
      </div>

      {/* Grouped event rows */}
      {Object.entries(grouped).map(([cat, evs]) => (
        <div key={cat} className="space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#F97316]">// {cat}</div>
          <div className="space-y-2">
            {evs.map((ev) => {
              const r = rules[ev.key] || { roles: [], users: [], active: true };
              return (
                <motion.div key={ev.key} layout data-testid={`np-row-${ev.key}`}
                  className={`rounded-2xl border bg-white p-4 shadow-sm transition ${r.active ? "border-slate-200" : "border-slate-200 bg-slate-50 opacity-70"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-[#0F2042]">{ev.label}</div>
                      <div className="text-[10px] text-slate-400">{ev.key}</div>
                    </div>
                    <button onClick={() => toggleActive(ev.key)} data-testid={`np-active-${ev.key}`}
                      className={`flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold ${r.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>
                      {r.active ? <><ToggleRight size={12} /> Active</> : <><ToggleLeft size={12} /> Disabled</>}
                    </button>
                  </div>
                  <div className="mt-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Notify roles</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {ROLE_OPTIONS.map((role) => {
                        const on = r.roles.includes(role);
                        const isSA = role === "super_admin";
                        return (
                          <button key={role} disabled={!r.active || isSA}
                            data-testid={`np-role-${ev.key}-${role}`}
                            onClick={() => toggleRole(ev.key, role)}
                            className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition ${
                              isSA ? "bg-amber-100 text-amber-700 ring-1 ring-amber-300"
                                : on ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                            }`}>
                            {isSA && <Crown size={9} className="-mt-0.5 mr-0.5 inline" />}
                            {role.replace("_", " ")} {isSA ? "(always)" : ""}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Specific users ({r.users.length})</div>
                    <UserPicker users={data.users} selected={r.users}
                      onToggle={(uid) => toggleUser(ev.key, uid)} disabled={!r.active}
                      testIdPrefix={`np-user-${ev.key}`} />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function UserPicker({ users, selected, onToggle, disabled, testIdPrefix }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const list = users.filter((u) => !q || (u.name + " " + u.email).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="mt-1">
      <div className="flex flex-wrap gap-1.5">
        {selected.map((uid) => {
          const u = users.find((x) => x.id === uid);
          if (!u) return null;
          return (
            <span key={uid} className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
              {u.name} <button onClick={() => onToggle(uid)} disabled={disabled}><X size={9} /></button>
            </span>
          );
        })}
        <button onClick={() => setOpen(!open)} disabled={disabled}
          data-testid={`${testIdPrefix}-add`}
          className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200 hover:ring-indigo-400 disabled:opacity-40">
          <Plus size={10} /> Add user
        </button>
      </div>
      {open && (
        <div className="mt-2 rounded-xl border border-slate-200 bg-white p-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search…"
            className="mb-1 w-full rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-indigo-400" />
          <div className="max-h-40 overflow-y-auto">
            {list.map((u) => (
              <button key={u.id} onClick={() => onToggle(u.id)}
                data-testid={`${testIdPrefix}-pick-${u.email}`}
                className={`flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-xs hover:bg-indigo-50 ${selected.includes(u.id) ? "bg-indigo-50" : ""}`}>
                <span><b>{u.name}</b> <span className="text-slate-500">· {u.email}</span></span>
                <span className="text-[9px] uppercase text-slate-400">{u.role}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
