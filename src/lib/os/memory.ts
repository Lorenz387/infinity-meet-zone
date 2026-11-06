export type MemoryLine = { id: string; name: string; text: string; at: number };
export type MemoryTask = { id: string; title: string; body: string; done: boolean; at: number };
export type MemoryPoint = { id: string; title: string };
export type MemoryDecision = { id: string; title: string; by: string; at: number };

export type RoomMemory = {
  heard: MemoryLine[];
  tasks: MemoryTask[];
  covered: MemoryPoint[];
  decided: MemoryDecision[];
  now: string;
  cue: string;
  job: string;
  begun: boolean;
};

export const EMPTY_MEMORY: RoomMemory = { heard: [], tasks: [], covered: [], decided: [], now: "", cue: "", job: "", begun: false };

export function memoryEmpty(memory: RoomMemory) {
  return !memory.heard.length && !memory.tasks.length && !memory.covered.length && !memory.decided.length && !memory.now && !memory.cue && !memory.job;
}

export function noteGate(name: string, text: string) {
  const who = name.trim();
  const said = text.trim();
  if (!who || who === "Gast") return "Trag zuerst deinen Namen ein.";
  if (!said) return "Die Zeile ist leer.";
  return "";
}

function realName(name: string) {
  const who = name.trim();
  return who && who !== "Gast" ? who : "";
}

function mergeLine(prev: MemoryLine | undefined, next: MemoryLine): MemoryLine {
  if (!prev) return next;
  const prevWho = realName(prev.name);
  const nextWho = realName(next.name);
  if (prevWho && nextWho !== prevWho) return prev;
  if (next.at < prev.at) return prev;
  return { ...next, name: nextWho || prevWho || next.name || "Gast", text: next.text || prev.text };
}

function mergeTask(prev: MemoryTask | undefined, next: MemoryTask): MemoryTask {
  if (!prev) return next;
  if (next.at >= prev.at) return { ...next, done: prev.done || next.done, title: next.title || prev.title, body: next.body || prev.body };
  return { ...prev, done: prev.done || next.done };
}

export function claimMemory(base: RoomMemory, incoming: RoomMemory, writer: string): RoomMemory {
  const who = realName(writer);
  if (!who) return incoming;
  const heardPrev = new Map(base.heard.map((line) => [line.id, line]));
  const decidedPrev = new Map((base.decided ?? []).map((item) => [item.id, item]));
  const taskPrev = new Map(base.tasks.map((task) => [task.id, task]));
  const heard = incoming.heard.map((line) => {
    const prev = heardPrev.get(line.id);
    if (!prev || realName(prev.name) === who) return { ...line, name: who };
    return prev;
  });
  const decided = incoming.decided.map((item) => {
    const prev = decidedPrev.get(item.id);
    if (!prev) return { ...item, by: who };
    if (realName(prev.by) === who) return { ...item, by: who, title: item.title || prev.title };
    return prev;
  });
  const tasks = incoming.tasks.map((task) => {
    const owner = realName(decidedPrev.get(task.id)?.by ?? "");
    if (owner && owner !== who) return taskPrev.get(task.id) ?? { ...task, body: owner };
    if (task.done) return { ...task, body: who };
    return task;
  });
  return { ...incoming, heard, decided, tasks };
}

export function keepDecision(prev: MemoryDecision | undefined, next: MemoryDecision): MemoryDecision {
  if (!prev) return next;
  const prevWho = realName(prev.by);
  const nextWho = realName(next.by);
  if (prevWho && nextWho === prevWho && next.at >= prev.at) {
    return { ...next, by: prevWho, title: next.title || prev.title };
  }
  return prev;
}

export function mergeMemory(base: RoomMemory, incoming: RoomMemory): RoomMemory {
  const heard = new Map(base.heard.map((line) => [line.id, line]));
  for (const line of incoming.heard) heard.set(line.id, mergeLine(heard.get(line.id), line));
  const tasks = new Map(base.tasks.map((task) => [task.id, task]));
  for (const task of incoming.tasks) tasks.set(task.id, mergeTask(tasks.get(task.id), task));
  const covered = new Map(base.covered.map((point) => [point.id, point]));
  for (const point of incoming.covered) covered.set(point.id, point);
  const mergedTasks = [...tasks.values()];
  const decided = new Map<string, MemoryDecision>();
  for (const item of [...(base.decided ?? []), ...(incoming.decided ?? [])]) decided.set(item.id, keepDecision(decided.get(item.id), item));
  for (const task of mergedTasks) {
    if (!task.done) continue;
    decided.set(task.id, keepDecision(decided.get(task.id), { id: task.id, title: task.title, by: task.body, at: task.at }));
  }
  return {
    heard: [...heard.values()].sort((a, b) => a.at - b.at).slice(-16),
    tasks: mergedTasks.sort((a, b) => b.at - a.at).slice(0, 12),
    covered: [...covered.values()].slice(0, 8),
    decided: [...decided.values()].sort((a, b) => a.at - b.at).slice(0, 12),
    now: incoming.now || base.now,
    cue: incoming.cue || base.cue,
    job: incoming.job || base.job,
    begun: base.begun || incoming.begun,
  };
}