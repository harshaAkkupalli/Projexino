/**
 * WebsiteConfigHub.jsx — Iter 39 · Website Config + Blog + LinkedIn + Newsletter + Experience Manager.
 */
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Globe2, FileText, Megaphone, Mail, Sparkles } from "lucide-react";
import WebsiteConfig from "./WebsiteConfig";
import BlogEditor from "./BlogEditor";
import LinkedInQueue from "./LinkedInQueue";
import Newsletter from "./Newsletter";
import WebsiteExperienceManager from "./WebsiteExperienceManager";
import JobPostings from "./JobPostings";
import { BriefcaseBusiness } from "lucide-react";

const TABS = [
  { v: "config", label: "Website Config", icon: Globe2 },
  { v: "wxm", label: "Experience Manager", icon: Sparkles },
  { v: "blog", label: "Blog", icon: FileText },
  { v: "linkedin", label: "LinkedIn", icon: Megaphone },
  { v: "newsletter", label: "Newsletter", icon: Mail },
  { v: "jobs", label: "Job Postings", icon: BriefcaseBusiness },
];

export default function WebsiteConfigHub() {
  const [params, setParams] = useSearchParams();
  const initial = params.get("tab") || "config";
  const [tab, setTabState] = useState(TABS.find((t) => t.v === initial) ? initial : "config");
  const setTab = (v) => { setTabState(v); setParams((p) => { p.set("tab", v); return p; }, { replace: true }); };
  useEffect(() => {
    const t = params.get("tab");
    if (t && TABS.find((x) => x.v === t) && t !== tab) setTabState(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
  return (
    <div className="space-y-4" data-testid="page-website-hub">
      <div className="inline-flex flex-wrap gap-1 rounded-full bg-white p-1 shadow-sm ring-1 ring-slate-200">
        {TABS.map((t) => (
          <button key={t.v} onClick={() => setTab(t.v)} data-testid={`webhub-tab-${t.v}`}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition ${tab === t.v ? "bg-[#0F2042] text-white shadow" : "text-slate-500 hover:text-[#0F2042]"}`}>
            <t.icon size={12}/> {t.label}
          </button>
        ))}
      </div>
      {tab === "config" && <WebsiteConfig/>}
      {tab === "wxm" && <WebsiteExperienceManager/>}
      {tab === "blog" && <BlogEditor/>}
      {tab === "linkedin" && <LinkedInQueue/>}
      {tab === "newsletter" && <Newsletter/>}
      {tab === "jobs" && <JobPostings/>}
    </div>
  );
}
