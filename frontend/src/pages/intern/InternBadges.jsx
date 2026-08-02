import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Lock, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import InternInfographic from "@/components/InternInfographic";
import Badge3D from "@/components/Badge3D";

export default function InternBadges() {
  const [intern, setIntern] = useState(null);
  const [catalog, setCatalog] = useState([]);

  useEffect(() => {
    Promise.all([
      api.get("/me/intern"),
      api.get("/intern-hub/badge-catalog").catch(() => ({ data: [] })),
    ]).then(([a, b]) => {
      setIntern(a.data);
      setCatalog(b.data);
    }).catch(() => {});
  }, []);

  if (!intern) return <div className="rounded-2xl border border-orange-100 bg-white p-10 text-center text-sm text-slate-500">Loading…</div>;

  const earnedSlugs = new Set((intern.badges || []).map((b) => b.slug));
  const total = catalog.length || 8;
  const earned = (intern.badges || []).length;

  return (
    <div data-testid="intern-badges-page" className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-orange-100 bg-white p-6 shadow-sm">
        <div className="relative grid items-center gap-6 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <div className="text-xs font-bold uppercase tracking-[0.25em] text-[#F97316]">// my badges</div>
            <h1 className="font-display mt-2 text-3xl font-medium leading-tight text-[#0F2042] md:text-4xl">
              Earn the next one.
            </h1>
            <p className="mt-3 text-sm text-slate-600">
              You've earned <span className="font-semibold text-[#F97316]">{earned}</span> of {total} available badges. Keep going!
            </p>
          </div>
          <div className="lg:col-span-3">
            <InternInfographic variant="badges" className="h-56 w-full" />
          </div>
        </div>
      </div>

      {/* Earned */}
      {earned > 0 && (
        <div className="rounded-2xl border border-orange-100 bg-white p-6 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#10B981]">// earned</div>
          <h2 className="font-display mt-1 text-xl font-semibold">Your achievements</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {(intern.badges || []).map((b, i) => {
              const cat = catalog.find((c) => c.slug === b.slug) || {};
              return (
                <motion.div key={b.id}
                  initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: i * 0.07, type: "spring" }}
                  data-testid={`earned-badge-${b.slug || b.name?.replace(/\s+/g, '-').toLowerCase()}`}
                  className="flex flex-col items-center rounded-2xl border-2 p-6 pb-8 text-center"
                  style={{ borderColor: b.color || cat.color || "#F97316", background: `${b.color || cat.color || '#F97316'}08` }}>
                  <Badge3D icon={b.icon || cat.icon || "trophy"} color={b.color || cat.color || "#F97316"} size={130} />
                  <div className="font-display mt-10 text-base font-bold" style={{ color: b.color || cat.color || "#F97316" }}>{b.name}</div>
                  <p className="mt-1 text-xs text-slate-600">{b.reason}</p>
                  <div className="mt-3 flex flex-col items-center gap-0.5 text-[10px] uppercase tracking-[0.2em] text-slate-400">
                    <span>Awarded by {b.awarded_by || "Reviewer"}</span>
                    <span>{(b.earned_at || "").slice(0, 10)}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Catalog (locked + earned shown) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">// catalog</div>
        <h2 className="font-display mt-1 text-xl font-semibold">All badges & how to earn them</h2>
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {catalog.map((b, i) => {
            const isEarned = earnedSlugs.has(b.slug);
            return (
              <motion.div key={b.slug}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                className={`group flex flex-col items-center rounded-2xl border p-5 pb-9 text-center transition ${isEarned ? "border-emerald-200 bg-emerald-50/20" : "border-slate-200 bg-white opacity-90 hover:opacity-100"}`}>
                <div className="relative">
                  <Badge3D icon={b.icon} color={b.color} size={100} earned={isEarned} />
                  {!isEarned && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="rounded-full bg-white/85 p-2 shadow"><Lock size={14} className="text-slate-500" /></div>
                    </div>
                  )}
                </div>
                <div className="font-display mt-9 text-sm font-semibold" style={{ color: isEarned ? b.color : "#475569" }}>{b.name}</div>
                <p className="mt-1 text-[11px] leading-snug text-slate-500">{b.tagline}</p>
                {isEarned && (
                  <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-700">
                    <Sparkles size={9} /> Earned
                  </span>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
