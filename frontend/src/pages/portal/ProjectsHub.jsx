/**
 * ProjectsHub.jsx — Iter 38 · embeds Projects + Tasks + Issues under one page
 * with a small top-of-page tab strip. The underlying components stay untouched.
 */
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { FolderKanban, ListChecks, AlertTriangle } from "lucide-react";
import Projects from "./Projects";
import Tasks from "./Tasks";
import Issues from "./Issues";

const TABS = [
  { v: "projects", label: "Projects", icon: FolderKanban },
  { v: "tasks", label: "Tasks", icon: ListChecks },
  { v: "issues", label: "Issues", icon: AlertTriangle },
];

export default function ProjectsHub() {
  const [params, setParams] = useSearchParams();
  const initial = params.get("tab") || "projects";
  const [tab, setTabState] = useState(TABS.find((t) => t.v === initial) ? initial : "projects");
  const setTab = (v) => { setTabState(v); setParams((p) => { p.set("tab", v); return p; }, { replace: true }); };
  useEffect(() => {
    const t = params.get("tab");
    if (t && TABS.find((x) => x.v === t) && t !== tab) setTabState(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
  return (
    <div className="space-y-4" data-testid="page-projects-hub">
      <div className="inline-flex flex-wrap gap-1 rounded-full bg-white p-1 shadow-sm ring-1 ring-slate-200">
        {TABS.map((t) => (
          <button key={t.v} onClick={() => setTab(t.v)} data-testid={`projhub-tab-${t.v}`}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition ${tab === t.v ? "bg-[#0F2042] text-white shadow" : "text-slate-500 hover:text-[#0F2042]"}`}>
            <t.icon size={12}/> {t.label}
          </button>
        ))}
      </div>
      {tab === "projects" && <Projects/>}
      {tab === "tasks" && <Tasks/>}
      {tab === "issues" && <Issues/>}
    </div>
  );
}
