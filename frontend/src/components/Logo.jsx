import { Link } from "react-router-dom";

const LOGO_URL =
  "https://customer-assets.emergentagent.com/job_projexino-hub/artifacts/k85zxnvo_cropped-projexino-scaled-1-768x358%20%281%29.png";

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
