import { motion } from "framer-motion";

const NAVY = "#0F2042";
const ORANGE = "#F97316";

/* Page-themed 3D-style hero infographics for portal pages. */
export default function PageInfographic({ variant, className = "" }) {
  if (variant === "projects") return <ProjectsGraphic className={className} />;
  if (variant === "documents") return <DocumentsGraphic className={className} />;
  if (variant === "chat") return <ChatGraphic className={className} />;
  if (variant === "interns") return <InternsGraphic className={className} />;
  if (variant === "ai") return <AIGraphic className={className} />;
  return null;
}

function ProjectsGraphic({ className }) {
  const blocks = [
    { x: 60, y: 80, w: 110, h: 80, c: "#3B82F6", t: "PLAN" },
    { x: 195, y: 60, w: 110, h: 100, c: ORANGE, t: "BUILD" },
    { x: 330, y: 90, w: 110, h: 70, c: "#A855F7", t: "REVIEW" },
    { x: 460, y: 50, w: 70, h: 110, c: "#10B981", t: "SHIP" },
  ];
  return (
    <svg viewBox="0 0 560 240" className={className} fill="none">
      <defs>
        <filter id="pg-sh"><feDropShadow dx="0" dy="3" stdDeviation="3" floodOpacity="0.15" /></filter>
        <linearGradient id="pg-iso" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="white" stopOpacity="0.95" />
          <stop offset="1" stopColor="white" stopOpacity="0.4" />
        </linearGradient>
      </defs>
      <path d="M30 220 L530 220 L490 195 L70 195 Z" fill="rgba(15,32,66,0.06)" />
      {blocks.map((b, i) => (
        <motion.g key={b.t}
          initial={{ y: b.y + 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          transition={{ delay: i * 0.1, duration: 0.6 }}>
          <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="10" fill={b.c} filter="url(#pg-sh)" />
          <rect x={b.x + 6} y={b.y + 6} width={b.w - 12} height={b.h - 12} rx="6" fill="url(#pg-iso)" />
          <text x={b.x + 12} y={b.y + 22} fill={b.c} fontFamily="JetBrains Mono" fontSize="9" fontWeight="700">{b.t}</text>
          <rect x={b.x + 12} y={b.y + 32} width={b.w - 30} height="3" rx="1.5" fill={b.c} opacity="0.7" />
          <rect x={b.x + 12} y={b.y + 40} width={b.w - 50} height="2" rx="1" fill="#94A3B8" />
          <rect x={b.x + 12} y={b.y + 50} width={b.w - 40} height="2" rx="1" fill="#94A3B8" />
          <circle cx={b.x + b.w - 16} cy={b.y + b.h - 14} r="5" fill="white" />
          <circle cx={b.x + b.w - 16} cy={b.y + b.h - 14} r="3" fill={b.c} />
        </motion.g>
      ))}
      <motion.path d="M170 120 L195 110 M305 110 L330 125 M440 125 L460 105"
        stroke={NAVY} strokeWidth="1.5" strokeDasharray="3 4" fill="none" opacity="0.4"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.5, delay: 0.6 }} />
      {/* Floating timeline pin */}
      <motion.g animate={{ y: [0, -6, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}>
        <rect x="430" y="20" width="100" height="22" rx="6" fill="white" stroke={ORANGE} />
        <text x="440" y="36" fill={NAVY} fontFamily="JetBrains Mono" fontSize="10" fontWeight="700">→ Q2 SPRINT</text>
      </motion.g>
    </svg>
  );
}

function DocumentsGraphic({ className }) {
  return (
    <svg viewBox="0 0 560 240" className={className} fill="none">
      <defs><filter id="dc-sh"><feDropShadow dx="0" dy="3" stdDeviation="3" floodOpacity="0.18" /></filter></defs>
      <ellipse cx="280" cy="225" rx="220" ry="10" fill="rgba(15,32,66,0.06)" />
      {[0, 1, 2].map((i) => (
        <motion.g key={i}
          initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.15, duration: 0.6 }}>
          <rect x={170 + i * 60} y={60 - i * 8} width="120" height="160" rx="10"
            fill="white" stroke={i === 1 ? ORANGE : "#CBD5E1"} strokeWidth={i === 1 ? 2 : 1} filter="url(#dc-sh)" />
          <rect x={180 + i * 60} y={75 - i * 8} width="60" height="6" rx="2" fill={NAVY} opacity={i === 1 ? 1 : 0.5} />
          <rect x={180 + i * 60} y={88 - i * 8} width="100" height="2.5" rx="1" fill="#94A3B8" />
          <rect x={180 + i * 60} y={97 - i * 8} width="86" height="2.5" rx="1" fill="#94A3B8" />
          <rect x={180 + i * 60} y={106 - i * 8} width="94" height="2.5" rx="1" fill="#94A3B8" />
          <rect x={180 + i * 60} y={130 - i * 8} width="60" height="40" rx="4" fill={i === 1 ? `${ORANGE}25` : "#F1F5F9"} />
          <text x={210 + i * 60} y={156 - i * 8} textAnchor="middle"
            fill={i === 1 ? ORANGE : "#94A3B8"} fontFamily="JetBrains Mono" fontSize="11" fontWeight="700">.pdf</text>
          <rect x={180 + i * 60} y={180 - i * 8} width="50" height="2" rx="1" fill="#CBD5E1" />
          <rect x={180 + i * 60} y={188 - i * 8} width="36" height="2" rx="1" fill="#CBD5E1" />
        </motion.g>
      ))}
      {/* Shared indicators */}
      <motion.g animate={{ y: [0, -4, 0] }} transition={{ duration: 2.6, repeat: Infinity }}>
        <circle cx="100" cy="100" r="22" fill="white" stroke={ORANGE} strokeWidth="2" />
        <text x="100" y="105" textAnchor="middle" fill={ORANGE} fontFamily="JetBrains Mono" fontSize="11" fontWeight="700">⇄</text>
      </motion.g>
      <text x="60" y="150" fill={NAVY} fontFamily="JetBrains Mono" fontSize="10" fontWeight="700">SHARED</text>
    </svg>
  );
}

