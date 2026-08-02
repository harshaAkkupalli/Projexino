import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowUpRight, Search, Tag as TagIcon, Calendar } from "lucide-react";
import axios from "axios";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";

const API = process.env.REACT_APP_BACKEND_URL;

export default function Blog() {
  const [posts, setPosts] = useState([]);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [params, setParams] = useSearchParams();
  const tag = params.get("tag") || "";
  const q = params.get("q") || "";
  const [searchInput, setSearchInput] = useState(q);

  useEffect(() => {
    setLoading(true);
    const url = `${API}/api/blog/posts?` + new URLSearchParams({
      ...(tag ? { tag } : {}),
      ...(q ? { q } : {}),
      limit: "30",
    });
    axios.get(url).then((r) => setPosts(r.data.items || []))
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
    axios.get(`${API}/api/blog/tags`).then((r) => setTags(r.data || [])).catch(() => {});
  }, [tag, q]);

  const onSearch = (e) => {
    e.preventDefault();
    const next = new URLSearchParams(params);
    if (searchInput) next.set("q", searchInput); else next.delete("q");
    setParams(next);
  };

  return (
    <div data-testid="page-blog" className="relative min-h-screen overflow-hidden bg-canvas-warm text-[#0F172A]">
      <SEO
        title="Projexino Blog — AI, App Development & SaaS Engineering Insights"
        description="Read the Projexino blog for expert insights on app development, AI/LLM engineering, SaaS architecture, mobile development and modern software delivery."
        canonical="/blog"
        keywords={[
          "app development blog", "ai development insights", "saas engineering",
          "mobile app development india", "software development articles",
          "projexino blog",
        ]}
        jsonLd={[{
          "@context": "https://schema.org",
          "@type": "Blog",
          "name": "Projexino Blog",
          "url": "https://www.projexino.com/blog",
          "publisher": { "@type": "Organization", "name": "Projexino" },
        }, {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.projexino.com/" },
            { "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://www.projexino.com/blog" },
          ],
        }]}
      />
      <Navbar />

      <section className="relative pt-32 pb-12">
        <div className="absolute inset-0 bg-grid-light opacity-60 [mask-image:radial-gradient(ellipse_at_top,white,transparent_70%)]" />
        <div className="relative mx-auto max-w-6xl px-6">
          <span className="tag-chip">// projexino journal</span>
          <h1 className="font-display mt-4 text-4xl font-light leading-tight md:text-6xl">
            Insights on{" "}
            <span className="italic text-[#F97316]">app development</span>, AI &amp; SaaS engineering.
          </h1>
          <p className="mt-4 max-w-2xl text-slate-600">
            Practical guides, case studies and engineering deep-dives from the Projexino team —
            for founders and product leaders shipping ambitious software.
          </p>

          <form onSubmit={onSearch} className="mt-8 flex max-w-lg items-center gap-2 rounded-full border border-orange-200 bg-white px-4 py-2 shadow-sm">
            <Search size={16} className="text-slate-400" />
            <input
              data-testid="blog-search-input"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search articles…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
            <button data-testid="blog-search-btn" className="rounded-full bg-[#F97316] px-4 py-1.5 text-xs font-semibold text-white">
              Search
            </button>
          </form>

          {tags.length > 0 && (
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Link to="/blog" className={`rounded-full border px-3 py-1 text-xs font-semibold ${!tag ? "border-[#F97316] bg-[#F97316] text-white" : "border-orange-200 bg-white text-slate-600"}`}>
                All
              </Link>
              {tags.slice(0, 12).map((t) => (
                <Link key={t.tag} to={`/blog?tag=${encodeURIComponent(t.tag)}`}
                  data-testid={`tag-${t.tag}`}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${tag === t.tag ? "border-[#F97316] bg-[#F97316] text-white" : "border-orange-200 bg-white text-slate-600 hover:border-[#F97316]/40"}`}>
                  #{t.tag} <span className="text-slate-400">{t.count}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="pb-24">
        <div className="mx-auto max-w-6xl px-6">
          {loading && <p className="text-center text-sm text-slate-500" data-testid="blog-loading">Loading articles…</p>}
          {!loading && posts.length === 0 && (
            <div className="rounded-3xl border border-dashed border-orange-200 bg-white p-12 text-center" data-testid="blog-empty">
              <h2 className="font-display text-xl font-semibold text-[#0F2042]">No articles published yet</h2>
              <p className="mt-2 text-sm text-slate-500">
                The Projexino team is preparing fresh content. Check back soon — or
                <Link to="/contact" className="ml-1 text-[#F97316] underline">talk to us</Link>.
              </p>
            </div>
          )}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((p, i) => (
              <motion.article
                key={p.id || p.slug}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                data-testid={`blog-card-${i}`}
                className="group overflow-hidden rounded-3xl border border-orange-100 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
              >
                <Link to={`/blog/${p.slug}`} className="block">
                  {p.cover_image ? (
                    <img src={p.cover_image} alt={p.title} className="aspect-video w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="aspect-video w-full bg-gradient-to-br from-orange-200 via-orange-100 to-amber-50" />
                  )}
                  <div className="p-6">
                    <div className="flex flex-wrap gap-1.5">
                      {(p.tags || []).slice(0, 3).map((t) => (
                        <span key={t} className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#F97316]">
                          #{t}
                        </span>
                      ))}
                    </div>
                    <h2 className="font-display mt-3 text-lg font-semibold leading-tight text-[#0F2042] group-hover:text-[#F97316]">
                      {p.title}
                    </h2>
                    {p.excerpt && <p className="mt-2 text-sm leading-relaxed text-slate-600 line-clamp-3">{p.excerpt}</p>}
                    <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1.5"><Calendar size={12} /> {p.published_at ? new Date(p.published_at).toLocaleDateString() : ""}</span>
                      <span className="inline-flex items-center gap-1 font-semibold text-[#F97316]">Read <ArrowUpRight size={12} /></span>
                    </div>
                  </div>
                </Link>
              </motion.article>
            ))}
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}
