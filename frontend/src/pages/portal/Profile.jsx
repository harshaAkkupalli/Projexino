import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import {
  User, Mail, Phone, MapPin, Briefcase, KeyRound, Camera, Save, Loader2, FileText, ExternalLink,
} from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function Profile() {
  const { user, refresh } = useAuth();
  const fileRef = useRef(null);
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({});
  const [pw, setPw] = useState({ current_password: "", new_password: "", new_password2: "" });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/me/full-profile");
      setProfile(data);
      setForm({
        name: data.user.name || "",
        designation: data.user.designation || "",
        phone: data.user.phone || "",
        location: data.user.location || "",
        bio: data.user.bio || "",
      });
    } catch { toast.error("Failed to load"); }
  };
  useEffect(() => { load(); }, []);

  const saveProfile = async () => {
    setBusy(true);
    try {
      await api.patch("/rbac/me", form);
      toast.success("Profile updated · HR & Super Admin notified");
      await refresh?.();
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Failed"); }
    finally { setBusy(false); }
  };

  const changePw = async () => {
    if (pw.new_password.length < 8) return toast.error("Use 8+ characters");
    if (pw.new_password !== pw.new_password2) return toast.error("Passwords don't match");
    setBusy(true);
    try {
      await api.post("/auth/change-password", {
        current_password: pw.current_password, new_password: pw.new_password,
      });
      toast.success("Password updated");
      setPw({ current_password: "", new_password: "", new_password2: "" });
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Failed"); }
    finally { setBusy(false); }
  };

  const onAvatar = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) return toast.error("Max 3MB");
    const b64 = await new Promise((res) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result).split(",")[1] || "");
      fr.readAsDataURL(file);
    });
    setBusy(true);
    try {
      await api.post("/me/profile/avatar", { content_base64: b64, mime_type: file.type });
      toast.success("Avatar updated");
      load();
    } catch { toast.error("Upload failed"); }
    finally { setBusy(false); }
  };

  if (!profile) return <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />;
  const u = profile.user;
  const intern = profile.intern;
  const avatarSrc = u.avatar_base64
    ? `data:${u.avatar_mime || "image/png"};base64,${u.avatar_base64}`
    : null;

  return (
    <div data-testid="page-profile" className="space-y-5">
      {/* Hero */}
      <div className="rounded-3xl border border-orange-100 bg-gradient-to-br from-[#0F2042] via-[#1E3A8A] to-[#7C3AED] p-6 text-white">
        <div className="flex flex-col items-start gap-4 md:flex-row md:items-center">
          <div className="relative">
            {avatarSrc ? (
              <img src={avatarSrc} alt="avatar" className="h-24 w-24 rounded-full object-cover ring-4 ring-white/30" />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-rose-500 text-3xl font-bold ring-4 ring-white/30">
                {(u.name || u.email).slice(0, 1).toUpperCase()}
              </div>
            )}
            <button data-testid="profile-avatar-btn" onClick={() => fileRef.current?.click()}
              className="absolute bottom-0 right-0 rounded-full bg-[#F97316] p-2 text-white shadow ring-2 ring-white">
              <Camera size={12} />
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onAvatar} />
          </div>
          <div className="flex-1">
            <div className="text-[10px] font-bold uppercase tracking-[0.32em] text-orange-300">// {u.role.replace("_", " ")}</div>
            <h1 className="font-display text-3xl font-medium">{u.name}</h1>
            <div className="mt-1 flex flex-wrap gap-3 text-xs opacity-90">
              <span className="inline-flex items-center gap-1"><Mail size={11} /> {u.email}</span>
              {u.phone && <span className="inline-flex items-center gap-1"><Phone size={11} /> {u.phone}</span>}
              {u.location && <span className="inline-flex items-center gap-1"><MapPin size={11} /> {u.location}</span>}
              {u.designation && <span className="inline-flex items-center gap-1"><Briefcase size={11} /> {u.designation}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Edit profile */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#F97316]">// edit profile</div>
        <h2 className="font-display mt-1 text-xl font-semibold text-[#0F2042]">Personal details</h2>
        <p className="text-xs text-slate-500">Updates are auto-notified to HR &amp; Super Admin.</p>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <TF label="Full name" v={form.name} on={(v) => setForm({ ...form, name: v })} testId="profile-name" />
          <TF label="Designation" v={form.designation} on={(v) => setForm({ ...form, designation: v })} testId="profile-designation" />
          <TF label="Phone" v={form.phone} on={(v) => setForm({ ...form, phone: v })} testId="profile-phone" />
          <TF label="Location" v={form.location} on={(v) => setForm({ ...form, location: v })} testId="profile-location" />
          <label className="block md:col-span-2">
            <span className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-slate-500">Bio</span>
            <textarea rows={3} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })}
              data-testid="profile-bio"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
          </label>
        </div>
        <button onClick={saveProfile} disabled={busy} data-testid="profile-save"
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#F97316] to-[#EA580C] px-6 py-2.5 text-sm font-bold text-white shadow disabled:opacity-60">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save profile
        </button>
      </div>

      {/* Change password */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#F97316]">// security</div>
        <h2 className="font-display mt-1 text-xl font-semibold text-[#0F2042]">Change password</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <PwF label="Current" v={pw.current_password} on={(v) => setPw({ ...pw, current_password: v })} testId="pw-current" />
          <PwF label="New" v={pw.new_password} on={(v) => setPw({ ...pw, new_password: v })} testId="pw-new" />
          <PwF label="Confirm new" v={pw.new_password2} on={(v) => setPw({ ...pw, new_password2: v })} testId="pw-new2" />
        </div>
        <button onClick={changePw} disabled={busy} data-testid="pw-save"
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#0F2042] px-6 py-2.5 text-sm font-bold text-white disabled:opacity-60">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />} Update password
        </button>
      </div>

      {/* Documents (if intern) */}
      {intern && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#F97316]">// your documents</div>
          <h2 className="font-display mt-1 text-xl font-semibold text-[#0F2042]">Submitted documents</h2>
          {Object.keys(intern.submitted_docs || {}).length === 0 ? (
            <div className="mt-3 text-sm text-slate-400">No documents uploaded yet. Visit the Documents tab to upload.</div>
          ) : (
            <ul className="mt-3 space-y-2">
              {Object.entries(intern.submitted_docs).map(([type, d]) => (
                <li key={type} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm">
                  <div>
                    <div className="font-bold capitalize text-[#0F2042]">{type.replace(/_/g, " ")}</div>
                    <div className="text-xs text-slate-500">{d.file_name}</div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                    d.verification?.status === "approved" ? "bg-emerald-100 text-emerald-700" :
                    d.verification?.status === "rejected" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"
                  }`}>{d.verification?.status || "pending"}</span>
                </li>
              ))}
            </ul>
          )}
          <a href="/intern/documents" data-testid="profile-docs-link"
            className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#F97316] hover:underline">
            <ExternalLink size={11} /> Upload more / re-upload
          </a>
        </div>
      )}
    </div>
  );
}

function TF({ label, v, on, testId }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</span>
      <input type="text" value={v ?? ""} onChange={(e) => on(e.target.value)} data-testid={testId}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
    </label>
  );
}
function PwF({ label, v, on, testId }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</span>
      <input type="password" value={v} onChange={(e) => on(e.target.value)} data-testid={testId}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
    </label>
  );
}
