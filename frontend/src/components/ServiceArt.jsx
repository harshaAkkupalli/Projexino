import { motion } from "framer-motion";

const NAVY = "#0F2042";
const ORANGE = "#F97316";

/* Per-service themed 3D-style SVG illustrations for the homepage cards.
   Each variant is a unique animated isometric scene. */
export default function ServiceArt({ variant, className = "" }) {
  switch (variant) {
    case "ai-driven-development": return <AIArt className={className} />;
    case "app-development": return <AppArt className={className} />;
    case "chatgpt-solutions": return <ChatArt className={className} />;
    case "cross-platform-development": return <CrossArt className={className} />;
    case "saas-development": return <SaaSArt className={className} />;
    case "ios-android-development": return <MobileArt className={className} />;
    case "industry-focused-solutions": return <IndustryArt className={className} />;
    case "app-maintenance-support": return <SupportArt className={className} />;
    default: return null;
  }
}

const DECK = "url(#deck)";

const SharedDefs = () => (
  <defs>
    <linearGradient id="deck" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stopColor="#FFFBF1" />
      <stop offset="1" stopColor="#FFE9CC" />
    </linearGradient>
    <filter id="sh"><feDropShadow dx="0" dy="3" stdDeviation="3" floodOpacity="0.18" /></filter>
  </defs>
);

function AIArt({ className }) {
  return (
    <svg viewBox="0 0 320 200" className={className} fill="none">
      <SharedDefs />
      <rect x="0" y="0" width="320" height="200" rx="14" fill={DECK} />
      <ellipse cx="160" cy="180" rx="120" ry="6" fill="rgba(15,32,66,0.08)" />
      {/* Neural net nodes */}
      <motion.g animate={{ rotate: 360 }} style={{ transformOrigin: "160px 100px" }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}>
        <circle cx="160" cy="100" r="48" stroke="#F97316" strokeWidth="1" strokeDasharray="3 5" fill="none" opacity="0.5" />
      </motion.g>
      {[
        { x: 80, y: 70, c: "#3B82F6" }, { x: 80, y: 130, c: "#A855F7" },
        { x: 240, y: 70, c: ORANGE }, { x: 240, y: 130, c: "#10B981" },
      ].map((n, i) => (
        <g key={i}>
          <line x1={n.x} y1={n.y} x2="160" y2="100" stroke={n.c} strokeWidth="1.5" opacity="0.4" />
          <motion.circle cx={n.x} cy={n.y} r="10" fill={n.c} filter="url(#sh)"
            animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 2, delay: i * 0.2, repeat: Infinity }} />
          <circle cx={n.x} cy={n.y} r="5" fill="white" />
        </g>
      ))}
      <motion.g animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 2, repeat: Infinity }}>
        <circle cx="160" cy="100" r="22" fill={ORANGE} filter="url(#sh)" />
        <text x="160" y="106" textAnchor="middle" fill="white" fontFamily="JetBrains Mono" fontSize="13" fontWeight="700">AI</text>
      </motion.g>
      <text x="20" y="30" fill={NAVY} fontFamily="JetBrains Mono" fontSize="10" fontWeight="700">{"{ neural.net }"}</text>
    </svg>
  );
}

