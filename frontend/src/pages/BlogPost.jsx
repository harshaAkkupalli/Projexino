import { useEffect, useState, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Calendar, ArrowLeft, User as UserIcon, FileDown } from "lucide-react";
import axios from "axios";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import NewsletterSignup from "@/components/NewsletterSignup";

// Self-hosted logo, resolved to an absolute URL for external crawlers (JSON-LD/OG)
const LOGO_URL = (typeof window !== "undefined" ? window.location.origin : "https://www.projexino.com") + "/projexino-logo.png";

const API = process.env.REACT_APP_BACKEND_URL;

export default function BlogPost() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setLoading(true);
    axios.get(`${API}/api/blog/posts/${slug}`)
      .then((r) => setPost(r.data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas-warm">
        <Navbar />
        <div className="pt-32 text-center text-slate-500" data-testid="blog-post-loading">Loading article…</div>
        <Footer />
      </div>
    );
  }
  if (notFound || !post) {
    return (
      <div className="min-h-screen bg-canvas-warm">
        <SEO title="Article not found" noindex canonical={`/blog/${slug}`} />
        <Navbar />
        <div className="mx-auto max-w-3xl px-6 pt-40 pb-32 text-center" data-testid="blog-post-notfound">
          <h1 className="font-display text-4xl font-medium">This article doesn't exist.</h1>
          <p className="mt-4 text-slate-600">It may have been moved or unpublished.</p>
          <button onClick={() => navigate("/blog")} className="btn-primary mt-8">Back to Blog</button>
        </div>
        <Footer />
      </div>
    );
  }

  const url = `https://www.projexino.com/blog/${post.slug}`;
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      "headline": post.title,
      "description": post.seo_description || post.excerpt,
      "image": post.cover_image || undefined,
      "datePublished": post.published_at,
      "dateModified": post.updated_at || post.published_at,
      "author": { "@type": "Person", "name": post.author_name || "Projexino" },
      "publisher": {
        "@type": "Organization",
        "name": "Projexino",
        "logo": {
          "@type": "ImageObject",
          "url": LOGO_URL,
        },
      },
      "mainEntityOfPage": { "@type": "WebPage", "@id": url },
      "keywords": (post.seo_keywords || post.tags || []).join(", "),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.projexino.com/" },
        { "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://www.projexino.com/blog" },
        { "@type": "ListItem", "position": 3, "name": post.title, "item": url },
      ],
    },
  ];

  return (
    <div data-testid="page-blog-post" className="relative min-h-screen overflow-hidden bg-canvas-warm text-[#0F172A]">
      <SEO
        title={post.seo_title || post.title}
        description={post.seo_description || post.excerpt}
        canonical={`/blog/${post.slug}`}
        image={post.cover_image || undefined}
        keywords={post.seo_keywords || post.tags || []}
        ogType="article"
        jsonLd={jsonLd}
      />
      <Navbar />

      <article className="relative pt-32 pb-24">
        <div className="mx-auto max-w-3xl px-6">
          <Link to="/blog" className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-[#F97316]">
            <ArrowLeft size={14} /> Back to Blog
          </Link>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-display mt-6 text-4xl font-light leading-tight md:text-5xl"
          >
            {post.title}
          </motion.h1>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
            {post.author_name && (
              <span className="inline-flex items-center gap-1.5"><UserIcon size={12} /> {post.author_name}</span>
            )}
            {post.published_at && (
              <span className="inline-flex items-center gap-1.5"><Calendar size={12} /> {new Date(post.published_at).toLocaleDateString()}</span>
            )}
            {(post.tags || []).map((t) => (
              <Link key={t} to={`/blog?tag=${encodeURIComponent(t)}`} className="rounded-full bg-orange-50 px-2 py-0.5 font-semibold text-[#F97316]">
                #{t}
              </Link>
            ))}
          </div>

          {post.cover_image && (
            <img src={post.cover_image} alt={post.title} className="mt-8 w-full rounded-3xl border border-orange-100 object-cover" loading="lazy" />
          )}

          <BlogPostBody
            html={post.content_html}
            attachments={post.attachments || []}
            apiBase={API}
          />

          {/* Dynamic CTA (admin-editable) — falls back to default Projexino CTA */}
          <div data-testid="blog-post-cta" className="mt-16 rounded-3xl border border-orange-100 bg-gradient-to-br from-orange-50/50 via-white to-violet-50/40 p-8 text-center shadow-sm">
            <h3 className="font-display text-xl font-semibold text-[#0F2042]">
              {post.cta_heading || "Need a team to ship this for you?"}
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              {post.cta_subheading || "Projexino has shipped 500+ projects. Get a free scope & estimate."}
            </p>
            {post.cta_link ? (
              <a
                href={post.cta_link}
                target={post.cta_link.startsWith("http") ? "_blank" : undefined}
                rel="noopener noreferrer"
                className="btn-primary mt-5 inline-flex"
                data-testid="blog-post-cta-btn"
              >
                {post.cta_label || "Learn more"}
              </a>
            ) : (
              <Link to="/contact" className="btn-primary mt-5 inline-flex" data-testid="blog-post-cta-btn">
                {post.cta_label || "Start your project"}
              </Link>
            )}
          </div>

          {/* Newsletter signup card */}
          <div className="mt-10">
            <NewsletterSignup variant="card" source="blog" />
          </div>
        </div>
      </article>

      <Footer />
    </div>
  );
}


