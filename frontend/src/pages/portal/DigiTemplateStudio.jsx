/**
 * DigiTemplateStudio.jsx — predefined-template image maker (NO AI).
 * Pick a template + size, fill text, tweak colors (auto-loads brand kit),
 * live SVG preview → Download PNG or Save to the creatives library.
 */
import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, Save, LayoutTemplate } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";

export const SIZES = [
  { id: "square", label: "Post 1080×1080", w: 1080, h: 1080, platform: "instagram" },
  { id: "portrait", label: "Poster 1080×1350", w: 1080, h: 1350, platform: "instagram" },
  { id: "story", label: "Story 1080×1920", w: 1080, h: 1920, platform: "instagram" },
  { id: "banner", label: "Banner 1200×628", w: 1200, h: 628, platform: "linkedin" },
];

const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

// crude word-wrap for <text>/<tspan> (avoids foreignObject so canvas export works everywhere)
function wrapLines(text, maxChars, maxLines = 4) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars && cur) { lines.push(cur); cur = w; }
    else cur = (cur + " " + w).trim();
    if (lines.length === maxLines) break;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return lines;
}
const tspans = (lines, x, fontSize, lh = 1.12) =>
  lines.map((l, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : fontSize * lh}">${esc(l)}</tspan>`).join("");

function defs(c) {
  return `<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c.bg}"/><stop offset="100%" stop-color="#0a1530"/>
    </linearGradient>
    <radialGradient id="glow1" cx="85%" cy="12%" r="60%">
      <stop offset="0%" stop-color="${c.primary}" stop-opacity="0.5"/><stop offset="100%" stop-color="${c.primary}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="10%" cy="90%" r="55%">
      <stop offset="0%" stop-color="${c.accent}" stop-opacity="0.45"/><stop offset="100%" stop-color="${c.accent}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="cta" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${c.primary}"/><stop offset="100%" stop-color="${c.accent}"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect width="100%" height="100%" fill="url(#glow1)"/>
  <rect width="100%" height="100%" fill="url(#glow2)"/>`;
}
const brandTag = (c, w, text) =>
  `<text x="60" y="96" font-family="Arial,sans-serif" font-size="24" font-weight="700" letter-spacing="7" fill="${c.primary}">${esc(text || "// PROJEXINO")}</text>`;
const ctaPill = (c, x, y, label) => {
  const wPill = Math.max(220, (label || "").length * 15 + 90);
  return `<rect x="${x}" y="${y}" rx="42" ry="42" width="${wPill}" height="76" fill="url(#cta)"/>
  <text x="${x + wPill / 2}" y="${y + 48}" text-anchor="middle" font-family="Arial,sans-serif" font-size="26" font-weight="700" fill="#fff">${esc(label || "Learn more →")}</text>`;
};

export const TEMPLATES = [
  {
    id: "announcement", label: "Announcement", hint: "New launch / big news",
    fields: ["badge", "headline", "subtext", "cta"],
    defaults: { badge: "NEW LAUNCH", headline: "Something big is here", subtext: "A short supporting line that explains what changed and why it matters.", cta: "Learn more →" },
    render: ({ w, h, c, f, brand }) => {
      const hs = Math.round(w / 11);
      const hl = wrapLines(f.headline, 16, 3);
      const sl = wrapLines(f.subtext, 42, 3);
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs(c)}
${brandTag(c, w, brand)}
<rect x="60" y="${h * 0.24}" rx="26" width="${Math.max(200, f.badge.length * 17 + 70)}" height="52" fill="${c.accent}" opacity="0.92"/>
<text x="${60 + 34}" y="${h * 0.24 + 35}" font-family="Arial,sans-serif" font-size="24" font-weight="800" letter-spacing="3" fill="#fff">${esc(f.badge)}</text>
<rect x="60" y="${h * 0.33}" width="120" height="10" fill="${c.primary}"/>
<text x="60" y="${h * 0.33 + hs + 30}" font-family="Arial,sans-serif" font-size="${hs}" font-weight="800" fill="#fff">${tspans(hl, 60, hs)}</text>
<text x="60" y="${h * 0.33 + hs * (hl.length + 1) + 60}" font-family="Arial,sans-serif" font-size="30" fill="#cbd5e1">${tspans(sl, 60, 30, 1.4)}</text>
${ctaPill(c, 60, h - 150, f.cta)}
</svg>`;
    },
  },
  {
    id: "promo", label: "Promo / Offer", hint: "Discount & sale posts",
    fields: ["badge", "headline", "subtext", "cta"],
    defaults: { badge: "30% OFF", headline: "Season sale is live", subtext: "Limited period offer on all plans. Grab it before it's gone.", cta: "Shop now →" },
    render: ({ w, h, c, f, brand }) => {
      const hs = Math.round(w / 12);
      const hl = wrapLines(f.headline, 18, 3);
      const sl = wrapLines(f.subtext, 44, 3);
      const r = Math.round(w / 6.5);
      const bfs = Math.min(Math.round(r / 1.7), Math.round((r * 2.6) / Math.max(3, (f.badge || "").length)));
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs(c)}
${brandTag(c, w, brand)}
<circle cx="${w - r - 70}" cy="${h * 0.26}" r="${r}" fill="url(#cta)"/>
<circle cx="${w - r - 70}" cy="${h * 0.26}" r="${r - 14}" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="3" stroke-dasharray="10 8"/>
<text x="${w - r - 70}" y="${h * 0.26 + Math.round(bfs / 3)}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${bfs}" font-weight="900" fill="#fff">${esc(f.badge)}</text>
<text x="60" y="${h * 0.52}" font-family="Arial,sans-serif" font-size="${hs}" font-weight="800" fill="#fff">${tspans(hl, 60, hs)}</text>
<text x="60" y="${h * 0.52 + hs * hl.length + 40}" font-family="Arial,sans-serif" font-size="30" fill="#cbd5e1">${tspans(sl, 60, 30, 1.4)}</text>
${ctaPill(c, 60, h - 150, f.cta)}
</svg>`;
    },
  },
  {
    id: "quote", label: "Quote / Testimonial", hint: "Client praise & wisdom",
    fields: ["headline", "subtext"],
    defaults: { headline: "Projexino shipped our MVP in 6 weeks — flawless execution.", subtext: "Priya Sharma · CEO, Finlytics" },
    render: ({ w, h, c, f, brand }) => {
      const hs = Math.round(w / 15);
      const hl = wrapLines(f.headline, 26, 5);
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs(c)}
${brandTag(c, w, brand)}
<text x="52" y="${h * 0.32}" font-family="Georgia,serif" font-size="${Math.round(w / 4.5)}" font-weight="800" fill="${c.primary}" opacity="0.9">“</text>
<text x="70" y="${h * 0.38}" font-family="Georgia,serif" font-size="${hs}" font-style="italic" fill="#fff">${tspans(hl, 70, hs, 1.3)}</text>
<rect x="70" y="${h * 0.38 + hs * 1.3 * hl.length + 40}" width="90" height="8" fill="${c.accent}"/>
<text x="70" y="${h * 0.38 + hs * 1.3 * hl.length + 90}" font-family="Arial,sans-serif" font-size="28" font-weight="700" fill="#cbd5e1">${esc(f.subtext)}</text>
</svg>`;
    },
  },
  {
    id: "hiring", label: "We're Hiring", hint: "Recruitment posts",
    fields: ["headline", "subtext", "cta"],
    defaults: { headline: "Senior React Developer", subtext: "Remote · Full-time · 4+ yrs experience. Join a team shipping AI-first products.", cta: "Apply now →" },
    render: ({ w, h, c, f, brand }) => {
      const hs = Math.round(w / 13);
      const hl = wrapLines(f.headline, 20, 2);
      const sl = wrapLines(f.subtext, 44, 3);
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs(c)}
${brandTag(c, w, brand)}
<rect x="0" y="${h * 0.2}" width="${w}" height="110" fill="${c.primary}" opacity="0.16"/>
<text x="60" y="${h * 0.2 + 72}" font-family="Arial,sans-serif" font-size="52" font-weight="900" letter-spacing="10" fill="${c.primary}">WE'RE HIRING</text>
<text x="60" y="${h * 0.44}" font-family="Arial,sans-serif" font-size="${hs}" font-weight="800" fill="#fff">${tspans(hl, 60, hs)}</text>
<text x="60" y="${h * 0.44 + hs * hl.length + 40}" font-family="Arial,sans-serif" font-size="30" fill="#cbd5e1">${tspans(sl, 60, 30, 1.4)}</text>
${ctaPill(c, 60, h - 150, f.cta)}
</svg>`;
    },
  },
  {
    id: "event", label: "Event / Webinar", hint: "Invites with date chip",
    fields: ["badge", "headline", "subtext", "cta"],
    defaults: { badge: "24 JUL · 5 PM IST", headline: "Scaling products with AI workflows", subtext: "A live session with the Projexino engineering team. Free registration.", cta: "Register →" },
    render: ({ w, h, c, f, brand }) => {
      const hs = Math.round(w / 12.5);
      const hl = wrapLines(f.headline, 20, 3);
      const sl = wrapLines(f.subtext, 44, 3);
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs(c)}
${brandTag(c, w, brand)}
<rect x="60" y="${h * 0.22}" rx="14" width="${Math.max(280, f.badge.length * 16 + 70)}" height="58" fill="none" stroke="${c.primary}" stroke-width="3"/>
<text x="${60 + 34}" y="${h * 0.22 + 39}" font-family="Arial,sans-serif" font-size="26" font-weight="800" letter-spacing="2" fill="${c.primary}">${esc(f.badge)}</text>
<text x="60" y="${h * 0.36 + hs}" font-family="Arial,sans-serif" font-size="${hs}" font-weight="800" fill="#fff">${tspans(hl, 60, hs)}</text>
<text x="60" y="${h * 0.36 + hs * (hl.length + 1) + 44}" font-family="Arial,sans-serif" font-size="30" fill="#cbd5e1">${tspans(sl, 60, 30, 1.4)}</text>
${ctaPill(c, 60, h - 150, f.cta)}
</svg>`;
    },
  },
  {
    id: "tip", label: "Tip / Educational", hint: "Carousel covers & tips",
    fields: ["badge", "headline", "subtext"],
    defaults: { badge: "TIP #01", headline: "Ship smaller, ship faster", subtext: "Break features into slices you can release weekly — momentum beats perfection." },
    render: ({ w, h, c, f, brand }) => {
      const hs = Math.round(w / 11.5);
      const hl = wrapLines(f.headline, 17, 3);
      const sl = wrapLines(f.subtext, 42, 4);
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs(c)}
${brandTag(c, w, brand)}
<text x="60" y="${h * 0.3}" font-family="Arial,sans-serif" font-size="60" font-weight="900" letter-spacing="6" fill="${c.accent}">${esc(f.badge)}</text>
<rect x="60" y="${h * 0.33}" width="120" height="10" fill="${c.primary}"/>
<text x="60" y="${h * 0.33 + hs + 34}" font-family="Arial,sans-serif" font-size="${hs}" font-weight="800" fill="#fff">${tspans(hl, 60, hs)}</text>
<text x="60" y="${h * 0.33 + hs * (hl.length + 1) + 70}" font-family="Arial,sans-serif" font-size="32" fill="#cbd5e1">${tspans(sl, 60, 32, 1.45)}</text>
<circle cx="${w - 120}" cy="${h - 120}" r="44" fill="none" stroke="${c.primary}" stroke-width="4"/>
<text x="${w - 120}" y="${h - 108}" text-anchor="middle" font-family="Arial,sans-serif" font-size="34" font-weight="800" fill="${c.primary}">→</text>
</svg>`;
    },
  },
];

