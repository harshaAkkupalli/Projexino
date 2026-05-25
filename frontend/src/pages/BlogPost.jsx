import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Calendar, ArrowLeft, User as UserIcon } from "lucide-react";
import axios from "axios";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";

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
          "url": "https://customer-assets.emergentagent.com/job_projexino-hub/artifacts/k85zxnvo_cropped-projexino-scaled-1-768x358%20%281%29.png",
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

          <div
            className="prose prose-slate mt-10 max-w-none prose-headings:font-display prose-headings:text-[#0F2042] prose-a:text-[#F97316] prose-strong:text-[#0F2042]"
            data-testid="blog-post-body"
            dangerouslySetInnerHTML={{ __html: post.content_html }}
          />

          <div className="mt-16 rounded-3xl border border-orange-100 bg-white p-8 text-center">
            <h3 className="font-display text-xl font-semibold text-[#0F2042]">
              Need a team to ship this for you?
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Projexino has shipped 500+ projects. Get a free scope &amp; estimate.
            </p>
            <Link to="/contact" className="btn-primary mt-5">Start your project</Link>
          </div>
        </div>
      </article>

      <Footer />
    </div>
  );
}
