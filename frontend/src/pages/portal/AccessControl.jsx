import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, UserPlus, Users, Star, Trash2, Crown, RefreshCw, Save, X, Mail, Loader2,
  Check, CheckCheck, Lock, KeyRound, Sliders,
} from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { refreshPermissions } from "@/hooks/usePermissions";

const ROLE_LABELS = {
  super_admin: "Super Admin",
  admin: "Admin",
  manager: "Manager",
  hr: "HR",
  developer: "Developer",
  qa: "QA",
  cloud_admin: "Cloud Admin",
  intern: "Intern",
  team_member: "Team Member (legacy)",
};
// 7 roles surfaced as login cards. Super Admin is seeded-only.
const ASSIGNABLE_ROLE_OPTIONS = [
  { v: "admin", label: "Admin" },
  { v: "hr", label: "HR" },
  { v: "manager", label: "Manager" },
  { v: "developer", label: "Developer" },
  { v: "qa", label: "QA" },
  { v: "cloud_admin", label: "Cloud Admin" },
  { v: "intern", label: "Intern" },
];
const ACTION_LABELS = { view: "View", create: "Create", edit: "Edit", delete: "Delete" };
const MODULE_GROUPS = [
  { label: "Core", mods: ["dashboard", "projects", "tasks", "chat", "ai", "documents", "profile"] },
  { label: "People", mods: ["team", "interns", "manager", "badges", "leads"] },
  { label: "Growth", mods: ["outreach", "newsletter", "blog", "linkedin"] },
  { label: "Operations", mods: ["finance", "issues", "presence", "email-campaigns", "email-templates", "email", "calendly", "org-chart"] },
  { label: "HR Module", mods: ["hr", "hr-regulations", "hr-payslips", "hr-audit", "hr-expenses", "hr-documents", "doc-verification"] },
  { label: "Admin", mods: ["settings", "access-control", "notifications-permissions", "ai-settings", "website-config"] },
];

const TABS = [
  { v: "admins",  label: "Admins & Roles", icon: Users },
  { v: "matrix",  label: "Permission Matrix", icon: Sliders },
];