function ChatGraphic({ className }) {
  return (
    <svg viewBox="0 0 560 240" className={className} fill="none">
      <defs><filter id="ch-sh"><feDropShadow dx="0" dy="3" stdDeviation="3" floodOpacity="0.15" /></filter></defs>
      <ellipse cx="280" cy="225" rx="220" ry="10" fill="rgba(15,32,66,0.05)" />
      {[
        { x: 80, y: 50, w: 200, c: NAVY, txt: "Pushing v2 today 🚀" },
        { x: 290, y: 95, w: 220, c: ORANGE, txt: "Review attached doc plz" },
        { x: 110, y: 145, w: 180, c: "#10B981", txt: "All green on CI ✔" },
      ].map((m, i) => (
        <motion.g key={i}
          initial={{ opacity: 0, x: i % 2 ? 24 : -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.18, duration: 0.5 }}>
          <rect x={m.x} y={m.y} width={m.w} height="40" rx="14" fill={m.c} filter="url(#ch-sh)" />
          <text x={m.x + 14} y={m.y + 25} fill="white" fontFamily="Outfit" fontSize="12" fontWeight="600">{m.txt}</text>
          <circle cx={i % 2 ? m.x + m.w + 14 : m.x - 14} cy={m.y + 20} r="10" fill="white" stroke={m.c} strokeWidth="1.5" />
        </motion.g>
      ))}
      {/* typing dots */}
      <motion.g
        initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 1, 0] }}
        transition={{ duration: 3, repeat: Infinity }}>
        <rect x="80" y="195" width="80" height="22" rx="11" fill="#E2E8F0" />
        {[0, 1, 2].map((d) => (
          <motion.circle key={d} cx={100 + d * 14} cy={206} r="3" fill={NAVY}
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1, repeat: Infinity, delay: d * 0.2 }} />
        ))}
      </motion.g>
    </svg>
  );
}

