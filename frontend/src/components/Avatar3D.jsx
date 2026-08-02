/**
 * Avatar3D.jsx
 *
 * Lightweight, dependency-free animated avatar:
 *  • If `src` is provided (uploaded client photo) we render the image.
 *  • Otherwise we generate a deterministic gradient + initials with a subtle
 *    floating motion + radial glow that gives the "3D animated avatar" feel.
 *
 * Used in the carousel, public testimonials grid, and admin cards.
 */
import React from "react";
import { motion } from "framer-motion";

const PALETTES = [
  ["#F97316", "#FBBF24"],
  ["#7C3AED", "#A855F7"],
  ["#0EA5E9", "#3B82F6"],
  ["#10B981", "#34D399"],
  ["#EC4899", "#F472B6"],
  ["#F43F5E", "#FB7185"],
  ["#0F2042", "#1E40AF"],
  ["#9333EA", "#C084FC"],
];

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < (s || "").length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const BACKEND = process.env.REACT_APP_BACKEND_URL;

export default function Avatar3D({
  name = "",
  src = "",
  size = 56,
  className = "",
  ringColor = "rgba(255,255,255,0.6)",
  testId,
}) {
  const url = src ? (src.startsWith("http") ? src : `${BACKEND}/api/uploads/testimonials/${src}`) : "";
  const palette = PALETTES[hashStr(name) % PALETTES.length];
  const initial = (name || "C").trim().charAt(0).toUpperCase();
  const fontSize = Math.round(size * 0.42);
  const ringPx = Math.max(2, Math.round(size * 0.04));

  return (
    <motion.div
      data-testid={testId}
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileHover={{ scale: 1.06, rotate: -3 }}
      transition={{ type: "spring", stiffness: 180, damping: 18 }}
      style={{
        width: size,
        height: size,
        boxShadow:
          "0 12px 30px -8px rgba(15,32,66,0.25), 0 4px 12px -4px rgba(124,58,237,0.2), inset 0 1px 0 rgba(255,255,255,0.4)",
        outline: `${ringPx}px solid ${ringColor}`,
        outlineOffset: 0,
      }}
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full ${className}`}
    >
      {url ? (
        <img
          src={url}
          alt={name}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={(e) => {
            // Fall back to gradient initial if the image breaks
            e.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <>
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(120% 120% at 20% 10%, ${palette[1]} 0%, ${palette[0]} 60%, ${palette[0]} 100%)`,
            }}
          />
          <motion.div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(50% 60% at 70% 30%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 60%)",
              mixBlendMode: "screen",
            }}
            animate={{ y: [-2, 2, -2], x: [-1, 1, -1] }}
            transition={{ repeat: Infinity, duration: 5, ease: "easeInOut" }}
          />
          <motion.span
            style={{ fontSize, fontWeight: 800, color: "white", letterSpacing: "-0.02em" }}
            className="relative font-display drop-shadow-sm"
            animate={{ y: [0, -1.5, 0] }}
            transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
          >
            {initial}
          </motion.span>
        </>
      )}
    </motion.div>
  );
}
