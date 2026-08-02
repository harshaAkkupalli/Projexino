import { Link } from "react-router-dom";

/**
 * Self-hosted from /app/frontend/public/projexino-logo.png so it loads reliably
 * inside Android TWA/WebView (cross-origin CDN URLs intermittently fail there —
 * see iter57 fix). Same-origin path = no CORS, no cert-chain, no URL-encoding bugs.
 */
const LOGO_URL = "/projexino-logo.png";

export default function Logo({ size = 44, showText = false, asLink = true }) {
  const inner = (
    <>
      <img
        src={LOGO_URL}
        alt="Projexino"
        style={{ height: size }}
        className="block w-auto select-none"
        draggable="false"
      />
      {showText && (
        <span className="font-display text-lg font-semibold tracking-[0.18em] text-[#0F2042]">
          PROJEX<span style={{ color: "#F97316" }}>I</span>NO
        </span>
      )}
    </>
  );
  if (!asLink) {
    return <span data-testid="brand-logo" className="flex items-center gap-2.5">{inner}</span>;
  }
  return (
    <Link to="/" data-testid="brand-logo" className="flex items-center gap-2.5">
      {inner}
    </Link>
  );
}
