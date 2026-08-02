import { useRef } from "react";
import { useMotionValue, useSpring, useTransform } from "framer-motion";

/**
 * Mouse-tracking 3D tilt for cards.
 * Returns ref + motion values to bind: { ref, rotateX, rotateY, glareX, glareY, onMouseMove, onMouseLeave }
 *
 * Usage:
 *   const tilt = useTilt({ max: 8 });
 *   <motion.div ref={tilt.ref} onMouseMove={tilt.onMouseMove} onMouseLeave={tilt.onMouseLeave}
 *     style={{ rotateX: tilt.rotateX, rotateY: tilt.rotateY, transformStyle: "preserve-3d" }}>
 */
export default function useTilt({ max = 10, spring = { stiffness: 220, damping: 22 } } = {}) {
  const ref = useRef(null);
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const gx = useMotionValue(50);
  const gy = useMotionValue(50);

  const rotateX = useSpring(rx, spring);
  const rotateY = useSpring(ry, spring);
  const glareX = useSpring(gx, spring);
  const glareY = useSpring(gy, spring);

  const onMouseMove = (e) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width; // 0..1
    const py = (e.clientY - r.top) / r.height;
    ry.set((px - 0.5) * (max * 2));
    rx.set(-(py - 0.5) * (max * 2));
    gx.set(px * 100);
    gy.set(py * 100);
  };

  const onMouseLeave = () => {
    rx.set(0);
    ry.set(0);
    gx.set(50);
    gy.set(50);
  };

  // Pre-baked transform for a "lift" feedback (translateZ-ish via scale)
  const lift = useTransform([rotateX, rotateY], ([x, y]) => Math.min(Math.hypot(x, y) / 30, 1));

  return { ref, rotateX, rotateY, glareX, glareY, lift, onMouseMove, onMouseLeave };
}
