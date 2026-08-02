import { motion } from "framer-motion";

/**
 * 3D-style animated SVG badge.
 * Layers: outer ring (rotates), gem (pulses), inner icon, sparkle ring.
 * `icon` slug picks one of the inline SVG shapes below; `color` is the accent color.
 * `size` is the box size in px.
 *
 * Usage:
 *   <Badge3D icon="trophy" color="#F97316" label="On-Time Achiever" />
 */
const ICONS = {
  trophy: (c) => (
    <g fill={c}>
      <path d="M40 26 H60 V40 a10 10 0 0 1 -20 0 Z" />
      <path d="M30 26 H40 V42 a14 14 0 0 1 -14 -14 V26 Z" />
      <path d="M60 26 H70 V28 a14 14 0 0 1 -14 14 V26 Z" transform="translate(-2,0)" />
      <rect x="45" y="50" width="10" height="6" rx="1" />
      <rect x="38" y="56" width="24" height="4" rx="1.5" />
    </g>
  ),
  chat: (c) => (
    <g fill={c}>
      <path d="M28 30 h44 a5 5 0 0 1 5 5 v18 a5 5 0 0 1 -5 5 H46 l-10 8 v-8 H28 a5 5 0 0 1 -5 -5 V35 a5 5 0 0 1 5 -5 Z" />
      <circle cx="40" cy="44" r="2.5" fill="#fff" />
      <circle cx="50" cy="44" r="2.5" fill="#fff" />
      <circle cx="60" cy="44" r="2.5" fill="#fff" />
    </g>
  ),
  shield: (c) => (
    <g>
      <path d="M50 22 L70 30 V46 c0 12 -8 22 -20 26 c-12 -4 -20 -14 -20 -26 V30 Z" fill={c} />
      <path d="M42 46 l6 6 l12 -14" stroke="#fff" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  ),
  briefcase: (c) => (
    <g fill={c}>
      <rect x="26" y="36" width="48" height="32" rx="4" />
      <rect x="40" y="28" width="20" height="8" rx="2" />
      <rect x="26" y="48" width="48" height="3" fill="#fff" opacity="0.6" />
    </g>
  ),
  rocket: (c) => (
    <g>
      <path d="M50 20 c10 10 14 22 14 32 l-8 6 h-12 l-8 -6 c0 -10 4 -22 14 -32 Z" fill={c} />
      <circle cx="50" cy="42" r="5" fill="#fff" />
      <path d="M42 60 l-6 12 l8 -2 l0 8 l8 -8 l8 8 l0 -8 l8 2 l-6 -12 Z" fill={c} opacity="0.6" />
    </g>
  ),
  spark: (c) => (
    <g fill={c}>
      <path d="M50 22 L55 42 L75 48 L55 54 L50 74 L45 54 L25 48 L45 42 Z" />
    </g>
  ),
  heart: (c) => (
    <path d="M50 72 C28 56 22 42 32 32 c8 -8 14 -2 18 4 c4 -6 10 -12 18 -4 c10 10 4 24 -18 40 Z" fill={c} />
  ),
  bolt: (c) => (
    <path d="M52 18 L34 50 H46 L42 78 L66 44 H54 Z" fill={c} />
  ),
};

export default function Badge3D({ icon = "trophy", color = "#F97316", label, size = 120, earned = true, delay = 0 }) {
  const pale = `${color}22`;
  const ICON = ICONS[icon] || ICONS.trophy;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.7, rotateY: -30 }}
      animate={{ opacity: earned ? 1 : 0.5, scale: 1, rotateY: 0 }}
      transition={{ delay, duration: 0.7, type: "spring", stiffness: 120, damping: 14 }}
      style={{ width: size, height: size, transformStyle: "preserve-3d", perspective: 600 }}
      className="relative flex items-center justify-center"
    >
      {/* Outer glow */}
      <motion.div
        animate={{ opacity: [0.5, 0.9, 0.5] }}
        transition={{ duration: 3, repeat: Infinity }}
        className="absolute inset-0 rounded-full blur-2xl"
        style={{ background: `radial-gradient(closest-side, ${color}55, transparent 70%)` }}
      />
      <svg viewBox="0 0 100 100" width={size} height={size} className="relative drop-shadow-xl">
        <defs>
          <radialGradient id={`g-bg-${icon}-${color.replace('#','')}`} cx="50%" cy="35%" r="60%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.9" />
            <stop offset="50%" stopColor={pale} />
            <stop offset="100%" stopColor={color} />
          </radialGradient>
          <linearGradient id={`g-ring-${icon}-${color.replace('#','')}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={color} />
            <stop offset="100%" stopColor="#FFFFFF" />
          </linearGradient>
        </defs>
        {/* Rotating outer ring with notches */}
        <motion.g animate={{ rotate: 360 }} transition={{ duration: 18, repeat: Infinity, ease: "linear" }} style={{ transformOrigin: "50% 50%" }}>
          <circle cx="50" cy="50" r="46" fill="none" stroke={`url(#g-ring-${icon}-${color.replace('#','')})`} strokeWidth="2" strokeDasharray="4 6" />
        </motion.g>
        {/* Inner medallion */}
        <circle cx="50" cy="50" r="38" fill={`url(#g-bg-${icon}-${color.replace('#','')})`} stroke={color} strokeWidth="1.5" />
        {/* Top highlight */}
        <ellipse cx="50" cy="32" rx="22" ry="10" fill="#FFFFFF" opacity="0.55" />
        {/* Pulsing inner ring */}
        <motion.circle
          cx="50" cy="50" r="32" fill="none" stroke="#fff" strokeWidth="1"
          animate={{ opacity: [0.15, 0.55, 0.15], r: [32, 34, 32] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
        {/* Icon */}
        <motion.g
          animate={{ scale: [1, 1.04, 1] }}
          transition={{ duration: 3.5, repeat: Infinity }}
          style={{ transformOrigin: "50% 50%" }}
        >{ICON(color)}</motion.g>
        {/* Sparkle dots */}
        {[0, 60, 120, 180, 240, 300].map((deg, i) => (
          <motion.circle
            key={i}
            cx={50 + 44 * Math.cos((deg * Math.PI) / 180)}
            cy={50 + 44 * Math.sin((deg * Math.PI) / 180)}
            r="1.5" fill="#fff"
            animate={{ opacity: [0.2, 1, 0.2] }}
            transition={{ duration: 2, delay: i * 0.18, repeat: Infinity }}
          />
        ))}
      </svg>
      {label && (
        <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color }}>
          {label}
        </div>
      )}
    </motion.div>
  );
}
