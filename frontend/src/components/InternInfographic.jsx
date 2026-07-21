import { motion } from "framer-motion";

const NAVY = "#0F2042";
const ORANGE = "#F97316";
const PURPLE = "#A855F7";
const GREEN = "#10B981";
const BLUE = "#3B82F6";

/* 3D-styled infographics specifically for intern portal pages */
export default function InternInfographic({ variant, className = "" }) {
  if (variant === "dashboard") return <DashGraphic className={className} />;
  if (variant === "tasks") return <TasksGraphic className={className} />;
  if (variant === "documents") return <DocsGraphic className={className} />;
  if (variant === "badges") return <BadgesGraphic className={className} />;
  return null;
}

/* ---- Dashboard hero — isometric growth chart with trophy ---- */
function DashGraphic({ className }) {
  return (
    <svg viewBox="0 0 560 240" className={className} fill="none">
      <defs>
        <linearGradient id="id-bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor={ORANGE} stopOpacity="0.25" />
          <stop offset="100%" stopColor={PURPLE} stopOpacity="0.05" />
        </linearGradient>
        <filter id="id-sh"><feDropShadow dx="0" dy="3" stdDeviation="3" floodOpacity="0.18" /></filter>
      </defs>
      <rect x="0" y="0" width="560" height="240" fill="url(#id-bg)" rx="14" />
      <path d="M30 220 L530 220 L490 195 L70 195 Z" fill="rgba(15,32,66,0.06)" />
      {/* growth bars */}
      {[40, 70, 60, 110, 90, 140, 130, 180].map((h, i) => {
        const c = [BLUE, BLUE, ORANGE, ORANGE, PURPLE, PURPLE, GREEN, GREEN][i];
        return (
          <motion.rect key={i} x={70 + i * 50} y={210 - h} width="28" height={h} rx="4" fill={c}
            initial={{ height: 0, y: 210 }} animate={{ height: h, y: 210 - h }}
            transition={{ delay: i * 0.08, duration: 0.5 }} filter="url(#id-sh)" />
        );
      })}
      {/* trajectory arrow */}
      <motion.path d="M85 195 Q220 130 280 110 T490 30"
        stroke={ORANGE} strokeWidth="3" strokeLinecap="round" fill="none"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.8, delay: 0.5 }} />
      <motion.circle cx="490" cy="30" r="7" fill={ORANGE}
        initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 2.2 }} />
      {/* trophy bubble */}
      <motion.g initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.8 }}>
        <circle cx="460" cy="60" r="30" fill="white" stroke={ORANGE} strokeWidth="2.5" filter="url(#id-sh)" />
        <polygon points="450,50 470,50 472,62 460,72 448,62" fill={ORANGE} />
        <rect x="453" y="72" width="14" height="6" fill={ORANGE} opacity="0.7" />
        <ellipse cx="460" cy="80" rx="14" ry="3" fill={ORANGE} opacity="0.5" />
      </motion.g>
      {/* PROGRESS chip */}
      <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
        <rect x="30" y="20" width="160" height="30" rx="8" fill="white" stroke={ORANGE} strokeWidth="1.5" filter="url(#id-sh)" />
        <text x="42" y="40" fill={ORANGE} fontFamily="JetBrains Mono" fontSize="11" fontWeight="700">PROGRESS</text>
        <text x="120" y="40" fill={NAVY} fontFamily="Outfit" fontSize="13" fontWeight="700">↑ 24%</text>
      </motion.g>
    </svg>
  );
}

/* ---- Tasks — flowing pipeline ---- */
function TasksGraphic({ className }) {
  return (
    <svg viewBox="0 0 560 240" className={className} fill="none">
      <defs><filter id="it-sh"><feDropShadow dx="0" dy="3" stdDeviation="3" floodOpacity="0.16" /></filter></defs>
      <ellipse cx="280" cy="225" rx="220" ry="10" fill="rgba(15,32,66,0.06)" />
      {/* track */}
      <motion.path d="M50 120 L510 120" stroke="#E2E8F0" strokeWidth="6" strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1 }} />
      {[
        { x: 80, c: BLUE, label: "ASSIGNED", icon: "📥" },
        { x: 220, c: ORANGE, label: "IN PROGRESS", icon: "⚡" },
        { x: 360, c: PURPLE, label: "SUBMITTED", icon: "📤" },
        { x: 490, c: GREEN, label: "DONE", icon: "✓" },
      ].map((n, i) => (
        <motion.g key={n.label}
          initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.3 + i * 0.15, type: "spring", stiffness: 200 }}>
          <circle cx={n.x} cy={120} r="28" fill="white" stroke={n.c} strokeWidth="3" filter="url(#it-sh)" />
          <text x={n.x} y={127} textAnchor="middle" fontSize="20">{n.icon}</text>
          <rect x={n.x - 50} y={158} width="100" height="20" rx="10" fill={n.c} opacity="0.15" />
          <text x={n.x} y={172} textAnchor="middle" fill={n.c} fontFamily="JetBrains Mono" fontSize="9" fontWeight="700">
            {n.label}
          </text>
        </motion.g>
      ))}
      {/* moving package */}
      <motion.g initial={{ x: 0 }} animate={{ x: [0, 140, 280, 410, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}>
        <rect x="74" y="80" width="14" height="14" rx="3" fill={ORANGE} />
        <rect x="74" y="80" width="14" height="3" fill="white" />
      </motion.g>
    </svg>
  );
}

