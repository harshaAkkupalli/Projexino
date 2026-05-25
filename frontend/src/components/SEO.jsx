/**
 * SEO.jsx — Lightweight, dependency-free SEO head manager for React 19.
 *
 * Usage:
 *   <SEO
 *     title="Page Title"
 *     description="…"
 *     canonical="/services/app-development"
 *     image="https://…"
 *     keywords={["app development", "react"]}
 *     jsonLd={[{ "@context":"https://schema.org", "@type":"Service", ... }]}
 *   />
 *
 * Manages: <title>, meta description/keywords, canonical link,
 * Open Graph, Twitter, JSON-LD application/ld+json scripts.
 * Removes the tags it added on unmount so navigation stays clean.
 */
import { useEffect } from "react";

const SITE_URL = "https://www.projexino.com";
const DEFAULT_IMAGE =
  "https://customer-assets.emergentagent.com/job_projexino-hub/artifacts/k85zxnvo_cropped-projexino-scaled-1-768x358%20%281%29.png";

function setOrCreateMeta(selector, attrs) {
  let el = document.head.querySelector(selector);
  const created = !el;
  if (!el) {
    el = document.createElement("meta");
    Object.keys(attrs)
      .filter((k) => k !== "content")
      .forEach((k) => el.setAttribute(k, attrs[k]));
    document.head.appendChild(el);
  }
  if (attrs.content != null) el.setAttribute("content", attrs.content);
  if (created) el.setAttribute("data-seo-managed", "true");
  return el;
}

function setOrCreateLink(rel, href, extraAttrs = {}) {
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  const created = !el;
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
  Object.keys(extraAttrs).forEach((k) => el.setAttribute(k, extraAttrs[k]));
  if (created) el.setAttribute("data-seo-managed", "true");
  return el;
}

export default function SEO({
  title,
  description,
  canonical,
  image,
  keywords,
  noindex = false,
  jsonLd,
  ogType = "website",
  locale = "en_US",
}) {
  useEffect(() => {
    const fullTitle = title
      ? title.includes("Projexino")
        ? title
        : `${title} | Projexino`
      : "Projexino — Engineering the Future of Operations";
    const fullDesc =
      description ||
      "Projexino — AI-driven, cross-platform app development & SaaS engineering. Transforming ideas into digital reality.";
    const url = canonical
      ? canonical.startsWith("http")
        ? canonical
        : `${SITE_URL}${canonical.startsWith("/") ? canonical : "/" + canonical}`
      : SITE_URL;
    const img = image || DEFAULT_IMAGE;
    const kw =
      keywords && keywords.length
        ? Array.isArray(keywords)
          ? keywords.join(", ")
          : keywords
        : null;

    document.title = fullTitle;

    setOrCreateMeta('meta[name="description"]', { name: "description", content: fullDesc });
    if (kw) setOrCreateMeta('meta[name="keywords"]', { name: "keywords", content: kw });
    setOrCreateMeta('meta[name="robots"]', {
      name: "robots",
      content: noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
    });
    setOrCreateMeta('meta[name="googlebot"]', {
      name: "googlebot",
      content: noindex ? "noindex" : "index, follow",
    });

    setOrCreateLink("canonical", url);

    // Open Graph
    setOrCreateMeta('meta[property="og:type"]', { property: "og:type", content: ogType });
    setOrCreateMeta('meta[property="og:title"]', { property: "og:title", content: fullTitle });
    setOrCreateMeta('meta[property="og:description"]', { property: "og:description", content: fullDesc });
    setOrCreateMeta('meta[property="og:url"]', { property: "og:url", content: url });
    setOrCreateMeta('meta[property="og:image"]', { property: "og:image", content: img });
    setOrCreateMeta('meta[property="og:site_name"]', { property: "og:site_name", content: "Projexino" });
    setOrCreateMeta('meta[property="og:locale"]', { property: "og:locale", content: locale });

    // Twitter
    setOrCreateMeta('meta[name="twitter:card"]', { name: "twitter:card", content: "summary_large_image" });
    setOrCreateMeta('meta[name="twitter:title"]', { name: "twitter:title", content: fullTitle });
    setOrCreateMeta('meta[name="twitter:description"]', { name: "twitter:description", content: fullDesc });
    setOrCreateMeta('meta[name="twitter:image"]', { name: "twitter:image", content: img });
    setOrCreateMeta('meta[name="twitter:site"]', { name: "twitter:site", content: "@projexino" });

    // JSON-LD blocks — managed via data-seo-jsonld attr so we can swap on route change
    document.head
      .querySelectorAll('script[data-seo-jsonld="page"]')
      .forEach((s) => s.remove());
    const blocks = Array.isArray(jsonLd) ? jsonLd : jsonLd ? [jsonLd] : [];
    blocks.forEach((block) => {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.setAttribute("data-seo-jsonld", "page");
      script.text = JSON.stringify(block);
      document.head.appendChild(script);
    });

    return () => {
      // We intentionally don't remove generic meta tags here — leaving last-known
      // values is better than blanking them during route transitions. The next
      // SEO mount overwrites them.
      document.head
        .querySelectorAll('script[data-seo-jsonld="page"]')
        .forEach((s) => s.remove());
    };
  }, [title, description, canonical, image, JSON.stringify(keywords), noindex, JSON.stringify(jsonLd), ogType, locale]);

  return null;
}

export { SITE_URL, DEFAULT_IMAGE };
