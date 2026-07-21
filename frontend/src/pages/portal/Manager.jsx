import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Users2, AlertTriangle, Award, Clock3, ListChecks, FileText, ShieldCheck, ShieldX,
  FolderPlus, ClipboardPlus, MessageCircle, X, Send, Paperclip, Upload,
} from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import PageInfographic from "@/components/PageInfographic";

export default function Manager() {
  const [data, setData] = useState({ summary: {}, interns: [] });
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assignTaskFor, setAssignTaskFor] = useState(null); // intern obj
  const [assignProjectFor, setAssignProjectFor] = useState(null);
  const [chatFor, setChatFor] = useState(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const [a, b] = await Promise.all([
        api.get("/manager/interns"),
        api.get("/manager/activity-feed"),
      ]);
      setData(a.data); setFeed(b.data);
    } finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  const verify = async (intern_id, doc_type, verified) => {
    let note = "";
    if (!verified) {
      note = window.prompt("Reason for rejection (visible to intern):", "") || "";
      if (note === null) return;
    }
    try {
      await api.post("/manager/verify-document", { intern_id, doc_type, verified, note });
      toast.success(verified ? "Document verified" : "Document rejected");
      refresh();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Failed"); }
  };

  const s = data.summary || {};

  return (
    <div data-testid="portal-manager" className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-orange-50/40 to-purple-50/40 p-6 shadow-sm">
        <div className="relative grid items-center gap-6 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <div className="text-xs font-bold uppercase tracking-[0.25em] text-[#F97316]">// intern hub</div>
            <h1 className="font-display mt-2 text-3xl font-medium leading-tight text-[#0F2042] md:text-4xl">
              Manage every intern from one screen.
            </h1>
            <p className="mt-3 text-sm text-slate-600">
              Assign projects with onboarding docs, hand off tasks, verify paperwork, chat live —
              all in one place.
            </p>
          </div>
          <div className="lg:col-span-3">
            <PageInfographic variant="interns" className="h-56 w-full" />
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard icon={Users2} label="Interns" value={s.total_interns || 0} c="#3B82F6" />
        <KpiCard icon={Clock3} label="Active today" value={s.active_today || 0} c="#10B981" />
        <KpiCard icon={AlertTriangle} label="At-risk" value={s.at_risk || 0} c="#EF4444" />
        <KpiCard icon={Award} label="Badges (total)" value={s.badges_total || 0} c="#F97316" />
        <KpiCard icon={ListChecks} label="Tasks overdue" value={s.tasks_overdue_total || 0} c="#A855F7" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Loading…</div>
          ) : data.interns.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">No interns under your supervision yet.</div>
          ) : data.interns.map((row, i) => (
            <InternRow key={row.intern.id} row={row} index={i}
              onVerify={verify}
              onAssignTask={() => setAssignTaskFor(row.intern)}
              onAssignProject={() => setAssignProjectFor(row.intern)}
              onChat={() => setChatFor(row.intern)} />
          ))}
        </div>

        <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#F97316]">// live feed</div>
            <h3 className="font-display mt-1 text-lg font-semibold">Recent activity</h3>
          </div>
          <div className="space-y-3 max-h-[600px] overflow-y-auto">
            {feed.length === 0 ? (
              <div className="text-sm text-slate-400">No activity yet.</div>
            ) : feed.map((f, i) => (
              <motion.div key={`${f.intern_id}-${f.at}-${i}`}
                initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                className="rounded-xl border border-slate-100 p-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-1.5 w-1.5 rounded-full" style={{ background: pickColor(f.kind) }} />
                  <span className="font-semibold text-[#0F172A]">{f.intern}</span>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-500">{ago(f.at)}</span>
                </div>
                <div className="mt-1 font-semibold text-slate-700">{f.title}</div>
                {f.detail && <div className="mt-0.5 text-slate-500">{f.detail}</div>}
              </motion.div>
            ))}
          </div>
        </aside>
      </div>

      <AnimatePresence>
        {assignTaskFor && <AssignTaskModal intern={assignTaskFor} onClose={() => setAssignTaskFor(null)} onDone={refresh} />}
        {assignProjectFor && <AssignProjectModal intern={assignProjectFor} onClose={() => setAssignProjectFor(null)} onDone={refresh} />}
        {chatFor && <ChatPopup intern={chatFor} onClose={() => setChatFor(null)} />}
      </AnimatePresence>
    </div>
  );
}

