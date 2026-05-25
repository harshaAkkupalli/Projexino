import { useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle2, AlertCircle, Loader2, Receipt, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import XinoLogo from "@/components/XinoLogo";

/**
 * Public invoice payment landing page.
 * Hit by Stripe Checkout success_url (with session_id) or cancel_url (with canceled=1).
 *
 *   /invoice/:id/paid?session_id=cs_test_xxx  → polls /api/finance/invoices/:id/stripe-status/:session_id
 *   /invoice/:id/paid?canceled=1              → shows cancel message + retry CTA
 */
export default function InvoicePayResult() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");
  const canceled = params.get("canceled") === "1";

  const [invoice, setInvoice] = useState(null);
  const [status, setStatus] = useState(canceled ? "canceled" : "checking");
  const [attempts, setAttempts] = useState(0);

  // Fetch invoice info
  useEffect(() => {
    let cancelled = false;
    api.get(`/public/invoice/${id}`).then(({ data }) => {
      if (!cancelled) setInvoice(data);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [id]);

  // Poll status if we have a session_id
  useEffect(() => {
    if (!sessionId || canceled) return;
    let stopped = false;
    let timer;
    const poll = async (attempt = 0) => {
      if (stopped) return;
      try {
        const { data } = await api.get(`/finance/invoices/${id}/stripe-status/${sessionId}`);
        setAttempts(attempt);
        if (data.payment_status === "paid") {
          setStatus("paid");
          return;
        }
        if (data.status === "expired") {
          setStatus("expired");
          return;
        }
        if (attempt >= 10) {
          setStatus("pending");
          return;
        }
        timer = setTimeout(() => poll(attempt + 1), 2200);
      } catch (e) {
        if (attempt >= 5) {
          setStatus("error");
          return;
        }
        timer = setTimeout(() => poll(attempt + 1), 2200);
      }
    };
    poll();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [id, sessionId, canceled]);

  const fmt = (n) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const cur = invoice?.currency || "USD";
  const symbol = { USD: "$", INR: "₹", EUR: "€", GBP: "£" }[cur] || cur + " ";

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0F2042] via-[#1E1B4B] to-[#7C3AED] px-4 py-12">
      <div className="mx-auto max-w-2xl">
        <Link to="/" className="mb-8 inline-flex items-center gap-2 text-white/80 hover:text-white" data-testid="invoice-back-home">
          <XinoLogo size={32} animated /> <span className="font-display text-lg font-semibold">Projexino</span>
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 24 }}
          data-testid="invoice-result-card"
          className="overflow-hidden rounded-3xl bg-white shadow-2xl"
        >
          {/* Status bar */}
          <div className={`relative h-32 overflow-hidden ${
            status === "paid"     ? "bg-gradient-to-br from-[#10B981] to-[#059669]" :
            status === "canceled" ? "bg-gradient-to-br from-[#64748B] to-[#1E293B]" :
            status === "expired" || status === "error" ? "bg-gradient-to-br from-[#EF4444] to-[#991B1B]" :
                                    "bg-gradient-to-br from-[#0F2042] via-[#7C3AED] to-[#F97316]"
          }`}>
            <div className="absolute inset-0 opacity-30" style={{
              backgroundImage:
                "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.4) 0, transparent 40%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.3) 0, transparent 35%)",
            }} />
            <div className="relative flex h-full items-center gap-4 px-8">
              <motion.div
                initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ type: "spring", delay: 0.2, stiffness: 180 }}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20 backdrop-blur-md"
              >
                {status === "paid"     && <CheckCircle2 size={36} className="text-white" />}
                {status === "canceled" && <AlertCircle  size={36} className="text-white" />}
                {(status === "expired" || status === "error") && <AlertCircle size={36} className="text-white" />}
                {(status === "checking" || status === "pending") && <Loader2 size={36} className="animate-spin text-white" />}
              </motion.div>
              <div className="min-w-0 text-white">
                <div className="text-[10px] font-bold uppercase tracking-[0.32em] opacity-80">// Projexino billing</div>
                <h1 className="font-display text-2xl font-semibold sm:text-3xl">
                  {status === "paid"     && "Payment received"}
                  {status === "canceled" && "Payment canceled"}
                  {status === "expired"  && "Session expired"}
                  {status === "error"    && "Could not confirm"}
                  {status === "checking" && "Confirming payment…"}
                  {status === "pending"  && "Still processing…"}
                </h1>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="space-y-6 px-8 py-8">
            {invoice && (
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5" data-testid="invoice-details">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">// Invoice</div>
                <div className="mt-1 flex flex-wrap items-baseline justify-between gap-3">
                  <div>
                    <div className="font-display text-2xl font-semibold text-[#0F2042]">
                      {invoice.invoice_no}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {invoice.project_name || "Project"} · for {invoice.client_name || invoice.client_email || "client"}
                    </div>
                  </div>
                  <div className="font-display text-3xl font-semibold text-[#F97316]">
                    {symbol}{fmt(invoice.amount)}
                  </div>
                </div>
              </div>
            )}

            <p className="text-sm leading-relaxed text-slate-600">
              {status === "paid" && (
                <>Thanks for paying! We've marked invoice <b>{invoice?.invoice_no}</b> as paid and notified the
                  Projexino finance team. A receipt will arrive in your inbox shortly. We're already kicking off
                  the next sprint — talk soon.</>
              )}
              {status === "canceled" && (
                <>Looks like the payment was canceled before it completed. No charges have been made.
                  You can retry whenever you're ready — the invoice is still open.</>
              )}
              {status === "expired" && (
                <>The Stripe checkout session expired. Reach out to your Projexino contact and we'll
                  send a fresh payment link.</>
              )}
              {status === "error" && (
                <>We couldn't confirm the payment status. If you completed the payment, you'll see it
                  reflected in your inbox shortly — webhooks update automatically.</>
              )}
              {(status === "checking" || status === "pending") && (
                <>Reaching out to Stripe to confirm this transaction… don't close the tab, this only takes a moment.
                  {attempts > 0 && <span className="ml-1 text-slate-400">(check {attempts + 1}/11)</span>}</>
              )}
            </p>

            <div className="flex flex-wrap gap-3 pt-2">
              <Link to="/" data-testid="invoice-home-link"
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#0F2042] to-[#7C3AED] px-6 py-3 text-xs font-bold uppercase tracking-[0.18em] text-white shadow-lg transition hover:shadow-xl">
                Back to projexino.com <ArrowRight size={14} />
              </Link>
              <Link to="/contact" data-testid="invoice-contact-link"
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-3 text-xs font-bold uppercase tracking-[0.18em] text-slate-500 hover:bg-slate-50">
                <Receipt size={14} /> Contact billing
              </Link>
            </div>
          </div>
        </motion.div>

        <div className="mt-6 text-center text-[10px] text-white/50">
          Secured by Stripe · Receipt also emailed to {invoice?.client_email || "you"} when payment clears.
        </div>
      </div>
    </div>
  );
}
