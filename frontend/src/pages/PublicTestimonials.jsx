/**
 * PublicTestimonials.jsx — /testimonials
 *
 * Full grid of approved client testimonials with format + rating filters.
 * Each card supports text + video preview, glassmorphism, and a CTA.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Star, Play, Filter as FilterIcon, MessageSquare, Video as VideoIcon } from "lucide-react";
import axios from "axios";
import Avatar3D from "@/components/Avatar3D";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const videoSrc = (item) =>
  item?.video_path ? `${API}/uploads/testimonials/${item.video_path}` : "";

function Stars({ rating = 5, size = 14 }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={size}
          className={i < rating ? "fill-[#FBBF24] text-[#FBBF24]" : "text-slate-300"}
        />
      ))}
    </div>
  );
}

function VideoCard({ src }) {
  const [playing, setPlaying] = useState(false);
  const ref = React.useRef(null);
  return (
    <div className="relative aspect-video overflow-hidden rounded-2xl border border-slate-200 bg-black">
      <video
        ref={ref}
        src={src}
        playsInline
        muted={!playing}
        controls={playing}
        onEnded={() => setPlaying(false)}
        className="h-full w-full object-cover"
      />
      {!playing && (
        <button
          onClick={() => {
            ref.current?.play();
            setPlaying(true);
          }}
          aria-label="Play"
          data-testid="public-card-play"
          className="absolute inset-0 grid place-items-center bg-gradient-to-br from-black/30 to-black/60 transition hover:from-black/40"
        >
          <span className="grid h-12 w-12 place-items-center rounded-full bg-white/95 text-[#0F2042] shadow-xl">
            <Play size={20} className="ml-0.5" />
          </span>
        </button>
      )}
    </div>
  );
}

export default function PublicTestimonials() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [format, setFormat] = useState("");
  const [minStar, setMinStar] = useState(0);

  useEffect(() => {
    setLoading(true);
    axios
      .get(`${API}/public/testimonials`, { params: { limit: 100 } })
      .then(({ data }) => setItems(data.items || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return items.filter((t) => {
      if (minStar && (t.rating || 0) < minStar) return false;
      if (format === "video" && !["video", "both"].includes(t.format)) return false;
      if (format === "text" && t.format !== "text") return false;
      return true;
    });
  }, [items, format, minStar]);

  const ldJson = useMemo(() => {
    if (!items.length) return null;
    return {
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: items.slice(0, 20).map((t, i) => ({
        "@type": "Review",
        position: i + 1,
        author: { "@type": "Person", name: t.client_name },
        reviewBody: t.message,
        reviewRating: {
          "@type": "Rating",
          ratingValue: t.rating,
          bestRating: 5,
          worstRating: 1,
        },
        itemReviewed: { "@type": "Organization", name: "PROJEXINO" },
      })),
    };
  }, [items]);

  return (
    <div className="bg-[#FFF7ED]">
      <SEO
        title="Client Testimonials — PROJEXINO"
        description="See what founders, CTOs and product leaders say about working with PROJEXINO. Read reviews, watch video testimonials and discover why teams choose us."
      />
      {ldJson && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ldJson) }}
        />
      )}
      <Navbar />

      <section className="relative overflow-hidden pt-28 pb-14">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -left-20 top-10 h-80 w-80 rounded-full bg-[#F97316]/25 blur-3xl" />
          <div className="absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-[#7C3AED]/20 blur-3xl" />
        </div>
        <div className="mx-auto max-w-5xl px-6 text-center">
          <div className="text-[10px] font-bold uppercase tracking-[0.32em] text-[#F97316]">
            // client stories
          </div>
          <h1 className="font-display mt-2 text-4xl font-light text-[#0F2042] sm:text-5xl lg:text-6xl">
            Real words. Real founders. <span className="italic text-[#F97316]">Real outcomes.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-sm text-slate-600 sm:text-base">
            Browse every approved testimonial from teams we&apos;ve shipped with — read the long form, watch the videos, then talk to us.
          </p>
        </div>
      </section>

      {/* Filters */}
      <section className="mx-auto max-w-7xl px-6 pb-8">
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white/80 p-3 backdrop-blur" data-testid="public-test-filters">
          <FilterIcon size={14} className="text-slate-400" />
          <div className="inline-flex gap-1 rounded-full bg-slate-100 p-1">
            {[
              { v: "", l: "All", i: null },
              { v: "text", l: "Text only", i: MessageSquare },
              { v: "video", l: "Video", i: VideoIcon },
            ].map((opt) => (
              <button
                key={opt.v || "all"}
                onClick={() => setFormat(opt.v)}
                data-testid={`pt-filter-${opt.v || "all"}`}
                className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold transition ${
                  format === opt.v ? "bg-[#0F2042] text-white shadow" : "text-slate-500 hover:text-[#0F2042]"
                }`}
              >
                {opt.i && <opt.i size={11} />} {opt.l}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
            <span>Minimum rating:</span>
            <div className="inline-flex gap-1 rounded-full bg-slate-100 p-1">
              {[0, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setMinStar(n)}
                  data-testid={`pt-star-${n}`}
                  className={`rounded-full px-2.5 py-1 text-xs font-bold transition ${
                    minStar === n ? "bg-[#F97316] text-white" : "text-slate-500 hover:text-[#0F2042]"
                  }`}
                >
                  {n === 0 ? "All" : `${n}★+`}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-24">
        {loading ? (
          <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-12 text-center text-sm text-slate-500" data-testid="public-test-empty">
            No testimonials match your filters yet. Try widening them.
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((t, i) => (
              <motion.article
                key={t.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: (i % 6) * 0.05 }}
                viewport={{ once: true }}
                whileHover={{ y: -6 }}
                data-testid={`public-test-card-${t.id}`}
                className="group relative overflow-hidden rounded-3xl border border-white/40 p-6 shadow-lg backdrop-blur-xl"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(255,255,255,0.92) 0%, rgba(255,247,237,0.7) 100%)",
                }}
              >
                {t.featured && (
                  <span className="absolute right-4 top-4 rounded-full bg-gradient-to-r from-[#F97316] to-[#FB923C] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow">
                    Featured
                  </span>
                )}
                <Stars rating={t.rating || 5} />
                {(t.format === "video" || t.format === "both") && t.video_path && (
                  <div className="mt-4">
                    <VideoCard src={videoSrc(t)} />
                  </div>
                )}
                {t.message && (
                  <p className="mt-4 line-clamp-6 text-sm leading-relaxed text-slate-700">
                    &ldquo;{t.message}&rdquo;
                  </p>
                )}
                <div className="mt-5 flex items-center gap-3 border-t border-slate-100 pt-4">
                  <Avatar3D name={t.client_name} src={t.avatar_path} size={44} testId={`public-test-avatar-${t.id}`} />
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-sm font-bold text-[#0F2042]">
                      {t.client_name}
                    </div>
                    {t.designation && (
                      <div className="truncate text-[11px] font-bold text-[#F97316]">{t.designation}</div>
                    )}
                    <div className="truncate text-xs text-slate-500">
                      {[t.company, t.project_name].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                </div>
              </motion.article>
            ))}
          </div>
        )}

        <div className="mt-16 text-center">
          <Link to="/contact" className="btn-primary" data-testid="public-test-cta">
            Start your own success story
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