function InternRow({ row, index, onVerify, onAssignTask, onAssignProject, onChat }) {
  const i = row.intern;
  const [expanded, setExpanded] = useState(false);
  const maxMin = Math.max(...(row.hours_last_7d.map((h) => h.minutes) || [60]), 60);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}
      data-testid={`manager-row-${i.id}`}
      className={`rounded-2xl border bg-white p-5 shadow-sm ${row.at_risk ? "border-red-200" : "border-slate-200"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#F97316] to-[#A855F7] text-sm font-bold text-white">
            {i.name?.[0]?.toUpperCase()}
          </div>
          <div>
            <div className="font-display text-base font-semibold text-[#0F172A]">{i.name}</div>
            <div className="text-xs text-slate-500">{i.designation} · {i.department}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {row.at_risk && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
              <AlertTriangle size={10} /> AT RISK
            </span>
          )}
          <button data-testid={`assign-project-${i.id}`} onClick={onAssignProject}
            className="inline-flex items-center gap-1 rounded-md border border-purple-200 bg-purple-50 px-2.5 py-1 text-[10px] font-semibold text-purple-700 hover:bg-purple-100">
            <FolderPlus size={11} /> Assign Project
          </button>
          <button data-testid={`assign-task-${i.id}`} onClick={onAssignTask}
            className="inline-flex items-center gap-1 rounded-md border border-orange-200 bg-orange-50 px-2.5 py-1 text-[10px] font-semibold text-orange-700 hover:bg-orange-100">
            <ClipboardPlus size={11} /> Assign Task
          </button>
          <button data-testid={`chat-intern-${i.id}`} onClick={onChat}
            className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100">
            <MessageCircle size={11} /> Chat
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-5">
        <Metric label="Today" value={`${row.today_minutes}m`} c="#10B981" />
        <Metric label="Week" value={`${row.total_hours_week}h`} c="#3B82F6" />
        <Metric label="Done" value={`${row.tasks_completed}/${row.tasks_total}`} c="#10B981" />
        <Metric label="Overdue" value={row.tasks_overdue} c={row.tasks_overdue ? "#EF4444" : "#94A3B8"} />
        <Metric label="Docs" value={`${row.docs_submitted}/${row.docs_required}`} c="#A855F7" />
      </div>

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-slate-400">
          <span>Hours · last 7 days</span>
          <span>{row.total_hours_week}h total</span>
        </div>
        <div className="flex h-16 items-end gap-1">
          {row.hours_last_7d.length === 0 ? (
            <div className="flex h-full w-full items-center justify-center rounded-lg bg-slate-50 text-[10px] text-slate-400">
              No login activity yet
            </div>
          ) : row.hours_last_7d.map((d) => {
            const pct = Math.min((d.minutes / maxMin) * 100, 100);
            return (
              <div key={d.date} className="flex-1 text-center">
                <div className="relative h-12 rounded-md bg-slate-100">
                  <motion.div initial={{ height: 0 }} animate={{ height: `${pct}%` }} transition={{ duration: 0.6 }}
                    className="absolute bottom-0 left-0 right-0 rounded-md bg-gradient-to-t from-[#F97316] to-[#A855F7]" />
                </div>
                <div className="mt-1 text-[9px] text-slate-500">{d.date.slice(5)}</div>
              </div>
            );
          })}
        </div>
      </div>

      {row.at_risk_reasons.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
          {row.at_risk_reasons.map((r, k) => (
            <span key={k} className="rounded-full bg-red-50 px-2 py-0.5 font-semibold text-red-600">{r}</span>
          ))}
        </div>
      )}

      <button onClick={() => setExpanded((v) => !v)} data-testid={`expand-${i.id}`} className="mt-3 text-xs font-semibold text-[#F97316] hover:underline">
        {expanded ? "Hide documents" : "Documents & verification →"}
      </button>

      {expanded && (
        <div className="mt-3 space-y-2">
          {Object.entries(i.submitted_docs || {}).length === 0 ? (
            <div className="text-xs text-slate-400">No documents submitted yet.</div>
          ) : Object.entries(i.submitted_docs).map(([t, d]) => {
            const state = d.verified === true ? "verified" : d.verified === false && d.verified_at ? "rejected" : "pending";
            return (
              <div key={t} className={`rounded-lg border p-2.5 text-xs ${state === "rejected" ? "border-red-200 bg-red-50/40" : "border-slate-100"}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <FileText size={13} className="text-slate-400" />
                    <div>
                      <div className="font-semibold text-slate-700 capitalize">{t.replace(/_/g, " ")}</div>
                      <div className="text-[10px] text-slate-400">{d.file_name} · {new Date(d.submitted_at).toLocaleDateString()}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {state === "verified" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-700">
                        <ShieldCheck size={9} /> Verified
                      </span>
                    ) : state === "rejected" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[9px] font-bold text-red-700">
                        <ShieldX size={9} /> Rejected
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-700">
                        Pending
                      </span>
                    )}
                  </div>
                </div>
                {(state === "verified" || state === "rejected") && (d.verified_by || d.verifier_note) && (
                  <div className="mt-2 rounded-md bg-white/60 px-2 py-1 text-[10px] text-slate-500">
                    {d.verified_by && <span className="font-semibold text-slate-600">{d.verified_by}</span>}
                    {d.verified_at && <span> · {new Date(d.verified_at).toLocaleDateString()}</span>}
                    {d.verifier_note && <div className="mt-0.5 italic">"{d.verifier_note}"</div>}
                  </div>
                )}
                <div className="mt-2 flex gap-1.5">
                  {state !== "verified" && (
                    <button onClick={() => onVerify(i.id, t, true)} data-testid={`verify-${i.id}-${t}`}
                      className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100">
                      <ShieldCheck size={10} className="mr-1 inline" /> Verify
                    </button>
                  )}
                  {state !== "rejected" && (
                    <button onClick={() => onVerify(i.id, t, false)} data-testid={`reject-${i.id}-${t}`}
                      className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-[10px] font-semibold text-red-700 hover:bg-red-100">
                      <ShieldX size={10} className="mr-1 inline" /> Reject
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

/* =================================================================
   ASSIGN TASK MODAL — project dropdown + file attachments
================================================================= */
function AssignTaskModal({ intern, onClose, onDone }) {
  const [form, setForm] = useState({
    title: "", description: "", project_id: "", project_name: "",
    deadline: defaultDeadline(), priority: "medium",
    publish_to_project_docs: false,
  });
  const [projects, setProjects] = useState([]);
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.get("/projects").then(({ data }) => setProjects(data)).catch(() => {}); }, []);

  const handleFiles = async (filelist) => {
    const next = [...files];
    for (const f of Array.from(filelist || [])) {
      if (f.size > 10 * 1024 * 1024) { toast.error(`${f.name} > 10MB — skipped`); continue; }
      const content_base64 = await readBase64(f);
      next.push({ name: f.name, mime_type: f.type || "application/octet-stream", content_base64 });
    }
    setFiles(next.slice(0, 10));
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/intern-hub/assign-task", {
        intern_id: intern.id,
        title: form.title,
        description: form.description,
        project_id: form.project_id || "",
        project_name: form.project_name || "",
        deadline: form.deadline,
        priority: form.priority,
        attachments: files,
        publish_to_project_docs: form.publish_to_project_docs,
      });
      toast.success("Task assigned");
      onDone(); onClose();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Failed"); }
    finally { setSaving(false); }
  };

  return (
    <ModalShell onClose={onClose} title={`Assign task → ${intern.name}`} testId="assign-task-modal">
      <form onSubmit={submit} className="space-y-3 text-sm">
        <Input label="Title *" value={form.title} onChange={(v) => setForm({ ...form, title: v })} required testId="task-title" />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Project" value={form.project_id} onChange={(v) => {
            const p = projects.find((x) => x.id === v);
            setForm({ ...form, project_id: v, project_name: p?.name || "" });
          }} options={[{ value: "", label: "— None —" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]} testId="task-project" />
          <Select label="Priority" value={form.priority} onChange={(v) => setForm({ ...form, priority: v })}
            options={["low", "medium", "high"].map((o) => ({ value: o, label: o }))} testId="task-priority" />
        </div>
        <Input label="Deadline *" type="date" value={form.deadline} onChange={(v) => setForm({ ...form, deadline: v })} required testId="task-deadline" />
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-500">Description / Brief</span>
          <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-[#F97316]" data-testid="task-desc" />
        </label>
        <FilePicker files={files} onPick={handleFiles} onRemove={(idx) => setFiles((p) => p.filter((_, k) => k !== idx))} />
        {form.project_id && files.length > 0 && (
          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={form.publish_to_project_docs}
              onChange={(e) => setForm({ ...form, publish_to_project_docs: e.target.checked })} data-testid="publish-checkbox" />
            Also publish these files to the project Documents tab (visible to whole team)
          </label>
        )}
        <button disabled={saving} className="btn-primary mt-2 w-full justify-center" data-testid="assign-task-submit">
          {saving ? "Assigning…" : "Assign Task"}
        </button>
      </form>
    </ModalShell>
  );
}

