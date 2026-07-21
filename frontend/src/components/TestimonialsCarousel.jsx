/**
 * TestimonialsCarousel.jsx
 *
 * Auto-rotating premium testimonial showcase used on the landing page.
 * Pulls approved testimonials from /api/public/testimonials.
 *
 * Visual contract (per the requirement):
 *   • Auto-scroll with a 10s transition
 *   • Glassmorphism, floating card, 3D tilt on hover
 *   • Plays back text + video previews
 *   • Fully responsive
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { Star, Play, ChevronLeft, ChevronRight, Quote } from "lucide-react";
import axios from "axios";
import Avatar3D from "@/components/Avatar3D";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const ROTATE_MS = 10_000;

function videoSrc(item) {
  if (!item?.video_path) return "";
  return `${API}/uploads/testimonials/${item.video_path}`;
}

function StarRow({ rating = 5, size = 14 }) {
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

export default function TestimonialsCarousel({
  title = "Loved by the people who matter",
  subtitle = "Real words from real founders, CTOs and product leaders we've shipped with.",
  className = "",
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    axios
      .get(`${API}/public/testimonials`, { params: { limit: 12 } })
      .then(({ data }) => {
        if (!cancelled) setItems(data.items || []);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-rotate every 10s — paused on hover/focus
  useEffect(() => {
    if (paused || items.length <= 1) return;
    const t = setInterval(() => setIdx((p) => (p + 1) % items.length), ROTATE_MS);
    return () => clearInterval(t);
  }, [paused, items.length]);

  const ldJson = useMemo(() => {
    if (!items.length) return null;
    return {
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: items.slice(0, 8).map((t, i) => ({
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
        itemReviewed: {
          "@type": "Organization",
          name: "PROJEXINO",
        },
      })),
    };
  }, [items]);

  if (loading) return null;
  if (!items.length) return null;
  const current = items[idx];
  const total = items.length;

  const go = (dir) => setIdx((p) => (p + dir + total) % total);

  return (
    <section
      ref={containerRef}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      data-testid="testimonials-carousel"
      className={`relative overflow-hidden py-20 ${className}`}
    >
      {ldJson && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ldJson) }}
        />
      )}
      {/* Floating glow orbs */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-10 top-10 h-72 w-72 rounded-full bg-[#F97316]/25 blur-3xl animate-pulse" />
        <div
          className="absolute right-10 bottom-10 h-80 w-80 rounded-full bg-[#7C3AED]/20 blur-3xl animate-pulse"
          style={{ animationDelay: "1.2s" }}
        />
      </div>

      <div className="mx-auto max-w-6xl px-5">
        <div className="text-center">
          <div className="text-[10px] font-bold uppercase tracking-[0.32em] text-[#F97316]">
            // testimonials
          </div>
          <h2 className="font-display mt-2 text-3xl font-light leading-tight text-[#0F2042] md:text-5xl">
            {title}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-600 md:text-base">
            {subtitle}
          </p>
        </div>

        {/* Card stage */}
        <div className="relative mt-12 grid place-items-center" style={{ minHeight: 360 }}>
          <AnimatePresence mode="popLayout">
            <motion.div
              key={current.id}
              initial={{ opacity: 0, scale: 0.9, rotateX: 8, y: 20 }}
              animate={{ opacity: 1, scale: 1, rotateX: 0, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, rotateX: -6, y: -20 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              whileHover={{ rotateX: -3, rotateY: 3, scale: 1.02 }}
              style={{ transformStyle: "preserve-3d", perspective: 1200 }}
              data-testid={`carousel-card-${current.id}`}
              className="relative w-full max-w-3xl"
            >
              <div
                className="relative overflow-hidden rounded-3xl p-7 md:p-10 backdrop-blur-2xl"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(255,255,255,0.85) 0%, rgba(255,247,237,0.65) 60%, rgba(237,233,254,0.7) 100%)",
                  boxShadow:
                    "0 30px 80px -20px rgba(15,32,66,0.25), 0 8px 20px -8px rgba(124,58,237,0.15), inset 0 1px 0 rgba(255,255,255,0.6)",
                  border: "1px solid rgba(255,255,255,0.5)",
                }}
              >
                {/* Floating quote icon */}
                <motion.div
                  initial={{ y: 0 }}
                  animate={{ y: [-4, 4, -4] }}
                  transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                  className="absolute -right-3 -top-3 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#F97316] to-[#FB923C] text-white shadow-xl"
                >
                  <Quote size={28} />
                </motion.div>

                <div className="grid items-start gap-6 md:grid-cols-[1fr_auto]">
                  <div>
                    <StarRow rating={current.rating || 5} size={18} />
                    <p className="font-display mt-5 text-lg leading-relaxed text-[#0F2042] md:text-2xl">
                      &ldquo;{current.message}&rdquo;
                    </p>
                    <div className="mt-6 flex items-center gap-3">
                      <Avatar3D name={current.client_name} src={current.avatar_path} size={56} testId="carousel-avatar"/>
                      <div>
                        <div className="font-display text-sm font-bold text-[#0F2042]">
                          {current.client_name}
                        </div>
                        <div className="text-xs text-slate-500">
                          {[current.designation, current.company, current.project_name].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                    </div>
                  </div>

                  {current.video_path && (
                    <VideoTile src={videoSrc(current)} />
                  )}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Prev / next */}
          {total > 1 && (
            <>
              <button
                onClick={() => go(-1)}
                data-testid="carousel-prev"
                aria-label="Previous testimonial"
                className="absolute left-0 top-1/2 -translate-y-1/2 grid h-10 w-10 place-items-center rounded-full bg-white/80 text-[#0F2042] shadow-md backdrop-blur-md transition hover:bg-white"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={() => go(1)}
                data-testid="carousel-next"
                aria-label="Next testimonial"
                className="absolute right-0 top-1/2 -translate-y-1/2 grid h-10 w-10 place-items-center rounded-full bg-white/80 text-[#0F2042] shadow-md backdrop-blur-md transition hover:bg-white"
              >
                <ChevronRight size={20} />
              </button>
            </>
          )}
        </div>

        {/* Dots + see-all link */}
        <div className="mt-8 flex flex-col items-center gap-4">
          {total > 1 && (
            <div className="flex gap-1.5">
              {items.map((t, i) => (
                <button
                  key={t.id}
                  onClick={() => setIdx(i)}
                  data-testid={`carousel-dot-${i}`}
                  aria-label={`Show testimonial ${i + 1}`}
                  className={`h-1.5 rounded-full transition-all ${
                    i === idx ? "w-8 bg-[#F97316]" : "w-1.5 bg-slate-300 hover:bg-slate-400"
                  }`}
                />
              ))}
            </div>
          )}
          <Link
            to="/testimonials"
            data-testid="carousel-see-all"
            className="text-sm font-bold text-[#F97316] hover:underline"
          >
            See all client stories →
          </Link>
        </div>
      </div>
    </section>
  );
}

function VideoTile({ src }) {
  const [playing, setPlaying] = useState(false);
  const ref = useRef(null);
  const togglePlay = () => {
    if (!ref.current) return;
    if (playing) ref.current.pause();
    else ref.current.play();
    setPlaying(!playing);
  };
  return (
    <div className="relative w-full max-w-[260px] overflow-hidden rounded-2xl border border-white/40 bg-black shadow-lg md:w-[260px]">
      <video
        ref={ref}
        src={src}
        playsInline
        muted={!playing}
        controls={playing}
        onEnded={() => setPlaying(false)}
        className="aspect-[4/5] w-full object-cover"
      />
      {!playing && (
        <button
          type="button"
          onClick={togglePlay}
          aria-label="Play video testimonial"
          data-testid="carousel-play"
          className="absolute inset-0 grid place-items-center bg-gradient-to-br from-black/30 to-black/60 backdrop-blur-[2px] transition hover:from-black/40"
        >
          <span className="grid h-14 w-14 place-items-center rounded-full bg-white/95 text-[#0F2042] shadow-xl">
            <Play size={22} className="ml-0.5" />
          </span>
        </button>
      )}
    </div>
  );
}
