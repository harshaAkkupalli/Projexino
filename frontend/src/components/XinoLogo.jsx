import { motion } from "framer-motion";

/**
 * XinoLogo — animated brand mark for Xino AI.
 *
 * A floating gradient "X" with an orbital ring + neural pulse — used in:
 *  - Xino Estimator popup
 *  - AI Assist / Email Studio loading states
 *  - Floating CTA button on the public site
 *
 * Pure SVG + framer-motion. No 3D dependencies → works everywhere.
 */
export default function XinoLogo({ size = 64, glow = true, animated = true, className = "" }) {
  const s = size;
  const gid = `xino-grad-${size}`;
  const cgid = `xino-core-${size}`;
  return (
    <div
      data-testid="xino-logo"
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: s, height: s }}
    >
      {/* Soft outer glow */}
      {glow && (
        <motion.div
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(232,123,44,0.5) 0%, rgba(36,86,166,0.35) 45%, transparent 70%)",
            filter: "blur(8px)",
          }}
          animate={animated ? { scale: [0.9, 1.15, 0.9], opacity: [0.7, 1, 0.7] } : undefined}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      <svg
        viewBox="0 0 100 100"
        width={s}
        height={s}
        className="relative drop-shadow-[0_8px_24px_rgba(22,50,92,0.5)]"
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2E64B8" />
            <stop offset="55%" stopColor="#1B3E7A" />
            <stop offset="100%" stopColor="#0F2042" />
          </linearGradient>
          <radialGradient id={cgid} cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.55" />
            <stop offset="60%" stopColor="#2E64B8" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#16325C" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Background disc */}
        <circle cx="50" cy="50" r="46" fill={`url(#${gid})`} opacity="0.95" />
        <circle cx="50" cy="50" r="46" fill={`url(#${cgid})`} />

        {/* Orbital ring */}
        <motion.g
          style={{ originX: "50px", originY: "50px" }}
          animate={animated ? { rotate: 360 } : undefined}
          transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
        >
          <ellipse
            cx="50" cy="50" rx="42" ry="14"
            fill="none" stroke="#FFFFFF" strokeOpacity="0.65" strokeWidth="1.3"
            strokeDasharray="3 5"
          />
          <circle cx="92" cy="50" r="2.2" fill="#FFFFFF" />
        </motion.g>

        {/* Counter orbit */}
        <motion.g
          style={{ originX: "50px", originY: "50px" }}
          animate={animated ? { rotate: -360 } : undefined}
          transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
        >
          <ellipse
            cx="50" cy="50" rx="14" ry="42"
            fill="none" stroke="#FFFFFF" strokeOpacity="0.4" strokeWidth="1"
            strokeDasharray="2 4"
          />
          <circle cx="50" cy="8" r="1.6" fill="#FFFFFF" />
        </motion.g>

        {/* Bold "X" — the Xino mark */}
        <motion.g
          animate={animated ? { scale: [1, 1.05, 1] } : undefined}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
          style={{ originX: "50px", originY: "50px" }}
        >
          {/* Outer X (shadow) */}
          <path
            d="M28 28 L72 72 M72 28 L28 72"
            stroke="#0F2042" strokeWidth="11" strokeLinecap="round"
            opacity="0.35"
          />
          {/* Inner X (highlight) */}
          <path
            d="M28 28 L72 72 M72 28 L28 72"
            stroke="#FFFFFF" strokeWidth="7.5" strokeLinecap="round"
          />
          {/* Center node */}
          <circle cx="50" cy="50" r="5.5" fill="#FFFFFF" />
          <circle cx="50" cy="50" r="2.6" fill="#E87B2C" />
        </motion.g>

        {/* Neural pulse dots */}
        {animated && [0, 1, 2].map((i) => (
          <motion.circle
            key={i}
            cx="50" cy="50" r="46"
            fill="none" stroke="#FFFFFF" strokeWidth="1"
            initial={{ opacity: 0, scale: 1 }}
            animate={{ opacity: [0, 0.6, 0], scale: [1, 1.18, 1.25] }}
            transition={{ duration: 2.6, repeat: Infinity, delay: i * 0.7, ease: "easeOut" }}
            style={{ transformOrigin: "50px 50px" }}
          />
        ))}
      </svg>
    </div>
  );
}

/**
 * XinoLoader — full loading screen overlay used while Xino AI computes an estimate.
 */
export function XinoLoader({ message = "Xino AI is thinking…", subMessage = "Crunching market data, scoping requirements, drafting the budget…" }) {
  return (
    <div data-testid="xino-loader" className="flex flex-col items-center justify-center py-12 text-center">
      <XinoLogo size={120} animated />
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="mt-6"
      >
        <div className="font-display text-2xl font-semibold text-[#0F2042]">{message}</div>
        <div className="mt-2 max-w-md text-sm text-slate-500">{subMessage}</div>
      </motion.div>

      {/* progress shimmer */}
      <div className="mt-6 h-1 w-64 overflow-hidden rounded-full bg-orange-100">
        <motion.div
          className="h-full w-1/3 rounded-full bg-gradient-to-r from-[#FBBF24] via-[#F97316] to-[#A855F7]"
          animate={{ x: ["-100%", "300%"] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* status chips */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
        {["Parsing brief", "Matching market", "Scoping phases", "Compiling estimate"].map((step, i) => (
          <motion.span
            key={step}
            className="rounded-full border border-orange-200 bg-white/60 px-3 py-1 text-[#F97316]"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 2, repeat: Infinity, delay: i * 0.45 }}
          >
            {step}
          </motion.span>
        ))}
      </div>
    </div>
  );
}