/**
 * BlogPostBody — renders the post HTML and expands custom inline markers:
 *   {{attachment:<id>}}    →  Download card (uses attachment.title)
 *   {{image:<id>}}         →  Centered <img> with caption
 *
 * The markers are placed by the admin in the Blog Editor with the
 * "Insert PDF here" / "Insert image here" buttons, so editors can drop
 * a downloadable PDF (with its own title) at ANY position in the post.
 */
function BlogPostBody({ html, attachments, apiBase }) {
  const expandedHtml = useMemo(() => {
    if (!html) return "";
    let out = html;
    (attachments || []).forEach((a) => {
      if (a.kind === "image") {
        const tag = `<figure data-att="${a.id}" style="margin:32px auto;text-align:center"><img src="${apiBase}/api/blog/assets/${a.id}" alt="${(a.title || "").replace(/"/g, "")}" style="max-width:100%;border-radius:18px;border:1px solid #fde2c9"/>${a.title ? `<figcaption style="margin-top:8px;font-size:13px;color:#64748b">${a.title}</figcaption>` : ""}</figure>`;
        out = out.split(`{{image:${a.id}}}`).join(tag);
      } else if (a.kind === "pdf") {
        const card = `<a href="${apiBase}/api/blog/assets/${a.id}?download=1" download class="pjx-att-card" data-att="${a.id}" style="display:flex;align-items:center;gap:14px;margin:24px 0;padding:16px 18px;border:1px solid #fde2c9;border-radius:18px;background:linear-gradient(135deg,#fff7ed 0%,#ffffff 60%);text-decoration:none;color:#0F2042;transition:transform .15s,box-shadow .15s"><span style="display:inline-flex;width:44px;height:44px;align-items:center;justify-content:center;border-radius:12px;background:linear-gradient(135deg,#F97316,#FB923C);color:white;flex-shrink:0;font-weight:bold;font-size:11px;letter-spacing:0.16em">PDF</span><span style="flex:1;min-width:0"><strong style="display:block;font-size:15px">${a.title || a.filename}</strong><span style="font-size:12px;color:#64748b">${a.size_kb ? a.size_kb + " KB · " : ""}Click to download</span></span><span style="color:#F97316;font-size:18px;font-weight:bold">↓</span></a>`;
        out = out.split(`{{attachment:${a.id}}}`).join(card);
      } else {
        const card = `<a href="${apiBase}/api/blog/assets/${a.id}?download=1" download style="display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border:1px solid #fde2c9;border-radius:999px;background:#fff7ed;color:#F97316;text-decoration:none;font-weight:bold;font-size:13px">${a.title || a.filename}</a>`;
        out = out.split(`{{attachment:${a.id}}}`).join(card);
      }
    });
    return out;
  }, [html, attachments, apiBase]);

  return (
    <div
      className="prose prose-slate mt-10 max-w-none prose-headings:font-display prose-headings:text-[#0F2042] prose-a:text-[#F97316] prose-strong:text-[#0F2042]"
      data-testid="blog-post-body"
      dangerouslySetInnerHTML={{ __html: expandedHtml }}
    />
  );
}
