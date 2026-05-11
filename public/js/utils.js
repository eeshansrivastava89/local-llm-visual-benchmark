export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

export function escapeAttribute(value) {
  return escapeHtml(value);
}

export function formatBytes(value) {
  if (!Number.isFinite(value)) return "Unavailable";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return size.toFixed(unitIndex === 0 ? 0 : 1) + " " + units[unitIndex];
}

export function formatDate(value) {
  return value ? new Date(value).toLocaleString() : "-";
}

export function formatDateShort(value) {
  return value
    ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "-";
}

export function normalizeBaseUrlInput(value) {
  const trimmed = String(value || "").trim().replace(/\/+$/u, "");
  if (!trimmed) return "http://localhost:1234/v1";
  return trimmed.endsWith("/v1") ? trimmed : trimmed + "/v1";
}

export function uniqueBy(items, keyForItem) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyForItem(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
