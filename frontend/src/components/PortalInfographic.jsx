import { motion } from "framer-motion";

const NAVY = "#1E3A8A";
const NAVY_DARK = "#0F2042";
const ORANGE = "#F97316";

/**
 * 3D-styled animated infographic header for portal pages.
 * Uses isometric SVG + framer-motion to imply depth/lift without R3F overhead.
 */
export default function PortalInfographic({ variant = "tasks", className = "" }) {
  const _cls = `portal-infographic ${className}`;
  className = _cls;
  if (variant === "tasks") return <TasksGraphic className={className} />;
  if (variant === "leads") return <LeadsGraphic className={className} />;
  if (variant === "team") return <TeamGraphic className={className} />;
  if (variant === "dashboard") return <DashboardGraphic className={className} />;
  return null;
}

/* ---------- TASKS — isometric Kanban with flowing cards ---------- */
function TasksGraphic({ className }) {
  const cols = [
    { x: 30, y: 100, color: "#94A3B8", label: "TODO" },
    { x: 160, y: 90, color: "#3B82F6", label: "DOING" },
    { x: 290, y: 80, color: ORANGE, label: "REVIEW" },
    { x: 420, y: 70, color: "#10B981", label: "DONE" },
  ];

  return (
    <svg viewBox="0 0 560 240" className={className} fill="none">
      <defs>
        <linearGradient id="tg-glass" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity="0.95" />
          <stop offset="100%" stopColor="white" stopOpacity="0.4" />
        </linearGradient>
        <filter id="tg-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
          <feOffset dx="0" dy="4" />
          <feComponentTransfer><feFuncA type="linear" slope="0.18" /></feComponentTransfer>
          <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Iso-floor */}
      <motion.path
        d="M40 220 L520 220 L470 180 L90 180 Z"
        fill="rgba(15,32,66,0.05)"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
      />

      {/* Columns */}
      {cols.map((c, i) => (
        <g key={c.label}>
          {/* column stack — back */}
          <motion.rect
            x={c.x} y={c.y} width="100" height="120" rx="14"
            fill="white" stroke={c.color} strokeWidth="1.5" filter="url(#tg-shadow)"
            initial={{ opacity: 0, y: c.y + 20 }}
            animate={{ opacity: 1, y: c.y }}
            transition={{ duration: 0.6, delay: i * 0.1 }}
          />
          {/* column header */}
          <motion.rect
            x={c.x + 6} y={c.y + 8} width="88" height="22" rx="6"
            fill={`${c.color}22`}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ delay: i * 0.1 + 0.2 }}
          />
          <text
            x={c.x + 14} y={c.y + 23}
            fill={c.color} fontFamily="JetBrains Mono" fontSize="9" fontWeight="700"
          >
            {c.label}
          </text>
          {/* count */}
          <text
            x={c.x + 86} y={c.y + 23} textAnchor="end"
            fill={c.color} fontFamily="JetBrains Mono" fontSize="9" fontWeight="700"
          >
            {[6, 3, 2, 8][i]}
          </text>
          {/* cards inside */}
          {[0, 1].map((j) => (
            <motion.g
              key={j}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 + 0.3 + j * 0.1 }}
            >
              <rect x={c.x + 8} y={c.y + 38 + j * 30} width="84" height="22" rx="5" fill="url(#tg-glass)" stroke="#E2E8F0" />
              <rect x={c.x + 13} y={c.y + 44 + j * 30} width={[40, 56][j]} height="3" rx="1.5" fill="#0F2042" opacity="0.6" />
              <rect x={c.x + 13} y={c.y + 50 + j * 30} width={[28, 36][j]} height="2" rx="1" fill="#94A3B8" />
              <circle cx={c.x + 86} cy={c.y + 47 + j * 30} r="2.5" fill={c.color} />
            </motion.g>
          ))}
          {/* "add" placeholder */}
          <motion.rect
            x={c.x + 8} y={c.y + 100} width="84" height="14" rx="5"
            fill="none" stroke={c.color} strokeDasharray="3 3" strokeWidth="1" opacity="0.5"
            initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} transition={{ delay: i * 0.1 + 0.6 }}
          />
        </g>
      ))}

      {/* Flying card — drag/drop hint */}
      <motion.g
        initial={{ opacity: 0 }}
        animate={{
          opacity: [0, 1, 1, 1, 0],
          x: [0, 130, 260, 390, 390],
          y: [0, -8, -16, -22, -22],
          rotate: [0, -2, 2, -1, 0],
        }}
        transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
      >
        <rect x="38" y="160" width="84" height="24" rx="6" fill={ORANGE} opacity="0.95" />
        <rect x="44" y="167" width="46" height="3" rx="1.5" fill="white" />
        <rect x="44" y="174" width="32" height="2" rx="1" fill="white" opacity="0.7" />
        <circle cx="114" cy="172" r="3" fill="white" />
      </motion.g>

      {/* Floating sparkles */}
      {[
        { x: 480, y: 30, c: ORANGE },
        { x: 510, y: 60, c: NAVY },
        { x: 60, y: 40, c: ORANGE },
        { x: 30, y: 70, c: NAVY },
      ].map((s, i) => (
        <motion.circle
          key={i} cx={s.x} cy={s.y} r="3" fill={s.c}
          animate={{ opacity: [0.3, 1, 0.3], scale: [0.7, 1.3, 0.7] }}
          transition={{ duration: 2 + i * 0.3, repeat: Infinity, delay: i * 0.4 }}
        />
      ))}
    </svg>
  );
}

