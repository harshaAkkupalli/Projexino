import { useEffect } from "react";

// Positions portal pop-ups near the user's last click, clamped to stay
// fully visible in the current viewport (never off-screen / cut off).
// Side drawers (justify-end / items-stretch / inset-y-0) are left untouched.
export default function useSmartPopups() {
  useEffect(() => {
    const click = { x: window.innerWidth / 2, y: window.innerHeight / 3 };
    const onDown = (e) => {
      if (typeof e.clientX === "number" && (e.clientX || e.clientY)) {
        click.x = e.clientX;
        click.y = e.clientY;
      }
    };
    window.addEventListener("pointerdown", onDown, true);

    const place = (panel) => {
      if (!panel || panel.dataset.pjPos) return;
      panel.dataset.pjPos = "1";
      const cx = click.x;
      const cy = click.y;
      const m = 12;
      const clamp = () => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const rect = panel.getBoundingClientRect();
        // Delta between inline coords and actual viewport position — non-zero
        // when a transformed/filtered ancestor scopes position:fixed.
        const dX = rect.left - (parseFloat(panel.style.left) || 0);
        const dY = rect.top - (parseFloat(panel.style.top) || 0);
        const w = Math.min(rect.width || 480, vw - m * 2);
        const h = Math.min(rect.height || 300, vh - m * 2);
        const vLeft = Math.round(Math.min(Math.max(m, cx - w / 2), vw - w - m));
        const vTop = Math.round(Math.min(Math.max(m, cy + 14), Math.max(m, vh - h - m)));
        panel.style.left = vLeft - dX + "px";
        panel.style.top = vTop - dY + "px";
        panel.style.maxWidth = w + "px";
        panel.style.maxHeight = vh - vTop - m + "px";
      };
      panel.classList.add("pj-smart-pop");
      panel.style.left = "0px";
      panel.style.top = "0px";
      panel.style.transform = "none";
      clamp();
      setTimeout(clamp, 300);
      setTimeout(clamp, 800);
    };

    const defer = (el) =>
      requestAnimationFrame(() => requestAnimationFrame(() => place(el)));

    const handleOverlay = (o) => {
      const cls = typeof o.className === "string" ? o.className : "";
      if (cls.includes("justify-end") || cls.includes("items-stretch")) return;
      const panel = Array.from(o.children).find(
        (c) => c.tagName === "DIV" && !(c.getAttribute("role") || "").includes("alert")
      );
      if (panel) defer(panel);
    };

    const handleRadix = (el) => {
      const cls = typeof el.className === "string" ? el.className : "";
      if (!cls.includes("fixed")) return;
      if (cls.includes("inset-y-0") || cls.includes("inset-x-0")) return;
      defer(el);
    };

    const scan = (node) => {
      if (node.nodeType !== 1) return;
      const role = node.getAttribute?.("role");
      if (role === "dialog" || role === "alertdialog") {
        handleRadix(node);
      } else if (node.classList?.contains("fixed") && node.classList.contains("inset-0")) {
        handleOverlay(node);
      }
      node.querySelectorAll?.('.fixed.inset-0, [role="dialog"], [role="alertdialog"]').forEach((el) => {
        const r = el.getAttribute("role");
        if (r === "dialog" || r === "alertdialog") handleRadix(el);
        else handleOverlay(el);
      });
    };

    const obs = new MutationObserver((muts) => {
      muts.forEach((mm) => mm.addedNodes.forEach(scan));
    });
    obs.observe(document.body, { childList: true, subtree: true });

    return () => {
      obs.disconnect();
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, []);
}