function InternsGraphic({ className }) {
  return (
    <svg viewBox="0 0 560 240" className={className} fill="none">
      <defs><filter id="in-sh"><feDropShadow dx="0" dy="3" stdDeviation="3" floodOpacity="0.18" /></filter></defs>
      <ellipse cx="280" cy="225" rx="220" ry="10" fill="rgba(15,32,66,0.06)" />
      {/* Graduation cap */}
      <motion.g initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.7 }}>
        <polygon points="200,90 280,60 360,90 280,120" fill={NAVY} filter="url(#in-sh)" />
        <rect x="240" y="115" width="80" height="12" fill={ORANGE} />
        <line x1="280" y1="90" x2="350" y2="135" stroke={ORANGE} strokeWidth="2" />
        <circle cx="350" cy="135" r="6" fill={ORANGE} />
      </motion.g>
      {/* Badges */}
      {[
        { x: 80, y: 130, c: ORANGE },
        { x: 140, y: 170, c: "#10B981" },
        { x: 420, y: 130, c: "#A855F7" },
        { x: 480, y: 170, c: "#3B82F6" },
      ].map((b, i) => (
        <motion.g key={i}
          initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.4 + i * 0.12, type: "spring", stiffness: 220 }}>
          <circle cx={b.x} cy={b.y} r="22" fill="white" stroke={b.c} strokeWidth="2" filter="url(#in-sh)" />
          <polygon
            points={`${b.x - 8},${b.y - 6} ${b.x},${b.y - 12} ${b.x + 8},${b.y - 6} ${b.x + 5},${b.y + 4} ${b.x},${b.y - 1} ${b.x - 5},${b.y + 4}`}
            fill={b.c} />
          <rect x={b.x - 6} y={b.y + 8} width="12" height="6" fill={b.c} opacity="0.6" />
        </motion.g>
      ))}
      <motion.g animate={{ y: [0, -4, 0] }} transition={{ duration: 2.4, repeat: Infinity }}>
        <rect x="220" y="170" width="120" height="32" rx="8" fill="white" stroke={ORANGE} strokeWidth="1.5" />
        <text x="280" y="190" textAnchor="middle" fill={ORANGE} fontFamily="JetBrains Mono" fontSize="11" fontWeight="700">CERTIFIED</text>
      </motion.g>
    </svg>
  );
}

function AIGraphic({ className }) {
  return (
    <svg viewBox="0 0 560 240" className={className} fill="none">
      <defs>
        <radialGradient id="ai-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor={ORANGE} stopOpacity="0.45" />
          <stop offset="1" stopColor={ORANGE} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="280" cy="120" r="100" fill="url(#ai-glow)" />
      <motion.circle cx="280" cy="120" r="60"
        stroke={NAVY} strokeWidth="1" strokeDasharray="4 6" fill="none" opacity="0.4"
        animate={{ rotate: 360 }} style={{ transformOrigin: "280px 120px" }}
        transition={{ duration: 14, repeat: Infinity, ease: "linear" }} />
      {/* Sparkle core */}
      <motion.g
        initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 180 }}>
        <polygon points="280,80 290,110 320,120 290,130 280,160 270,130 240,120 270,110" fill={ORANGE} />
        <circle cx="280" cy="120" r="6" fill="white" />
      </motion.g>
      {/* Code snippets floating */}
      {[
        { x: 60, y: 60, t: "function build()" },
        { x: 410, y: 50, t: "/* refactor */" },
        { x: 80, y: 170, t: "const ai = ⚡" },
        { x: 380, y: 180, t: "writeDocs(x)" },
      ].map((c, i) => (
        <motion.g key={i}
          initial={{ opacity: 0, y: c.y + 20 }} animate={{ opacity: 1, y: c.y }}
          transition={{ delay: 0.3 + i * 0.1, duration: 0.5 }}>
          <rect x={c.x} y={c.y} width="120" height="22" rx="6" fill="white" stroke="#CBD5E1" />
          <text x={c.x + 8} y={c.y + 15} fill={NAVY} fontFamily="JetBrains Mono" fontSize="10">{c.t}</text>
          <circle cx={c.x + 110} cy={c.y + 11} r="3" fill={ORANGE} />
        </motion.g>
      ))}
    </svg>
  );
}
