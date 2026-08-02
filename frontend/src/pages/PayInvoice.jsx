import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import axios from "axios";
import { motion } from "framer-motion";
import { toast, Toaster } from "sonner";
import { Loader2, Download, Landmark, Copy, CheckCircle2, ShieldCheck, AlertTriangle } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const Row = ({ label, value }) => {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-0">
      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
      <span className="flex items-center gap-2 text-sm font-semibold text-[#0F2042]">
        {value}
        <button
          onClick={() => { navigator.clipboard.writeText(value); toast.success(`${label} copied`); }}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          data-testid={`copy-${label.toLowerCase().replace(/\s+/g, "-")}`}
        ><Copy size={12} /></button>
      </span>
    </div>
  );
};

export default function PayInvoice() {
  const { token } = useParams();
  const [params] = useSearchParams();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [claimed, setClaimed] = useState(false);

  const track = (event, method) =>
    axios.post(`${API}/public/invoice-pay/${token}/track`, { event, method: method || "" }).catch(() => {});

  useEffect(() => {
    axios.get(`${API}/public/invoice-pay/${token}`)
      .then(({ data }) => { setInfo(data); track("page_view"); })
      .catch((e) => setError(e?.response?.data?.detail || "This payment link is invalid or has expired."));
  }, [token]);

  useEffect(() => {
    if (params.get("canceled")) toast.info("Payment was cancelled — you can try again anytime.");
  }, [params]);

  const bank = info?.bank || {};
  const hasBank = ["bank_name", "account_number", "upi_id"].some((k) => (bank[k] || "").trim());
  const isPaid = info?.status === "paid";
  const money = info ? `${info.currency} ${Number(info.amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "";

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0F2042] via-[#16325C] to-[#0F2042] px-4 py-10" data-testid="pay-invoice-page">
      <Toaster richColors position="top-center" />
      <div className="mx-auto max-w-xl">
        <div className="mb-6 flex items-center justify-center gap-3">
          <img src="/projexino-logo.png" alt="Projexino" className="h-10 rounded bg-white/95 px-2 py-1" />
        </div>
        {error ? (
          <div className="rounded-2xl bg-white p-8 text-center shadow-2xl" data-testid="pay-error">
            <AlertTriangle size={32} className="mx-auto mb-3 text-amber-500" />
            <p className="text-sm font-semibold text-slate-700">{error}</p>
          </div>
        ) : !info ? (
          <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-white/70" /></div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-slate-100 bg-gradient-to-r from-orange-50 to-white px-6 py-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#F97316]">Projexino Solutions · Secure Payment</div>
              <h1 className="font-display mt-1 text-xl font-bold text-[#0F2042]" data-testid="pay-invoice-no">
                {info.project_name} — {info.invoice_no}
              </h1>
              <p className="text-xs text-slate-500">Billed to {info.client_name}{info.due_date ? ` · Due ${info.due_date}` : ""}</p>
            </div>
            <div className="px-6 py-5">
              <div className="flex items-end justify-between rounded-xl bg-[#0F2042] px-5 py-4 text-white">
                <span className="text-[11px] font-bold uppercase tracking-wide text-white/60">{isPaid ? "Amount Paid" : "Amount Due"}</span>
                <span className="font-display text-2xl font-bold" data-testid="pay-amount">{money}</span>
              </div>

              {isPaid ? (
                <div className="mt-5 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700" data-testid="pay-paid-banner">
                  <CheckCircle2 size={16} /> This invoice has been paid in full. Thank you!
                </div>
              ) : (
                <>
                  <div className="mt-5 rounded-xl border border-slate-200 p-4" data-testid="pay-qr-section">
                    <div className="mb-2 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                      📱 Scan &amp; Pay — UPI / PhonePe
                    </div>
                    <img src="/phonepe-qr.png" alt="PhonePe payment QR" className="mx-auto w-52 rounded-xl" data-testid="pay-qr-img" />
                    <p className="mt-2 text-center text-[11px] text-slate-500">Open any UPI app (PhonePe / GPay / Paytm) and scan to pay instantly.</p>
                  </div>
                  {hasBank && (
                    <div className="mt-5 rounded-xl border border-slate-200 p-4" data-testid="pay-bank-details">
                      <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                        <Landmark size={13} className="text-[#0F2042]" /> Pay by Bank Transfer
                      </div>
                      <Row label="Bank" value={bank.bank_name} />
                      <Row label="Account Name" value={bank.account_name} />
                      <Row label="Account No" value={bank.account_number} />
                      <Row label="IFSC" value={bank.ifsc} />
                      <Row label="SWIFT" value={bank.swift} />
                      <Row label="Branch" value={bank.branch} />
                      <Row label="UPI ID" value={bank.upi_id} />
                      {bank.payment_note && <p className="mt-2 text-[11px] italic text-slate-500">{bank.payment_note}</p>}
                      {claimed ? (
                        <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-xs font-semibold text-emerald-700" data-testid="bank-claimed-banner">
                          <CheckCircle2 size={14} /> Thanks! We've notified the team — your receipt will arrive after verification.
                        </div>
                      ) : (
                        <button
                          onClick={() => { track("bank_transfer_claimed", "bank"); setClaimed(true); }}
                          data-testid="bank-claim-btn"
                          className="mt-3 w-full rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100"
                        >
                          ✓ I've completed the bank transfer
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}

              <a href={`${API}/public/finance-doc/${token}`} data-testid="pay-download-btn"
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-[#0F2042] transition hover:border-[#0F2042]">
                <Download size={15} /> Download {isPaid ? "Receipt" : "Invoice"} PDF
              </a>

              <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-400">
                <ShieldCheck size={12} /> Payments are processed securely. Questions? Reply to us on WhatsApp or email.
              </p>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