function AppArt({ className }) {
  return (
    <svg viewBox="0 0 320 200" className={className} fill="none">
      <SharedDefs />
      <rect x="0" y="0" width="320" height="200" rx="14" fill={DECK} />
      <ellipse cx="160" cy="180" rx="120" ry="6" fill="rgba(15,32,66,0.08)" />
      {/* Phone frame */}
      <motion.g initial={{ y: 8 }} animate={{ y: [0, -6, 0] }} transition={{ duration: 3.5, repeat: Infinity }}>
        <rect x="118" y="36" width="84" height="140" rx="14" fill={NAVY} filter="url(#sh)" />
        <rect x="124" y="46" width="72" height="116" rx="6" fill="white" />
        {/* widgets */}
        <rect x="130" y="54" width="60" height="20" rx="4" fill={ORANGE} />
        <rect x="130" y="80" width="28" height="28" rx="4" fill="#3B82F6" />
        <rect x="162" y="80" width="28" height="28" rx="4" fill="#10B981" />
        <rect x="130" y="114" width="60" height="6" rx="2" fill="#94A3B8" />
        <rect x="130" y="124" width="44" height="6" rx="2" fill="#CBD5E1" />
        <rect x="130" y="134" width="50" height="6" rx="2" fill="#CBD5E1" />
        <circle cx="160" cy="169" r="3" fill={ORANGE} />
      </motion.g>
      {/* Laptop in back */}
      <g opacity="0.85">
        <path d="M50 130 L100 100 L100 144 L50 174 Z" fill={NAVY} filter="url(#sh)" />
        <path d="M58 134 L96 110 L96 140 L58 164 Z" fill="#3B82F6" />
      </g>
      <g opacity="0.85">
        <path d="M270 130 L220 100 L220 144 L270 174 Z" fill={NAVY} filter="url(#sh)" />
        <path d="M262 134 L224 110 L224 140 L262 164 Z" fill="#A855F7" />
      </g>
      <text x="20" y="30" fill={NAVY} fontFamily="JetBrains Mono" fontSize="10" fontWeight="700">{"<App />"}</text>
    </svg>
  );
}

function ChatArt({ className }) {
  return (
    <svg viewBox="0 0 320 200" className={className} fill="none">
      <SharedDefs />
      <rect x="0" y="0" width="320" height="200" rx="14" fill={DECK} />
      <ellipse cx="160" cy="180" rx="120" ry="6" fill="rgba(15,32,66,0.08)" />
      {[
        { x: 40, y: 50, w: 150, c: NAVY, txt: "Hi! 👋" },
        { x: 130, y: 95, w: 170, c: ORANGE, txt: "Help me build..." },
        { x: 60, y: 140, w: 140, c: "#10B981", txt: "On it! 🚀" },
      ].map((m, i) => (
        <motion.g key={i} initial={{ opacity: 0, x: i % 2 ? 20 : -20 }} animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.2, duration: 0.5 }}>
          <rect x={m.x} y={m.y} width={m.w} height="30" rx="14" fill={m.c} filter="url(#sh)" />
          <text x={m.x + 14} y={m.y + 20} fill="white" fontFamily="Outfit" fontSize="11" fontWeight="600">{m.txt}</text>
        </motion.g>
      ))}
      <motion.g animate={{ y: [0, -4, 0] }} transition={{ duration: 2, repeat: Infinity }}>
        <circle cx="280" cy="60" r="16" fill="white" stroke={ORANGE} strokeWidth="2" />
        <text x="280" y="66" textAnchor="middle" fill={ORANGE} fontFamily="Outfit" fontSize="13" fontWeight="700">AI</text>
      </motion.g>
      <text x="20" y="30" fill={NAVY} fontFamily="JetBrains Mono" fontSize="10" fontWeight="700">{"// chat.ai"}</text>
    </svg>
  );
}

function CrossArt({ className }) {
  return (
    <svg viewBox="0 0 320 200" className={className} fill="none">
      <SharedDefs />
      <rect x="0" y="0" width="320" height="200" rx="14" fill={DECK} />
      <ellipse cx="160" cy="180" rx="120" ry="6" fill="rgba(15,32,66,0.08)" />
      {[
        { x: 30, label: "iOS", c: "#0EA5E9" },
        { x: 110, label: "Android", c: "#10B981" },
        { x: 190, label: "Web", c: ORANGE },
        { x: 250, label: "Desktop", c: "#A855F7" },
      ].map((d, i) => (
        <motion.g key={d.label} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          transition={{ delay: i * 0.12 }}>
          <rect x={d.x} y={70} width="60" height="80" rx="8" fill={d.c} filter="url(#sh)" />
          <rect x={d.x + 6} y={76} width="48" height="58" rx="3" fill="white" />
          <circle cx={d.x + 30} cy={142} r="3" fill="white" />
          <text x={d.x + 30} y={166} textAnchor="middle" fill={d.c} fontFamily="JetBrains Mono" fontSize="9" fontWeight="700">{d.label}</text>
        </motion.g>
      ))}
      <motion.path d="M65 110 Q160 30 285 110" stroke={ORANGE} strokeWidth="2" strokeDasharray="4 4" fill="none" opacity="0.6"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.8 }} />
      <text x="20" y="30" fill={NAVY} fontFamily="JetBrains Mono" fontSize="10" fontWeight="700">{"build × deploy*"}</text>
    </svg>
  );
}

