/**
 * MilestoneConfirm — public, no-auth page where a client approves or
 * rejects a milestone. Reached via the token-link emailed when an admin
 * clicks "Send for confirmation" in the Finance UI.
 *
 * URL pattern: /milestone/confirm?t=<token>
 */
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle2, XCircle, Loader2, Sparkles, ShieldCheck } from "lucide-react";
import axios from "axios";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";

const API = process.env.REACT_APP_BACKEND_URL;

export default function MilestoneConfirm() {
  const [params] = useSearchParams();
  const token = params.get("t") || "";
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [decision, setDecision] = useState(null);
  const [note, setNote] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) {
      setError("Missing token. Did you click the link from your email?");
      setLoading(false);
      return;
    }
    axios
      .get(`${API}/api/finance/milestones/by-token/${token}`)
      .then(({ data }) => setData(data))
      .catch((e) => setError(e.response?.data?.detail || "This link is invalid or has expired."))
      .finally(() => setLoading(false));
  }, [token]);

  const decide = async (verdict) => {
    setBusy(true);
    try {
      await axios.post(`${API}/api/finance/milestones/by-token/${token}/decision`, {
        decision: verdict,
        note,
      });
      setDecision(verdict);
    } catch (e) {
      setError(e.response?.data?.detail || "Failed to record your decision");
    }
    setBusy(false);
  };

  if (loading) {
    return (
      <Bg>
        <div className="flex flex-1 items-center justify-center">
          <Loader2 size={32} className="animate-spin text-[#F97316]" />
        </div>
      </Bg>
    );
  }

  if (error) {
    return (
      <Bg>
        <div className="mx-auto max-w-md py-24 text-center">
          <XCircle size={56} className="mx-auto text-rose-400" />
          <h2 className="mt-4 font-display text-2xl font-semibold text-[#0F2042]">Link unavailable</h2>
          <p className="mt-2 text-sm text-slate-500">{error}</p>
          <button onClick={() => navigate("/")} className="btn-primary mt-6">Back to home</button>
        </div>
      </Bg>
    );
  }

  const m = data?.milestone || {};
  const isDecided = data?.is_decided || decision != null;

  return (
    <Bg>
      <SEO title="Approve Milestone — Projexino" description="Review and approve a project milestone." />
      <div className="mx-auto max-w-2xl px-5 py-12 md:py-20" data-testid="milestone-confirm-page">
        {isDecided ? (
          <DecidedCard decision={decision || m.status} project={data.project_name} milestone={m} />
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl border border-orange-100 bg-white p-7 shadow-xl md:p-10"
          >
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.28em] text-[#F97316]">
              <Sparkles size={12} /> // milestone approval
            </div>
            <h1 className="font-display mt-2 text-3xl font-semibold leading-tight text-[#0F2042] md:text-4xl">
              {m.title}
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              <b>Project:</b> {data.project_name} · <b>Client:</b> {data.client_name || "—"}
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <Stat label="Amount" value={`${data.currency} ${(m.amount || 0).toLocaleString()}`} accent />
              <Stat label="Order" value={`#${m.order || 1}`} />
              <Stat label="Target" value={m.due_date || "TBD"} />
            </div>

            {m.description && (
              <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Scope</div>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-700">{m.description}</p>
              </div>
            )}

            <div className="mt-6">
              <label className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
                Optional note for the Projexino team
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Any comments, clarifications, or concerns…"
                data-testid="milestone-decision-note"
                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-[#F97316]"
              />
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                onClick={() => decide("rejected")}
                disabled={busy}
                data-testid="milestone-reject-btn"
                className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-rose-200 bg-white px-6 py-3 text-sm font-bold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
              >
                <XCircle size={16} /> Send back with notes
              </button>
              <button
                onClick={() => decide("confirmed")}
                disabled={busy}
                data-testid="milestone-confirm-btn"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#10B981] to-[#059669] px-6 py-3 text-sm font-bold text-white shadow-lg transition hover:shadow-xl disabled:opacity-50"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                Approve milestone
              </button>
            </div>
            <p className="mt-4 inline-flex items-center gap-1 text-[11px] text-slate-400">
              <ShieldCheck size={11} /> Secure — this link is tied to your email and rotates after a decision.
            </p>
          </motion.div>
        )}
      </div>
    </Bg>
  );
}

function Bg({ children }) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-orange-50/40 via-white to-violet-50/30">
      <Navbar />
      <div className="flex-1">{children}</div>
      <Footer />
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className={`rounded-2xl p-3 ${accent ? "bg-gradient-to-br from-orange-50 to-orange-100/50 border border-orange-200" : "bg-slate-50 border border-slate-100"}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className={`mt-1 font-display text-lg font-bold ${accent ? "text-[#F97316]" : "text-[#0F2042]"}`}>{value}</div>
    </div>
  );
}

function DecidedCard({ decision, project, milestone }) {
  const isApproved = decision === "confirmed" || decision === "invoiced" || decision === "paid";
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className={`rounded-3xl border bg-white p-8 text-center shadow-xl md:p-12 ${isApproved ? "border-emerald-200" : "border-rose-200"}`}
      data-testid="milestone-decided-card"
    >
      {isApproved ? (
        <CheckCircle2 size={56} className="mx-auto text-emerald-500" />
      ) : (
        <XCircle size={56} className="mx-auto text-rose-400" />
      )}
      <h2 className="font-display mt-4 text-2xl font-semibold text-[#0F2042] md:text-3xl">
        {isApproved ? "Thanks — milestone approved!" : "Sent back to the Projexino team"}
      </h2>
      <p className="mt-2 text-sm text-slate-500">
        <b>{milestone.title}</b> on <b>{project}</b>
      </p>
      <p className="mt-4 text-sm text-slate-500">
        {isApproved
          ? "We'll send the invoice next. You'll get an email with the invoice + payment link shortly."
          : "We'll review your note and reach out to discuss the changes."}
      </p>
    </motion.div>
  );
}