/* ---- Documents — folder + ticks ---- */
function DocsGraphic({ className }) {
  const items = [
    { x: 70, y: 80, c: GREEN, label: "BANK", done: true },
    { x: 175, y: 80, c: GREEN, label: "PAN", done: true },
    { x: 280, y: 80, c: ORANGE, label: "ID", done: false },
    { x: 385, y: 80, c: ORANGE, label: "ADDR", done: false },
    { x: 480, y: 80, c: PURPLE, label: "CV", done: false },
  ];
  return (
    <svg viewBox="0 0 560 240" className={className} fill="none">
      <defs><filter id="dd-sh"><feDropShadow dx="0" dy="3" stdDeviation="3" floodOpacity="0.15" /></filter></defs>
      <ellipse cx="280" cy="225" rx="220" ry="10" fill="rgba(15,32,66,0.06)" />
      {items.map((it, i) => (
        <motion.g key={it.label}
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.12, duration: 0.5 }}>
          <rect x={it.x} y={it.y} width="80" height="100" rx="8" fill="white" stroke={it.c} strokeWidth="2" filter="url(#dd-sh)" />
          <rect x={it.x + 8} y={it.y + 14} width="64" height="3" rx="1" fill={it.c} opacity="0.7" />
          <rect x={it.x + 8} y={it.y + 24} width="50" height="2" rx="1" fill="#CBD5E1" />
          <rect x={it.x + 8} y={it.y + 34} width="55" height="2" rx="1" fill="#CBD5E1" />
          <rect x={it.x + 8} y={it.y + 44} width="45" height="2" rx="1" fill="#CBD5E1" />
          <text x={it.x + 40} y={it.y + 78} textAnchor="middle" fill={it.c} fontFamily="JetBrains Mono" fontSize="11" fontWeight="700">{it.label}</text>
          {it.done && (
            <motion.g initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.6 + i * 0.1, type: "spring" }}>
              <circle cx={it.x + 64} cy={it.y - 6} r="12" fill={GREEN} />
              <path d={`M${it.x + 58} ${it.y - 6} l4 4 8 -8`} stroke="white" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </motion.g>
          )}
        </motion.g>
      ))}
    </svg>
  );
}

/* ---- Badges — orbit of medals ---- */
function BadgesGraphic({ className }) {
  const badges = [
    { angle: 0, c: ORANGE, label: "TIME" },
    { angle: 72, c: PURPLE, label: "COMM" },
    { angle: 144, c: BLUE, label: "DOCS" },
    { angle: 216, c: GREEN, label: "PRO" },
    { angle: 288, c: "#EAB308", label: "CHMP" },
  ];
  return (
    <svg viewBox="0 0 560 240" className={className} fill="none">
      <defs>
        <radialGradient id="ib-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={ORANGE} stopOpacity="0.35" />
          <stop offset="100%" stopColor={ORANGE} stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="280" cy="220" rx="220" ry="12" fill="rgba(15,32,66,0.06)" />
      <circle cx="280" cy="115" r="100" fill="url(#ib-glow)" />
      <motion.circle cx="280" cy="115" r="80"
        stroke={NAVY} strokeWidth="1" strokeDasharray="4 6" fill="none" opacity="0.3"
        animate={{ rotate: 360 }} style={{ transformOrigin: "280px 115px" }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }} />
      {/* central trophy */}
      <motion.g initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 180 }}>
        <circle cx="280" cy="115" r="34" fill="white" stroke={ORANGE} strokeWidth="2.5" />
        <polygon points="266,108 294,108 296,120 280,134 264,120" fill={ORANGE} />
        <rect x="272" y="134" width="16" height="6" fill={ORANGE} opacity="0.7" />
      </motion.g>
      {/* orbit badges */}
      {badges.map((b, i) => {
        const r = 80;
        const rad = (b.angle * Math.PI) / 180;
        const x = 280 + Math.cos(rad) * r;
        const y = 115 + Math.sin(rad) * r;
        return (
          <motion.g key={i}
            initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 + i * 0.1, type: "spring", stiffness: 200 }}>
            <circle cx={x} cy={y} r="20" fill="white" stroke={b.c} strokeWidth="2.5" />
            <polygon
              points={`${x - 8},${y - 6} ${x},${y - 12} ${x + 8},${y - 6} ${x + 5},${y + 5} ${x},${y} ${x - 5},${y + 5}`}
              fill={b.c} />
            <text x={x} y={y + 32} textAnchor="middle" fill={b.c} fontFamily="JetBrains Mono" fontSize="8" fontWeight="700">{b.label}</text>
          </motion.g>
        );
      })}
    </svg>
  );
}