/* ---------- LEADS — funnel infographic ---------- */
function LeadsGraphic({ className }) {
  const stages = [
    { label: "NEW", color: "#3B82F6", w: 420, val: 142 },
    { label: "CONTACTED", color: ORANGE, w: 340, val: 96 },
    { label: "QUALIFIED", color: "#10B981", w: 250, val: 58 },
    { label: "WON", color: "#A855F7", w: 160, val: 21 },
  ];

  return (
    <svg viewBox="0 0 560 240" className={className} fill="none">
      <defs>
        <filter id="lg-shadow"><feDropShadow dx="0" dy="3" stdDeviation="3" floodOpacity="0.18" /></filter>
      </defs>

      {/* Floor */}
      <path d="M40 220 L520 220 L480 198 L80 198 Z" fill="rgba(15,32,66,0.05)" />

      {stages.map((s, i) => {
        const x = (560 - s.w) / 2;
        const y = 25 + i * 38;
        return (
          <g key={s.label}>
            <motion.rect
              x={x} y={y} width={s.w} height="30" rx="6"
              fill={s.color} filter="url(#lg-shadow)"
              initial={{ opacity: 0, scaleX: 0.3, originX: 0.5 }}
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{ duration: 0.5, delay: i * 0.12 }}
              style={{ transformOrigin: "center" }}
            />
            <text x={x + 12} y={y + 19} fill="white" fontFamily="JetBrains Mono" fontSize="11" fontWeight="700">
              {s.label}
            </text>
            <text x={x + s.w - 10} y={y + 19} textAnchor="end" fill="white" fontFamily="JetBrains Mono" fontSize="11" fontWeight="700">
              {s.val}
            </text>
            {/* drip animation */}
            {i < stages.length - 1 && (
              <motion.circle
                cx={280} r="3" fill={s.color}
                animate={{ cy: [y + 30, y + 60] , opacity: [1, 0] }}
                transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.3 }}
              />
            )}
          </g>
        );
      })}

      {/* conversion callout */}
      <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}>
        <rect x="430" y="190" width="100" height="36" rx="8" fill="white" stroke={ORANGE} strokeWidth="1.5" />
        <text x="440" y="206" fill={ORANGE} fontFamily="JetBrains Mono" fontSize="9" fontWeight="700">CONVERSION</text>
        <text x="440" y="220" fill={NAVY_DARK} fontFamily="Outfit" fontSize="14" fontWeight="700">14.8%</text>
      </motion.g>
    </svg>
  );
}

