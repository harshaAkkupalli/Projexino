import { motion } from "framer-motion";

export default function Infographic({ variant = "ai", className = "" }) {
  if (variant === "ai") return <AIInfographic className={className} />;
  if (variant === "cross") return <CrossPlatformInfographic className={className} />;
  if (variant === "saas") return <SaaSInfographic className={className} />;
  if (variant === "growth") return <GrowthInfographic className={className} />;
  return null;
}

const NAVY = "#1E3A8A";
const NAVY_DARK = "#0F2042";
const ORANGE = "#F97316";
const SLATE = "#64748B";
const LIGHT = "#F1F5F9";

function AIInfographic({ className }) {
  return (
    <svg viewBox="0 0 500 380" className={className} fill="none">
      <defs>
        <radialGradient id="ai-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={ORANGE} stopOpacity="0.18" />
          <stop offset="100%" stopColor={ORANGE} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="250" cy="190" r="160" fill="url(#ai-glow)" />

      <motion.circle
        cx="250" cy="190" r="50"
        stroke={ORANGE} strokeWidth="2"
        fill="rgba(249,115,22,0.08)"
        initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      />
      <text x="250" y="198" textAnchor="middle" fill={ORANGE} fontFamily="JetBrains Mono" fontSize="14" fontWeight="600">
        AI CORE
      </text>

      {[
        { x: 90, y: 100, label: "NLP" },
        { x: 410, y: 100, label: "ML" },
        { x: 90, y: 280, label: "DATA" },
        { x: 410, y: 280, label: "VISION" },
        { x: 250, y: 30, label: "LLM" },
        { x: 250, y: 350, label: "AGENT" },
      ].map((n, i) => (
        <g key={i}>
          <motion.line
            x1="250" y1="190" x2={n.x} y2={n.y}
            stroke={NAVY} strokeWidth="1.2" strokeDasharray="3 4"
            initial={{ pathLength: 0, opacity: 0 }}
            whileInView={{ pathLength: 1, opacity: 0.5 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: i * 0.1 + 0.3 }}
          />
          <motion.circle
            cx={n.x} cy={n.y} r="22"
            fill="white" stroke={NAVY} strokeWidth="1.5"
            initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }}
            transition={{ delay: i * 0.1 + 0.5 }}
          />
          <text x={n.x} y={n.y + 4} textAnchor="middle" fill={NAVY_DARK} fontFamily="JetBrains Mono" fontSize="9" fontWeight="600">
            {n.label}
          </text>
        </g>
      ))}

      {[0, 1, 2, 3].map((i) => (
        <motion.circle
          key={`p${i}`} r="3" fill={ORANGE}
          initial={{ offsetDistance: "0%" }}
          animate={{ offsetDistance: "100%" }}
          transition={{ duration: 3 + i * 0.4, repeat: Infinity, ease: "linear", delay: i * 0.5 }}
          style={{
            offsetPath: `path("M250 190 L${[90, 410, 250, 250][i]} ${[100, 280, 30, 350][i]}")`,
          }}
        />
      ))}
    </svg>
  );
}

