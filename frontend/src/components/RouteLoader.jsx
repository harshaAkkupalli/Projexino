import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import Loader from "./Loader";

/**
 * Shows the morph/build loader on route changes.
 * First load: 1.6s (lets the full materialization play).
 * Subsequent route changes: 700ms (snappy, just a flourish).
 */
export default function RouteLoader({ children }) {
  const location = useLocation();
  const firstRef = useRef(true);
  // Public booking pages skip the loader entirely — every second of friction
  // costs us a meeting.
  const skipLoader = location.pathname.startsWith("/book/");
  const [showing, setShowing] = useState(!skipLoader);

  useEffect(() => {
    if (skipLoader) {
      setShowing(false);
      firstRef.current = false;
      return;
    }
    setShowing(true);
    const dur = firstRef.current ? 1600 : 700;
    firstRef.current = false;
    const t = setTimeout(() => setShowing(false), dur);
    return () => clearTimeout(t);
  }, [location.pathname, skipLoader]);

  return (
    <>
      <AnimatePresence>
        {showing && (
          <motion.div
            key="route-loader"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.03, filter: "blur(8px)" }}
            transition={{ duration: 0.45, ease: [0.2, 0.7, 0.2, 1] }}
          >
            <Loader />
          </motion.div>
        )}
      </AnimatePresence>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.55, delay: 0.25, ease: [0.2, 0.7, 0.2, 1] }}
      >
        {children}
      </motion.div>
    </>
  );
}
