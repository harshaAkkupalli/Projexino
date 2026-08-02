/**
 * modalScrollAnchor
 * -----------------
 * Globally anchors every modal/overlay to the user's CURRENT scroll position
 * so the popup floats at the page's current view AND scrolls with the page
 * (instead of being pinned to the viewport like a sticky overlay).
 *
 * How it works:
 *   1. A MutationObserver watches the document body for new nodes.
 *   2. Any element that looks like a modal overlay (matches `.fixed.inset-0`
 *      and contains either a backdrop colour or a child centred dialog) is
 *      mutated: the `fixed inset-0` classes are swapped for a `pjx-anchor-doc`
 *      class which uses `position: absolute; top: <scrollY>px`.
 *   3. The captured scrollY freezes when the modal opens so the user can
 *      scroll the body underneath and the modal scrolls along.
 *
 * Excluded:
 *   - Drawer/sheet primitives from shadcn (`[data-radix-*]`) since they
 *     already manage scroll-locking correctly.
 *   - Toaster region (`[data-sonner-toaster]`).
 *   - The Login intro popup + Xino estimator (mark them with
 *     `data-pjx-no-anchor`).
 */

const ANCHOR_CLASS = "pjx-anchor-doc";
const SKIP_ATTR = "data-pjx-no-anchor";
const PROCESSED = new WeakSet();

function shouldAnchor(el) {
  if (!(el instanceof HTMLElement)) return false;
  if (PROCESSED.has(el)) return false;
  if (el.hasAttribute(SKIP_ATTR)) return false;
  // Skip shadcn/radix primitives — they handle their own scroll locking.
  if (el.closest('[data-radix-portal], [data-radix-popper-content-wrapper]')) return false;
  if (el.closest('[data-sonner-toaster]')) return false;
  // Must be position: fixed and full-bleed (inset-0).
  const cls = el.className || "";
  if (typeof cls !== "string") return false;
  if (!/\bfixed\b/.test(cls)) return false;
  if (!/\binset-0\b/.test(cls)) return false;
  // Only anchor CENTERED DIALOG modals — i.e. overlays that center a child
  // dialog box. Skip full-takeover layers (login/xino/loader) and the
  // nav drawer backdrops (they should stay viewport-pinned).
  if (!/\bitems-center\b/.test(cls) || !/\bjustify-center\b/.test(cls)) return false;
  // Skip very-high z-index full-screen takeovers (login intro, Xino estimator,
  // loader, etc.) — they intentionally trap the entire viewport.
  if (/z-\[?(?:8\d|9\d|1\d\d)\]?/.test(cls)) return false;
  // Skip if it's the very first child of body inside a takeover wrapper.
  if (el.parentElement && el.parentElement.matches?.('[data-pjx-no-anchor]')) return false;
  return true;
}

function anchorToScroll(el) {
  if (!shouldAnchor(el)) return;
  PROCESSED.add(el);
  const y = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
  // Swap the offending utility classes for our anchored class.
  el.classList.remove("fixed", "inset-0");
  el.classList.add(ANCHOR_CLASS);
  el.style.top = `${y}px`;
}

let observer = null;

export function initModalScrollAnchor() {
  if (observer) return;
  // Pass 1: anchor anything already in the DOM.
  document.querySelectorAll('.fixed.inset-0').forEach(anchorToScroll);
  // Pass 2: watch for new nodes.
  observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((n) => {
        if (n instanceof HTMLElement) {
          if (shouldAnchor(n)) anchorToScroll(n);
          // Also scan descendants — framer-motion sometimes wraps the
          // overlay one level deeper.
          n.querySelectorAll && n.querySelectorAll('.fixed.inset-0').forEach(anchorToScroll);
        }
      });
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

export function stopModalScrollAnchor() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}
