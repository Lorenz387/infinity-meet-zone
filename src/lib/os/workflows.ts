import { clipThought, showThought, type ThoughtVia } from "@/lib/os/thoughts";
import { keepNow, readKept } from "@/lib/os/keep";

export type Flow = { id: string; name: string; steps: string[]; index: number; at: number };

const KEY = "arc-workflows-v1";
const listeners = new Set<() => void>();
let seq = 0;

function asFlow(value: unknown): Flow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Flow;
  const name = typeof row.name === "string" ? clipThought(row.name).slice(0, 40) : "";
  const steps = Array.isArray(row.steps) ? row.steps.map((step) => (typeof step === "string" ? clipThought(step) : "")).filter(Boolean).slice(0, 12) : [];
  if (!name || !steps.length || typeof row.id !== "string") return null;
  const index = typeof row.index === "number" ? Math.max(0, Math.min(steps.length - 1, Math.floor(row.index))) : 0;
  return { id: row.id.slice(0, 40), name, steps, index, at: typeof row.at === "number" ? row.at : Date.now() };
}

function read(): Flow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(readKept(KEY) || "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.map(asFlow).filter((item): item is Flow => !!item).slice(0, 8);
  } catch {
    return [];
  }
}

function write(items: Flow[]) {
  keepNow(KEY, JSON.stringify(items.slice(0, 8)));
  listeners.forEach((listen) => listen());
}

export function listFlows() {
  return read();
}

export function subscribeFlows(listen: () => void) {
  listeners.add(listen);
  return () => listeners.delete(listen);
}

export function parseSteps(raw: string) {
  return raw
    .split(/\n|\|/)
    .map((part) => clipThought(part))
    .filter(Boolean)
    .slice(0, 12);
}

export function addFlow(name: string, steps: string[]): Flow | null {
  const cleanName = clipThought(name).slice(0, 40);
  const cleanSteps = steps.map((step) => clipThought(step)).filter(Boolean).slice(0, 12);
  if (!cleanName || cleanSteps.length === 0) return null;
  seq += 1;
  const flow: Flow = { id: `w-${Date.now().toString(36)}-${seq.toString(36)}`, name: cleanName, steps: cleanSteps, index: 0, at: Date.now() };
  write([flow, ...read()].slice(0, 8));
  return flow;
}

export function currentStep(flow: Flow) {
  return flow.steps[Math.min(flow.index, flow.steps.length - 1)] ?? "";
}

export function playFlow(id: string, via: ThoughtVia) {
  const flow = read().find((item) => item.id === id);
  if (!flow) return null;
  const text = currentStep(flow);
  if (!text) return null;
  return showThought(text, via);
}

export function moveFlow(id: string, to: "next" | "start") {
  const items = read();
  const flow = items.find((item) => item.id === id);
  if (!flow) return null;
  flow.index = to === "start" ? 0 : Math.min(flow.steps.length - 1, flow.index + 1);
  flow.at = Date.now();
  write(items);
  return flow;
}

export function removeFlow(id: string) {
  write(read().filter((item) => item.id !== id));
}

export function latestFlow() {
  return read()
    .slice()
    .sort((a, b) => b.at - a.at)[0] ?? null;
}

export function exportFlows() {
  return read();
}

export function importFlows(value: unknown) {
  if (!Array.isArray(value)) return 0;
  const incoming = value.map(asFlow).filter((item): item is Flow => !!item);
  const by = new Map(read().map((item) => [item.id, item]));
  let added = 0;
  for (const flow of incoming) {
    const prev = by.get(flow.id);
    if (!prev) added += 1;
    if (!prev || flow.at >= prev.at) by.set(flow.id, flow);
  }
  write([...by.values()].sort((a, b) => b.at - a.at).slice(0, 8));
  return added;
}
