/**
 * NewsletterSignup — drop-in widget for the public site footer + blog
 * sidebar / inline. Persists subscription via POST /api/newsletter/subscribe.
 */
import { useState } from "react";
import { Mail, Loader2, CheckCircle2 } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";

export default function NewsletterSignup({ variant = "footer", source = "footer" }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!email.trim()) return;
    setBusy(true);
    try {
      const { data } = await api.post("/newsletter/subscribe", {
        email: email.trim(),
        name: name.trim(),
        source,
      });
      if (data?.status === "already_subscribed") {
        toast.success("You're already on the list — thanks!");
      } else if (data?.status === "resubscribed") {
        toast.success("Welcome back! You're subscribed again.");
      } else {
        toast.success("Subscribed! Watch your inbox for our next dispatch.");
      }
      setDone(true);
      setEmail("");
      setName("");
    } catch (err) {
      toast.error(formatApiError(err) || "Couldn't subscribe — try again");
    }
    setBusy(false);
  };

  // === Compact footer variant ===
  if (variant === "footer") {
    return (
      <form data-testid="newsletter-footer" onSubmit={submit} className="flex w-full flex-col gap-2 sm:flex-row">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Your email…"
          required
          data-testid="newsletter-footer-email"
          className="flex-1 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm outline-none focus:border-[#F97316]"
        />
        <button
          type="submit"
          disabled={busy}
          data-testid="newsletter-footer-submit"
          className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#F97316] px-5 py-2 text-xs font-bold uppercase tracking-[0.18em] text-white shadow disabled:opacity-50"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : done ? <CheckCircle2 size={12} /> : <Mail size={12} />}
          {busy ? "…" : done ? "Subscribed" : "Subscribe"}
        </button>
      </form>
    );
  }

  // === Hero / inline card variant ===
  return (
    <div data-testid="newsletter-card" className="rounded-3xl border border-orange-100 bg-gradient-to-br from-white via-orange-50/30 to-violet-50/30 p-6 shadow-sm md:p-8">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.28em] text-[#F97316]">
        <Mail size={12} /> // PROJEXINO NEWSLETTER
      </div>
      <h3 className="font-display mt-2 text-2xl font-semibold text-[#0F2042] md:text-3xl">
        Get app development insights every fortnight.
      </h3>
      <p className="mt-1 text-sm text-slate-600">
        No spam. Real engineering teardown, AI cost benchmarks, and SaaS launch playbooks. Unsubscribe in one click anytime.
      </p>
      <form onSubmit={submit} className="mt-5 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name (optional)"
          data-testid="newsletter-card-name"
          className="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-[#F97316] sm:w-48"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          required
          data-testid="newsletter-card-email"
          className="flex-1 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-[#F97316]"
        />
        <button
          type="submit"
          disabled={busy || done}
          data-testid="newsletter-card-submit"
          className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#0F2042] to-[#7C3AED] px-6 py-2.5 text-xs font-bold uppercase tracking-[0.16em] text-white shadow-lg disabled:opacity-60"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : done ? <CheckCircle2 size={14} /> : <Mail size={14} />}
          {busy ? "Subscribing…" : done ? "Subscribed" : "Subscribe"}
        </button>
      </form>
    </div>
  );
}
