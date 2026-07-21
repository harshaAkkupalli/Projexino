/**
 * BlogEditor.jsx — Admin/Manager-only blog CMS.
 *
 * Lets the team draft, edit, publish/unpublish and delete posts for the
 * public /blog. Posts are stored server-side via /api/admin/blog/posts and
 * auto-included in /api/sitemap.xml on publish.
 */
import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import {
  Plus, Save, Trash2, Eye, EyeOff, Loader2, ArrowLeft, Search,
  FileText, Tag as TagIcon, ImageIcon, Calendar, ExternalLink,
  Sparkles, Lightbulb, Linkedin, X, FileUp, Send, Megaphone,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";

const EMPTY_POST = {
  id: null,
  title: "",
  slug: "",
  excerpt: "",
  cover_image: "",
  content_html: "",
  tags: [],
  author_name: "Projexino",
  seo_title: "",
  seo_description: "",
  seo_keywords: [],
  status: "draft",
  cta_label: "",
  cta_link: "",
  cta_heading: "",
  cta_subheading: "",
  attachments: [],
};

export default function BlogEditor() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null = list view, post or EMPTY_POST = edit view
  const [filter, setFilter] = useState("all"); // all | draft | published
  const [search, setSearch] = useState("");
  const [showTopics, setShowTopics] = useState(false);

  useEffect(() => { void load(); }, [filter]);

  async function load() {
    setLoading(true);
    try {
      const params = filter !== "all" ? { status: filter } : {};
      const { data } = await api.get("/admin/blog/posts", { params });
      setPosts(data.items || []);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }

  async function openExisting(p) {
    try {
      const { data } = await api.get(`/admin/blog/posts/${p.id}`);
      setEditing(data);
    } catch (e) {
      toast.error(formatApiError(e));
    }
  }

  async function deletePost(p) {
    if (!window.confirm(`Delete "${p.title}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/admin/blog/posts/${p.id}`);
      toast.success("Post deleted");
      await load();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  }

  async function togglePublish(p) {
    try {
      await api.post(`/admin/blog/posts/${p.id}/publish`);
      toast.success(p.status === "published" ? "Unpublished" : "Published — live on /blog");
      await load();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  }

  async function draftForLinkedIn(p) {
    try {
      const { data } = await api.post(`/linkedin/draft-from-blog/${p.id}`);
      toast.success(`Drafted ${data.items?.length || 2} LinkedIn posts → review in LinkedIn Queue`);
    } catch (e) {
      toast.error(formatApiError(e));
    }
  }

  const filtered = posts.filter((p) =>
    !search || (p.title || "").toLowerCase().includes(search.toLowerCase())
  );

  if (editing) {
    return <PostForm post={editing} onBack={() => { setEditing(null); load(); }} />;
  }

  return (
    <div data-testid="blog-editor" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-[#0F2042]">Blog</h1>
          <p className="text-sm text-slate-500">Publish SEO-optimized posts to <Link to="/blog" target="_blank" className="text-[#F97316] underline">/blog</Link>.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowTopics(true)} data-testid="blog-suggest-topics-btn" className="rounded-full border border-orange-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#F97316] hover:bg-orange-50">
            <Lightbulb size={14} className="inline mr-1" /> AI Suggest Topics
          </button>
          <button onClick={() => setEditing({ ...EMPTY_POST, _openAIPanel: true })} data-testid="blog-ai-draft-btn" className="rounded-full bg-gradient-to-r from-[#7C3AED] to-[#A855F7] px-3 py-1.5 text-xs font-semibold text-white shadow">
            <Sparkles size={14} className="inline mr-1" /> AI Generate
          </button>
          <button onClick={() => setEditing({ ...EMPTY_POST })} data-testid="blog-new-btn" className="btn-primary text-xs">
            <Plus size={14} /> New post
          </button>
        </div>
      </div>

      {showTopics && (
        <TopicsModal
          onClose={() => setShowTopics(false)}
          onPick={(topic) => { setShowTopics(false); setEditing({ ...EMPTY_POST, _aiTopic: topic, _openAIPanel: true }); }}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        {["all", "draft", "published"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            data-testid={`blog-filter-${f}`}
            className={`rounded-full border px-4 py-1.5 text-xs font-semibold capitalize ${
              filter === f ? "border-[#F97316] bg-[#F97316] text-white" : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            {f}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5">
          <Search size={14} className="text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-48 bg-transparent text-xs outline-none"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={28} className="animate-spin text-[#F97316]" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-12 text-center">
          <FileText size={28} className="mx-auto text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">No posts yet. Click "New post" to write your first article.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Tags</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-t border-slate-100 hover:bg-orange-50/30" data-testid={`blog-row-${p.slug}`}>
                  <td className="px-4 py-3">
                    <button onClick={() => openExisting(p)} className="font-semibold text-[#0F2042] hover:text-[#F97316]">
                      {p.title}
                    </button>
                    <div className="text-xs text-slate-400">/{p.slug}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      p.status === "published" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                    }`}>{p.status}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {(p.tags || []).slice(0, 3).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {p.updated_at ? new Date(p.updated_at).toLocaleDateString() : ""}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => togglePublish(p)} className="rounded-lg border border-slate-200 p-1.5 hover:border-[#F97316] hover:text-[#F97316]" title={p.status === "published" ? "Unpublish" : "Publish"}>
                        {p.status === "published" ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                      {p.status === "published" && (
                        <a href={`/blog/${p.slug}`} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 p-1.5 hover:border-[#F97316] hover:text-[#F97316]" title="View live">
                          <ExternalLink size={14} />
                        </a>
                      )}
                      {p.status === "published" && (
                        <button onClick={() => draftForLinkedIn(p)} className="rounded-lg border border-slate-200 p-1.5 hover:border-[#0A66C2] hover:text-[#0A66C2]" title="Draft 2× LinkedIn posts (teaser + AI-native) — Mon &amp; Thu slots">
                          <Linkedin size={14} />
                        </button>
                      )}
                      <button onClick={() => deletePost(p)} className="rounded-lg border border-slate-200 p-1.5 text-red-500 hover:border-red-300 hover:bg-red-50" title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PostForm({ post, onBack }) {
  const [form, setForm] = useState(() => {
    const { _openAIPanel, _aiTopic, ...rest } = post || {};
    // Ensure new fields are initialised on legacy docs
    return {
      cta_label: "", cta_link: "", cta_heading: "", cta_subheading: "",
      attachments: [],
      ...rest,
    };
  });
  const [saving, setSaving] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [aiOpen, setAiOpen] = useState(!!(post && post._openAIPanel));
  const [aiTopic, setAiTopic] = useState((post && post._aiTopic) || "");
  const [aiKeywords, setAiKeywords] = useState("");
  const [aiTone, setAiTone] = useState("expert, friendly, practical");
  const [aiBusy, setAiBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);
  const [sendingNewsletter, setSendingNewsletter] = useState(false);
  const [showNewsletterModal, setShowNewsletterModal] = useState(false);
  const contentRef = useRef(null);
  const isNew = !form.id;

  const set = (k, v) => setForm((s) => ({ ...s, [k]: v }));

  function addTag() {
    const t = tagInput.trim();
    if (!t) return;
    if (form.tags.includes(t)) { setTagInput(""); return; }
    set("tags", [...form.tags, t]);
    setTagInput("");
  }

  async function runAIDraft() {
    if (!aiTopic || aiTopic.length < 5) { toast.error("Add a topic first (≥ 5 chars)"); return; }
    setAiBusy(true);
    try {
      const { data } = await api.post("/blog/ai/draft", {
        topic: aiTopic,
        target_keywords: aiKeywords.split(",").map((s) => s.trim()).filter(Boolean),
        tone: aiTone,
      });
      // Merge into form (don't overwrite existing user input where present)
      setForm((f) => ({
        ...f,
        title: f.title || data.title || "",
        slug: f.slug || data.slug || "",
        excerpt: f.excerpt || data.excerpt || "",
        content_html: data.content_html || f.content_html || "",
        tags: [...new Set([...(f.tags || []), ...(data.tags || [])])],
        seo_title: f.seo_title || data.seo_title || "",
        seo_description: f.seo_description || data.seo_description || "",
        seo_keywords: [...new Set([...(f.seo_keywords || []), ...(data.seo_keywords || [])])],
      }));
      toast.success("AI draft loaded — review &amp; edit, then publish");
      setAiOpen(false);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setAiBusy(false);
    }
  }

  async function save(publish = false) {
    if (!form.title || form.title.length < 3) { toast.error("Title is required"); return; }
    if (!form.content_html || form.content_html.length < 10) { toast.error("Content is too short"); return; }
    setSaving(true);
    try {
      const payload = { ...form, status: publish ? "published" : form.status };
      let res;
      if (isNew) {
        res = await api.post("/admin/blog/posts", payload);
      } else {
        res = await api.put(`/admin/blog/posts/${form.id}`, payload);
      }
      // Sync new id back to state on first save so subsequent uploads
      // attach to the saved post.
      setForm((f) => ({ ...f, ...res.data }));
      toast.success(publish ? "Published — live on /blog!" : "Saved");
      setForm(res.data);
      if (publish || isNew) onBack();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setSaving(false);
    }
  }

  // ============ Inline asset upload (image / PDF) ============
  function insertAtCursor(text) {
    const ta = contentRef.current;
    if (!ta) {
      set("content_html", (form.content_html || "") + "\n" + text);
      return;
    }
    const start = ta.selectionStart || 0;
    const end = ta.selectionEnd || 0;
    const before = form.content_html.slice(0, start);
    const after = form.content_html.slice(end);
    const next = before + text + after;
    set("content_html", next);
    // Restore caret after the inserted token
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + text.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  async function uploadAttachment(file, kind /* "image" | "pdf" */, title) {
    if (!file) return null;
    setUploadBusy(true);
    try {
      const b64 = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result || "").split(",")[1] || "");
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const { data } = await api.post("/admin/blog/upload", {
        data_base64: b64,
        mime: file.type || (kind === "pdf" ? "application/pdf" : "image/png"),
        filename: file.name,
        title: (title || file.name || "Attachment").trim(),
      });
      // Track attachment metadata on the post so the public renderer can
      // expand the {{attachment:<id>}} or {{image:<id>}} markers.
      set("attachments", [...(form.attachments || []), {
        id: data.id, title: data.title, filename: data.filename,
        mime: data.mime, kind: data.kind, size_kb: data.size_kb,
        url: data.url,
      }]);
      toast.success(`${kind === "pdf" ? "PDF" : "Image"} uploaded`);
      return data;
    } catch (e) {
      toast.error(formatApiError(e));
      return null;
    } finally {
      setUploadBusy(false);
    }
  }

  async function handleImageInsert(file) {
    const data = await uploadAttachment(file, "image", file?.name || "Image");
    if (data) insertAtCursor(`\n\n{{image:${data.id}}}\n\n`);
  }

  async function handlePdfInsert(file) {
    // Ask the editor for a title — it appears on the download card
    const title = window.prompt("Title for this PDF download card (shown next to ↓):", file.name.replace(/\.pdf$/i, ""));
    if (title === null) return; // cancelled
    const data = await uploadAttachment(file, "pdf", title || file.name);
    if (data) insertAtCursor(`\n\n{{attachment:${data.id}}}\n\n`);
  }

  async function handleCoverUpload(file) {
    if (!file) return;
    setCoverBusy(true);
    const data = await uploadAttachment(file, "image", "Cover image");
    if (data) {
      // Use the public asset URL directly so the cover_image field works.
      const base = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");
      set("cover_image", `${base}/api/blog/assets/${data.id}`);
    }
    setCoverBusy(false);
  }

  // ============ Send-as-newsletter ============
  async function sendAsNewsletter(audience, tag) {
    if (!form.id) { toast.error("Save the post first"); return; }
    if (form.status !== "published") { toast.error("Publish the post before sending as newsletter"); return; }
    setSendingNewsletter(true);
    try {
      const { data } = await api.post(`/admin/newsletter/send-blog/${form.id}`, {
        audience, tag,
        subject: form.title,
      });
      toast.success(`Newsletter sent → ${data.success_count}/${data.to_count} subscribers`);
      setShowNewsletterModal(false);
    } catch (e) {
      toast.error(formatApiError(e));
    }
    setSendingNewsletter(false);
  }

  return (
    <div data-testid="blog-post-form" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-[#F97316]">
          <ArrowLeft size={16} /> Back to posts
        </button>
        <div className="flex items-center gap-2">
          <button onClick={() => setAiOpen((v) => !v)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${aiOpen ? "border-[#7C3AED] bg-[#7C3AED] text-white" : "border-slate-200 bg-white text-[#7C3AED]"}`} data-testid="blog-toggle-ai">
            <Sparkles size={14} className="inline mr-1" /> {aiOpen ? "Hide AI" : "AI Generate"}
          </button>
          <button onClick={() => save(false)} disabled={saving} className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 hover:border-[#F97316]" data-testid="blog-save-draft">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <><Save size={14} className="inline mr-1" />Save draft</>}
          </button>
          <button onClick={() => save(true)} disabled={saving} className="btn-primary text-xs" data-testid="blog-publish-btn">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <><Eye size={14} className="inline mr-1" /> {form.status === "published" ? "Update" : "Publish"}</>}
          </button>
          {form.status === "published" && form.id && (
            <button
              onClick={() => setShowNewsletterModal(true)}
              disabled={sendingNewsletter}
              data-testid="blog-send-newsletter-btn"
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#F97316] to-[#FB923C] px-4 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-white shadow-lg disabled:opacity-50"
              title="Email this post to all newsletter subscribers"
            >
              {sendingNewsletter ? <Loader2 size={12} className="animate-spin" /> : <Megaphone size={12} />}
              Send as Newsletter
            </button>
          )}
        </div>
      </div>

      {aiOpen && (
        <div className="rounded-2xl border border-[#7C3AED]/40 bg-gradient-to-br from-[#F5F3FF] to-white p-5" data-testid="blog-ai-panel">
          <h3 className="font-display text-base font-semibold text-[#7C3AED]">
            <Sparkles size={16} className="inline mr-1" /> AI Blog Drafter (Claude 4.5)
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Generates a full SEO-optimized article with H2/H3 hierarchy, FAQ, internal links to /services/*, and SEO meta.
            You can edit everything after generation.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Topic / working title</label>
              <input value={aiTopic} onChange={(e) => setAiTopic(e.target.value)}
                placeholder="e.g. How to build a SaaS MVP in 8 weeks"
                data-testid="blog-ai-topic"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#7C3AED]" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Target keywords (comma-separated)</label>
              <input value={aiKeywords} onChange={(e) => setAiKeywords(e.target.value)}
                placeholder="saas mvp development, mvp cost, saas startup"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#7C3AED]" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tone</label>
              <input value={aiTone} onChange={(e) => setAiTone(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#7C3AED]" />
            </div>
          </div>
          <button onClick={runAIDraft} disabled={aiBusy} className="mt-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#7C3AED] to-[#A855F7] px-5 py-2 text-sm font-semibold text-white shadow disabled:opacity-60" data-testid="blog-ai-run">
            {aiBusy ? <><Loader2 size={14} className="animate-spin" /> Drafting (this takes 20-40s)…</> : <><Sparkles size={14} /> Generate Draft</>}
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Input label="Title" value={form.title} onChange={(v) => set("title", v)} placeholder="e.g. The Definitive Guide to Building a SaaS MVP in 8 Weeks" testid="blog-title" />
          <Input label="Slug (URL)" value={form.slug} onChange={(v) => set("slug", v)} placeholder="auto-generated from title if blank" testid="blog-slug" />
          <Input label="Excerpt (shown in card &amp; meta description)" value={form.excerpt} onChange={(v) => set("excerpt", v)} textarea rows={3} testid="blog-excerpt" />
          {/* Cover image — pick file OR paste URL */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Cover image</label>
            <div className="mt-1 flex items-stretch gap-2">
              <input
                type="text"
                value={form.cover_image || ""}
                onChange={(e) => set("cover_image", e.target.value)}
                placeholder="https://… or upload →"
                data-testid="blog-cover"
                className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316]"
              />
              <label className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-bold text-[#F97316] hover:bg-orange-100">
                {coverBusy ? <Loader2 size={12} className="animate-spin" /> : <ImageIcon size={12} />}
                Upload
                <input type="file" accept="image/*" hidden data-testid="blog-cover-upload"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCoverUpload(f); e.target.value = ""; }} />
              </label>
            </div>
            {form.cover_image && (
              <img src={form.cover_image} alt="Cover preview" className="mt-2 h-32 w-full rounded-lg border border-slate-200 object-cover" />
            )}
          </div>

          {/* Content editor + toolbar */}
          <div>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Content (HTML)</label>
              <div className="flex flex-wrap items-center gap-1.5">
                <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:border-[#F97316] hover:text-[#F97316]" data-testid="blog-insert-image">
                  {uploadBusy ? <Loader2 size={11} className="animate-spin" /> : <ImageIcon size={11} />}
                  Insert image
                  <input type="file" accept="image/*" hidden
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageInsert(f); e.target.value = ""; }} />
                </label>
                <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:border-[#F97316] hover:text-[#F97316]" data-testid="blog-insert-pdf">
                  {uploadBusy ? <Loader2 size={11} className="animate-spin" /> : <FileUp size={11} />}
                  Insert PDF download
                  <input type="file" accept="application/pdf" hidden
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePdfInsert(f); e.target.value = ""; }} />
                </label>
                <button type="button"
                  onClick={() => insertAtCursor("\n<h2>New Section</h2>\n<p>Write here…</p>\n")}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:border-[#F97316] hover:text-[#F97316]"
                  data-testid="blog-insert-heading">
                  + H2
                </button>
              </div>
            </div>
            <textarea
              ref={contentRef}
              value={form.content_html}
              onChange={(e) => set("content_html", e.target.value)}
              rows={18}
              data-testid="blog-content"
              placeholder={'<h2>Intro</h2>\n<p>Write your article. Use the toolbar to drop in images or downloadable PDFs anywhere.</p>\n\n{{image:abc123}}  ← gets expanded into a centered image\n{{attachment:xyz789}}  ← gets expanded into a PDF download card'}
              className="w-full rounded-2xl border border-slate-200 bg-white p-4 font-mono text-sm outline-none focus:border-[#F97316]"
            />
            <p className="mt-1 text-xs text-slate-400">
              Tip: position your cursor inside the text and click <b>Insert image</b> / <b>Insert PDF download</b> — a marker is placed at that exact spot. On the published post it expands into an embedded image or a branded download card.
            </p>
          </div>

          {/* Inserted attachments — manage list */}
          {(form.attachments && form.attachments.length > 0) && (
            <div className="rounded-2xl border border-orange-100 bg-orange-50/40 p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#F97316]">// attachments ({form.attachments.length})</div>
              <ul className="mt-2 space-y-1.5">
                {form.attachments.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs ring-1 ring-orange-100">
                    <span className={`inline-flex h-6 w-9 items-center justify-center rounded text-[9px] font-bold text-white ${a.kind === "pdf" ? "bg-[#F97316]" : "bg-violet-500"}`}>
                      {a.kind === "pdf" ? "PDF" : "IMG"}
                    </span>
                    <span className="flex-1 truncate font-semibold text-[#0F2042]">{a.title}</span>
                    <span className="text-[10px] text-slate-400">{a.size_kb} KB</span>
                    <button type="button"
                      onClick={() => insertAtCursor(`\n\n{{${a.kind === "image" ? "image" : "attachment"}:${a.id}}}\n\n`)}
                      className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 hover:border-[#F97316] hover:text-[#F97316]"
                      title="Insert marker at cursor">
                      Insert →
                    </button>
                    <button type="button"
                      onClick={() => set("attachments", form.attachments.filter((x) => x.id !== a.id))}
                      className="text-[10px] font-bold text-red-500 hover:text-red-700"
                      title="Remove from this post (the asset stays available via direct URL)">
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Dynamic CTA section */}
          <div className="rounded-2xl border border-violet-100 bg-violet-50/40 p-5">
            <h3 className="text-sm font-semibold text-[#7C3AED]"><Megaphone size={14} className="mr-1 inline" /> Bottom CTA (dynamic)</h3>
            <p className="mt-0.5 text-xs text-slate-500">Replaces the default "Start your project" block at the end of this post. Leave blank to keep the default.</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <Input label="CTA heading" value={form.cta_heading} onChange={(v) => set("cta_heading", v)} placeholder="Need a team to ship this for you?" testid="blog-cta-heading" />
              <Input label="CTA sub-heading" value={form.cta_subheading} onChange={(v) => set("cta_subheading", v)} placeholder="Projexino has shipped 500+ projects…" testid="blog-cta-sub" />
              <Input label="Button label" value={form.cta_label} onChange={(v) => set("cta_label", v)} placeholder="Start your project" testid="blog-cta-label" />
              <Input label="Button link" value={form.cta_link} onChange={(v) => set("cta_link", v)} placeholder="/contact or https://…" testid="blog-cta-link" />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-[#0F2042]"><TagIcon size={14} /> Tags</h3>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {form.tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-xs font-semibold text-[#F97316]">
                  #{t}
                  <button onClick={() => set("tags", form.tags.filter((x) => x !== t))} className="text-orange-400 hover:text-red-500">×</button>
                </span>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                placeholder="add tag…"
                data-testid="blog-tag-input"
                className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-[#F97316]"
              />
              <button onClick={addTag} className="rounded-lg bg-[#F97316] px-3 text-xs font-semibold text-white">Add</button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-[#0F2042]">SEO</h3>
            <div className="mt-3 space-y-3">
              <Input label="SEO title (≤ 60 chars)" value={form.seo_title} onChange={(v) => set("seo_title", v)} testid="blog-seo-title" />
              <Input label="SEO description (≤ 160 chars)" value={form.seo_description} onChange={(v) => set("seo_description", v)} textarea rows={3} testid="blog-seo-desc" />
              <Input
                label="SEO keywords (comma-separated)"
                value={(form.seo_keywords || []).join(", ")}
                onChange={(v) => set("seo_keywords", v.split(",").map((s) => s.trim()).filter(Boolean))}
                testid="blog-seo-kw"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-[#0F2042]">Meta</h3>
            <Input label="Author name" value={form.author_name} onChange={(v) => set("author_name", v)} testid="blog-author" />
            {form.published_at && (
              <p className="mt-3 inline-flex items-center gap-1 text-xs text-slate-500">
                <Calendar size={12} /> Published {new Date(form.published_at).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      </div>

      {showNewsletterModal && (
        <SendNewsletterModal
          postTitle={form.title}
          onClose={() => setShowNewsletterModal(false)}
          onSend={sendAsNewsletter}
          busy={sendingNewsletter}
        />
      )}
    </div>
  );
}

function SendNewsletterModal({ postTitle, onClose, onSend, busy }) {
  const [audience, setAudience] = useState("all");
  const [tag, setTag] = useState("");
  const [stats, setStats] = useState(null);
  useEffect(() => {
    api.get("/admin/newsletter/subscribers", { params: { status: "active" } })
      .then(({ data }) => setStats({ total: data.total, active: data.active }))
      .catch(() => {});
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" data-testid="blog-newsletter-modal">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#F97316]">// SEND AS NEWSLETTER</div>
            <h3 className="font-display mt-1 text-lg font-semibold text-[#0F2042]">{postTitle}</h3>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100"><X size={16} /></button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          {stats === null ? "Loading subscribers…" : <span>This will email the post to <b>{stats.active}</b> active newsletter subscribers (out of {stats.total} total).</span>}
        </p>
        <div className="mt-4 space-y-2">
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm">
            <input type="radio" checked={audience === "all"} onChange={() => setAudience("all")} />
            All active subscribers
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm">
            <input type="radio" checked={audience === "tag"} onChange={() => setAudience("tag")} />
            <span>Subscribers tagged</span>
            <input type="text" placeholder="e.g. healthcare" value={tag}
              onChange={(e) => setTag(e.target.value)}
              className="flex-1 rounded border border-slate-200 px-2 py-0.5 text-xs outline-none focus:border-[#F97316]" />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-bold text-slate-600">Cancel</button>
          <button
            onClick={() => onSend(audience, audience === "tag" ? tag : null)}
            disabled={busy || (audience === "tag" && !tag.trim())}
            data-testid="blog-newsletter-confirm"
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#F97316] to-[#FB923C] px-5 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-white shadow disabled:opacity-50">
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            Send now
          </button>
        </div>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, placeholder, textarea, rows = 2, testid }) {
  const Cmp = textarea ? "textarea" : "input";
  return (
    <div>
      <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</label>
      <Cmp
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={textarea ? rows : undefined}
        data-testid={testid}
        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316]"
      />
    </div>
  );
}

function TopicsModal({ onClose, onPick }) {
  const [keyword, setKeyword] = useState("");
  const [audience, setAudience] = useState("startup founders and product leaders");
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(false);

  async function run() {
    if (!keyword || keyword.length < 2) { toast.error("Pillar keyword required"); return; }
    setLoading(true);
    setTopics([]);
    try {
      const { data } = await api.post("/blog/ai/suggest-topics", { keyword, audience, count: 6 });
      setTopics(data.topics || []);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" data-testid="topics-modal">
      <div className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold text-[#0F2042]">
              <Lightbulb className="inline mr-1 text-[#F97316]" size={20} /> AI Topic Suggester
            </h2>
            <p className="mt-1 text-xs text-slate-500">Pick a pillar keyword and let Claude propose 6 topics with realistic ranking potential.</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={16} /></button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Pillar keyword</label>
            <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="e.g. saas development, ai mvp, app development india"
              data-testid="topics-keyword"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Audience</label>
            <input value={audience} onChange={(e) => setAudience(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
          </div>
        </div>
        <button onClick={run} disabled={loading} className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#F97316] px-5 py-2 text-sm font-semibold text-white shadow disabled:opacity-60" data-testid="topics-run">
          {loading ? <><Loader2 size={14} className="animate-spin" /> Thinking…</> : <><Lightbulb size={14} /> Suggest topics</>}
        </button>

        {topics.length > 0 && (
          <div className="mt-6 space-y-2">
            {topics.map((t, i) => (
              <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4 hover:border-[#F97316]" data-testid={`topic-${i}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <h3 className="font-display text-sm font-semibold text-[#0F2042]">{t.title}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-wider">
                      <span className="rounded-full bg-orange-50 px-2 py-0.5 font-bold text-[#F97316]">{t.search_intent || "info"}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">difficulty: {t.estimated_difficulty || "—"}</span>
                      <span className="text-slate-500">kw: {t.primary_keyword}</span>
                    </div>
                    {t.why_it_will_rank && <p className="mt-2 text-xs italic text-slate-500">&ldquo;{t.why_it_will_rank}&rdquo;</p>}
                  </div>
                  <button onClick={() => onPick(t.title)} className="rounded-full bg-[#7C3AED] px-3 py-1.5 text-xs font-semibold text-white" data-testid={`topic-pick-${i}`}>
                    Use this →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
