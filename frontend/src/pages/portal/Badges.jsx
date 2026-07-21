import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Award, X, Search, Wand2, Send } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import Badge3D from "@/components/Badge3D";
import PageInfographic from "@/components/PageInfographic";

export default function Badges() {
  const [catalog, setCatalog] = useState([]);
  const [interns, setInterns] = useState([]);
  const [activeIntern, setActiveIntern] = useState(null);
  const [q, setQ] = useState("");
  const [awardFor, setAwardFor] = useState(null); // {intern, slug, reason}
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const [c, m] = await Promise.all([
        api.get("/intern-hub/badge-catalog"),
        api.get("/manager/interns"),
      ]);
      setCatalog(c.data);
      setInterns((m.data?.interns || []).map((r) => r.intern));
    } finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  const filteredInterns = interns.filter((i) =>
    !q.trim() || (i.name || "").toLowerCase().includes(q.toLowerCase()) || (i.email || "").toLowerCase().includes(q.toLowerCase())
  );

  const openAward = (intern, slug = null) => setAwardFor({ intern, slug, reason: "" });

  const suggestForIntern = async (intern) => {
    try {
      const { data } = await api.post("/intern-hub/badge-suggestion", { intern_id: intern.id });
      setAwardFor({ intern, slug: data.slug, reason: data.reason });
      toast.success("AI suggestion ready — review and award");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "AI suggestion failed");
    }
  };

  return (
    <div data-testid="portal-badges" className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-orange-50/40 to-purple-50/40 p-6 shadow-sm">
        <div className="relative grid items-center gap-6 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <div className="text-xs font-bold uppercase tracking-[0.25em] text-[#F97316]">// recognition · badges</div>
            <h1 className="font-display mt-2 text-3xl font-medium leading-tight text-[#0F2042] md:text-4xl">
              Celebrate the wins, every week.
            </h1>
            <p className="mt-3 text-sm text-slate-600">
              Recognize interns with meaningful badges. AI looks at their week and proposes the right one —
              you tweak the message and hand it out in a click.
            </p>
          </div>
          <div className="lg:col-span-3">
            <PageInfographic variant="ai" className="h-56 w-full" />
          </div>
        </div>
      </div>

      {/* CATALOG */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#F97316]">// catalog</div>
            <h3 className="font-display text-lg font-semibold">Badge catalog</h3>
          </div>
          <div className="text-xs text-slate-500">{catalog.length} badges</div>
        </div>
        <div data-testid="badge-catalog" className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4">
          {catalog.map((b, i) => (
            <motion.div
              key={b.slug}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              data-testid={`badge-tile-${b.slug}`}
              className="group relative flex flex-col items-center rounded-2xl border border-slate-100 bg-gradient-to-b from-white to-slate-50 p-5 pb-10 text-center transition hover:-translate-y-1 hover:shadow-lg"
            >
              <Badge3D icon={b.icon} color={b.color} size={110} />
              <div className="font-display mt-9 text-sm font-semibold text-[#0F2042]">{b.name}</div>
              <div className="mt-1 text-[11px] leading-snug text-slate-500">{b.tagline}</div>
              <button
                onClick={() => activeIntern && openAward(activeIntern, b.slug)}
                disabled={!activeIntern}
                data-testid={`award-from-tile-${b.slug}`}
                className="mt-3 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] transition disabled:opacity-40"
                style={{ borderColor: b.color, color: b.color }}
              >
                {activeIntern ? `Award → ${activeIntern.name.split(" ")[0]}` : "Pick intern first"}
              </button>
            </motion.div>
          ))}
        </div>
      </section>

      {/* INTERNS — pick + award */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#F97316]">// weekly review</div>
            <h3 className="font-display text-lg font-semibold">Award badges</h3>
            <div className="mt-0.5 text-xs text-slate-500">Pick an intern, then click "AI suggest" or award a specific badge.</div>
          </div>
          <label className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search intern…"
              data-testid="badge-intern-search"
              className="rounded-lg border border-slate-200 bg-white pl-8 pr-3 py-2 text-xs outline-none focus:border-[#F97316]" />
          </label>
        </div>
        {loading ? (
          <div className="py-8 text-center text-sm text-slate-400">Loading…</div>
        ) : filteredInterns.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">No interns found.</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredInterns.map((i) => (
              <motion.div key={i.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                onClick={() => setActiveIntern(i)}
                data-testid={`intern-row-${i.id}`}
                className={`cursor-pointer rounded-xl border p-4 transition ${activeIntern?.id === i.id ? "border-[#F97316] bg-orange-50/50 shadow-md" : "border-slate-200 hover:border-orange-200"}`}>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#F97316] to-[#A855F7] text-sm font-bold text-white">
                    {i.name?.[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-display truncate text-sm font-semibold text-[#0F172A]">{i.name}</div>
                    <div className="truncate text-[10px] text-slate-500">{i.designation}</div>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-[#F97316]">
                      <Award size={9} /> {(i.badges || []).length}
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button onClick={(e) => { e.stopPropagation(); suggestForIntern(i); }}
                    data-testid={`ai-suggest-${i.id}`}
                    className="flex-1 rounded-lg border border-purple-200 bg-purple-50 px-2 py-1.5 text-[11px] font-semibold text-purple-700 hover:bg-purple-100">
                    <Wand2 size={11} className="mr-1 inline" /> AI suggest
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); openAward(i); }}
                    data-testid={`open-award-${i.id}`}
                    className="flex-1 rounded-lg border border-orange-200 bg-orange-50 px-2 py-1.5 text-[11px] font-semibold text-orange-700 hover:bg-orange-100">
                    <Sparkles size={11} className="mr-1 inline" /> Award badge
                  </button>
                </div>
                {(i.badges || []).length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {(i.badges || []).slice(-4).map((b, k) => (
                      <span key={k} className="rounded-full px-2 py-0.5 text-[9px] font-bold text-white"
                        style={{ background: b.color || "#F97316" }}>
                        {b.name}
                      </span>
                    ))}
                    {(i.badges || []).length > 4 && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-500">
                        +{(i.badges || []).length - 4}
                      </span>
                    )}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </section>

      <AnimatePresence>
        {awardFor && (
          <AwardModal data={awardFor} catalog={catalog} onClose={() => setAwardFor(null)} onAwarded={() => { setAwardFor(null); refresh(); }} />
        )}
      </AnimatePresence>
    </div>
  );
}

function AwardModal({ data, catalog, onClose, onAwarded }) {
  const [slug, setSlug] = useState(data.slug || catalog[0]?.slug || "");
  const [reason, setReason] = useState(data.reason || "");
  const [saving, setSaving] = useState(false);
  const cat = catalog.find((c) => c.slug === slug) || catalog[0];

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/intern-hub/award-badge", { intern_id: data.intern.id, slug, reason });
      toast.success(`Badge awarded → ${data.intern.name}`);
      onAwarded();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    } finally { setSaving(false); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <motion.form initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        onClick={(e) => e.stopPropagation()} onSubmit={submit}
        data-testid="award-modal"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold">Award badge → {data.intern.name}</h3>
          <button type="button" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="flex justify-center py-3">
          {cat && <Badge3D icon={cat.icon} color={cat.color} size={120} />}
        </div>
        <label className="mt-3 block">
          <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-500">Badge</span>
          <select value={slug} onChange={(e) => setSlug(e.target.value)} data-testid="award-slug"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316]">
            {catalog.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </label>
        <label className="mt-3 block">
          <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-500">Reason (visible to intern)</span>
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
            data-testid="award-reason"
            placeholder={cat?.tagline}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
        </label>
        <button disabled={saving} data-testid="award-submit" className="btn-primary mt-5 w-full justify-center">
          {saving ? "Awarding…" : <><Send size={14} /> Award badge</>}
        </button>
      </motion.form>
    </motion.div>
  );
}
