import { motion } from "framer-motion";

const LOGO_URL =
  "https://customer-assets.emergentagent.com/job_projexino-hub/artifacts/k85zxnvo_cropped-projexino-scaled-1-768x358%20%281%29.png";

/**
 * Loader: "Digital materialization" — particles orbit, geometric wireframes
 * fold, concentric rings expand, then the official Projexino logo
 * crystallizes at the centre with a glowing core.
 */
export default function Loader() {
  return (
    <div
      data-testid="projexino-loader"
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-[#FAF6F0]"
      style={{
        backgroundImage:
          "radial-gradient(60% 50% at 50% 50%, rgba(249,115,22,0.18), transparent 65%), radial-gradient(80% 60% at 50% 100%, rgba(30,58,138,0.14), transparent)",
      }}
    >
      {/* Soft grid backdrop */}
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            "linear-gradient(rgba(15,32,66,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(15,32,66,0.05) 1px,transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 70%)",
        }}
      />

      <div className="relative flex flex-col items-center gap-8">
        {/* Concentric expanding rings */}
        <div className="relative h-64 w-64">
          {[0, 1, 2, 3].map((i) => (
            <motion.div
              key={`ring-${i}`}
              className="absolute inset-0 rounded-full border"
              style={{ borderColor: i % 2 === 0 ? "rgba(249,115,22,0.4)" : "rgba(30,58,138,0.3)" }}
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: [0.4, 1.6], opacity: [0.9, 0] }}
              transition={{
                duration: 2.2,
                delay: i * 0.55,
                repeat: Infinity,
                ease: "easeOut",
              }}
            />
          ))}

          {/* Rotating orbit ring with dots */}
          <motion.div
            className="absolute inset-6 rounded-full border border-dashed border-[#0F2042]/20"
            animate={{ rotate: 360 }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          >
            {[0, 1, 2, 3, 4].map((i) => {
              const angle = (i / 5) * Math.PI * 2;
              const r = 100;
              const x = Math.cos(angle) * r;
              const y = Math.sin(angle) * r;
              return (
                <div
                  key={`orbit-${i}`}
                  className="absolute h-2 w-2 rounded-full bg-[#F97316]"
                  style={{
                    left: "50%",
                    top: "50%",
                    transform: `translate(${x}px, ${y}px) translate(-50%, -50%)`,
                    boxShadow: "0 0 10px rgba(249,115,22,0.7)",
                  }}
                />
              );
            })}
          </motion.div>

          {/* Counter-rotating outer */}
          <motion.div
            className="absolute -inset-2"
            animate={{ rotate: -360 }}
            transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
          >
            {[0, 1, 2].map((i) => {
              const angle = (i / 3) * Math.PI * 2;
              const r = 138;
              const x = Math.cos(angle) * r;
              const y = Math.sin(angle) * r;
              return (
                <div
                  key={`o2-${i}`}
                  className="absolute"
                  style={{
                    left: "50%",
                    top: "50%",
                    transform: `translate(${x}px, ${y}px) translate(-50%, -50%)`,
                  }}
                >
                  <div className="h-1.5 w-1.5 rotate-45 bg-[#1E3A8A]" />
                </div>
              );
            })}
          </motion.div>

          {/* Center core — pulsing badge with logo */}
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3, type: "spring", stiffness: 180, damping: 18 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <motion.div
              className="relative flex h-32 w-32 items-center justify-center rounded-full bg-white shadow-[0_20px_40px_-15px_rgba(15,32,66,0.4),0_0_0_8px_rgba(255,255,255,0.6)]"
              animate={{
                boxShadow: [
                  "0 20px 40px -15px rgba(15,32,66,0.4), 0 0 0 8px rgba(255,255,255,0.6), 0 0 0 0 rgba(249,115,22,0.45)",
                  "0 20px 40px -15px rgba(15,32,66,0.4), 0 0 0 8px rgba(255,255,255,0.6), 0 0 0 18px rgba(249,115,22,0)",
                ],
              }}
              transition={{ duration: 1.6, repeat: Infinity }}
            >
              <img
                src={LOGO_URL}
                alt="Projexino"
                className="h-20 w-20 object-contain"
                draggable="false"
              />
            </motion.div>
          </motion.div>

          {/* Floating particles converging */}
          {[...Array(12)].map((_, i) => {
            const angle = (i / 12) * Math.PI * 2;
            const r = 180;
            const startX = Math.cos(angle) * r;
            const startY = Math.sin(angle) * r;
            return (
              <motion.div
                key={`p-${i}`}
                className="absolute h-1 w-1 rounded-full"
                style={{
                  left: "50%",
                  top: "50%",
                  background: i % 3 === 0 ? "#F97316" : "#1E3A8A",
                }}
                initial={{ x: startX, y: startY, opacity: 0, scale: 0 }}
                animate={{
                  x: [startX, 0],
                  y: [startY, 0],
                  opacity: [0, 1, 0],
                  scale: [0, 1.4, 0],
                }}
                transition={{
                  duration: 2,
                  delay: i * 0.15,
                  repeat: Infinity,
                  repeatDelay: 0.5,
                  ease: "easeIn",
                }}
              />
            );
          })}
        </div>

        {/* Brand strip */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="flex flex-col items-center gap-3"
        >
          <div className="font-display text-2xl font-light tracking-[0.42em] text-[#0F2042]">
            PROJEX<span className="text-[#F97316]">I</span>NO
          </div>

          <div className="flex items-center gap-2 font-mono-pj text-[10px] uppercase tracking-[0.35em] text-slate-500">
            <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-[#F97316]" />
            <span>Materializing your experience</span>
          </div>
        </motion.div>

        {/* Loading bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="relative h-[3px] w-52 overflow-hidden rounded-full bg-[#0F2042]/10"
        >
          <motion.div
            className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-gradient-to-r from-[#1E3A8A] via-[#F97316] to-[#1E3A8A]"
            animate={{ x: ["-100%", "300%"] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
        </motion.div>
      </div>
    </div>
  );
}
