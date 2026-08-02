import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, User, KeyRound, CheckCircle2, AlertTriangle } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

export default function InternProfile() {
  const { user, setUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({ name: "", bio: "" });
  const [pw, setPw] = useState({ current_password: "", new_password: "", confirm: "" });
  const [saving, setSaving] = useState(false);
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    api.get("/me/profile").then(({ data }) => {
      setProfile(data);
      setForm({ name: data.name || "", bio: data.bio || "" });
    });
  }, []);

  const saveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.patch("/me/profile", form);
      setProfile(data);
      if (setUser) setUser({ ...user, ...data });
      toast.success("Profile updated");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    } finally { setSaving(false); }
  };

  const changePw = async (e) => {
    e.preventDefault();
    if (pw.new_password !== pw.confirm) { toast.error("Passwords don't match"); return; }
    if (pw.new_password.length < 6) { toast.error("Min 6 characters"); return; }
    setChanging(true);
    try {
      await api.post("/me/change-password", {
        current_password: pw.current_password || undefined,
        new_password: pw.new_password,
      });
      toast.success("Password updated");
      setPw({ current_password: "", new_password: "", confirm: "" });
      // refresh profile to clear must_change flag
      const { data } = await api.get("/me/profile");
      setProfile(data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    } finally { setChanging(false); }
  };

  if (!profile) return <div className="rounded-2xl border border-orange-100 bg-white p-10 text-center text-sm text-slate-500">Loading…</div>;

  return (
    <div data-testid="intern-profile" className="mx-auto max-w-3xl space-y-6">
      {profile.must_change_password && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          data-testid="must-change-banner"
          className="flex items-start gap-3 rounded-2xl border border-orange-200 bg-orange-50 p-4">
          <AlertTriangle className="mt-0.5 text-[#F97316]" size={20} />
          <div>
            <div className="font-display text-sm font-bold text-[#0F2042]">Set your own password</div>
            <p className="text-xs text-slate-600">
              You're using a temporary password. Please pick a new one below.
            </p>
          </div>
        </motion.div>
      )}

      <div className="rounded-3xl border border-orange-100 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#F97316] to-[#A855F7] text-2xl font-bold text-white">
            {profile.name?.[0]?.toUpperCase()}
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#F97316]">// profile</div>
            <h1 className="font-display text-2xl font-semibold text-[#0F2042]">{profile.name}</h1>
            <div className="text-xs text-slate-500">{profile.email} · role: <span className="font-semibold">{profile.role}</span></div>
          </div>
        </div>

        <form onSubmit={saveProfile} className="mt-6 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-500">Display name</span>
            <div className="relative">
              <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input data-testid="profile-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-[#F97316]" />
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-500">Bio</span>
            <textarea data-testid="profile-bio" rows={3} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
          </label>
          <button data-testid="profile-save-btn" disabled={saving} className="btn-primary text-sm">
            {saving ? "Saving…" : "Save profile"}
          </button>
        </form>
      </div>

      <div className="rounded-3xl border border-orange-100 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <KeyRound size={18} className="text-[#F97316]" />
          <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#F97316]">// security</div>
        </div>
        <h2 className="font-display mt-1 text-xl font-semibold">Change password</h2>
        <p className="mt-1 text-xs text-slate-500">
          Use at least 6 characters. {profile.must_change_password ? "Skip 'current password' for first-time change." : "Current password required."}
        </p>
        <form onSubmit={changePw} className="mt-4 space-y-3">
          {!profile.must_change_password && (
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-500">Current password</span>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input data-testid="pw-current" type="password" required value={pw.current_password}
                  onChange={(e) => setPw({ ...pw, current_password: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-[#F97316]" />
              </div>
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-500">New password</span>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input data-testid="pw-new" type="password" required minLength={6} value={pw.new_password}
                onChange={(e) => setPw({ ...pw, new_password: e.target.value })}
                className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-[#F97316]" />
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-500">Confirm new password</span>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input data-testid="pw-confirm" type="password" required minLength={6} value={pw.confirm}
                onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
                className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-[#F97316]" />
            </div>
          </label>
          <button data-testid="pw-change-btn" disabled={changing} className="btn-primary text-sm">
            {changing ? "Updating…" : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}