function CrossPlatformInfographic({ className }) {
  return (
    <svg viewBox="0 0 500 380" className={className} fill="none">
      <defs>
        <linearGradient id="cp-grad" x1="0" x2="1">
          <stop offset="0%" stopColor={NAVY} />
          <stop offset="100%" stopColor={ORANGE} />
        </linearGradient>
      </defs>

      <motion.rect
        x="200" y="155" width="100" height="70" rx="12"
        fill="white" stroke={ORANGE} strokeWidth="2"
        initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }}
      />
      <text x="250" y="186" textAnchor="middle" fill={ORANGE} fontFamily="JetBrains Mono" fontSize="11" fontWeight="700">
        {"</> CORE"}
      </text>
      <text x="250" y="202" textAnchor="middle" fill={SLATE} fontFamily="JetBrains Mono" fontSize="9">
        ONE CODEBASE
      </text>

      {[
        { x: 60, y: 80, label: "iOS", w: 70 },
        { x: 370, y: 80, label: "ANDROID", w: 90 },
        { x: 60, y: 270, label: "WEB", w: 70 },
        { x: 370, y: 270, label: "DESKTOP", w: 90 },
      ].map((d, i) => (
        <g key={i}>
          <motion.path
            d={`M250 ${i < 2 ? 155 : 225} Q${(250 + d.x) / 2} ${(190 + d.y + 20) / 2} ${d.x + d.w / 2} ${d.y + 22}`}
            stroke="url(#cp-grad)" strokeWidth="1.5" strokeDasharray="4 4" fill="none"
            initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }}
            transition={{ duration: 1, delay: i * 0.15 }}
          />
          <motion.rect
            x={d.x} y={d.y} width={d.w} height="44" rx="22"
            fill="white" stroke={NAVY} strokeWidth="1.5"
            initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            transition={{ delay: i * 0.15 + 0.3 }}
          />
          <text x={d.x + d.w / 2} y={d.y + 28} textAnchor="middle" fill={NAVY_DARK} fontFamily="JetBrains Mono" fontSize="11" fontWeight="700">
            {d.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function SaaSInfographic({ className }) {
  return (
    <svg viewBox="0 0 500 380" className={className} fill="none">
      <motion.path
        d="M140 130 Q120 110 130 90 Q140 60 180 70 Q210 30 260 50 Q310 35 330 80 Q380 75 380 120 Q400 140 380 160 L140 160 Z"
        fill="rgba(30,58,138,0.07)" stroke={NAVY} strokeWidth="2"
        initial={{ opacity: 0, y: -10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
        transition={{ duration: 0.7 }}
      />
      <text x="260" y="115" textAnchor="middle" fill={ORANGE} fontFamily="JetBrains Mono" fontSize="12" fontWeight="700">
        CLOUD
      </text>

      {[
        { x: 70, y: 270 }, { x: 180, y: 290 }, { x: 290, y: 290 }, { x: 400, y: 270 },
      ].map((s, i) => (
        <g key={i}>
          <motion.line
            x1="260" y1="160" x2={s.x + 25} y2={s.y + 5}
            stroke={ORANGE} strokeWidth="1.5" strokeDasharray="3 4"
            initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }}
            transition={{ delay: i * 0.15 + 0.4 }}
          />
          <motion.rect
            x={s.x} y={s.y} width="50" height="50" rx="10"
            fill="white" stroke={NAVY} strokeWidth="1.5"
            initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }}
            transition={{ delay: i * 0.15 + 0.6 }}
          />
          <text x={s.x + 25} y={s.y + 30} textAnchor="middle" fill={SLATE} fontFamily="JetBrains Mono" fontSize="10">
            ORG·{i + 1}
          </text>
        </g>
      ))}

      {[0, 1, 2].map((i) => (
        <motion.circle
          key={i} cx={150 + i * 110} r="3" fill={ORANGE}
          initial={{ cy: 280 }} animate={{ cy: 160 }}
          transition={{ duration: 2, repeat: Infinity, delay: i * 0.6, ease: "easeInOut" }}
        />
      ))}
    </svg>
  );
}

function GrowthInfographic({ className }) {
  return (
    <svg viewBox="0 0 500 320" className={className} fill="none">
      <line x1="60" y1="270" x2="460" y2="270" stroke={LIGHT} strokeWidth="1.5" />
      <line x1="60" y1="270" x2="60" y2="60" stroke={LIGHT} strokeWidth="1.5" />

      {[120, 180, 90, 200, 150, 240].map((h, i) => (
        <motion.rect
          key={i} x={90 + i * 60} y={270 - h} width="36" height={h} rx="6"
          fill={i === 5 ? ORANGE : NAVY}
          initial={{ height: 0, y: 270 }} whileInView={{ height: h, y: 270 - h }} viewport={{ once: true }}
          transition={{ duration: 0.6, delay: i * 0.1 }}
        />
      ))}

      <motion.path
        d="M108 150 L168 90 L228 180 L288 70 L348 120 L408 30"
        stroke={ORANGE} strokeWidth="2.5" fill="none" strokeDasharray="600"
        initial={{ strokeDashoffset: 600 }} whileInView={{ strokeDashoffset: 0 }} viewport={{ once: true }}
        transition={{ duration: 1.6, delay: 0.5 }}
      />

      <motion.circle
        cx="408" cy="30" r="8" fill={ORANGE}
        initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }}
        transition={{ delay: 1.9 }}
      />
      <text x="420" y="35" fill={ORANGE} fontFamily="JetBrains Mono" fontSize="11" fontWeight="700">
        +247%
      </text>

      {["Q1", "Q2", "Q3", "Q4", "Q5", "Q6"].map((l, i) => (
        <text key={l} x={108 + i * 60} y="290" textAnchor="middle" fill={SLATE} fontFamily="JetBrains Mono" fontSize="10">
          {l}
        </text>
      ))}
    </svg>
  );
}
