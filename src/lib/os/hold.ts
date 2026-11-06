let held: string | null = null;
const listeners = new Set<() => void>();

export function getHold() {
  return held;
}

export function holdCall(code: string) {
  if (held === code) return;
  held = code;
  listeners.forEach((listen) => listen());
}

export function dropCall() {
  if (!held) return;
  held = null;
  listeners.forEach((listen) => listen());
}

export function subscribeHold(listen: () => void) {
  listeners.add(listen);
  return () => listeners.delete(listen);
}
