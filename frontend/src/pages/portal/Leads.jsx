import { useEffect, useMemo, useState } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Mail, Phone, Building, DollarSign, MessageSquare, Trash2, Activity, TrendingUp } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import PortalInfographic from "@/components/PortalInfographic";

const COLUMNS = [
  { id: "new", title: "New", color: "#3B82F6" },
  { id: "contacted", title: "Contacted", color: "#F97316" },
  { id: "qualified", title: "Qualified", color: "#10B981" },
  { id: "won", title: "Won", color: "#A855F7" },
  { id: "lost", title: "Lost", color: "#EF4444" },
];

export default function Leads() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [activeLead, setActiveLead] = useState(null);

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/leads");
      setLeads(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, []);

  const grouped = useMemo(() => {
    const g = Object.fromEntries(COLUMNS.map((c) => [c.id, []]));
    leads.forEach((l) => g[l.status]?.push(l));
    return g;
  }, [leads]);

  const onDragEnd = async (result) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId) return;
    const newStatus = destination.droppableId;
    // optimistic
    setLeads((prev) => prev.map((l) => (l.id === draggableId ? { ...l, status: newStatus } : l)));
    try {
      const { data } = await api.patch(`/leads/${draggableId}`, { status: newStatus });
      setLeads((prev) => prev.map((l) => (l.id === draggableId ? data : l)));
      toast.success(`Moved to ${newStatus}`);
    } catch (e) {
      toast.error("Update failed");
      fetchLeads();
    }
  };

  return (
    <div data-testid="portal-leads" className="space-y-6">
      {/* 3D Infographic Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-orange-50/40 to-purple-50/40 p-6 shadow-sm">
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(50% 50% at 80% 20%, rgba(168,85,247,0.18), transparent 60%), radial-gradient(50% 50% at 10% 90%, rgba(249,115,22,0.18), transparent 60%)",
          }}
        />
        <div className="relative grid items-center gap-6 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <div className="text-xs font-bold uppercase tracking-[0.25em] text-[#F97316]">// lead tracking</div>
            <h1 className="font-display mt-2 text-3xl font-medium leading-tight text-[#0F2042] md:text-4xl">
              Convert every lead with intent.
            </h1>
            <p className="mt-3 text-sm text-slate-600">
              Drag prospects from <span className="font-semibold text-[#0F2042]">New → Contacted → Qualified → Won</span> and
              keep notes + activity in sync.
            </p>
            <div className="mt-5 flex items-center gap-3">
              <button
                data-testid="add-lead-btn"
                onClick={() => setShowAdd(true)}
                className="btn-primary text-sm"
              >
                <Plus size={16} /> New Lead
              </button>
              <div className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                <TrendingUp size={14} className="text-[#10B981]" />
                Pipeline live
              </div>
            </div>
          </div>
          <div className="lg:col-span-3">
            <PortalInfographic variant="leads" className="h-56 w-full" />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          Loading leads…
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="scrollbar-thin flex gap-4 overflow-x-auto pb-4">
            {COLUMNS.map((col) => (
              <Droppable droppableId={col.id} key={col.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    data-testid={`kanban-col-${col.id}`}
                    className={`kanban-col flex-1 rounded-2xl border p-3 transition-colors ${
                      snapshot.isDraggingOver
                        ? "border-[#F97316] bg-orange-50/50"
                        : "border-slate-200 bg-slate-50/50"
                    }`}
                  >
                    <div className="mb-3 flex items-center justify-between px-1">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: col.color }} />
                        <span className="text-sm font-semibold text-slate-700">{col.title}</span>
                      </div>
                      <span className="font-mono-pj text-xs text-slate-400">{grouped[col.id].length}</span>
                    </div>
                    <div className="space-y-2">
                      {grouped[col.id].map((lead, idx) => (
                        <Draggable key={lead.id} draggableId={lead.id} index={idx}>
                          {(p, snap) => (
                            <div
                              ref={p.innerRef}
                              {...p.draggableProps}
                              {...p.dragHandleProps}
                              onClick={() => setActiveLead(lead)}
                              data-testid={`lead-card-${lead.id}`}
                              className={`cursor-grab rounded-xl border bg-white p-3 shadow-sm transition hover:border-[#1E3A8A] hover:shadow-md ${
                                snap.isDragging ? "rotate-1 border-[#F97316] shadow-lg" : "border-slate-200"
                              }`}
                            >
                              <div className="flex items-start justify-between">
                                <div className="font-semibold text-sm text-[#0F172A]">{lead.name}</div>
                                {lead.value > 0 && (
                                  <div className="font-mono-pj text-xs text-[#F97316]">
                                    ${Number(lead.value).toLocaleString()}
                                  </div>
                                )}
                              </div>
                              {lead.company && (
                                <div className="mt-1 text-xs text-slate-500">{lead.company}</div>
                              )}
                              <div className="mt-3 flex items-center justify-between">
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-500">
                                  {lead.source}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {lead.activities?.length || 0} act.
                                </span>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            ))}
          </div>
        </DragDropContext>
      )}

      <AnimatePresence>
        {showAdd && <AddLeadModal onClose={() => setShowAdd(false)} onCreated={(l) => setLeads((p) => [l, ...p])} />}
      </AnimatePresence>
      <AnimatePresence>
        {activeLead && (
          <LeadDrawer
            lead={activeLead}
            onClose={() => setActiveLead(null)}
            onUpdated={(updated) => {
              setLeads((p) => p.map((l) => (l.id === updated.id ? updated : l)));
              setActiveLead(updated);
            }}
            onDeleted={(id) => {
              setLeads((p) => p.filter((l) => l.id !== id));
              setActiveLead(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function AddLeadModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", source: "website", value: 0 });
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.post("/leads", { ...form, value: Number(form.value) || 0 });
      onCreated(data);
      toast.success("Lead added");
      onClose();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <motion.form
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-xl font-semibold">New Lead</h3>
          <button type="button" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <Input label="Name *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} testId="lead-name" required />
          <Input label="Company" value={form.company} onChange={(v) => setForm({ ...form, company: v })} testId="lead-company" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} testId="lead-email" />
            <Input label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} testId="lead-phone" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Source" value={form.source} onChange={(v) => setForm({ ...form, source: v })} options={["website", "referral", "linkedin", "event", "outbound"]} testId="lead-source" />
            <Input label="Value ($)" type="number" value={form.value} onChange={(v) => setForm({ ...form, value: v })} testId="lead-value" />
          </div>
        </div>
        <button data-testid="lead-save-btn" disabled={saving} className="btn-primary mt-6 w-full justify-center">
          {saving ? "Saving…" : "Create Lead"}
        </button>
      </motion.form>
    </motion.div>
  );
}

function LeadDrawer({ lead, onClose, onUpdated, onDeleted }) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const addNote = async () => {
    if (!note.trim()) return;
    setSaving(true);
    try {
      const { data } = await api.post(`/leads/${lead.id}/notes`, { message: note });
      onUpdated(data);
      setNote("");
      toast.success("Note added");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Delete this lead?")) return;
    await api.delete(`/leads/${lead.id}`);
    onDeleted(lead.id);
    toast.success("Lead deleted");
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex justify-end bg-black/30"
      onClick={onClose}
    >
      <motion.div
        initial={{ x: 400 }}
        animate={{ x: 0 }}
        exit={{ x: 400 }}
        transition={{ type: "spring", damping: 25, stiffness: 220 }}
        onClick={(e) => e.stopPropagation()}
        data-testid="lead-drawer"
        className="h-full w-full max-w-md overflow-y-auto bg-white p-6"
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#F97316]">// lead</div>
            <h3 className="font-display mt-1 text-2xl font-semibold">{lead.name}</h3>
            {lead.company && <div className="mt-1 text-sm text-slate-500">{lead.company}</div>}
          </div>
          <button onClick={onClose}><X size={20} /></button>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <Info icon={Mail} label="Email" value={lead.email || "—"} />
          <Info icon={Phone} label="Phone" value={lead.phone || "—"} />
          <Info icon={Building} label="Source" value={lead.source} />
          <Info icon={DollarSign} label="Value" value={`$${Number(lead.value).toLocaleString()}`} />
        </div>

        <div className="mt-6">
          <div className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Add note</div>
          <div className="flex gap-2">
            <input
              data-testid="lead-note-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Quick note…"
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#F97316]"
            />
            <button
              data-testid="lead-add-note-btn"
              onClick={addNote}
              disabled={saving || !note.trim()}
              className="btn-primary text-sm"
            >
              <MessageSquare size={14} /> Add
            </button>
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
            <Activity size={12} /> Activity timeline
          </div>
          <div className="space-y-3">
            {(lead.activities || []).slice().reverse().map((a) => (
              <div key={a.id} className="border-l-2 border-[#F97316] pl-3">
                <div className="text-xs uppercase tracking-wider text-slate-500">{a.kind.replace("_", " ")}</div>
                <div className="text-sm text-slate-800">{a.message}</div>
                <div className="text-[10px] text-slate-400">{new Date(a.at).toLocaleString()}</div>
              </div>
            ))}
            {(!lead.activities || lead.activities.length === 0) && (
              <div className="text-sm text-slate-400">No activity yet.</div>
            )}
          </div>
        </div>

        <button onClick={remove} data-testid="lead-delete-btn" className="mt-8 flex items-center gap-2 text-sm text-red-500 hover:underline">
          <Trash2 size={14} /> Delete lead
        </button>
      </motion.div>
    </motion.div>
  );
}

function Input({ label, value, onChange, type = "text", testId, required }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-500">{label}</span>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]"
      />
    </label>
  );
}

function Select({ label, value, onChange, options, testId }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]"
      >
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

function Info({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
        <Icon size={12} /> {label}
      </div>
      <div className="mt-1 truncate text-sm font-medium text-slate-800">{value}</div>
    </div>
  );
}