function SaaSArt({ className }) {
  return (
    <svg viewBox="0 0 320 200" className={className} fill="none">
      <SharedDefs />
      <rect x="0" y="0" width="320" height="200" rx="14" fill={DECK} />
      <ellipse cx="160" cy="180" rx="120" ry="6" fill="rgba(15,32,66,0.08)" />
      {/* stacked servers */}
      {[0, 1, 2].map((i) => (
        <motion.g key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
          <rect x="100" y={60 + i * 26} width="120" height="22" rx="4" fill={i === 1 ? ORANGE : NAVY} filter="url(#sh)" />
          <circle cx={110} cy={71 + i * 26} r="2.5" fill="#10B981" />
          <circle cx={118} cy={71 + i * 26} r="2.5" fill="white" opacity="0.5" />
          <text x={210} y={75 + i * 26} fontFamily="JetBrains Mono" fontSize="8" fill="white" textAnchor="end">{i === 0 ? "01" : i === 1 ? "02" : "03"}</text>
        </motion.g>
      ))}
      {/* growth bars on right */}
      {[30, 50, 70, 100].map((h, i) => (
        <motion.rect key={i} x={258 + i * 12} y={170 - h} width="8" height={h} rx="2"
          fill={i === 3 ? ORANGE : "#3B82F6"}
          initial={{ height: 0, y: 170 }} animate={{ height: h, y: 170 - h }}
          transition={{ delay: 0.3 + i * 0.1, duration: 0.5 }} />
      ))}
      <motion.g animate={{ rotate: 360 }} style={{ transformOrigin: "40px 100px" }}
        transition={{ duration: 18, repeat: Infinity, ease: "linear" }}>
        <circle cx="40" cy="100" r="24" stroke={ORANGE} strokeWidth="1.5" strokeDasharray="4 3" fill="none" />
      </motion.g>
      <circle cx="40" cy="100" r="14" fill={ORANGE} />
      <text x="40" y="104" textAnchor="middle" fill="white" fontFamily="JetBrains Mono" fontSize="10" fontWeight="700">∞</text>
      <text x="20" y="30" fill={NAVY} fontFamily="JetBrains Mono" fontSize="10" fontWeight="700">{"saas.scale"}</text>
    </svg>
  );
}

function MobileArt({ className }) {
  return (
    <svg viewBox="0 0 320 200" className={className} fill="none">
      <SharedDefs />
      <rect x="0" y="0" width="320" height="200" rx="14" fill={DECK} />
      <ellipse cx="160" cy="180" rx="120" ry="6" fill="rgba(15,32,66,0.08)" />
      {/* iOS phone */}
      <motion.g animate={{ rotate: [-3, 3, -3] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "110px 100px" }}>
        <rect x="80" y="40" width="60" height="120" rx="12" fill={NAVY} filter="url(#sh)" />
        <rect x="84" y="50" width="52" height="98" rx="4" fill={ORANGE} />
        <text x="110" y="105" textAnchor="middle" fill="white" fontFamily="Outfit" fontSize="22" fontWeight="700"></text>
      </motion.g>
      {/* Android phone */}
      <motion.g animate={{ rotate: [3, -3, 3] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "210px 100px" }}>
        <rect x="180" y="40" width="60" height="120" rx="12" fill="#10B981" filter="url(#sh)" />
        <rect x="184" y="50" width="52" height="98" rx="4" fill="white" />
        <text x="210" y="108" textAnchor="middle" fill="#10B981" fontFamily="Outfit" fontSize="20" fontWeight="700">▲</text>
      </motion.g>
      <text x="20" y="30" fill={NAVY} fontFamily="JetBrains Mono" fontSize="10" fontWeight="700">{"iOS · Android"}</text>
    </svg>
  );
}

