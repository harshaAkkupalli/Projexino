import { useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { toast, Toaster } from "sonner";
import { Loader2, Trash2, ShieldAlert, CheckCircle2, ArrowLeft } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function AccountDeletion() {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [reason, setReason] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);

  const requestCode = async () => {
    if (!email.trim()) return toast.error("Enter your account email");
    setBusy(true);
    try {
      await axios.post(`${API}/public/account-deletion/request`, { email: email.trim() });
      toast.success("If an account exists, a verification code has been emailed");
      setStep(2);
    } catch (e) { toast.error(e?.response?.data?.detail || "Something went wrong"); }
    setBusy(false);
  };

  const confirm = async () => {
    if (code.trim().length !== 6) return toast.error("Enter the 6-digit code");
    if (!agree) return toast.error("Please confirm you understand the deletion is permanent");
    setBusy(true);
    try {
      await axios.post(`${API}/public/account-deletion/confirm`, { email: email.trim(), code: code.trim(), reason });
      setStep(3);
    } catch (e) { toast.error(e?.response?.data?.detail || "Verification failed"); }
    setBusy(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0F2042] via-[#16325C] to-[#0F2042] px-4 py-12" data-testid="account-deletion-page">
      <Toaster richColors position="top-center" />
      <div className="mx-auto max-w-lg">
        <div className="mb-6 flex items-center justify-center">
          <img src="/projexino-logo.png" alt="Projexino" className="h-10 rounded bg-white/95 px-2 py-1" />
        </div>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-2xl bg-white shadow-2xl">
          <div className="border-b border-slate-100 bg-red-50 px-6 py-5">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.28em] text-red-600">
              <Trash2 size={12} /> Account &amp; Data Deletion
            </div>
            <h1 className="font-display mt-1 text-xl font-bold text-[#0F2042]">Delete your Projexino account</h1>
          </div>
          <div className="space-y-4 px-6 py-6">
            {step === 3 ? (
              <div className="py-6 text-center" data-testid="deletion-done">
                <CheckCircle2 size={40} className="mx-auto mb-3 text-emerald-500" />
                <h2 className="font-display text-lg font-bold text-[#0F2042]">Account deactivated</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Your account is now deactivated and you have been signed out everywhere.
                  All personal data will be <b>permanently deleted within 30 days</b>.
                </p>
                <Link to="/" className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-[#F97316] hover:underline">
                  <ArrowLeft size={14} /> Back to projexino.com
                </Link>
              </div>
            ) : (
              <>
                <div className="rounded-xl bg-slate-50 p-4 text-[12px] leading-relaxed text-slate-600 ring-1 ring-slate-200">
                  <div className="mb-1 flex items-center gap-1.5 font-bold text-slate-800"><ShieldAlert size={13} className="text-red-500" /> What gets deleted</div>
                  Your profile, login credentials, tasks &amp; activity history, HR records, uploaded documents and notifications.
                  The account is <b>deactivated immediately</b>; all personal data is permanently erased within <b>30 days</b>. This cannot be undone.
                </div>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Account email</span>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={step === 2}
                    placeholder="you@company.com" data-testid="deletion-email"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#0F2042] disabled:bg-slate-50" />
                </label>
                {step === 1 ? (
                  <button onClick={requestCode} disabled={busy} data-testid="deletion-request-btn"
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0F2042] px-5 py-3 text-sm font-bold text-white hover:bg-[#1a3560] disabled:opacity-60">
                    {busy ? <Loader2 size={15} className="animate-spin" /> : null} Send verification code
                  </button>
                ) : (
                  <>
                    <label className="block">
                      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">6-digit code (check your email)</span>
                      <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="••••••" data-testid="deletion-code" inputMode="numeric"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-center text-lg font-bold tracking-[0.5em] outline-none focus:border-[#0F2042]" />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Reason (optional)</span>
                      <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
                        data-testid="deletion-reason"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#0F2042]" />
                    </label>
                    <label className="flex items-start gap-2 text-xs text-slate-600">
                      <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} data-testid="deletion-agree" className="mt-0.5" />
                      I understand my account will be deactivated immediately and all my data permanently deleted within 30 days.
                    </label>
                    <button onClick={confirm} disabled={busy} data-testid="deletion-confirm-btn"
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60">
                      {busy ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />} Permanently delete my account
                    </button>
                    <button onClick={requestCode} disabled={busy} className="w-full text-center text-[11px] font-bold text-slate-400 hover:text-slate-700">
                      Resend code
                    </button>
                  </>
                )}
                <p className="text-center text-[11px] text-slate-400">
                  Trouble? Email <a href="mailto:support@projexino.com" className="font-bold text-[#F97316]">support@projexino.com</a>
                </p>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
