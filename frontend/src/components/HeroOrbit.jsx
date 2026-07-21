import { motion } from "framer-motion";
import { Brain, Smartphone, Bot, Layers, Cloud, Apple, Building2, Wrench } from "lucide-react";

const ORBIT_ITEMS = [
  { icon: Brain, color: "#A855F7", label: "AI" },
  { icon: Smartphone, color: "#0EA5E9", label: "APPS" },
  { icon: Bot, color: "#10B981", label: "BOT" },
  { icon: Layers, color: "#14B8A6", label: "X-PLAT" },
  { icon: Cloud, color: "#3B82F6", label: "SAAS" },
  { icon: Apple, color: "#F97316", label: "iOS" },
  { icon: Building2, color: "#D97706", label: "ENT" },
  { icon: Wrench, color: "#475569", label: "OPS" },
];

const NAVY = "#0F2042";
const ORANGE = "#F97316";

/** New hero illustration — orbiting service moons around a 3D-styled core. */
export default function HeroOrbit({ className = "" }) {
  return (
    <div className={`relative ${className}`}>
      {/* Backdrop glow */}
      <motion.div
        aria-hidden
        className="absolute inset-0 rounded-[36px]"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 45%, rgba(249,115,22,0.22), transparent 60%), radial-gradient(60% 60% at 70% 75%, rgba(168,85,247,0.22), transparent 60%)",
        }}
      />

      <svg viewBox="0 0 560 560" className="relative h-full w-full" fill="none">
        <defs>
          <radialGradient id="hero-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFFBF1" />
            <stop offset="100%" stopColor="#FFD7A8" />
          </radialGradient>
          <linearGradient id="hero-band" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={ORANGE} />
            <stop offset="100%" stopColor="#A855F7" />
          </linearGradient>
          <filter id="hero-shadow">
            <feDropShadow dx="0" dy="6" stdDeviation="8" floodOpacity="0.22" />
          </filter>
        </defs>

        {/* Orbits — rotating dashed rings */}
        {[200, 240].map((r, i) => (
          <motion.circle
            key={i}
            cx="280"
            cy="280"
            r={r}
            stroke={i === 0 ? ORANGE : "#0F2042"}
            strokeOpacity={i === 0 ? 0.35 : 0.18}
            strokeWidth="1.2"
            strokeDasharray="2 8"
            fill="none"
            animate={{ rotate: i === 0 ? 360 : -360 }}
            style={{ transformOrigin: "280px 280px" }}
            transition={{ duration: 28 + i * 8, repeat: Infinity, ease: "linear" }}
          />
        ))}

        {/* Core glow disc */}
        <circle cx="280" cy="280" r="110" fill="url(#hero-core)" filter="url(#hero-shadow)" />
        {/* Stacked deck "monitor" */}
        <g transform="translate(192,200)">
          <rect width="176" height="120" rx="14" fill={NAVY} filter="url(#hero-shadow)" />
          <rect x="10" y="12" width="156" height="86" rx="6" fill="#FFFBF1" />
          {/* dot bar */}
          {[0, 1, 2].map((d) => (
            <circle key={d} cx={18 + d * 8} cy={110} r="2.4" fill="#94A3B8" />
          ))}
          {/* mini chart */}
          <polyline
            points="22,80 48,64 70,72 96,46 118,56 142,32 158,40"
            stroke={ORANGE}
            strokeWidth="2.4"
            fill="none"
            strokeLinecap="round"
          />
          <rect x="20" y="22" width="46" height="6" rx="2" fill={NAVY} opacity="0.85" />
          <rect x="20" y="34" width="100" height="3" rx="1.5" fill="#CBD5E1" />
          <rect x="20" y="42" width="80" height="3" rx="1.5" fill="#CBD5E1" />
        </g>

        {/* Floating sparkle line */}
        <motion.line
          x1="80" y1="120" x2="160" y2="160"
          stroke="url(#hero-band)" strokeWidth="2.4" strokeLinecap="round"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 3, repeat: Infinity }}
        />
      </svg>

      {/* Orbit moons (HTML so they tile crisp + can hold lucide icons) */}
      <Orbit radius={220} duration={28}>
        {ORBIT_ITEMS.slice(0, 4).map((it, i) => (
          <Moon key={it.label} index={i} total={4} {...it} />
        ))}
      </Orbit>
      <Orbit radius={262} duration={36} reverse>
        {ORBIT_ITEMS.slice(4).map((it, i) => (
          <Moon key={it.label} index={i} total={4} {...it} />
        ))}
      </Orbit>

      {/* Floating badges */}
      <motion.div
        animate={{ y: [0, -10, 0] }} transition={{ duration: 3.6, repeat: Infinity }}
        className="absolute left-2 top-6 flex items-center gap-2 rounded-2xl border border-[#F97316]/30 bg-white/85 px-3 py-2 text-xs shadow backdrop-blur"
      >
        <span className="inline-block h-2 w-2 rounded-full bg-[#F97316]" />
        <span className="font-mono-pj text-[#0F2042]">P · sync //_ stable</span>
      </motion.div>
      <motion.div
        animate={{ y: [0, -8, 0] }} transition={{ duration: 4.4, repeat: Infinity }}
        className="absolute bottom-8 right-2 rounded-2xl border border-white/40 bg-[#0F2042] px-3 py-2 text-xs text-white shadow"
      >
        <div className="text-[10px] uppercase tracking-[0.25em] text-orange-300">// engineered</div>
        <div className="font-display text-sm font-semibold">for scale</div>
      </motion.div>
    </div>
  );
}

function Orbit({ radius, duration, reverse, children }) {
  return (
    <motion.div
      className="pointer-events-none absolute inset-0"
      animate={{ rotate: reverse ? -360 : 360 }}
      transition={{ duration, repeat: Infinity, ease: "linear" }}
      style={{ transformOrigin: "50% 50%" }}
    >
      {Array.isArray(children) ? children.map((c, i) => {
        const angle = (360 / children.length) * i;
        return (
          <div
            key={i}
            className="absolute left-1/2 top-1/2"
            style={{
              transform: `rotate(${angle}deg) translate(${radius}px) rotate(${-angle}deg)`,
            }}
          >
            {c}
          </div>
        );
      }) : children}
    </motion.div>
  );
}

function Moon({ icon: Icon, color, label, index, total }) {
  return (
    <motion.div
      animate={{ y: [0, -4, 0] }}
      transition={{ duration: 2 + (index * 0.25), repeat: Infinity, ease: "easeInOut" }}
      className="flex items-center gap-2 rounded-full border border-white/60 bg-white/95 px-3 py-1.5 shadow-md backdrop-blur"
      style={{ boxShadow: `0 8px 22px -10px ${color}aa` }}
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: `${color}22`, color }}>
        <Icon size={14} />
      </span>
      <span className="font-mono-pj text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color }}>
        {label}
      </span>
    </motion.div>
  );
}
