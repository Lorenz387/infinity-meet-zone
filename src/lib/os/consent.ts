const KEY = "arc-consent-v1";

export type Consent = "necessary" | "all";

export function readConsent(): Consent | "" {
  if (typeof window === "undefined") return "";
  try {
    const value = window.localStorage.getItem(KEY);
    return value === "necessary" || value === "all" ? value : "";
  } catch {
    return "";
  }
}

export function saveConsent(value: Consent) {
  window.localStorage.setItem(KEY, value);
  window.dispatchEvent(new Event("arc-consent"));
}

/** Optional analysis may start only after an explicit yes. Nothing in this app calls it. */
export function mayUseOptional() {
  return readConsent() === "all";
}