function IndustryArt({ className }) {
  return (
    <svg viewBox="0 0 320 200" className={className} fill="none">
      <SharedDefs />
      <rect x="0" y="0" width="320" height="200" rx="14" fill={DECK} />
      <ellipse cx="160" cy="180" rx="120" ry="6" fill="rgba(15,32,66,0.08)" />
      {/* buildings */}
      {[
        { x: 50, w: 50, h: 100, c: "#3B82F6", label: "FIN" },
        { x: 110, w: 60, h: 120, c: ORANGE, label: "HEAL" },
        { x: 180, w: 50, h: 90, c: "#10B981", label: "ECOM" },
        { x: 240, w: 50, h: 110, c: "#A855F7", label: "HR" },
      ].map((b, i) => (
        <motion.g key={i} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.1 }}>
          <rect x={b.x} y={170 - b.h} width={b.w} height={b.h} rx="3" fill={b.c} filter="url(#sh)" />
          {/* windows */}
          {Array.from({ length: Math.floor(b.h / 18) }).map((_, r) => (
            [0, 1].map((col) => (
              <rect key={`${r}-${col}`} x={b.x + 8 + col * 22} y={170 - b.h + 12 + r * 16}
                width="10" height="8" fill="white" opacity="0.7" />
            ))
          ))}
          <text x={b.x + b.w / 2} y={170 - b.h - 5} textAnchor="middle" fill={b.c} fontFamily="JetBrains Mono" fontSize="9" fontWeight="700">{b.label}</text>
        </motion.g>
      ))}
      <text x="20" y="30" fill={NAVY} fontFamily="JetBrains Mono" fontSize="10" fontWeight="700">{"verticals.compile()"}</text>
    </svg>
  );
}

function SupportArt({ className }) {
  return (
    <svg viewBox="0 0 320 200" className={className} fill="none">
      <SharedDefs />
      <rect x="0" y="0" width="320" height="200" rx="14" fill={DECK} />
      <ellipse cx="160" cy="180" rx="120" ry="6" fill="rgba(15,32,66,0.08)" />
      {/* Big gear */}
      <motion.g animate={{ rotate: 360 }} style={{ transformOrigin: "120px 100px" }}
        transition={{ duration: 14, repeat: Infinity, ease: "linear" }}>
        <Gear cx={120} cy={100} r={42} color={NAVY} />
      </motion.g>
      {/* Small gear */}
      <motion.g animate={{ rotate: -360 }} style={{ transformOrigin: "190px 130px" }}
        transition={{ duration: 9, repeat: Infinity, ease: "linear" }}>
        <Gear cx={190} cy={130} r={26} color={ORANGE} />
      </motion.g>
      {/* status dots */}
      {[0, 1, 2].map((i) => (
        <motion.circle key={i} cx={250 + i * 16} cy={60} r="6" fill={["#10B981", "#10B981", "#F97316"][i]}
          animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.6, delay: i * 0.3, repeat: Infinity }} />
      ))}
      <text x="246" y="80" fill="#10B981" fontFamily="JetBrains Mono" fontSize="9" fontWeight="700">UPTIME 99.95%</text>
      <text x="20" y="30" fill={NAVY} fontFamily="JetBrains Mono" fontSize="10" fontWeight="700">{"// maintenance"}</text>
    </svg>
  );
}

function Gear({ cx, cy, r, color }) {
  const teeth = 8;
  const points = [];
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i * Math.PI) / teeth;
    const radius = i % 2 === 0 ? r : r - 8;
    points.push(`${cx + Math.cos(a) * radius},${cy + Math.sin(a) * radius}`);
  }
  return (
    <g>
      <polygon points={points.join(" ")} fill={color} />
      <circle cx={cx} cy={cy} r={r - 14} fill="white" />
      <circle cx={cx} cy={cy} r={r - 22} fill={color} />
    </g>
  );
}
