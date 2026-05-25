import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Send, Paperclip, Hash, UserCircle2, FolderKanban, Settings2, ArrowLeft, Download as DownloadIcon, Search, Info, Smile, ThumbsUp, ImageIcon } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

const isImage = (mime) => /^image\//i.test(mime || "");

const fmtRelTime = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const now = Date.now();
  const diff = (now - d.getTime()) / 1000;
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
};

export default function Chat() {
  const { user } = useAuth();
  const me = user || {};
  const [channels, setChannels] = useState([]);
  const [members, setMembers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [imageCache, setImageCache] = useState({});
  const [file, setFile] = useState(null);
  const [search, setSearch] = useState("");
  const fileRef = useRef(null);
  const endRef = useRef(null);
  const scrollerRef = useRef(null);
  const stickRef = useRef(true);

  const fetchChannels = async () => {
    const { data } = await api.get("/chat/channels");
    setChannels(data);
    if (data.length && !active) setActive(data[0]);
  };

  // When the active channel changes, force-scroll the inner pane to the bottom after layout.
  useEffect(() => {
    if (!active) return;
    stickRef.current = true;
    const t1 = setTimeout(() => {
      const el = scrollerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, 80);
    const t2 = setTimeout(() => {
      const el = scrollerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, 300);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [active?.id, messages.length]);

  const fetchMessages = async (channelId) => {
    const { data } = await api.get(`/chat/channels/${channelId}/messages`);
    setMessages(data);
    // preload image attachments
    for (const m of data) {
      if (m.attachment_url_id && isImage(m.attachment_mime) && !imageCache[m.id]) {
        api.get(`/chat/attachment/${m.attachment_url_id}`).then(({ data: d }) => {
          setImageCache((c) => ({ ...c, [m.id]: `data:${d.mime_type};base64,${d.content_base64}` }));
        }).catch(() => {});
      }
    }
    // Scroll the inner messages container to the bottom (NOT the page).
    requestAnimationFrame(() => {
      const el = scrollerRef.current;
      if (el && stickRef.current) {
        el.scrollTop = el.scrollHeight;
      }
    });
  };

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  useEffect(() => {
    fetchChannels();
    api.get("/members/directory").then(({ data }) => setMembers(data.filter((m) => m.email !== me.email))).catch(() => {});
    api.get("/projects").then(({ data }) => setProjects(data)).catch(() => {});
  }, []);
  useEffect(() => { if (active) fetchMessages(active.id); }, [active?.id]);

  // poll every 3s
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => fetchMessages(active.id), 3000);
    return () => clearInterval(id);
  }, [active?.id]);

  const send = async (e) => {
    e?.preventDefault?.();
    if (!active) return;
    if (!text.trim() && !file) return;
    let attach = {};
    if (file) {
      const b64 = await readBase64(file);
      attach = { attachment_name: file.name, attachment_mime: file.type, attachment_base64: b64 };
    }
    try {
      const { data } = await api.post("/chat/messages", {
        channel_id: active.id, text, ...attach,
      });
      setMessages((p) => [...p, data]);
      setText(""); setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 30);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    }
  };

  const downloadAttach = async (m) => {
    if (!m.attachment_url_id) return;
    const { data } = await api.get(`/chat/attachment/${m.attachment_url_id}`);
    const a = document.createElement("a");
    a.href = `data:${data.mime_type};base64,${data.content_base64}`;
    a.download = data.name;
    a.click();
  };

  return (
    <div data-testid="portal-chat" className="-mx-4 -my-4">
      {/* Mobile-app single-pane Messenger inside AppShell phone-frame. */}
      <div className="relative flex h-[calc(100vh-9rem)] overflow-hidden border border-slate-200 bg-[#F4F6FA] sm:rounded-2xl">
        {/* LEFT — Conversations list (hidden when a chat is open) */}
        <aside className={`${active ? "hidden" : "flex"} w-full flex-col border-r border-slate-200 bg-white`}>
          <div className="border-b border-slate-100 px-4 pb-3 pt-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold text-[#0F2042]">Chats</h2>
              <button data-testid="new-channel-btn" onClick={() => setShowNew(true)}
                title="New conversation"
                className="rounded-full bg-slate-100 p-2 text-slate-600 transition hover:bg-orange-50 hover:text-[#F97316]">
                <Plus size={16} />
              </button>
            </div>
            <div className="relative mt-3">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                data-testid="chat-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search Messenger"
                className="w-full rounded-full border border-transparent bg-slate-100 py-2 pl-9 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-[#F97316] focus:bg-white"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-2">
            <ConversationList
              channels={channels}
              members={members}
              me={me}
              search={search}
              active={active}
              onPick={setActive}
              onStartDM={async (m) => {
                const exists = channels.find((c) => c.kind === "direct" && c.name === m.name);
                if (exists) { setActive(exists); return; }
                try {
                  const { data } = await api.post("/chat/channels", { name: m.name, kind: "direct", member_ids: [m.id] });
                  await fetchChannels(); setActive(data);
                } catch { toast.error("Could not start chat"); }
              }}
            />
          </div>
        </aside>

        {/* MIDDLE — Conversation thread */}
        <section className={`${active ? "flex" : "hidden"} flex-1 flex-col bg-white`}>
          {!active ? (
            <div className="m-auto px-6 text-center">
              <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-[#F97316]/15 to-[#A855F7]/15">
                <Hash size={36} className="text-[#F97316]" />
              </div>
              <h3 className="font-display text-xl font-semibold text-[#0F2042]">Your messages</h3>
              <p className="mt-1 text-sm text-slate-500">Pick a chat on the left to start.</p>
            </div>
          ) : (
            <>
              {/* Header (Messenger-style) */}
              <header className="flex items-center gap-3 border-b border-slate-100 px-3 py-2.5 sm:px-4">
                <button onClick={() => setActive(null)} data-testid="chat-back-btn"
                  className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100">
                  <ArrowLeft size={18} />
                </button>
                <ChannelAvatar channel={active} size={40} showPresence />
                <div className="min-w-0 flex-1">
                  <div className="font-display truncate text-base font-semibold text-[#0F172A]">{active.name}</div>
                  <div className="truncate text-[11px] text-emerald-600">
                    <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                    Active now · {active.member_ids?.length || 0} members
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button data-testid="chat-info-btn" onClick={() => setShowInfo((v) => !v)}
                    title="Conversation info" className={`rounded-full p-2 ${showInfo ? "bg-orange-50 text-[#F97316]" : "text-[#F97316] hover:bg-orange-50"}`}>
                    <Info size={16} />
                  </button>
                </div>
              </header>

              {/* Messages */}
              <div ref={scrollerRef} onScroll={onScroll}
                className="flex-1 overflow-y-auto bg-[#F4F6FA] px-3 py-4 sm:px-6">
                {messages.length === 0 && (
                  <div className="mx-auto mt-10 max-w-xs rounded-2xl bg-white p-5 text-center text-sm text-slate-500 shadow-sm">
                    No messages yet — say hi 👋
                  </div>
                )}
                <div className="space-y-1">
                  {messages.map((m, idx) => {
                    const mine = m.author_email === me.email;
                    const prev = messages[idx - 1];
                    const next = messages[idx + 1];
                    const groupedTop = prev && prev.author_email === m.author_email;
                    const groupedBot = next && next.author_email === m.author_email;
                    const imgSrc = m.attachment_url_id && isImage(m.attachment_mime) ? imageCache[m.id] : null;
                    return (
                      <div key={m.id} className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>
                        {!mine && (
                          <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#0F2042] to-[#A855F7] text-[10px] font-bold text-white ${groupedBot ? "invisible" : ""}`}>
                            {m.author?.[0]?.toUpperCase() || "?"}
                          </div>
                        )}
                        <div className={`max-w-[78%] px-3.5 py-2 text-sm shadow-sm sm:max-w-[68%] ${mine
                          ? `bg-gradient-to-br from-[#F97316] to-[#EF4444] text-white ${groupedTop ? "rounded-tr-md" : "rounded-tr-2xl"} ${groupedBot ? "rounded-br-md" : "rounded-br-2xl"} rounded-l-2xl`
                          : `bg-white text-slate-800 border border-slate-100 ${groupedTop ? "rounded-tl-md" : "rounded-tl-2xl"} ${groupedBot ? "rounded-bl-md" : "rounded-bl-2xl"} rounded-r-2xl`}`}>
                          {!mine && !groupedTop && <div className="mb-0.5 text-[10px] font-bold text-[#A855F7]">{m.author}</div>}
                          {m.text && <div className="whitespace-pre-wrap break-words leading-snug">{m.text}</div>}
                          {imgSrc && (
                            <button onClick={() => setLightbox({ src: imgSrc, name: m.attachment_name })}
                              data-testid={`chat-image-${m.id}`}
                              className="mt-2 block overflow-hidden rounded-xl">
                              <img src={imgSrc} alt={m.attachment_name} className="max-h-64 max-w-full object-cover" />
                            </button>
                          )}
                          {m.attachment_url_id && !imgSrc && (
                            <button onClick={() => downloadAttach(m)} className={`mt-1.5 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] underline ${mine ? "bg-white/15 text-white" : "bg-orange-50 text-[#F97316]"}`}>
                              <Paperclip size={11} /> {m.attachment_name}
                            </button>
                          )}
                          {!groupedBot && (
                            <div className={`mt-1 text-[10px] ${mine ? "text-white/70" : "text-slate-400"}`}>
                              {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={endRef} />
                </div>
              </div>

              {/* Input (Messenger pill) */}
              <form onSubmit={send}
                className="flex items-center gap-2 border-t border-slate-100 bg-white p-2.5 sm:p-3"
                style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}>
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="shrink-0 rounded-full p-2 text-[#F97316] hover:bg-orange-50"
                  data-testid="chat-attach-btn" title="Attach">
                  <Paperclip size={18} />
                </button>
                <input ref={fileRef} type="file" hidden onChange={(e) => setFile(e.target.files?.[0] || null)} />
                <div className="flex flex-1 items-center gap-2 rounded-full bg-slate-100 px-4 py-1.5">
                  {file && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] text-[#F97316]">
                      <Paperclip size={9} /> {file.name}
                      <button type="button" onClick={() => setFile(null)}><X size={9} /></button>
                    </span>
                  )}
                  <textarea data-testid="chat-input" value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(e); } }}
                    placeholder="Aa" rows={1}
                    className="block flex-1 resize-none bg-transparent px-1 py-1.5 text-sm outline-none placeholder:text-slate-400" />
                  <button type="button" className="text-[#F97316] hover:opacity-80" title="Emoji"><Smile size={16} /></button>
                </div>
                {text.trim() || file ? (
                  <button data-testid="chat-send-btn" type="submit"
                    className="shrink-0 rounded-full bg-gradient-to-br from-[#F97316] to-[#A855F7] p-2 text-white shadow-md">
                    <Send size={18} />
                  </button>
                ) : (
                  <button type="button" data-testid="chat-thumb-btn"
                    onClick={() => { setText("👍"); setTimeout(() => send(), 30); }}
                    className="shrink-0 rounded-full bg-orange-50 p-2 text-[#F97316] hover:bg-orange-100" title="Send a thumbs up">
                    <ThumbsUp size={18} />
                  </button>
                )}
              </form>
            </>
          )}
        </section>

        {/* RIGHT — Conversation info as bottom sheet (mobile-app style) */}
        <AnimatePresence>
          {active && showInfo && (
            <motion.aside
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 280, damping: 30 }}
              className="absolute inset-y-0 right-0 z-20 flex w-full max-w-sm flex-col border-l border-slate-200 bg-white shadow-2xl"
            >
            <div className="flex items-center justify-end px-4 pt-2">
              <button onClick={() => setShowInfo(false)} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100">
                <X size={16} />
              </button>
            </div>
            <div className="border-b border-slate-100 px-5 py-2 text-center">
              <ChannelAvatar channel={active} size={72} center showPresence />
              <h3 className="font-display mt-2 text-lg font-semibold text-[#0F2042]">{active.name}</h3>
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">{active.kind} channel</div>
              {active.kind !== "direct" && (
                <button data-testid="chat-edit-channel-btn" onClick={() => setShowEdit(true)}
                  className="mt-3 inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:border-[#F97316] hover:text-[#F97316]">
                  <Settings2 size={11} /> Manage channel
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Members ({active.member_ids?.length || 0})</div>
              <ul className="mt-2 space-y-1">
                {(active.member_ids || []).map((id) => {
                  const m = members.find((x) => x.id === id) || (id === me.id ? me : null);
                  if (!m) return null;
                  return (
                    <li key={id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0F2042] text-[10px] font-bold text-white">{m.name?.[0]?.toUpperCase()}</div>
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold text-[#0F2042]">{m.name}{id === me.id ? " (you)" : ""}</div>
                        <div className="truncate text-[10px] text-slate-400">{m.role}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-5 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Shared media</div>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {messages.filter((m) => m.attachment_url_id && isImage(m.attachment_mime) && imageCache[m.id]).slice(-9).map((m) => (
                  <button key={m.id} onClick={() => setLightbox({ src: imageCache[m.id], name: m.attachment_name })}
                    className="aspect-square overflow-hidden rounded-md">
                    <img src={imageCache[m.id]} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
                {messages.filter((m) => m.attachment_url_id && isImage(m.attachment_mime) && imageCache[m.id]).length === 0 && (
                  <div className="col-span-3 rounded-lg bg-slate-50 p-4 text-center text-[10px] text-slate-400">No shared media yet</div>
                )}
              </div>
            </div>
          </motion.aside>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showNew && <NewChannelModal members={members} projects={projects} onClose={() => setShowNew(false)} onSaved={async (c) => { await fetchChannels(); setActive(c); }} />}
        {showEdit && active && (
          <EditChannelModal channel={active} members={members} onClose={() => setShowEdit(false)}
            onSaved={async (updated) => { await fetchChannels(); setActive(updated); setShowEdit(false); }} />
        )}
        {lightbox && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            data-testid="chat-image-lightbox"
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4"
            onClick={() => setLightbox(null)}>
            <motion.div initial={{ scale: 0.92 }} animate={{ scale: 1 }} exit={{ scale: 0.92 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-h-[90vh] max-w-[92vw]">
              <img src={lightbox.src} alt={lightbox.name} className="max-h-[90vh] max-w-[92vw] rounded-lg object-contain" />
              <div className="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-1 text-[11px] text-white">{lightbox.name}</div>
              <a href={lightbox.src} download={lightbox.name}
                className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-[#F97316] px-2 py-1 text-[11px] font-semibold text-white">
                <DownloadIcon size={11} /> Download
              </a>
              <button onClick={() => setLightbox(null)} className="absolute -bottom-12 left-1/2 -translate-x-1/2 rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-[#0F2042]">
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NewChannelModal({ members = [], projects = [], onClose, onSaved }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState("group");
  const [memberIds, setMemberIds] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [saving, setSaving] = useState(false);
  const toggleMember = (id) => {
    setMemberIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  };
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.post("/chat/channels", {
        name, kind, member_ids: memberIds, project_id: projectId,
      });
      toast.success("Channel created");
      onSaved(data);
      onClose();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    } finally { setSaving(false); }
  };
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <motion.form initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()} onSubmit={submit}
        data-testid="channel-modal"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-xl font-semibold">New channel</h3>
          <button type="button" onClick={onClose}><X size={18} /></button>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-500">Name *</span>
          <input data-testid="channel-name" required value={name} onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
        </label>
        <label className="mt-3 block">
          <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-500">Kind</span>
          <select data-testid="channel-kind" value={kind} onChange={(e) => setKind(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316]">
            <option value="group">Group</option><option value="project">Project</option>
          </select>
        </label>
        {kind === "project" && (
          <label className="mt-3 block">
            <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-500">Link to project</span>
            <select data-testid="channel-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316]">
              <option value="">— Select —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
        {members.length > 0 && (
          <div className="mt-3">
            <div className="mb-1 text-xs uppercase tracking-[0.18em] text-slate-500">Add teammates</div>
            <div className="max-h-32 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {members.map((m) => (
                <label key={m.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-slate-50">
                  <input type="checkbox" checked={memberIds.includes(m.id)} onChange={() => toggleMember(m.id)} />
                  <span className="font-semibold">{m.name}</span>
                  <span className="text-[10px] text-slate-400">· {m.role}</span>
                </label>
              ))}
            </div>
          </div>
        )}
        <button data-testid="channel-save-btn" disabled={saving} className="btn-primary mt-6 w-full justify-center">
          {saving ? "Creating…" : "Create"}
        </button>
      </motion.form>
    </motion.div>
  );
}

function EditChannelModal({ channel, members, onClose, onSaved }) {
  const [name, setName] = useState(channel.name || "");
  const [memberIds, setMemberIds] = useState(channel.member_ids || []);
  const [saving, setSaving] = useState(false);

  const toggle = (id) => setMemberIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const { data } = await api.patch(`/chat/channels/${channel.id}`, { name, member_ids: memberIds });
      toast.success("Channel updated");
      onSaved(data);
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail) || "Failed"); }
    finally { setSaving(false); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <motion.form initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        onClick={(e) => e.stopPropagation()} onSubmit={submit}
        data-testid="edit-channel-modal"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-xl font-semibold">Manage {channel.kind === "project" ? "project channel" : "group"}</h3>
          <button type="button" onClick={onClose}><X size={18} /></button>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-500">Group name *</span>
          <input data-testid="edit-channel-name" required value={name} onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
        </label>
        <div className="mt-4">
          <div className="mb-1 text-xs uppercase tracking-[0.18em] text-slate-500">Members</div>
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
            {members.length === 0 && <div className="text-xs text-slate-400">No teammates to add</div>}
            {members.map((m) => (
              <label key={m.id || m.email} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-slate-50">
                <input type="checkbox" checked={memberIds.includes(m.id)} onChange={() => toggle(m.id)} data-testid={`edit-member-${m.email}`} />
                <span className="font-semibold">{m.name}</span>
                <span className="text-[10px] text-slate-400">· {m.role}</span>
              </label>
            ))}
          </div>
        </div>
        <button disabled={saving} data-testid="edit-channel-save" className="btn-primary mt-5 w-full justify-center">
          {saving ? "Saving…" : "Save changes"}
        </button>
      </motion.form>
    </motion.div>
  );
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


// ──────────── Subcomponents ────────────

function ChannelAvatar({ channel, size = 36, center = false, showPresence = false }) {
  const Icon = channel.kind === "direct" ? UserCircle2 : channel.kind === "project" ? FolderKanban : Hash;
  const initial = channel.name?.[0]?.toUpperCase() || "?";
  return (
    <div className={`relative shrink-0 ${center ? "mx-auto" : ""}`} style={{ width: size, height: size }}>
      <div
        className="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-[#F97316] via-[#EF4444] to-[#A855F7] font-bold text-white shadow-sm"
        style={{ fontSize: size * 0.4 }}
      >
        {channel.kind === "group" || channel.kind === "project" ? <Icon size={size * 0.42} /> : initial}
      </div>
      {showPresence && (
        <span
          className="absolute bottom-0 right-0 block rounded-full border-2 border-white bg-emerald-500"
          style={{ width: size * 0.25, height: size * 0.25 }}
        />
      )}
    </div>
  );
}

function ConversationList({ channels, members, me, search, active, onPick, onStartDM }) {
  const term = (search || "").toLowerCase();
  const visibleChannels = channels.filter((c) =>
    !term || (c.name || "").toLowerCase().includes(term)
  );
  const visibleMembers = members
    .filter((m) => !term || (m.name || "").toLowerCase().includes(term) || (m.email || "").toLowerCase().includes(term))
    .filter((m) => !channels.some((c) => c.kind === "direct" && c.name === m.name));

  return (
    <>
      {visibleChannels.length === 0 && visibleMembers.length === 0 && (
        <div className="px-3 py-4 text-center text-xs text-slate-400">No conversations match.</div>
      )}
      {visibleChannels.map((c) => {
        const isActive = active?.id === c.id;
        const last = c.last_message_text || "";
        const lastAt = c.last_message_at || c.updated_at || c.created_at;
        return (
          <button
            key={c.id}
            onClick={() => onPick(c)}
            data-testid={`channel-${c.id}`}
            className={`mb-0.5 flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition ${
              isActive ? "bg-orange-100/60" : "hover:bg-slate-100"
            }`}
          >
            <ChannelAvatar channel={c} size={44} showPresence={c.kind === "direct"} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className={`truncate text-sm ${isActive ? "font-bold text-[#0F2042]" : "font-semibold text-slate-800"}`}>{c.name}</span>
                <span className="shrink-0 text-[10px] text-slate-400">{lastAt ? fmtRelTime(lastAt) : ""}</span>
              </div>
              <div className="truncate text-[12px] text-slate-500">
                {last || (c.kind === "direct" ? "Tap to start chatting" : `${c.member_ids?.length || 0} members`)}
              </div>
            </div>
          </button>
        );
      })}
      {visibleMembers.length > 0 && (
        <div className="mt-2 px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Start a new chat</div>
      )}
      {visibleMembers.slice(0, 12).map((m) => (
        <button
          key={m.id}
          data-testid={`dm-${m.email}`}
          onClick={() => onStartDM(m)}
          className="mb-0.5 flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition hover:bg-slate-100"
        >
          <div className="relative h-11 w-11 shrink-0">
            <div className="flex h-full w-full items-center justify-center rounded-full bg-[#0F2042] text-sm font-bold text-white">
              {m.name?.[0]?.toUpperCase()}
            </div>
            <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full border-2 border-white bg-slate-300" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-slate-800">{m.name}</div>
            <div className="truncate text-[12px] text-slate-500">{m.role}</div>
          </div>
        </button>
      ))}
    </>
  );
}
