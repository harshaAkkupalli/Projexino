/**
 * LinkedInQueue.jsx — Admin panel for the LinkedIn auto-publisher.
 *
 * • Shows connection status + organization picker.
 * • Lists queued / approved / posted / failed items.
 * • Approve / Skip / Delete / Publish-now actions.
 * • Posts run automatically on Mon + Thu @ 10:00 IST via the backend scheduler.
 */
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Linkedin, RefreshCw, Loader2, Check, X, Trash2, Send, AlertTriangle,
  Calendar, Link as LinkIcon, ExternalLink, Sparkles, ChevronDown,
} from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";

const STATUS_STYLE = {
  queued:   { bg: "bg-slate-100", fg: "text-slate-600", label: "Queued (needs approval)" },
  approved: { bg: "bg-amber-100", fg: "text-amber-700", label: "Approved · scheduled" },
  posted:   { bg: "bg-emerald-100", fg: "text-emerald-700", label: "Posted to LinkedIn" },
  failed:   { bg: "bg-red-100", fg: "text-red-700", label: "Failed" },
  skipped:  { bg: "bg-zinc-100", fg: "text-zinc-500", label: "Skipped" },
};

export default function LinkedInQueue() {
  const [status, setStatus] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [params] = useSearchParams();

  useEffect(() => {
    void loadAll();
    const banner = params.get("linkedin");
    if (banner === "connected") toast.success("LinkedIn connected ✓");
    if (banner === "error") toast.error(`LinkedIn connect failed: ${params.get("reason") || "unknown"}`);
  }, []);  // eslint-disable-line

  async function loadAll() {
    setLoading(true);
    try {
      const [s, q] = await Promise.all([
        api.get("/linkedin/status"),
        api.get("/linkedin/queue"),
      ]);
      setStatus(s.data);
      setItems(q.data.items || []);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }

  async function connect() {
    try {
      const { data } = await api.get("/linkedin/authorize");
      // Stash the redirect URI so the admin can paste it into LinkedIn if mismatch error
      try { window.localStorage.setItem("linkedin_redirect_uri", data.redirect_uri || ""); } catch {}
      window.location.href = data.authorize_url;
    } catch (e) {
      toast.error(formatApiError(e));
    }
  }

  async function disconnect() {
    if (!window.confirm("Disconnect the Projexino LinkedIn company page?")) return;
    try {
      await api.post("/linkedin/disconnect");
      toast.success("Disconnected");
      await loadAll();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  }

  async function selectOrg(urn) {
    try {
      await api.post("/linkedin/select-organization", { organization_urn: urn });
      toast.success("Organization updated");
      await loadAll();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  }

  async function doAction(id, kind) {
    setBusyId(id);
    try {
      const map = {
        approve: ["post", `/linkedin/queue/${id}/approve`],
        skip:    ["post", `/linkedin/queue/${id}/skip`],
        delete:  ["delete", `/linkedin/queue/${id}`],
        publish: ["post", `/linkedin/queue/${id}/publish-now`],
      };
      const [m, url] = map[kind];
      const res = await api[m](url);
      if (kind === "publish" && res.data && res.data.ok === false) {
        toast.error(res.data.error || "Publish failed");
      } else {
        toast.success(kind === "publish" ? "Sent to LinkedIn" : "Updated");
      }
      await loadAll();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-[#F97316]" /></div>;
  }

  return (
    <div data-testid="linkedin-queue" className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-[#0F2042]">
            <Linkedin className="inline mr-2 text-[#0A66C2]" size={22} /> LinkedIn Auto-Publisher
          </h1>
          <p className="text-sm text-slate-500">
            Auto-posts go live <strong>Monday &amp; Thursday at 10:00 AM IST</strong>. Items remain "Queued"
            until an admin approves them.
          </p>
        </div>
        <button onClick={loadAll} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:border-[#F97316]" data-testid="li-refresh">
          <RefreshCw size={12} className="inline mr-1" /> Refresh
        </button>
      </div>

      {/* CONNECTION CARD */}
      {!status?.connected ? (
        <div className="rounded-3xl border border-orange-200 bg-orange-50/40 p-6" data-testid="li-not-connected">
          <h2 className="font-display text-lg font-semibold text-[#0F2042]">Connect Projexino LinkedIn Page</h2>
          <p className="mt-2 text-sm text-slate-600">
            You must be an <strong>admin of the Projexino LinkedIn Company Page</strong>. We'll request
            <code className="mx-1 rounded bg-white px-1.5 py-0.5">w_organization_social</code>
            and
            <code className="mx-1 rounded bg-white px-1.5 py-0.5">r_organization_social</code>
            so the system can post on behalf of the company page.
          </p>
          <RedirectURIHint />
          <button onClick={connect} className="btn-primary mt-5" data-testid="li-connect-btn">
            <Linkedin size={16} /> Connect LinkedIn
          </button>
          {params.get("linkedin") === "error" && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700" data-testid="li-error-banner">
              <strong>LinkedIn returned an error:</strong> {params.get("reason") || "unknown"}
              <div className="mt-1 text-red-600">
                Common fixes: (1) Add the redirect URL shown above to your LinkedIn app's
                "Authorized redirect URLs". (2) Confirm Community Management API is approved on
                your app. (3) Re-copy the Client Secret from LinkedIn Developer Portal → Auth tab.
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50/30 p-6" data-testid="li-connected">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-emerald-700">
                <Check className="inline mr-1" size={18} /> Connected
              </h2>
              <div className="mt-2 text-sm text-slate-600">
                Posting as: <strong>{status.selected_org_name || "(no organization picked)"}</strong>
              </div>
              <div className="mt-1 text-xs text-slate-400">
                Token expires {status.access_expires_at ? new Date(status.access_expires_at).toLocaleDateString() : "—"}
              </div>
            </div>
            <button onClick={disconnect} className="rounded-full border border-red-200 bg-white px-3 py-1.5 text-xs text-red-600 hover:bg-red-50" data-testid="li-disconnect">
              Disconnect
            </button>
          </div>
          {(status.organizations || []).length > 1 && (
            <div className="mt-4">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Switch organization</label>
              <select
                value={status.selected_org_urn || ""}
                onChange={(e) => selectOrg(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                data-testid="li-org-select"
              >
                {status.organizations.map((o) => (
                  <option key={o.urn} value={o.urn}>{o.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* QUEUE TABLE */}
      <div>
        <h2 className="font-display mb-3 text-lg font-semibold text-[#0F2042]">Queue ({items.length})</h2>
        {items.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-12 text-center text-sm text-slate-500" data-testid="li-empty">
            No items in the queue. Publish a blog post, then click <strong>"Draft for LinkedIn"</strong> in the Blog page.
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((it) => (
              <QueueRow
                key={it.id}
                item={it}
                busy={busyId === it.id}
                onApprove={() => doAction(it.id, "approve")}
                onSkip={() => doAction(it.id, "skip")}
                onDelete={() => doAction(it.id, "delete")}
                onPublishNow={() => doAction(it.id, "publish")}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RedirectURIHint() {
  const [uri, setUri] = useState("");
  useEffect(() => {
    (async () => {
      try {
        // Fetch the URI the backend will actually use right now
        const { data } = await api.get("/linkedin/authorize");
        setUri(data.redirect_uri || "");
      } catch {}
    })();
  }, []);
  if (!uri) return null;
  return (
    <div className="mt-3 rounded-xl border border-orange-300 bg-white p-3 text-xs">
      <div className="font-semibold text-[#0F2042]">Add this exact URL to your LinkedIn App:</div>
      <div className="mt-1 flex items-center gap-2">
        <code className="flex-1 break-all rounded bg-orange-50 px-2 py-1 text-[11px] text-[#F97316]" data-testid="li-redirect-uri">
          {uri}
        </code>
        <button
          onClick={() => { navigator.clipboard?.writeText(uri); toast.success("Copied"); }}
          className="rounded-full border border-orange-200 bg-white px-2 py-1 text-[10px] font-bold text-[#F97316] hover:bg-orange-50"
        >
          Copy
        </button>
      </div>
      <div className="mt-1.5 text-[10px] text-slate-500">
        Go to <a href="https://www.linkedin.com/developers/apps" target="_blank" rel="noreferrer" className="text-[#F97316] underline">linkedin.com/developers/apps</a> → your app → Auth tab → "Authorized redirect URLs" → Add.
      </div>
    </div>
  );
}

function QueueRow({ item, busy, onApprove, onSkip, onDelete, onPublishNow }) {
  const [open, setOpen] = useState(false);
  const s = STATUS_STYLE[item.status] || STATUS_STYLE.queued;
  const when = item.scheduled_for ? new Date(item.scheduled_for) : null;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4" data-testid={`li-row-${item.id}`}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${s.bg} ${s.fg}`}>{s.label}</span>
            <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
              {item.kind === "ai-native" ? "AI native" : item.kind === "blog-teaser" ? "Blog teaser" : "Manual"}
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
              <Calendar size={11} /> {when ? when.toLocaleString() : "—"}
            </span>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700" style={{ display: open ? "block" : "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {item.commentary}
          </p>
          {item.commentary && item.commentary.length > 240 && (
            <button onClick={() => setOpen((v) => !v)} className="mt-1 text-xs font-semibold text-[#F97316]">
              {open ? "Show less" : "Show more"} <ChevronDown size={10} className={`inline transition ${open ? "rotate-180" : ""}`} />
            </button>
          )}
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
            {item.link_url && <a href={item.link_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-[#F97316]"><LinkIcon size={11} /> {item.link_url.slice(0, 50)}</a>}
            {item.linkedin_post_urn && <a href={`https://www.linkedin.com/feed/update/${item.linkedin_post_urn}/`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-600 hover:underline"><ExternalLink size={11} /> View on LinkedIn</a>}
          </div>
          {item.last_error && (
            <div className="mt-2 flex items-start gap-1 rounded-lg bg-red-50 p-2 text-xs text-red-700">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              <span className="break-all">{item.last_error}</span>
            </div>
          )}
        </div>
        {item.image_url && (
          <img src={item.image_url} alt="" className="hidden h-20 w-20 rounded-lg object-cover sm:block" />
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        {item.status === "queued" && (
          <button onClick={onApprove} disabled={busy} className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700" data-testid={`li-approve-${item.id}`}>
            <Check size={12} className="inline mr-1" /> Approve
          </button>
        )}
        {(item.status === "queued" || item.status === "approved") && (
          <button onClick={onPublishNow} disabled={busy} className="rounded-full bg-[#0A66C2] px-3 py-1 text-xs font-semibold text-white hover:bg-[#084d96]">
            <Send size={12} className="inline mr-1" /> Publish now
          </button>
        )}
        {(item.status === "queued" || item.status === "approved") && (
          <button onClick={onSkip} disabled={busy} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:border-amber-400">
            Skip
          </button>
        )}
        {item.status !== "posted" && (
          <button onClick={onDelete} disabled={busy} className="ml-auto rounded-full border border-red-200 bg-white px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">
            <Trash2 size={12} className="inline mr-1" /> Delete
          </button>
        )}
      </div>
    </div>
  );
}
