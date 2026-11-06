export type OsScale = "base" | "read" | "large";

export type OsLook = { scale: OsScale; contrast: boolean; allow: boolean };

const KEY = "arc-look";

const BASE: OsLook = { scale: "base", contrast: false, allow: false };

export function loadLook(): OsLook {
  if (typeof window === "undefined") return BASE;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null") as Partial<OsLook> | null;
    if (!raw) return BASE;
    const scale: OsScale = raw.scale === "read" || raw.scale === "large" ? raw.scale : "base";
    return { scale, contrast: Boolean(raw.contrast), allow: Boolean(raw.allow) };
  } catch {
    return BASE;
  }
}

export function applyLook(next: OsLook) {
  const root = document.documentElement;
  if (next.scale === "base") root.removeAttribute("data-os-scale");
  else root.setAttribute("data-os-scale", next.scale);
  if (next.contrast) root.setAttribute("data-os-contrast", "sharp");
  else root.removeAttribute("data-os-contrast");
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("arc-look"));
}

export function patchLook(partial: Partial<OsLook>) {
  const current = loadLook();
  applyLook({
    scale: partial.scale ?? current.scale,
    contrast: partial.contrast ?? current.contrast,
    allow: partial.allow ?? current.allow,
  });
}

export function subscribeLook(onChange: () => void) {
  window.addEventListener("arc-look", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener("arc-look", onChange);
    window.removeEventListener("storage", onChange);
  };
}
