import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Mail, ArrowLeft, KeyRound, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!email) return;
    setBusy(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Failed");
    } finally { setBusy(false); }
  };

  return (
    <AuthShell title="Forgot your password?" subtitle="No worries — we'll email you a reset link.">
      {sent ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} data-testid="fp-sent"
          className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
          <CheckCircle2 size={32} className="mx-auto text-emerald-600" />
          <div className="font-bold text-emerald-800">Check your inbox</div>
          <div className="text-xs text-emerald-700">If <b>{email}</b> exists in our system, a reset link has been sent. It's valid for 4 hours.</div>
          <Link to="/login" className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-900">
            <ArrowLeft size={12} /> Back to login
          </Link>
        </motion.div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-slate-500">Your email</span>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 focus-within:border-[#F97316]">
              <Mail size={14} className="text-slate-400" />
              <input
                type="email" autoFocus required
                value={email} onChange={(e) => setEmail(e.target.value)}
                data-testid="fp-email"
                placeholder="you@projexino.com"
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
          </label>
          <button type="submit" disabled={busy} data-testid="fp-submit"
            className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#F97316] to-[#EA580C] py-3 text-sm font-bold text-white shadow disabled:opacity-60">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />} Send reset link
          </button>
          <Link to="/login" className="block text-center text-xs font-bold text-slate-500 hover:text-[#0F2042]">
            <ArrowLeft size={12} className="mr-1 inline" /> Back to login
          </Link>
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (pw.length < 8) return toast.error("Use at least 8 characters");
    if (pw !== pw2) return toast.error("Passwords don't match");
    setBusy(true);
    try {
      await api.post("/auth/reset-password", { token, new_password: pw });
      toast.success("Password updated — please log in");
      navigate("/login");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Failed");
    } finally { setBusy(false); }
  };

  if (!token) {
    return (
      <AuthShell title="Invalid reset link" subtitle="Missing or expired token.">
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-center">
          <AlertTriangle size={32} className="mx-auto text-rose-600" />
          <div className="mt-2 text-sm font-bold text-rose-800">Token missing.</div>
          <Link to="/forgot-password" className="mt-2 inline-block text-xs font-bold text-rose-700 underline">Request a new link →</Link>
        </div>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Choose a new password" subtitle="Pick something at least 8 characters long.">
      <form onSubmit={submit} className="space-y-3">
        <PwField label="New password *" v={pw} on={setPw} testId="rp-pw" />
        <PwField label="Confirm new password *" v={pw2} on={setPw2} testId="rp-pw2" />
        <button type="submit" disabled={busy} data-testid="rp-submit"
          className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#F97316] to-[#EA580C] py-3 text-sm font-bold text-white shadow disabled:opacity-60">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />} Update password
        </button>
      </form>
    </AuthShell>
  );
}

function PwField({ label, v, on, testId }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</span>
      <input type="password" value={v} onChange={(e) => on(e.target.value)} required minLength={8} data-testid={testId}
        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#F97316]" />
    </label>
  );
}

function AuthShell({ title, subtitle, children }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#0F2042] via-[#1E3A8A] to-[#7C3AED] p-5">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl">
        <div className="text-[10px] font-bold uppercase tracking-[0.32em] text-[#F97316]">// projexino</div>
        <h1 className="font-display mt-1 text-3xl font-medium text-[#0F2042]">{title}</h1>
        <p className="mt-1 mb-5 text-sm text-slate-600">{subtitle}</p>
        {children}
      </motion.div>
    </div>
  );
}