/* =================================================================
   ASSIGN PROJECT MODAL — pick project + optional docs published to project
================================================================= */
function AssignProjectModal({ intern, onClose, onDone }) {
  const [form, setForm] = useState({ project_id: "", role: "Contributor", note: "", publish_to_project_docs: true });
  const [projects, setProjects] = useState([]);
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.get("/projects").then(({ data }) => setProjects(data)).catch(() => {}); }, []);

  const handleFiles = async (filelist) => {
    const next = [...files];
    for (const f of Array.from(filelist || [])) {
      if (f.size > 10 * 1024 * 1024) { toast.error(`${f.name} > 10MB — skipped`); continue; }
      const content_base64 = await readBase64(f);
      next.push({ name: f.name, mime_type: f.type || "application/octet-stream", content_base64 });
    }
    setFiles(next.slice(0, 10));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.project_id) { toast.error("Pick a project"); return; }
    setSaving(true);
    try {
      await api.post("/intern-hub/assign-project", {
        intern_id: intern.id,
        project_id: form.project_id,
        role: form.role,
        note: form.note,
        attachments: files,
        publish_to_project_docs: form.publish_to_project_docs,
      });
      toast.success("Project assigned");
      onDone(); onClose();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Failed"); }
    finally { setSaving(false); }
  };

  return (
    <ModalShell onClose={onClose} title={`Assign project → ${intern.name}`} testId="assign-project-modal">
      <form onSubmit={submit} className="space-y-3 text-sm">
        <Select label="Project *" value={form.project_id} onChange={(v) => setForm({ ...form, project_id: v })}
          options={[{ value: "", label: "— pick project —" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
          testId="assign-project-select" />
        <Input label="Intern role on project" value={form.role} onChange={(v) => setForm({ ...form, role: v })} testId="assign-project-role" />
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-500">Brief / instructions</span>
          <textarea rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-[#F97316]" data-testid="assign-project-note" />
        </label>
        <FilePicker files={files} onPick={handleFiles} onRemove={(idx) => setFiles((p) => p.filter((_, k) => k !== idx))} />
        <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={form.publish_to_project_docs}
            onChange={(e) => setForm({ ...form, publish_to_project_docs: e.target.checked })} />
          Publish attached files to project Documents (recommended)
        </label>
        <button disabled={saving} className="btn-primary mt-2 w-full justify-center" data-testid="assign-project-submit">
          {saving ? "Assigning…" : "Assign Project"}
        </button>
      </form>
    </ModalShell>
  );
}

/* =================================================================
   CHAT POPUP — direct DM between current user and intern
================================================================= */
function ChatPopup({ intern, onClose }) {
  const [channel, setChannel] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let interval;
    (async () => {
      try {
        const { data } = await api.post("/intern-hub/dm-channel", { intern_id: intern.id });
        if (cancelled) return;
        setChannel(data);
        const load = async () => {
          try {
            const { data: m } = await api.get(`/chat/channels/${data.id}/messages`);
            if (!cancelled) setMessages(m);
          } catch {}
        };
        await load();
        interval = setInterval(load, 3500);
      } catch (e) {
        toast.error(formatApiError(e.response?.data?.detail) || "Cannot open chat");
        onClose();
      }
    })();
    return () => { cancelled = true; if (interval) clearInterval(interval); };
  }, [intern.id]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  const send = async (e) => {
    e?.preventDefault?.();
    if (!text.trim() || !channel) return;
    setSending(true);
    try {
      await api.post("/chat/messages", { channel_id: channel.id, text });
      setText("");
      const { data: m } = await api.get(`/chat/channels/${channel.id}/messages`);
      setMessages(m);
    } catch {} finally { setSending(false); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-end bg-black/30 p-4 sm:items-center sm:justify-center">
      <motion.div initial={{ scale: 0.96, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 12 }}
        onClick={(e) => e.stopPropagation()}
        data-testid="chat-popup"
        className="flex h-[560px] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-[#F97316]/15 to-[#A855F7]/15 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#F97316] to-[#A855F7] text-sm font-bold text-white">
              {intern.name?.[0]?.toUpperCase()}
            </div>
            <div>
              <div className="text-sm font-semibold text-[#0F172A]">{intern.name}</div>
              <div className="text-[10px] text-slate-500">Direct message · {intern.designation}</div>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:text-[#0F172A]" data-testid="chat-popup-close"><X size={16} /></button>
        </div>
        <div className="scrollbar-thin flex-1 space-y-2 overflow-y-auto bg-slate-50/40 p-3 text-sm">
          {messages.length === 0 && (
            <div className="text-center text-xs text-slate-400">No messages yet — say hi 👋</div>
          )}
          {messages.map((m) => {
            const mine = m.author_email && (m.author_email.toLowerCase() !== intern.email?.toLowerCase());
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs ${mine ? "bg-[#0F2042] text-white" : "bg-white text-[#0F172A] border border-slate-200"}`}>
                  {!mine && <div className="mb-0.5 text-[9px] font-bold uppercase tracking-[0.15em] opacity-70">{m.author}</div>}
                  <div className="whitespace-pre-wrap">{m.text}</div>
                  <div className={`mt-1 text-[9px] ${mine ? "text-white/60" : "text-slate-400"}`}>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
        <form onSubmit={send} className="flex gap-2 border-t border-slate-100 p-3">
          <input data-testid="chat-popup-input" value={text} onChange={(e) => setText(e.target.value)}
            placeholder="Type a message…" className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
          <button disabled={sending || !text.trim()} className="btn-primary px-3" data-testid="chat-popup-send">
            <Send size={14} />
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
}

/* =================================================================
   SHARED — small UI helpers
================================================================= */
function ModalShell({ onClose, title, testId, children }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        data-testid={testId}
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold">{title}</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

function Input({ label, value, onChange, type = "text", required, testId }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-500">{label}</span>
      <input type={type} required={required} value={value} onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-[#F97316]" />
    </label>
  );
}

function Select({ label, value, onChange, options, testId }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-500">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 outline-none focus:border-[#F97316]">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

function FilePicker({ files, onPick, onRemove }) {
  return (
    <div>
      <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-500">Attachments (≤10MB each)</span>
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-orange-200 bg-orange-50/30 p-3 text-xs text-[#F97316] hover:bg-orange-50">
        <Upload size={14} /> Click to add files
        <input type="file" hidden multiple onChange={(e) => onPick(e.target.files)} data-testid="file-picker-input" />
      </label>
      {files.length > 0 && (
        <ul className="mt-2 space-y-1">
          {files.map((f, idx) => (
            <li key={idx} className="flex items-center justify-between rounded-md bg-slate-50 px-2 py-1 text-[11px] text-slate-700">
              <span className="flex items-center gap-1"><Paperclip size={10} /> {f.name}</span>
              <button type="button" onClick={() => onRemove(idx)} className="text-slate-400 hover:text-red-500"><X size={11} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Metric({ label, value, c }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <div className="text-[9px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="font-display text-base font-semibold" style={{ color: c }}>{value}</div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, c }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="rounded-lg p-2" style={{ background: `${c}15`, color: c }}><Icon size={16} /></div>
        <div className="text-[9px] uppercase tracking-[0.2em] text-slate-400">live</div>
      </div>
      <div className="mt-3 font-display text-2xl font-semibold" style={{ color: c }}>{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</div>
    </div>
  );
}

function pickColor(kind) {
  return { task_status: "#10B981", doc_submitted: "#3B82F6", badge: "#F97316" }[kind] || "#94A3B8";
}

function ago(iso) {
  if (!iso) return "—";
  const m = (Date.now() - new Date(iso).getTime()) / 60000;
  if (m < 1) return "just now";
  if (m < 60) return `${Math.floor(m)}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}

function defaultDeadline() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

function readBase64(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = reject;
    fr.onload = () => {
      const s = String(fr.result || "");
      resolve(s.includes(",") ? s.split(",")[1] : s);
    };
    fr.readAsDataURL(file);
  });
}