/* ---------- TEAM — orbiting avatars ---------- */
function TeamGraphic({ className }) {
  const orbit = [
    { angle: 0, color: ORANGE, label: "MI" },
    { angle: 60, color: "#3B82F6", label: "JP" },
    { angle: 120, color: "#10B981", label: "TO" },
    { angle: 180, color: "#A855F7", label: "RX" },
    { angle: 240, color: "#EAB308", label: "DK" },
    { angle: 300, color: NAVY, label: "SV" },
  ];

  return (
    <svg viewBox="0 0 560 240" className={className} fill="none">
      <defs>
        <radialGradient id="tg-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={ORANGE} stopOpacity="0.3" />
          <stop offset="100%" stopColor={ORANGE} stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx="280" cy="220" rx="240" ry="14" fill="rgba(15,32,66,0.06)" />

      <circle cx="280" cy="120" r="120" fill="url(#tg-core)" />

      <motion.circle
        cx="280" cy="120" r="90"
        stroke={NAVY} strokeWidth="1" strokeDasharray="4 6" fill="none" opacity="0.3"
        animate={{ rotate: 360 }}
        style={{ transformOrigin: "280px 120px" }}
        transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
      />

      {/* Center: org */}
      <motion.g initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 180 }}>
        <circle cx="280" cy="120" r="34" fill="white" stroke={ORANGE} strokeWidth="2" />
        <text x="280" y="118" textAnchor="middle" fill={ORANGE} fontFamily="JetBrains Mono" fontSize="9" fontWeight="700">
          PROJEXINO
        </text>
        <text x="280" y="130" textAnchor="middle" fill={NAVY_DARK} fontFamily="Outfit" fontSize="11" fontWeight="700">
          TEAM
        </text>
      </motion.g>

      {/* Orbit avatars */}
      {orbit.map((m, i) => {
        const r = 90;
        const rad = (m.angle * Math.PI) / 180;
        const x = 280 + Math.cos(rad) * r;
        const y = 120 + Math.sin(rad) * r;
        return (
          <motion.g
            key={i}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 + i * 0.08 }}
          >
            <line x1="280" y1="120" x2={x} y2={y} stroke={m.color} strokeWidth="1" strokeDasharray="2 3" opacity="0.4" />
            <circle cx={x} cy={y} r="18" fill="white" stroke={m.color} strokeWidth="2" />
            <text x={x} y={y + 4} textAnchor="middle" fill={m.color} fontFamily="JetBrains Mono" fontSize="10" fontWeight="700">
              {m.label}
            </text>
            <motion.circle
              cx={x + 12} cy={y - 12} r="3" fill="#10B981"
              animate={{ opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.2 }}
            />
          </motion.g>
        );
      })}

      {/* corner label */}
      <text x="30" y="220" fill={NAVY_DARK} fontFamily="JetBrains Mono" fontSize="10" fontWeight="700">
        // PEOPLE GRAPH
      </text>
    </svg>
  );
}

/* ---------- DASHBOARD — composite chart ---------- */
function DashboardGraphic({ className }) {
  return (
    <svg viewBox="0 0 560 240" className={className} fill="none">
      <defs>
        <linearGradient id="dg-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={ORANGE} stopOpacity="0.4" />
          <stop offset="100%" stopColor={ORANGE} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* area chart back */}
      <motion.path
        d="M40 180 L100 130 L160 150 L220 90 L280 110 L340 60 L400 85 L460 40 L520 70 L520 220 L40 220 Z"
        fill="url(#dg-area)"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1 }}
      />
      <motion.path
        d="M40 180 L100 130 L160 150 L220 90 L280 110 L340 60 L400 85 L460 40 L520 70"
        stroke={ORANGE} strokeWidth="2.5" fill="none"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.8 }}
      />

      {/* bars */}
      {[60, 90, 50, 110, 80, 130].map((h, i) => (
        <motion.rect
          key={i} x={70 + i * 80} y={220 - h} width="20" height={h} rx="3"
          fill={NAVY}
          initial={{ height: 0, y: 220 }} animate={{ height: h, y: 220 - h }}
          transition={{ duration: 0.6, delay: i * 0.08 }}
        />
      ))}

      {/* KPI tile */}
      <motion.g initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1 }}>
        <rect x="410" y="20" width="130" height="60" rx="10" fill="white" stroke={ORANGE} strokeWidth="1.5" />
        <text x="425" y="42" fill={NAVY_DARK} fontFamily="JetBrains Mono" fontSize="9" fontWeight="700">
          // PIPELINE
        </text>
        <text x="425" y="64" fill={ORANGE} fontFamily="Outfit" fontSize="22" fontWeight="700">
          $284k
        </text>
      </motion.g>
    </svg>
  );
}