export default function AccessControl() {
  const { user } = useAuth();
  const [tab, setTab] = useState("admins");

  if (user?.role !== "super_admin") {
    return (
      <div data-testid="acl-blocked" className="rounded-2xl border border-rose-200 bg-rose-50 p-10 text-center">
        <Lock size={32} className="mx-auto mb-2 text-rose-500" />
        <div className="font-display text-xl font-semibold text-rose-700">Super Admin only</div>
        <div className="mt-1 text-sm text-rose-600">Only the Super Admin can manage access control.</div>
      </div>
    );
  }

  return (
    <div data-testid="page-access-control" className="space-y-5">
      {/* Hero */}
      <div className="rounded-3xl border border-indigo-100 bg-gradient-to-br from-white via-indigo-50/40 to-violet-50/40 p-5 md:p-7">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.32em] text-indigo-600">// rbac · phase a</div>
            <h1 className="font-display mt-1 text-3xl font-medium text-[#0F2042] md:text-4xl">Access Control</h1>
            <p className="mt-1 text-sm text-slate-600">Create admins, assign roles, and decide which role can see &amp; do what in every module.</p>
          </div>
        </div>
        {/* Tabs */}
        <div className="mt-5 inline-flex rounded-full bg-white p-1 shadow-sm ring-1 ring-slate-200">
          {TABS.map((t) => (
            <button
              key={t.v}
              data-testid={`acl-tab-${t.v}`}
              onClick={() => setTab(t.v)}
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition ${
                tab === t.v ? "bg-[#0F2042] text-white shadow" : "text-slate-500 hover:text-[#0F2042]"
              }`}
            >
              <t.icon size={12} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "admins" ? <AdminsTab /> : <MatrixTab />}
    </div>
  );
}

// =============== TAB 1 — Admins & Roles ===============
export function AdminsTab({ canCreate = true } = {}) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editor, setEditor] = useState(null);

  const fetch = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/rbac/admins");
      setList(data);
    } catch (e) {
      toast.error("Failed to load admins");
    } finally { setLoading(false); }
  };
  useEffect(() => { fetch(); }, []);

  const primaryId = list.find((a) => a.is_primary_super_admin)?.id;

  const promote = async (id) => {
    if (!window.confirm("Promote this admin to PRIMARY Super Admin? The current primary will become secondary.")) return;
    try {
      await api.post(`/rbac/admins/${id}/promote-primary`);
      toast.success("Primary super admin updated");
      fetch();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Failed"); }
  };

  const remove = async (a) => {
    if (a.is_primary_super_admin) return toast.error("Cannot delete the primary super admin");
    if (!window.confirm(`Permanently delete ${a.email}?`)) return;
    try {
      await api.delete(`/rbac/admins/${a.id}`);
      toast.success("Admin removed");
      fetch();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Failed"); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="text-sm text-slate-600">
          <b>{list.length}</b> team account{list.length !== 1 ? "s" : ""} · primary super admin has unrevokable full access
        </div>
        <button
          data-testid="acl-new-admin"
          onClick={() => setCreating(true)}
          disabled={!canCreate}
          title={canCreate ? "Add a new team member" : "Add new team members from the HR module → Team Access tab"}
          className={`flex items-center gap-2 self-start rounded-full px-5 py-2.5 text-sm font-bold text-white shadow-lg active:scale-95 ${canCreate ? "bg-gradient-to-r from-[#F97316] to-[#EA580C] shadow-orange-200" : "cursor-not-allowed bg-slate-300 shadow-none"}`}
        >
          <UserPlus size={16} /> Add team member
        </button>
      </div>

      {!canCreate && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" data-testid="acl-read-only-hint">
          You can review and edit existing accounts here. <b>New team members are now added from HR → Team Access.</b>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {[...Array(3)].map((_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {list.map((a) => (
            <motion.div
              key={a.id}
              layout
              data-testid={`acl-admin-${a.email}`}
              className={`relative overflow-hidden rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                a.is_primary_super_admin ? "border-amber-300 ring-2 ring-amber-200" : "border-slate-200"
              }`}
            >
              {a.is_primary_super_admin && (
                <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-400 to-amber-600 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow">
                  <Crown size={10} /> Primary
                </div>
              )}
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#0F2042] to-[#7C3AED] text-lg font-bold text-white">
                  {(a.name || a.email).slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-[#0F2042]">{a.name || <span className="text-red-500">— missing name</span>}</div>
                  <div className="truncate text-xs text-slate-500">{a.email}</div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider">
                <span className={`rounded-full px-2 py-0.5 ${
                  a.role === "super_admin" ? "bg-violet-100 text-violet-700"
                  : a.role === "team_member" ? "bg-amber-100 text-amber-700"
                  : "bg-slate-100 text-slate-600"
                }`}>
                  {ROLE_LABELS[a.role] || a.role}
                </span>
                {a.role === "team_member" && (
                  <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] text-amber-700" title="Legacy role — edit to reassign to Developer/QA/Cloud Admin">⚠ legacy</span>
                )}
                {a.designation && <span className="text-slate-400 normal-case">{a.designation}</span>}
              </div>
              <div className="mt-2 space-y-1 text-[11px] text-slate-500">
                <div>
                  <span className="font-semibold text-slate-400">Reports to:</span>{" "}
                  {a.reporting_manager_name
                    ? <span className="text-slate-700">{a.reporting_manager_name}</span>
                    : <span className="font-semibold text-rose-500">— not set</span>}
                  {a.route_comms_to_manager && (
                    <span className="ml-1 rounded-full bg-emerald-50 px-1.5 py-0 text-[9px] font-bold uppercase text-emerald-700">CC</span>
                  )}
                </div>
                <div>
                  <span className="font-semibold text-slate-400">Added by:</span>{" "}
                  {a.created_by_name || a.created_by || <span className="text-rose-500">— unknown</span>}
                </div>
                <div>
                  <span className="font-semibold text-slate-400">Added at:</span>{" "}
                  {a.created_at ? new Date(a.created_at).toLocaleString() : <span className="text-rose-500">— unknown</span>}
                </div>
              </div>
              <div className="mt-3 flex gap-1.5 border-t border-slate-100 pt-3">
                <button
                  onClick={() => setEditor(a)}
                  data-testid={`acl-edit-${a.email}`}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-100 px-2 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-200"
                >Edit</button>
                {!a.is_primary_super_admin && (
                  <button
                    onClick={() => promote(a.id)}
                    data-testid={`acl-promote-${a.email}`}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] font-bold text-amber-700 hover:bg-amber-100"
                  ><Star size={11} /> Set primary</button>
                )}
                {!a.is_primary_super_admin && a.id !== primaryId && (
                  <button
                    onClick={() => remove(a)}
                    data-testid={`acl-remove-${a.email}`}
                    className="flex h-7 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100"
                  ><Trash2 size={12} /></button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {creating && <CreateAdminModal onClose={() => setCreating(false)} onCreated={() => { setCreating(false); fetch(); }} />}
        {editor && <EditAdminModal admin={editor} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); fetch(); }} />}
      </AnimatePresence>
    </div>
  );
}

// ----- Create Admin Modal -----
function CreateAdminModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    name: "", email: "", password: "", role: "admin", is_primary: false,
    designation: "", phone: "",
    reporting_manager_id: "", route_comms_to_manager: false,
  });
  const [managers, setManagers] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/rbac/admins").then(({ data }) => setManagers(data || [])).catch(() => {});
  }, []);

  const submit = async () => {
    if (!form.email || !form.name || (form.password || "").length < 8) {
      toast.error("Name, valid email, and 8+ character password required");
      return;
    }
    setBusy(true);
    try {
      await api.post("/rbac/admins", form);
      toast.success("Account created — welcome email queued");
      onCreated();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    } finally { setBusy(false); }
  };

  return (
    <ModalShell onClose={onClose} title="Add new team member" subtitle="They'll receive a welcome email with login credentials.">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <TF label="Full name *" v={form.name} on={(v) => setForm({ ...form, name: v })} testId="acl-form-name" />
        <TF label="Email *" v={form.email} on={(v) => setForm({ ...form, email: v })} type="email" testId="acl-form-email" />
        <TF label="Temp password *" v={form.password} on={(v) => setForm({ ...form, password: v })} testId="acl-form-password" placeholder="≥ 8 characters" />
        <TS label="Role *" v={form.role} on={(v) => setForm({ ...form, role: v })} testId="acl-form-role" options={ASSIGNABLE_ROLE_OPTIONS} />
        <TF label="Designation" v={form.designation} on={(v) => setForm({ ...form, designation: v })} testId="acl-form-designation" />
        <TF label="Phone" v={form.phone} on={(v) => setForm({ ...form, phone: v })} testId="acl-form-phone" />
        <TS
          label="Reporting Manager"
          v={form.reporting_manager_id}
          on={(v) => setForm({ ...form, reporting_manager_id: v })}
          testId="acl-form-reporting-manager"
          options={[{ v: "", label: "— None —" },
            ...managers.filter((m) => m.id).map((m) => ({ v: m.id, label: `${m.name} (${m.role || "—"})` }))]}
        />
        <label className="flex items-end gap-2 text-xs">
          <input
            type="checkbox"
            checked={!!form.route_comms_to_manager}
            onChange={(e) => setForm({ ...form, route_comms_to_manager: e.target.checked })}
            data-testid="acl-form-route-comms"
            className="h-4 w-4"
          />
          <span><b>CC reporting manager</b> on every notification &amp; email sent to this person.</span>
        </label>
      </div>
      {form.role === "super_admin" && (
        <label className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs">
          <input type="checkbox" checked={form.is_primary} onChange={(e) => setForm({ ...form, is_primary: e.target.checked })} data-testid="acl-form-primary" />
          <span><b>Make primary super admin.</b> The current primary will become secondary.</span>
        </label>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-full border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
        <button onClick={submit} disabled={busy} data-testid="acl-form-save" className="flex items-center gap-2 rounded-full bg-gradient-to-r from-[#F97316] to-[#EA580C] px-5 py-2 text-xs font-bold text-white shadow disabled:opacity-60">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Create
        </button>
      </div>
    </ModalShell>
  );
}

// ----- Edit Admin Modal -----
function EditAdminModal({ admin, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: admin.name || "",
    role: admin.role,
    is_primary: admin.is_primary_super_admin || false,
    designation: admin.designation || "",
    phone: admin.phone || "",
    location: admin.location || "",
    reporting_manager_id: admin.reporting_manager_id || "",
    route_comms_to_manager: !!admin.route_comms_to_manager,
  });
  const [managers, setManagers] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.get("/rbac/admins").then(({ data }) => setManagers((data || []).filter((m) => m.id !== admin.id))).catch(() => {});
  }, [admin.id]);
  const submit = async () => {
    setBusy(true);
    try {
      await api.patch(`/rbac/admins/${admin.id}`, form);
      toast.success("Admin updated");
      onSaved();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    } finally { setBusy(false); }
  };
  return (
    <ModalShell onClose={onClose} title={`Edit ${admin.email}`} subtitle="Update role, reporting manager, or promote to primary.">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <TF label="Full name" v={form.name} on={(v) => setForm({ ...form, name: v })} testId="acl-edit-name" />
        <TS label="Role" v={form.role} on={(v) => setForm({ ...form, role: v })} testId="acl-edit-role"
          options={admin.role === "super_admin"
            ? [...ASSIGNABLE_ROLE_OPTIONS, { v: "super_admin", label: "Super Admin" }]
            : ASSIGNABLE_ROLE_OPTIONS} />
        <TF label="Designation" v={form.designation} on={(v) => setForm({ ...form, designation: v })} testId="acl-edit-designation" />
        <TF label="Phone" v={form.phone} on={(v) => setForm({ ...form, phone: v })} testId="acl-edit-phone" />
        <TF label="Location" v={form.location} on={(v) => setForm({ ...form, location: v })} testId="acl-edit-location" />
        <TS
          label="Reporting Manager"
          v={form.reporting_manager_id}
          on={(v) => setForm({ ...form, reporting_manager_id: v })}
          testId="acl-edit-reporting-manager"
          options={[{ v: "", label: "— None —" },
            ...managers.map((m) => ({ v: m.id, label: `${m.name} (${m.role || "—"})` }))]}
        />
        <label className="flex items-end gap-2 text-xs md:col-span-2">
          <input
            type="checkbox"
            checked={!!form.route_comms_to_manager}
            onChange={(e) => setForm({ ...form, route_comms_to_manager: e.target.checked })}
            data-testid="acl-edit-route-comms"
            className="h-4 w-4"
          />
          <span><b>CC reporting manager</b> on every notification &amp; email sent to this person.</span>
        </label>
      </div>
      {form.role === "super_admin" && (
        <label className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs">
          <input type="checkbox" checked={form.is_primary} onChange={(e) => setForm({ ...form, is_primary: e.target.checked })} data-testid="acl-edit-primary" />
          <span>Primary super admin (only one allowed)</span>
        </label>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-full border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
        <button onClick={submit} disabled={busy} data-testid="acl-edit-save" className="flex items-center gap-2 rounded-full bg-gradient-to-r from-[#0F2042] to-[#1E3A8A] px-5 py-2 text-xs font-bold text-white shadow disabled:opacity-60">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save changes
        </button>
      </div>
    </ModalShell>
  );
}

// =============== TAB 2 — Matrix ===============
export function MatrixTab() {
  const [data, setData] = useState(null);
  const [matrix, setMatrix] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [dirtyRoles, setDirtyRoles] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [activeRole, setActiveRole] = useState("manager");

  const load = async () => {
    try {
      const { data } = await api.get("/rbac/matrix");
      setData(data); setMatrix(data.matrix); setDirty(false); setDirtyRoles(new Set());
    } catch (e) { toast.error("Failed to load matrix"); }
  };
  useEffect(() => { load(); }, []);

  const markDirty = (role) => {
    setDirtyRoles((p) => new Set(p).add(role));
    setDirty(true);
  };
  const toggle = (role, module, action) => {
    if (role === "super_admin") return;
    const next = { ...matrix, [role]: { ...matrix[role], [module]: { ...matrix[role][module], [action]: !matrix[role][module][action] } } };
    setMatrix(next); markDirty(role);
  };
  const toggleRow = (role, module, on) => {
    if (role === "super_admin") return;
    const cur = matrix[role][module];
    const allOn = ["view", "create", "edit", "delete"].every((a) => cur[a]);
    const target = !allOn;
    const next = { ...matrix, [role]: { ...matrix[role], [module]: { view: target, create: target, edit: target, delete: target } } };
    setMatrix(next); markDirty(role);
  };

  const save = async () => {
    setSaving(true);
    try {
      // Role-scoped saves: ONLY roles the user actually edited are written.
      // Other roles keep their current server-side values.
      for (const r of Array.from(dirtyRoles)) {
        await api.put(`/rbac/matrix/role/${r}`, { modules: matrix[r] });
      }
      await load(); // re-sync from server
      await refreshPermissions(); // bust the cache so the change is reflected immediately
      toast.success("Permissions saved for: " + Array.from(dirtyRoles).join(", "));
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Save failed"); }
    finally { setSaving(false); }
  };

  const reset = async () => {
    if (!window.confirm("Reset entire matrix to defaults? Current overrides will be lost.")) return;
    try {
      await api.post("/rbac/matrix/reset");
      await load();
      await refreshPermissions();
      toast.success("Reset complete");
    } catch (e) { toast.error("Reset failed"); }
  };

  if (!data || !matrix) return <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />;

  return (
    <div className="space-y-4">
      {/* Role tabs */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {data.roles.filter((r) => r !== "team_member").map((r) => (
            <button
              key={r}
              data-testid={`acl-role-${r}`}
              onClick={() => setActiveRole(r)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                activeRole === r ? "bg-[#0F2042] text-white shadow" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-[#0F2042]"
              }`}
            >
              {ROLE_LABELS[r] || r}
              {r === "super_admin" && <Crown size={10} className="ml-1 inline text-amber-400" />}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={reset} data-testid="acl-matrix-reset"
            className="flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:border-rose-400 hover:text-rose-600">
            <RefreshCw size={11} /> Reset defaults
          </button>
          <button onClick={save} disabled={!dirty || saving} data-testid="acl-matrix-save"
            className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#F97316] to-[#EA580C] px-4 py-1.5 text-xs font-bold text-white shadow disabled:opacity-50">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save changes
          </button>
        </div>
      </div>

      {/* Matrix grid for active role */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className={`px-5 py-3 text-sm font-bold text-white ${activeRole === "super_admin" ? "bg-gradient-to-r from-amber-500 to-amber-700" : "bg-gradient-to-r from-[#0F2042] to-[#1E3A8A]"}`}>
          {ROLE_LABELS[activeRole]} permissions
          {activeRole === "super_admin" && <span className="ml-2 text-[10px] font-normal opacity-80">— always full, cannot be reduced</span>}
        </div>
        <div className="divide-y divide-slate-100">
          {(() => {
            // Build an auto "Other" group for any backend module that isn't
            // mapped into one of the explicit categories above — guarantees a
            // newly added MODULES entry on the backend is grantable here on day 1.
            const declared = new Set(MODULE_GROUPS.flatMap((g) => g.mods));
            const orphan = (data.modules || []).filter((m) => !declared.has(m));
            const groups = [...MODULE_GROUPS];
            if (orphan.length) groups.push({ label: "Other", mods: orphan });
            return groups;
          })().map((group) => (
            <div key={group.label} className="px-2">
              <div className="px-3 pt-3 text-[10px] font-bold uppercase tracking-[0.24em] text-[#F97316]">// {group.label}</div>
              {group.mods.filter((m) => data.modules.includes(m)).map((m) => {
                const row = matrix[activeRole][m];
                const allOn = ["view", "create", "edit", "delete"].every((a) => row[a]);
                return (
                  <div key={m} data-testid={`acl-row-${activeRole}-${m}`}
                    className="grid grid-cols-[1fr_repeat(4,72px)_60px] items-center gap-2 px-3 py-2 hover:bg-slate-50">
                    <div className="text-xs font-semibold capitalize text-[#0F2042]">{m.replace(/-/g, " ")}</div>
                    {["view", "create", "edit", "delete"].map((a) => (
                      <button
                        key={a}
                        data-testid={`acl-cell-${activeRole}-${m}-${a}`}
                        onClick={() => toggle(activeRole, m, a)}
                        disabled={activeRole === "super_admin"}
                        className={`flex h-7 items-center justify-center rounded-md text-[10px] font-bold transition disabled:cursor-not-allowed ${
                          row[a]
                            ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300"
                            : "bg-slate-100 text-slate-400 ring-1 ring-slate-200"
                        }`}
                      >
                        {row[a] ? <Check size={11} /> : <X size={11} />} {ACTION_LABELS[a]}
                      </button>
                    ))}
                    <button
                      onClick={() => toggleRow(activeRole, m)}
                      disabled={activeRole === "super_admin"}
                      data-testid={`acl-row-toggle-${activeRole}-${m}`}
                      className={`text-[10px] font-bold ${allOn ? "text-rose-600" : "text-emerald-600"} disabled:opacity-40`}
                    >
                      {allOn ? "Clear" : "All"}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// =============== Tiny shared shell + form helpers ===============
function ModalShell({ children, title, subtitle, onClose }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur">
      <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
        onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#F97316]">// access control</div>
            <h3 className="font-display text-xl font-semibold text-[#0F2042]">{title}</h3>
            <div className="mt-0.5 text-xs text-slate-500">{subtitle}</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-[#0F2042]"><X size={18} /></button>
        </div>
        <div className="p-6">{children}</div>
      </motion.div>
    </motion.div>
  );
}
function TF({ label, v, on, type = "text", testId, placeholder }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</span>
      <input type={type} value={v} onChange={(e) => on(e.target.value)} placeholder={placeholder} data-testid={testId}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
    </label>
  );
}
function TS({ label, v, on, options, testId }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</span>
      <select value={v} onChange={(e) => on(e.target.value)} data-testid={testId}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316]">
        {options.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
      </select>
    </label>
  );
}
