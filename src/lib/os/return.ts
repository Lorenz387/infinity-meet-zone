const KEY = "arc-return-v1";
const MAX_AGE = 12 * 60 * 60 * 1000;

export type ReturnMark = { code: string; at: number };

let mark: ReturnMark | null | undefined;
const listeners = new Set<() => void>();

export function parseReturn(raw: string | null, now = Date.now()): ReturnMark | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as { code?: unknown; at?: unknown };
    if (typeof data.code !== "string" || !/^[a-z0-9]{4,12}$/.test(data.code)) return null;
    if (typeof data.at !== "number" || !Number.isFinite(data.at)) return null;
    if (data.at > now + 60_000 || now - data.at > MAX_AGE) return null;
    return { code: data.code, at: data.at };
  } catch {
    return null;
  }
}

function read(): ReturnMark | null {
  if (typeof localStorage === "undefined") return null;
  if (mark !== undefined) return mark;
  mark = parseReturn(localStorage.getItem(KEY));
  if (!mark) localStorage.removeItem(KEY);
  return mark;
}

function emit() {
  listeners.forEach((listen) => listen());
}

export function getReturn() {
  return read();
}

export function rememberReturn(code: string) {
  if (typeof localStorage === "undefined") return;
  if (!/^[a-z0-9]{4,12}$/.test(code)) return;
  read();
  const same = mark?.code === code;
  mark = { code, at: Date.now() };
  localStorage.setItem(KEY, JSON.stringify(mark));
  if (!same) emit();
}

export function forgetReturn() {
  if (typeof localStorage === "undefined") return;
  read();
  if (!mark) return;
  mark = null;
  localStorage.removeItem(KEY);
  emit();
}

export function subscribeReturn(listen: () => void) {
  listeners.add(listen);
  return () => listeners.delete(listen);
}
