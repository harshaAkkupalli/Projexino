/**
 * Newsletter.jsx — Admin newsletter management.
 *
 * Tabs:
 *   • Subscribers — list, search, filter by status/tag, add/import, delete
 *   • Compose     — custom HTML newsletter to all/active/tag-filtered audience
 *   • History     — past sends with success/fail counts
 */
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Mail, Search, Plus, Trash2, Download, Send, Loader2, Users,
  History as HistoryIcon, FileEdit, Tag as TagIcon, UploadCloud,
  Sparkles, FileText, X, Eye,
} from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";

const TABS = [
  { v: "subscribers", label: "Subscribers", icon: Users },
  { v: "compose", label: "Compose", icon: FileEdit },
  { v: "history", label: "History", icon: HistoryIcon },
];

export default function Newsletter() {
  const [tab, setTab] = useState("subscribers");
  return (
    <div data-testid="page-newsletter" className="space-y-5">
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-orange-50/40 to-violet-50/30 p-6 md:p-7 shadow-sm">
        <div className="relative flex flex-col items-start gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.32em] text-[#F97316]">// growth · email</div>
            <h1 className="font-display mt-1 text-3xl font-medium text-[#0F2042] md:text-4xl">Newsletter Studio</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Manage public newsletter subscribers, compose campaigns, and broadcast any published blog post to your list — using your connected Gmail accounts.
            </p>
          </div>
        </div>
        <div className="relative mt-5 inline-flex rounded-full bg-white p-1 shadow-sm ring-1 ring-slate-200">
          {TABS.map((t) => (
            <button key={t.v} data-testid={`nl-tab-${t.v}`} onClick={() => setTab(t.v)}
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition ${tab === t.v ? "bg-[#0F2042] text-white shadow" : "text-slate-500 hover:text-[#0F2042]"}`}>
              <t.icon size={12} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "subscribers" && <SubscribersTab />}
      {tab === "compose" && <ComposeTab />}
      {tab === "history" && <HistoryTab />}
    </div>
  );
}

/* ============ Subscribers ============ */
function SubscribersTab() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, active: 0 });
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [show, setShow] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/newsletter/subscribers");
      setList(data.items || []);
      setStats({ total: data.total || 0, active: data.active || 0 });
    } catch (e) { toast.error(formatApiError(e)); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return list
      .filter((u) => statusFilter === "all" || u.status === statusFilter)
      .filter((u) => !s || (u.email || "").includes(s) || (u.name || "").toLowerCase().includes(s));
  }, [list, q, statusFilter]);

  const remove = async (sub) => {
    if (!window.confirm(`Delete subscriber "${sub.email}"?`)) return;
    try {
      await api.delete(`/admin/newsletter/subscribers/${sub.id}`);
      toast.success("Subscriber removed");
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const exportCsv = () => {
    const header = "email,name,status,source,tags,subscribed_at";
    const rows = filtered.map((u) => [
      u.email, (u.name || "").replace(/,/g, " "), u.status, u.source || "",
      (u.tags || []).join(";"), u.subscribed_at || "",
    ].join(","));
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `projexino-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <StatCard label="Total subscribers" value={stats.total} icon={Users} />
        <StatCard label="Active" value={stats.active} icon={Mail} color="emerald" />
        <StatCard label="Unsubscribed" value={stats.total - stats.active} icon={Trash2} color="rose" />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search email / name…"
            data-testid="nl-search"
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#F97316]" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} data-testid="nl-status-filter"
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316]">
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="unsubscribed">Unsubscribed</option>
        </select>
        <button onClick={exportCsv} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:border-[#F97316] hover:text-[#F97316]" data-testid="nl-export">
          <Download size={12} /> Export CSV
        </button>
        <button onClick={() => setShow(true)} className="btn-primary text-xs" data-testid="nl-add">
          <Plus size={14} /> Add
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-[#F97316]" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">No subscribers match your filter.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Subscribed</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-t border-slate-100 hover:bg-orange-50/30" data-testid={`nl-row-${u.email}`}>
                  <td className="px-4 py-3 font-bold text-[#0F2042]">{u.email}</td>
                  <td className="px-4 py-3 text-slate-600">{u.name || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${u.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {u.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 capitalize">{u.source || "—"}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{u.subscribed_at?.slice(0, 10)}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => remove(u)} className="rounded-lg border border-slate-200 p-1.5 text-red-500 hover:border-red-300 hover:bg-red-50" data-testid={`nl-delete-${u.email}`}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {show && <AddSubscriberModal onClose={() => setShow(false)} onAdded={load} />}
    </div>
  );
}

function AddSubscriberModal({ onClose, onAdded }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [bulk, setBulk] = useState("");
  const [busy, setBusy] = useState(false);

  const addSingle = async () => {
    setBusy(true);
    try {
      await api.post("/admin/newsletter/subscribers", { email, name, source: "manual" });
      toast.success("Added");
      onAdded(); onClose();
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };

  const addBulk = async () => {
    const lines = bulk.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
    if (!lines.length) return;
    setBusy(true);
    let ok = 0, fail = 0;
    for (const line of lines) {
      const [em, nm] = line.split(/\s+/, 2);
      try {
        await api.post("/admin/newsletter/subscribers", { email: em, name: nm || "", source: "manual" });
        ok++;
      } catch { fail++; }
    }
    toast.success(`Added ${ok} subscriber${ok !== 1 ? "s" : ""}${fail ? ` (${fail} failed)` : ""}`);
    setBusy(false);
    onAdded(); onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <h3 className="font-display text-lg font-semibold text-[#0F2042]">Add subscriber(s)</h3>
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">Single email</label>
            <div className="mt-1 flex gap-2">
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="hello@company.com" type="email"
                className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)"
                className="w-32 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
              <button onClick={addSingle} disabled={busy || !email} className="btn-primary text-xs"><Plus size={14}/></button>
            </div>
          </div>
          <div className="border-t border-slate-100 pt-3">
            <label className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">Bulk paste (one email per line, optional name after a space)</label>
            <textarea value={bulk} onChange={(e) => setBulk(e.target.value)} rows={6}
              placeholder={"jane@acme.com Jane Doe\njohn@beta.com\nfoo@bar.io Foo Bar"}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
            <button onClick={addBulk} disabled={busy || !bulk.trim()} className="mt-2 inline-flex items-center gap-1 rounded-full bg-[#0F2042] px-4 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-white disabled:opacity-50">
              {busy ? <Loader2 size={12} className="animate-spin"/> : <UploadCloud size={12}/>} Import all
            </button>
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <button onClick={onClose} className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-bold text-slate-600">Close</button>
        </div>
      </div>
    </div>
  );
}

/* ============ Compose ============ */
function ComposeTab() {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState("all");
  const [tag, setTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [showBlogPicker, setShowBlogPicker] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [draftMeta, setDraftMeta] = useState(null); // {blog_title, key_points, takeaway}

  const send = async () => {
    if (!subject || !body) { toast.error("Subject and body are required"); return; }
    if (!window.confirm(`Send newsletter "${subject}" to ${audience === "all" ? "ALL active subscribers" : `subscribers tagged "${tag}"`}?`)) return;
    setBusy(true);
    try {
      const { data } = await api.post("/admin/newsletter/send", { subject, body_html: body, audience, tag });
      toast.success(`Sent to ${data.success_count}/${data.to_count}`);
      setSubject(""); setBody(""); setDraftMeta(null);
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };

  const onDraftReady = (draft) => {
    setSubject(draft.subject || "");
    setBody(draft.body_html || "");
    setDraftMeta({
      blog_title: draft.blog_title, blog_post_slug: draft.blog_post_slug,
      key_points: draft.key_points || [], takeaway: draft.takeaway || "",
      preheader: draft.preheader || "",
    });
    setShowBlogPicker(false);
    toast.success(`Drafted from "${draft.blog_title}" — edit anything before sending.`);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr,300px]">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">Compose</div>
          <div className="flex items-center gap-2">
            {body && (
              <button onClick={() => setPreviewOpen(true)} data-testid="nl-preview-btn"
                className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-bold text-slate-600 hover:border-[#0F2042] hover:text-[#0F2042]">
                <Eye size={11}/> Preview
              </button>
            )}
            <button onClick={() => setShowBlogPicker(true)} data-testid="nl-draft-from-blog-btn"
              className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-1 text-[11px] font-bold text-white shadow hover:opacity-90">
              <Sparkles size={11}/> Compose from blog
            </button>
          </div>
        </div>
        {draftMeta && (
          <div className="mb-3 rounded-xl border border-violet-200 bg-violet-50/60 p-3" data-testid="nl-draft-meta">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-violet-700">
              <Sparkles size={11}/> AI-drafted from <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-violet-200">{draftMeta.blog_title}</span>
            </div>
            {draftMeta.preheader && <div className="mt-1 text-xs text-slate-500">Preheader: <i>&ldquo;{draftMeta.preheader}&rdquo;</i></div>}
          </div>
        )}
        <label className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">Subject</label>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Projexino — your fortnightly engineering teardown"
          data-testid="nl-compose-subject"
          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
        <label className="mt-4 block text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">Body (HTML)</label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={18}
          data-testid="nl-compose-body"
          placeholder="<h2>Hi {{FirstName}},</h2>\n<p>Welcome to the Projexino Newsletter…</p>"
          className="mt-1 w-full rounded-2xl border border-slate-200 bg-white p-4 font-mono text-sm outline-none focus:border-[#F97316]" />
        <p className="mt-1 text-[11px] text-slate-400">Available variables: <code>{`{{FirstName}}`}</code>, <code>{`{{Email}}`}</code></p>
      </div>
      <div className="space-y-3 self-start">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="text-sm font-semibold text-[#0F2042]">Audience</div>
          <div className="mt-2 space-y-2 text-sm">
            <label className="flex items-center gap-2"><input type="radio" checked={audience === "all"} onChange={() => setAudience("all")} /> All active</label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={audience === "tag"} onChange={() => setAudience("tag")} />
              <span>Tag</span>
              <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="healthcare" className="flex-1 rounded border border-slate-200 px-2 py-0.5 text-xs outline-none" />
            </label>
          </div>
        </div>
        <button onClick={send} disabled={busy || !subject || !body || (audience === "tag" && !tag)}
          data-testid="nl-compose-send"
          className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#F97316] to-[#FB923C] px-5 py-3 text-xs font-bold uppercase tracking-[0.18em] text-white shadow-lg disabled:opacity-50">
          {busy ? <Loader2 size={14} className="animate-spin"/> : <Send size={14}/>} Send Now
        </button>
      </div>

      {showBlogPicker && <BlogDraftDialog onClose={() => setShowBlogPicker(false)} onReady={onDraftReady}/>}
      {previewOpen && <EmailPreview html={body} onClose={() => setPreviewOpen(false)}/>}
    </div>
  );
}

/* ============ Blog → AI Draft picker ============ */
function BlogDraftDialog({ onClose, onReady }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [draftingId, setDraftingId] = useState("");
  const [tone, setTone] = useState("editorial · friendly · concise");
  const [audienceHint, setAudienceHint] = useState("founders, CTOs and engineering leaders");

  useEffect(() => {
    api.get("/admin/blog/posts?limit=80")
      .then(({ data }) => setPosts(data.items || data || []))
      .catch((e) => toast.error(formatApiError(e)))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (posts || []).filter((p) => !s || (p.title || "").toLowerCase().includes(s) || (p.slug || "").toLowerCase().includes(s));
  }, [posts, q]);

  const draft = async (post) => {
    setDraftingId(post.id);
    try {
      const { data } = await api.post(`/admin/newsletter/draft-from-blog/${post.id}`, { tone, audience_hint: audienceHint });
      onReady(data);
    } catch (e) { toast.error(formatApiError(e)); }
    setDraftingId("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" data-testid="nl-blog-picker">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 p-5">
          <div>
            <div className="flex items-center gap-2 text-violet-700 text-[10px] font-bold uppercase tracking-[0.22em]"><Sparkles size={12}/> AI Newsletter Draft</div>
            <h3 className="mt-1 font-display text-lg font-semibold text-[#0F2042]">Pick a blog post — we&apos;ll rewrite it for your subscribers</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X size={18}/></button>
        </div>
        <div className="grid grid-cols-2 gap-3 border-b border-slate-100 p-5">
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Tone</span>
            <input value={tone} onChange={(e) => setTone(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm" data-testid="nl-draft-tone"/>
          </label>
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Audience hint</span>
            <input value={audienceHint} onChange={(e) => setAudienceHint(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm" data-testid="nl-draft-audience"/>
          </label>
        </div>
        <div className="border-b border-slate-100 p-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search blog posts…"
              className="w-full rounded-full border border-slate-200 bg-slate-50 py-1.5 pl-9 pr-3 text-sm outline-none focus:border-[#F97316]"/>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-[#F97316]"/></div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">No blog posts. Publish one first in the Blog tab.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filtered.map((p) => (
                <li key={p.id} className="flex items-center gap-3 p-3 hover:bg-slate-50" data-testid={`nl-blog-row-${p.id}`}>
                  {p.cover_image
                    ? <img src={p.cover_image} alt="" className="h-12 w-16 shrink-0 rounded-md object-cover ring-1 ring-slate-200"/>
                    : <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-400"><FileText size={16}/></div>}
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-bold text-[#0F2042]">{p.title}</div>
                    <div className="truncate text-xs text-slate-500">{p.excerpt || p.slug}</div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ${p.status === "published" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-100 text-slate-500 ring-slate-200"}`}>{p.status || "draft"}</span>
                  <button disabled={draftingId === p.id} onClick={() => draft(p)} data-testid={`nl-draft-${p.id}`}
                    className="ml-2 flex items-center gap-1 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-1.5 text-[11px] font-bold text-white hover:opacity-90 disabled:opacity-50">
                    {draftingId === p.id ? <Loader2 size={11} className="animate-spin"/> : <Sparkles size={11}/>}
                    {draftingId === p.id ? "Drafting…" : "Draft"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function EmailPreview({ html, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" data-testid="nl-preview-modal">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <h3 className="font-display text-lg font-semibold text-[#0F2042]">Email preview</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" data-testid="nl-preview-close"><X size={18}/></button>
        </div>
        <iframe title="email-preview" srcDoc={html} sandbox="" className="flex-1 w-full bg-slate-50"/>
      </div>
    </div>
  );
}

/* ============ History ============ */
function HistoryTab() {
  const [sends, setSends] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get("/admin/newsletter/sends").then(({ data }) => setSends(data || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);
  if (loading) return <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-[#F97316]"/></div>;
  if (!sends.length) return <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center text-sm text-slate-500">No newsletters sent yet.</div>;
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-wider text-slate-500">
          <tr><th className="px-4 py-3">Subject</th><th className="px-4 py-3">Audience</th><th className="px-4 py-3">Sent</th><th className="px-4 py-3">Recipients</th><th className="px-4 py-3">By</th></tr>
        </thead>
        <tbody>
          {sends.map((s) => (
            <tr key={s.id} className="border-t border-slate-100">
              <td className="px-4 py-3 font-bold text-[#0F2042]">{s.subject}</td>
              <td className="px-4 py-3 text-xs text-slate-500 capitalize">{s.audience}{s.tag ? ` · ${s.tag}` : ""}</td>
              <td className="px-4 py-3 text-xs text-slate-500">{s.sent_at?.slice(0, 16)?.replace("T", " ")}</td>
              <td className="px-4 py-3 text-xs">
                <span className="font-bold text-emerald-700">{s.success_count}</span>
                <span className="text-slate-400"> / {s.to_count}</span>
                {s.fail_count > 0 && <span className="ml-2 rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">{s.fail_count} failed</span>}
              </td>
              <td className="px-4 py-3 text-xs text-slate-500">{s.sent_by_name || s.sent_by || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ============ Tiny helpers ============ */
function StatCard({ label, value, icon: Icon, color = "orange" }) {
  const palette = { orange: ["#F97316", "#FFEDD5"], emerald: ["#10B981", "#D1FAE5"], rose: ["#EF4444", "#FEE2E2"] }[color] || ["#F97316", "#FFEDD5"];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: palette[1], color: palette[0] }}>
          <Icon size={16} />
        </span>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">{label}</div>
          <div className="font-display text-xl font-bold text-[#0F2042]">{value}</div>
        </div>
      </div>
    </div>
  );
}
