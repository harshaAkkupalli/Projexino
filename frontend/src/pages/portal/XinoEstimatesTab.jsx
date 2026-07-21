import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, ChevronDown, ChevronUp, Search, Mail, Phone, Building2, Sparkles, ListPlus, CheckCircle2 } from "lucide-react";
import { api, formatApiError } from "@/lib/api";

const fmtUsd = (v) => `$${Number(v || 0).toLocaleString()}`;

export const XinoEstimatesTab = () => {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState("");
  const [listNames, setListNames] = useState({});
  const [added, setAdded] = useState({});
  const [busyAdd, setBusyAdd] = useState("");

  const addToList = async (r) => {
    if (!r.email) { toast.error("This contact has no email"); return; }
    setBusyAdd(r.id);
    try {
      const { data } = await api.post("/outreach/leads/from-xino", {
        name: r.name, email: r.email, phone: r.phone, company: r.company,
        note: r.requirements, list_name: (listNames[r.id] || "Xino Estimate Leads").trim() || "Xino Estimate Leads",
      });
      setAdded((p) => ({ ...p, [r.id]: data.list_name }));
      toast.success(`Added to lead list "${data.list_name}"`, { description: "Visible in Lead Management & as a Pipeline tab." });
    } catch (e) { toast.error(formatApiError(e)); }
    setBusyAdd("");
  };

  useEffect(() => {
    api.get("/xino/estimates")
      .then(({ data }) => setRows(data))
      .catch((e) => { toast.error(formatApiError(e)); setRows([]); });
  }, []);
  const filtered = useMemo(() => {
    if (!rows) return [];
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) => [r.name, r.email, r.company, r.phone, r.app_type, r.requirements].join(" ").toLowerCase().includes(t));
  }, [rows, q]);

  if (rows === null) return <div className="flex justify-center py-12"><Loader2 size={22} className="animate-spin text-[#F97316]" /></div>;
  return (
    <div className="space-y-3" data-testid="xino-estimates-tab">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm font-bold text-[#0F2042]">
          <Sparkles size={15} className="text-[#F97316]" /> Website Xino Estimate Leads
          <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-[#F97316]">{rows.length}</span>
        </div>
        <div className="relative ml-auto">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, requirement…"
            data-testid="xino-est-search"
            className="w-64 rounded-full border border-slate-200 py-1.5 pl-8 pr-3 text-xs outline-none focus:border-[#F97316]" />
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-400">
          <Sparkles size={26} className="mx-auto mb-2 text-slate-300" />
          No Xino estimates yet — they appear here the moment a visitor requests a cost &amp; time estimate on the website.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const res = r.result || {};
            const expanded = open === r.id;
            return (
              <div key={r.id} className="rounded-xl border border-slate-200 bg-white" data-testid={`xino-est-${r.id}`}>
                <button onClick={() => setOpen(expanded ? "" : r.id)} className="flex w-full items-center gap-3 p-3 text-left" data-testid={`xino-est-toggle-${r.id}`}>
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#F97316] to-[#FBBF24] font-bold text-white">
                    {(r.name || "?").slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold text-[#0F2042]">{r.name} {r.company && <span className="font-normal text-slate-400">· {r.company}</span>}</div>
                    <div className="truncate text-[11px] text-slate-500">{r.email}{r.phone ? ` · ${r.phone}` : ""} · {(r.created_at || "").slice(0, 16).replace("T", " ")}</div>
                  </div>
                  <span className="hidden rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600 sm:inline">{String(r.app_type || "").replace(/_/g, " ")}</span>
                  {res.budget_low_usd != null && (
                    <span className="hidden font-bold text-emerald-600 sm:inline">{fmtUsd(res.budget_low_usd)}–{fmtUsd(res.budget_high_usd)}</span>
                  )}
                  {expanded ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />}
                </button>
                {expanded && (
                  <div className="grid gap-3 border-t border-slate-100 p-4 sm:grid-cols-2" data-testid={`xino-est-detail-${r.id}`}>
                    <div className="space-y-1.5 text-xs text-slate-600">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Contact details</div>
                      <div className="flex items-center gap-1.5"><Mail size={11} className="text-slate-400" /> {r.email}</div>
                      {r.phone && <div className="flex items-center gap-1.5"><Phone size={11} className="text-slate-400" /> {r.phone}</div>}
                      {r.company && <div className="flex items-center gap-1.5"><Building2 size={11} className="text-slate-400" /> {r.company}</div>}
                      <div className="pt-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Requirements entered</div>
                      <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-2.5 leading-relaxed">{r.requirements}</p>
                    </div>
                    <div className="space-y-1.5 text-xs text-slate-600">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Xino AI estimate</div>
                      <div className="rounded-lg bg-orange-50 p-3 ring-1 ring-orange-100">
                        {res.budget_low_usd != null && <div>💰 <b>Projexino offer:</b> {fmtUsd(res.budget_low_usd)} – {fmtUsd(res.budget_high_usd)}</div>}
                        {res.market_low_usd != null && <div>📊 <b>Market reference:</b> {fmtUsd(res.market_low_usd)} – {fmtUsd(res.market_high_usd)}</div>}
                        {res.timeline_weeks_low != null && <div>🗓️ <b>Timeline:</b> {res.timeline_weeks_low}–{res.timeline_weeks_high} weeks</div>}
                        {res.complexity && <div>⚙️ <b>Complexity:</b> {res.complexity}{res.confidence ? ` · ${res.confidence} confidence` : ""}</div>}
                        {res.summary && <p className="mt-1 border-t border-orange-100 pt-1 text-[11px] italic text-slate-500">{res.summary}</p>}
                      </div>
                      {Array.isArray(res.modules) && res.modules.length > 0 && (
                        <ul className="list-inside list-disc rounded-lg bg-slate-50 p-2.5">
                          {res.modules.map((mo, i) => <li key={i}>{typeof mo === "string" ? mo : mo.name || JSON.stringify(mo)}</li>)}
                        </ul>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 sm:col-span-2" data-testid={`xino-add-list-row-${r.id}`}>
                      {added[r.id] ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1.5 text-[11px] font-bold text-emerald-700" data-testid={`xino-added-${r.id}`}>
                          <CheckCircle2 size={12} /> Added to "{added[r.id]}"
                        </span>
                      ) : (
                        <>
                          <input value={listNames[r.id] ?? "Xino Estimate Leads"}
                            onChange={(e) => setListNames((p) => ({ ...p, [r.id]: e.target.value }))}
                            data-testid={`xino-list-name-${r.id}`}
                            placeholder="Lead list name"
                            className="w-56 rounded-full border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-[#F97316]" />
                          <button onClick={() => addToList(r)} disabled={busyAdd === r.id}
                            data-testid={`xino-add-to-list-${r.id}`}
                            className="inline-flex items-center gap-1.5 rounded-full bg-[#0F2042] px-4 py-1.5 text-[11px] font-bold text-white hover:bg-[#1a3060] disabled:opacity-50">
                            {busyAdd === r.id ? <Loader2 size={11} className="animate-spin" /> : <ListPlus size={11} />} Add to Lead List
                          </button>
                          <span className="text-[10px] text-slate-400">Creates/updates the list & pushes this contact into Outreach leads.</span>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
