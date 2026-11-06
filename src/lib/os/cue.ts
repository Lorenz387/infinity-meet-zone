import { keepNow } from "@/lib/os/keep";
import { stripStealth } from "@/lib/os/guard";

const KEY = "arc-cue-v1";

type Stored = { text?: unknown; heldEmpty?: unknown };

function read(): { text: string; heldEmpty: boolean } {
  if (typeof window === "undefined") return { text: "", heldEmpty: false };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null") as Stored | null;
    return {
      text: typeof raw?.text === "string" ? raw.text.slice(0, 140) : "",
      heldEmpty: raw?.heldEmpty === true,
    };
  } catch {
    return { text: "", heldEmpty: false };
  }
}

const stored = read();
let text = stored.text;
let heldEmpty = stored.heldEmpty;
const listeners = new Set<() => void>();

function persist() {
  if (typeof window === "undefined") return;
  keepNow(KEY, JSON.stringify({ text, heldEmpty }));
}

function emit() {
  persist();
  listeners.forEach((listen) => listen());
  if (typeof window !== "undefined") window.dispatchEvent(new Event("arc-cue"));
}

export function getCue() {
  return text;
}

export function setCue(next: string) {
  const clean = stripStealth(next).trim().slice(0, 140);
  heldEmpty = clean === "";
  if (text === clean && heldEmpty === (clean === "")) {
    persist();
    return;
  }
  text = clean;
  emit();
}

export function ensureCue(fallback: string) {
  if (text || heldEmpty) return text;
  const clean = stripStealth(fallback).trim().slice(0, 140);
  if (!clean) return text;
  text = clean;
  emit();
  return text;
}

export function subscribeCue(listen: () => void) {
  listeners.add(listen);
  return () => {
    listeners.delete(listen);
  };
}
