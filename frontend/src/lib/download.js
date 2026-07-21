/**
 * Cross-platform file download/share helpers.
 * Inside the Android TWA (Play Store app) blob-anchor downloads fail silently,
 * so on Android we hand the file to the native share sheet (user can save,
 * open, or send it to WhatsApp). Desktop keeps the classic anchor download.
 */
import { api } from "@/lib/api";

export const isAndroid = () => /Android/i.test(navigator.userAgent || "");

export async function saveOrShareBlob(blob, filename, mime = "application/pdf") {
  const file = new File([blob], filename, { type: mime });
  if (isAndroid() && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return "shared";
    } catch (e) {
      if (e?.name === "AbortError") return "cancelled";
      // fall through to anchor download
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return "downloaded";
}

export async function downloadApiPdf(path, filename) {
  const res = await api.get(path, { responseType: "blob" });
  return saveOrShareBlob(new Blob([res.data], { type: "application/pdf" }), filename);
}

const csvCell = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function downloadBrandedCsv({ filename, title, headers, rows }) {
  const lines = [
    "PROJEXINO SOLUTIONS PVT LTD",
    title,
    `Generated on,${new Date().toISOString().slice(0, 19).replace("T", " ")} UTC`,
    "projexino.com,billing@projexino.com",
    "",
    headers.map(csvCell).join(","),
    ...rows.map((r) => r.map(csvCell).join(",")),
    "",
    "© Projexino Solutions Pvt Ltd — confidential",
  ];
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  return saveOrShareBlob(blob, filename, "text/csv");
}