export function buildSvg({ templateId, sizeId, colors, fields, brand }) {
  const t = TEMPLATES.find((x) => x.id === templateId) || TEMPLATES[0];
  const s = SIZES.find((x) => x.id === sizeId) || SIZES[0];
  const f = { ...t.defaults, ...fields };
  return { svg: t.render({ w: s.w, h: s.h, c: colors, f, brand }), size: s, template: t };
}

export function downloadSvgAsPng(svg, w, h, filename) {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d").drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(url);
    canvas.toBlob((png) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(png);
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }, "image/png");
  };
  img.onerror = () => { URL.revokeObjectURL(url); toast.error("PNG export failed"); };
  img.src = url;
}

export default function TemplateStudioPanel({ clients, selectedId, onSelect, Hero, ClientPicker, Field }) {
  const [templateId, setTemplateId] = useState("announcement");
  const [sizeId, setSizeId] = useState("square");
  const [colors, setColors] = useState({ primary: "#F97316", accent: "#A855F7", bg: "#0F2042" });
  const [brand, setBrand] = useState("// PROJEXINO");
  const [fields, setFields] = useState({ ...TEMPLATES[0].defaults });
  const [saving, setSaving] = useState(false);

  // Auto-pull the client's brand kit palette
  useEffect(() => {
    if (!selectedId) return;
    api.get(`/digi/clients/${selectedId}/brand-kit`).then(({ data }) => {
      if (!data) return;
      setColors((c) => ({
        primary: data.primary_color || c.primary,
        accent: data.accent_color || c.accent,
        bg: data.background_color || c.bg,
      }));
      const cl = clients.find((x) => x.id === selectedId);
      if (cl?.name) setBrand(`// ${cl.name.toUpperCase()}`);
    }).catch(() => {});
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const tpl = TEMPLATES.find((t) => t.id === templateId) || TEMPLATES[0];
  const { svg, size } = useMemo(
    () => buildSvg({ templateId, sizeId, colors, fields, brand }),
    [templateId, sizeId, colors, fields, brand]
  );
  const previewUri = useMemo(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, [svg]);

  const pickTemplate = (id) => {
    const t = TEMPLATES.find((x) => x.id === id);
    setTemplateId(id);
    // keep user's headline/subtext/cta; badge always resets to the template default
    setFields((f) => ({ ...t.defaults, ...Object.fromEntries(Object.entries(f).filter(([k, v]) => k !== "badge" && t.fields.includes(k) && v)) }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.post("/digi/creatives/save", {
        client_id: selectedId, template_id: templateId, kind: sizeId,
        platform: size.platform, headline: fields.headline, svg, size: { w: size.w, h: size.h },
      });
      toast.success("Saved to creatives library");
    } catch (e) { toast.error(formatApiError(e)); }
    setSaving(false);
  };

  return (
    <div className="space-y-4" data-testid="digi-studio-root">
      <Hero title="Template Studio — images without AI" subtitle="Pick a predefined template, type your text, tweak the palette (or auto-use the client's brand kit) and export a ready-to-post PNG."/>
      <ClientPicker clients={clients} selectedId={selectedId} onSelect={onSelect}/>

      {/* Template picker */}
      <div className="flex flex-wrap gap-2">
        {TEMPLATES.map((t) => (
          <button key={t.id} onClick={() => pickTemplate(t.id)} data-testid={`digi-tpl-${t.id}`}
            className={`rounded-xl px-3 py-2 text-left text-xs font-bold ring-1 transition ${templateId === t.id ? "bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white ring-transparent shadow" : "bg-white text-slate-600 ring-slate-200 hover:ring-violet-300"}`}>
            <div className="flex items-center gap-1.5"><LayoutTemplate size={12}/> {t.label}</div>
            <div className={`text-[9px] font-normal ${templateId === t.id ? "text-white/80" : "text-slate-400"}`}>{t.hint}</div>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[380px,1fr]">
        {/* Controls */}
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <Field label="Size">
            <select value={sizeId} onChange={(e) => setSizeId(e.target.value)} className="inp" data-testid="digi-studio-size">
              {SIZES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Brand tag (top-left)">
            <input value={brand} onChange={(e) => setBrand(e.target.value)} className="inp" data-testid="digi-studio-brand"/>
          </Field>
          {tpl.fields.includes("badge") && (
            <Field label="Badge"><input value={fields.badge || ""} onChange={(e) => setFields({ ...fields, badge: e.target.value })} className="inp" data-testid="digi-studio-badge"/></Field>
          )}
          <Field label={templateId === "quote" ? "Quote" : "Headline"}>
            <textarea rows={2} value={fields.headline || ""} onChange={(e) => setFields({ ...fields, headline: e.target.value })} className="inp resize-y" data-testid="digi-studio-headline"/>
          </Field>
          {tpl.fields.includes("subtext") && (
            <Field label={templateId === "quote" ? "Author / role" : "Subtext"}>
              <textarea rows={2} value={fields.subtext || ""} onChange={(e) => setFields({ ...fields, subtext: e.target.value })} className="inp resize-y" data-testid="digi-studio-subtext"/>
            </Field>
          )}
          {tpl.fields.includes("cta") && (
            <Field label="CTA button"><input value={fields.cta || ""} onChange={(e) => setFields({ ...fields, cta: e.target.value })} className="inp" data-testid="digi-studio-cta"/></Field>
          )}
          <div className="grid grid-cols-3 gap-2">
            {["primary", "accent", "bg"].map((k) => (
              <label key={k} className="block">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">{k}</span>
                <input type="color" value={colors[k]} onChange={(e) => setColors({ ...colors, [k]: e.target.value })}
                  className="h-9 w-full cursor-pointer rounded-lg border border-slate-200" data-testid={`digi-studio-color-${k}`}/>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <button onClick={() => downloadSvgAsPng(svg, size.w, size.h, `${templateId}-${size.w}x${size.h}.png`)} data-testid="digi-studio-download"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#0F2042] px-4 py-2 text-xs font-bold text-white">
              <Download size={12}/> Download PNG
            </button>
            <button onClick={save} disabled={saving} data-testid="digi-studio-save"
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-xs font-bold text-white shadow disabled:opacity-50">
              {saving ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>} Save to library
            </button>
          </div>
        </div>

        {/* Live preview */}
        <div className="flex items-start justify-center rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <img src={previewUri} alt="preview" data-testid="digi-studio-preview"
            className="max-h-[640px] w-auto max-w-full rounded-xl shadow-lg" style={{ aspectRatio: `${size.w}/${size.h}` }}/>
        </div>
      </div>
    </div>
  );
}
