import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Save, Loader2, FileUp, Plus, Trash2, Globe, Mail, Phone, MapPin, Share2, Sparkles, Layers, Building2, FileDown, Trash } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";

const SECTIONS = [
  { id: "brand",      label: "Brand",      icon: Sparkles },
  { id: "hero",       label: "Homepage hero", icon: Layers },
  { id: "about",      label: "About",      icon: Building2 },
  { id: "stats",      label: "Stats",      icon: Layers },
  { id: "services",   label: "Services",   icon: Layers },
  { id: "faq",        label: "FAQ",        icon: Layers },
  { id: "cta_section", label: "Bottom CTA", icon: Layers },
  { id: "industries", label: "Industries", icon: Building2 },
  { id: "tech_stack", label: "Tech stack", icon: Layers },
  { id: "contact",    label: "Contact",    icon: Mail },
  { id: "socials",    label: "Socials",    icon: Share2 },
  { id: "footer",     label: "Footer",     icon: Globe },
  { id: "profile_pdf", label: "Company Profile PDF", icon: FileUp },
];

export default function WebsiteConfig() {
  const [config, setConfig] = useState(null);
  const [section, setSection] = useState("brand");
  const [busy, setBusy] = useState(false);
  const [pdfInfo, setPdfInfo] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/website-config");
        setConfig(data);
        const info = await api.get("/xino/company-profile/info");
        setPdfInfo(info.data);
      } catch (e) {
        toast.error(formatApiError(e));
      }
    })();
  }, []);

  if (!config) {
    return <div className="flex items-center justify-center py-24"><Loader2 size={32} className="animate-spin text-[#F97316]" /></div>;
  }

  const save = async () => {
    setBusy(true);
    try {
      await api.put("/admin/website-config", config);
      toast.success("Website config saved — public site updated instantly.");
    } catch (e) {
      toast.error(formatApiError(e));
    }
    setBusy(false);
  };

  const reloadPdf = async () => {
    const { data } = await api.get("/xino/company-profile/info");
    setPdfInfo(data);
  };

  return (
    <div className="space-y-6" data-testid="website-config-page">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.32em] text-[#F97316]">// WEBSITE CONFIG</div>
          <h1 className="font-display mt-1 text-3xl font-semibold text-[#0F2042]">Edit your public site</h1>
          <div className="text-sm text-slate-500">
            Update copy, contact info and assets on every public page — instantly, no redeploy needed.
            {config.updated_at && (
              <span className="ml-2 text-xs text-slate-400">
                Last saved {new Date(config.updated_at).toLocaleString()} by {config.updated_by}
              </span>
            )}
          </div>
        </div>
        <button data-testid="ws-save"
          onClick={save} disabled={busy}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#0F2042] to-[#7C3AED] px-6 py-3 text-xs font-bold uppercase tracking-[0.18em] text-white shadow-lg disabled:opacity-50">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {busy ? "Saving…" : "Save & publish"}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[200px,1fr]">
        {/* Section nav */}
        <nav className="space-y-1 self-start rounded-2xl border border-slate-200 bg-white p-2">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              data-testid={`ws-section-${s.id}`}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold transition ${
                section === s.id
                  ? "bg-gradient-to-br from-[#F97316] to-[#FB923C] text-white shadow-md"
                  : "text-slate-500 hover:bg-slate-50 hover:text-[#F97316]"
              }`}
            >
              <s.icon size={14} /> {s.label}
            </button>
          ))}
        </nav>

        {/* Editor */}
        <motion.div
          key={section}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6"
        >
          {section === "brand" && (
            <Section title="Brand identity" desc="Visible across every page header and footer.">
              <Row><Field label="Brand name" value={config.brand?.name || ""} onChange={(v) => setConfig({...config, brand: {...config.brand, name: v}})} testId="ws-brand-name" /></Row>
              <Row><Field label="Tagline" value={config.brand?.tagline || ""} onChange={(v) => setConfig({...config, brand: {...config.brand, tagline: v}})} testId="ws-brand-tagline" /></Row>
              <Row cols={3}>
                <Field label="Established" value={config.brand?.established || ""} onChange={(v) => setConfig({...config, brand: {...config.brand, established: v}})} testId="ws-brand-est" />
                <Field label="Primary color (hex)" value={config.brand?.primary_color || ""} onChange={(v) => setConfig({...config, brand: {...config.brand, primary_color: v}})} testId="ws-brand-primary" />
                <Field label="Deep color (hex)" value={config.brand?.deep_color || ""} onChange={(v) => setConfig({...config, brand: {...config.brand, deep_color: v}})} testId="ws-brand-deep" />
              </Row>
            </Section>
          )}

          {section === "hero" && (
            <Section title="Homepage hero" desc="The first thing visitors read. Headline 2 is rendered italic in orange.">
              <Row><Field label="Eyebrow (small tag)" value={config.hero?.eyebrow} onChange={(v) => setConfig({...config, hero: {...config.hero, eyebrow: v}})} testId="ws-hero-eyebrow" /></Row>
              <Row cols={3}>
                <Field label="Headline (line 1)" value={config.hero?.headline_1} onChange={(v) => setConfig({...config, hero: {...config.hero, headline_1: v}})} testId="ws-hero-h1" />
                <Field label="Headline 2 (italic, orange)" value={config.hero?.headline_2_italic || config.hero?.headline_2 || ""} onChange={(v) => setConfig({...config, hero: {...config.hero, headline_2_italic: v}})} testId="ws-hero-h2" />
                <Field label="Headline (line 3)" value={config.hero?.headline_3 || ""} onChange={(v) => setConfig({...config, hero: {...config.hero, headline_3: v}})} testId="ws-hero-h3" />
              </Row>
              <Row><Textarea label="Sub-headline" value={config.hero?.subheadline} onChange={(v) => setConfig({...config, hero: {...config.hero, subheadline: v}})} testId="ws-hero-sub" /></Row>
              <Row cols={2}>
                <Field label="Primary CTA label" value={config.hero?.cta_primary_label} onChange={(v) => setConfig({...config, hero: {...config.hero, cta_primary_label: v}})} />
                <Field label="Primary CTA link" value={config.hero?.cta_primary_link} onChange={(v) => setConfig({...config, hero: {...config.hero, cta_primary_link: v}})} />
              </Row>
              <Row cols={2}>
                <Field label="Secondary CTA label" value={config.hero?.cta_secondary_label} onChange={(v) => setConfig({...config, hero: {...config.hero, cta_secondary_label: v}})} />
                <Field label="Secondary CTA link" value={config.hero?.cta_secondary_link} onChange={(v) => setConfig({...config, hero: {...config.hero, cta_secondary_link: v}})} />
              </Row>
            </Section>
          )}

          {section === "faq" && (
            <Section title="Homepage FAQ" desc="Each item appears in the homepage FAQ accordion AND emits FAQ schema for Google rich snippets.">
              <ObjListEditor
                items={config.faq || []}
                onChange={(arr) => setConfig({...config, faq: arr})}
                template={{ q: "New question?", a: "Detailed answer." }}
                fields={[
                  {key: "q", label: "Question"},
                  {key: "a", label: "Answer"},
                ]}
              />
            </Section>
          )}

          {section === "cta_section" && (
            <Section title="Bottom CTA section" desc="The closing call-to-action at the end of the homepage.">
              <Row cols={2}>
                <Field label="Headline 1" value={config.cta_section?.headline_1 || ""} onChange={(v) => setConfig({...config, cta_section: {...(config.cta_section || {}), headline_1: v}})} />
                <Field label="Headline 2 (italic accent)" value={config.cta_section?.headline_2_italic || ""} onChange={(v) => setConfig({...config, cta_section: {...(config.cta_section || {}), headline_2_italic: v}})} />
              </Row>
              <Row><Textarea label="Sub-headline" value={config.cta_section?.subheadline || ""} onChange={(v) => setConfig({...config, cta_section: {...(config.cta_section || {}), subheadline: v}})} /></Row>
              <Row cols={2}>
                <Field label="Button label" value={config.cta_section?.cta_label || ""} onChange={(v) => setConfig({...config, cta_section: {...(config.cta_section || {}), cta_label: v}})} />
                <Field label="Button link" value={config.cta_section?.cta_link || ""} onChange={(v) => setConfig({...config, cta_section: {...(config.cta_section || {}), cta_link: v}})} />
              </Row>
            </Section>
          )}

          {section === "about" && (
            <Section title="About section" desc="Who we are, mission and values.">
              <Row><Field label="Section title" value={config.about?.title} onChange={(v) => setConfig({...config, about: {...config.about, title: v}})} /></Row>
              <Row><Textarea rows={4} label="Body" value={config.about?.body} onChange={(v) => setConfig({...config, about: {...config.about, body: v}})} /></Row>
              <Row><Field label="Mission statement" value={config.about?.mission} onChange={(v) => setConfig({...config, about: {...config.about, mission: v}})} /></Row>
              <ListEditor label="Values" items={config.about?.values || []} onChange={(arr) => setConfig({...config, about: {...config.about, values: arr}})} />
            </Section>
          )}

          {section === "stats" && (
            <Section title="Stats / Counters" desc="Numbers shown on the hero and PDFs.">
              <ObjListEditor
                items={config.stats || []}
                onChange={(arr) => setConfig({...config, stats: arr})}
                template={{ label: "New label", value: "0+" }}
                fields={[
                  {key: "label", label: "Label"},
                  {key: "value", label: "Value (e.g. 100+)"},
                ]}
              />
            </Section>
          )}

          {section === "services" && (
            <Section title="Service cards" desc="Six headline capabilities.">
              <ObjListEditor
                items={config.services || []}
                onChange={(arr) => setConfig({...config, services: arr})}
                template={{ title: "New service", summary: "Describe it briefly." }}
                fields={[
                  {key: "title", label: "Title"},
                  {key: "summary", label: "Summary"},
                ]}
              />
            </Section>
          )}

          {section === "industries" && (
            <Section title="Industries served" desc="Shown on About + Profile PDF.">
              <ListEditor label="Industry" items={config.industries || []} onChange={(arr) => setConfig({...config, industries: arr})} />
            </Section>
          )}

          {section === "tech_stack" && (
            <Section title="Tech stack chips" desc="Shown on About + Profile PDF.">
              <ListEditor label="Technology" items={config.tech_stack || []} onChange={(arr) => setConfig({...config, tech_stack: arr})} />
            </Section>
          )}

          {section === "contact" && (
            <Section title="Contact details" desc="Email, phone & address shown sitewide.">
              <Row cols={2}>
                <Field label="Primary email" icon={Mail} value={config.contact?.email} onChange={(v) => setConfig({...config, contact: {...config.contact, email: v}})} testId="ws-contact-email" />
                <Field label="Support email" icon={Mail} value={config.contact?.support_email} onChange={(v) => setConfig({...config, contact: {...config.contact, support_email: v}})} />
              </Row>
              <Row cols={2}>
                <Field label="Phone" icon={Phone} value={config.contact?.phone} onChange={(v) => setConfig({...config, contact: {...config.contact, phone: v}})} testId="ws-contact-phone" />
                <Field label="Billing email" icon={Mail} value={config.contact?.billing_email} onChange={(v) => setConfig({...config, contact: {...config.contact, billing_email: v}})} />
              </Row>
              <Row><Field label="Office address" icon={MapPin} value={config.contact?.address} onChange={(v) => setConfig({...config, contact: {...config.contact, address: v}})} testId="ws-contact-addr" /></Row>
              <Row><Field label="Office hours" value={config.contact?.office_hours} onChange={(v) => setConfig({...config, contact: {...config.contact, office_hours: v}})} /></Row>
              <Row><Field label="Website URL" icon={Globe} value={config.contact?.website} onChange={(v) => setConfig({...config, contact: {...config.contact, website: v}})} /></Row>
            </Section>
          )}

          {section === "socials" && (
            <Section title="Social links" desc="Linked in the footer and contact strip.">
              {["linkedin", "twitter", "instagram", "github", "youtube"].map((k) => (
                <Row key={k}><Field label={k.charAt(0).toUpperCase() + k.slice(1)} value={config.socials?.[k] || ""} onChange={(v) => setConfig({...config, socials: {...config.socials, [k]: v}})} testId={`ws-social-${k}`} /></Row>
              ))}
            </Section>
          )}

          {section === "footer" && (
            <Section title="Footer" desc="Bottom of every public page.">
              <Row><Field label="Tagline" value={config.footer?.tagline} onChange={(v) => setConfig({...config, footer: {...config.footer, tagline: v}})} /></Row>
              <Row><Field label="Copyright" value={config.footer?.copyright} onChange={(v) => setConfig({...config, footer: {...config.footer, copyright: v}})} /></Row>
              <ObjListEditor
                label="Legal links"
                items={config.footer?.legal_links || []}
                onChange={(arr) => setConfig({...config, footer: {...config.footer, legal_links: arr}})}
                template={{ label: "New link", href: "/" }}
                fields={[{key: "label", label: "Label"}, {key: "href", label: "URL"}]}
              />
            </Section>
          )}

          {section === "profile_pdf" && (
            <ProfilePdfManager pdfInfo={pdfInfo} reloadPdf={reloadPdf} />
          )}
        </motion.div>
      </div>
    </div>
  );
}

function Section({ title, desc, children }) {
  return (
    <div>
      <div className="mb-4 border-b border-slate-100 pb-3">
        <h2 className="font-display text-xl font-semibold text-[#0F2042]">{title}</h2>
        {desc && <p className="mt-0.5 text-xs text-slate-500">{desc}</p>}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Row({ children, cols = 1 }) {
  return (
    <div className={`grid gap-3`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {children}
    </div>
  );
}

function Field({ label, value, onChange, icon: Icon, testId }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
        {Icon && <Icon size={11} />} {label}
      </span>
      <input type="text" value={value || ""} onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]" />
    </label>
  );
}

function Textarea({ label, value, onChange, rows = 3, testId }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">{label}</span>
      <textarea rows={rows} value={value || ""} onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]" />
    </label>
  );
}

function ListEditor({ label, items, onChange }) {
  return (
    <div className="space-y-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">{label} items</div>
      {items.map((v, i) => (
        <div key={i} className="flex gap-2">
          <input value={v} onChange={(e) => { const a = [...items]; a[i] = e.target.value; onChange(a); }}
            className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
          <button onClick={() => onChange(items.filter((_, k) => k !== i))}
            className="rounded-lg border border-red-200 bg-red-50 px-3 text-red-600 hover:bg-red-100"><Trash2 size={14}/></button>
        </div>
      ))}
      <button onClick={() => onChange([...(items || []), ""])}
        className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-bold text-[#F97316] hover:bg-orange-100">
        <Plus size={12}/> Add
      </button>
    </div>
  );
}

function ObjListEditor({ label, items, onChange, template, fields }) {
  return (
    <div className="space-y-2">
      {label && <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">{label}</div>}
      {items.map((item, i) => (
        <div key={i} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex justify-end">
            <button onClick={() => onChange(items.filter((_, k) => k !== i))}
              className="text-[10px] font-bold text-red-600 hover:text-red-800"><Trash2 size={12}/></button>
          </div>
          {fields.map(({key, label}) => (
            <Field key={key} label={label} value={item[key] || ""} onChange={(v) => {
              const a = [...items];
              a[i] = { ...a[i], [key]: v };
              onChange(a);
            }} />
          ))}
        </div>
      ))}
      <button onClick={() => onChange([...(items || []), { ...template }])}
        className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-bold text-[#F97316] hover:bg-orange-100">
        <Plus size={12}/> Add
      </button>
    </div>
  );
}

function ProfilePdfManager({ pdfInfo, reloadPdf }) {
  const [busy, setBusy] = useState(false);
  const fileRef = (typeof window !== "undefined") ? null : null;
  const downloadUrl = (() => {
    const base = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");
    return `${base}/api/xino/company-profile.pdf`;
  })();

  const upload = async (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) { toast.error("Only PDF files"); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post("/xino/company-profile/upload-secured", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Company Profile PDF replaced. Public download now serves this file.");
      await reloadPdf();
    } catch (e) {
      toast.error(formatApiError(e));
    }
    setBusy(false);
  };

  const remove = async () => {
    if (!window.confirm("Remove the custom PDF and revert to the auto-generated one?")) return;
    try {
      await api.delete("/xino/company-profile");
      toast.success("Reverted to auto-generated profile");
      await reloadPdf();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <Section title="Company Profile PDF" desc="This is what the public website serves on the Xino popup 'Download' button.">
      <div className="rounded-2xl border border-orange-100 bg-orange-50/40 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#F97316] to-[#FB923C] text-white shadow">
            <FileUp size={22} />
          </div>
          <div className="flex-1">
            <div className="font-display text-base font-semibold text-[#0F2042]">
              {pdfInfo?.custom ? "Custom PDF uploaded" : "Auto-generated PDF (no upload)"}
            </div>
            <div className="text-xs text-slate-500">
              {pdfInfo?.custom
                ? `${pdfInfo?.size_kb ? pdfInfo.size_kb.toFixed(1) : "?"} KB · updated ${new Date(pdfInfo?.updated_at).toLocaleString()}`
                : "We auto-generate a branded PDF on every download. Upload a custom one if you want full control."}
            </div>
          </div>
          <a href={downloadUrl} target="_blank" rel="noopener noreferrer"
            data-testid="ws-profile-download"
            className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#F97316] hover:bg-orange-50">
            <FileDown size={12} /> Preview
          </a>
          {pdfInfo?.custom && (
            <button onClick={remove}
              data-testid="ws-profile-remove"
              className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-red-600 hover:bg-red-50">
              <Trash size={12} /> Revert
            </button>
          )}
        </div>

        <label className="mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-orange-300 bg-white p-6 text-center hover:bg-orange-50">
          <FileUp size={24} className="text-[#F97316]" />
          <div className="text-sm font-semibold text-[#0F2042]">
            {busy ? "Uploading…" : "Click to upload a new PDF (max 12 MB)"}
          </div>
          <div className="text-[11px] text-slate-500">
            PDF only · Replaces the public Company Profile · Visitors download this file from the Xino popup.
          </div>
          <input type="file" accept="application/pdf" hidden disabled={busy}
            data-testid="ws-profile-upload"
            onChange={(e) => upload(e.target.files?.[0])} />
        </label>
      </div>
    </Section>
  );
}
