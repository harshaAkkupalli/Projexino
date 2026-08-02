import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Circle, Coffee, ShieldCheck, X } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

const STATUS_META = {
  online:   { label: "Online",  color: "#22c55e", icon: Circle },
  on_break: { label: "On Break", color: "#f59e0b", icon: Coffee  },
};

/**
 * Top-bar status selector. Restricted to "Online" / "On Break" only.
 * On first ever login, shows a one-time popup informing the user that
 * their login/logout is being logged. Dismissal is persisted server-side.
 */
export default function PresenceWidget() {
  const [me, setMe] = useState(null);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const { data } = await api.get("/presence/me");
        if (!mounted) return;
        setMe(data);
        if (!data.notice_shown) setNotice(true);
      } catch {}
    };
    load();
    const id = setInterval(load, 30000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  const setStatus = async (s) => {
    if (s === me?.status) { setOpen(false); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/presence/status", { status: s });
      setMe((m) => ({ ...(m || {}), status: data.status }));
      toast.success(`Status updated to ${STATUS_META[s]?.label || s}`);
    } catch (e) {
      toast.error("Could not update status");
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  const ackNotice = async () => {
    setNotice(false);
    try { await api.post("/presence/notice-ack"); } catch {}
    setMe((m) => ({ ...(m || {}), notice_shown: true }));
  };

  const cur = me?.status || "online";
  const meta = STATUS_META[cur] || STATUS_META.online;

  return (
    <>
      <div className="relative">
        <button
          type="button"
          data-testid="presence-toggle"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-[#F97316] hover:text-[#0F2042]"
        >
          <span className="relative flex h-2.5 w-2.5">
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
              style={{ backgroundColor: meta.color }}
            />
            <span
              className="relative inline-flex h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: meta.color }}
            />
          </span>
          <span>{meta.label}</span>
        </button>
        <AnimatePresence>
          {open && (
            <>
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setOpen(false)}
                className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.92, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 260, damping: 24 }}
                data-testid="presence-status-sheet"
                className="fixed left-1/2 top-1/2 z-50 w-[90%] max-w-sm -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-slate-200"
              >
                {/* Drag handle */}
                <div className="mx-auto mt-3 h-1 w-12 rounded-full bg-slate-200" />
                <div className="px-5 pb-1 pt-3 text-center">
                  <div className="text-[10px] font-bold uppercase tracking-[0.32em] text-[#F97316]">
                    Your status
                  </div>
                  <h3 className="font-display mt-1 text-lg font-semibold text-[#0F2042]">
                    Tap to update
                  </h3>
                </div>
                <div className="space-y-2 p-4">
                  {Object.entries(STATUS_META).map(([key, m]) => (
                    <button
                      key={key}
                      data-testid={`presence-status-${key}`}
                      onClick={() => setStatus(key)}
                      disabled={busy}
                      className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition active:scale-[0.98] ${
                        cur === key
                          ? "border-[#F97316] bg-orange-50/60 shadow-sm"
                          : "border-slate-200 bg-white hover:border-[#F97316]"
                      }`}
                    >
                      <span className="relative flex h-3 w-3">
                        <span
                          className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
                          style={{ backgroundColor: m.color }}
                        />
                        <span
                          className="relative inline-flex h-3 w-3 rounded-full"
                          style={{ backgroundColor: m.color }}
                        />
                      </span>
                      <div className="flex-1">
                        <div className={`text-sm font-semibold ${cur === key ? "text-[#0F2042]" : "text-slate-700"}`}>
                          {m.label}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {key === "online"
                            ? "I'm available and at my desk."
                            : "I'm taking a short break."}
                        </div>
                      </div>
                      {cur === key && (
                        <span className="rounded-full bg-[#F97316] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                          Active
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-3 text-[11px] leading-relaxed text-slate-500">
                  <b className="text-[#0F2042]">Offline / Out-of-office</b> cannot be selected manually —
                  your session is automatically marked offline on sign-out.
                </div>
                <button
                  data-testid="presence-status-close"
                  onClick={() => setOpen(false)}
                  className="block w-full border-t border-slate-100 py-3 text-sm font-semibold text-slate-500 hover:bg-slate-50 hover:text-[#F97316]"
                >
                  Cancel
                </button>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {notice && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            data-testid="presence-notice-modal"
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.92, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 8 }}
              transition={{ type: "spring", stiffness: 220, damping: 22 }}
              className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
            >
              <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-orange-100" />
              <div className="absolute -left-12 bottom-0 h-24 w-24 rounded-full bg-blue-100" />
              <div className="relative p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#F97316] to-[#A855F7] text-white">
                    <ShieldCheck size={22} />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-[#0F2042]">Presence tracking is active</h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">
                      Every sign-in and sign-out you make is recorded against your account for
                      attendance and audit. While you're online you can switch between
                      <b className="text-[#0F2042]"> Online</b> and <b className="text-[#0F2042]"> On Break</b>
                      using the badge in the top bar.
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      You won't see this message again.
                    </p>
                  </div>
                </div>
                <div className="mt-5 flex justify-end">
                  <button
                    data-testid="presence-notice-ack"
                    onClick={ackNotice}
                    className="rounded-lg bg-[#0F2042] px-5 py-2 text-sm font-semibold text-white hover:bg-[#F97316]"
                  >
                    Got it
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
