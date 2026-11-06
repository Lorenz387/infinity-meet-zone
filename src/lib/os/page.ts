const KEY = "arc-page-v1";

export function cleanPageUrl(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const withProto = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withProto);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function loadPageUrl() {
  if (typeof localStorage === "undefined") return "";
  return cleanPageUrl(localStorage.getItem(KEY) || "") || "";
}

export function savePageUrl(raw: string) {
  const url = cleanPageUrl(raw);
  if (!url) return "";
  localStorage.setItem(KEY, url);
  window.dispatchEvent(new Event("arc-page"));
  return url;
}
