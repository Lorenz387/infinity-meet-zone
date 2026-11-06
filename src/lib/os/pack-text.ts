export type TextPack = {
  at: number;
  jobs: { client: string; room: string; line: string }[];
  sessions: { room: string; label: string }[];
  rooms: {
    room: string;
    memory: {
      now: string;
      cue: string;
      decided: { title: string; by: string }[];
      heard: { name: string; text: string }[];
      tasks: { title: string; done: boolean }[];
    };
  }[];
  talk: { who: string; text: string }[];
};

export function packText(pack: TextPack) {
  const lines = ["Infinity-Meet-Zone", `Stand: ${new Date(pack.at).toISOString().slice(0, 16).replace("T", " ")}`, ""];
  if (pack.jobs.length) {
    lines.push("Aufträge");
    for (const job of pack.jobs) lines.push(`- ${job.client} · ${job.room}${job.line ? ` · ${job.line}` : ""}`);
    lines.push("");
  }
  if (pack.sessions.length) {
    lines.push("Offene Sitzungen");
    for (const session of pack.sessions) lines.push(`- ${session.label} (${session.room})`);
    lines.push("");
  }
  for (const room of pack.rooms) {
    lines.push(`Akte ${room.room}`);
    if (room.memory.now) lines.push(`Jetzt: ${room.memory.now}`);
    for (const item of room.memory.decided) lines.push(`Entschieden: ${item.title}${item.by ? ` · ${item.by}` : ""}`);
    for (const line of room.memory.heard) lines.push(`${line.name || "Gast"}: ${line.text}`);
    for (const task of room.memory.tasks) lines.push(`${task.done ? "Fertig" : "Offen"}: ${task.title}`);
    if (room.memory.cue) lines.push(`Satz: ${room.memory.cue}`);
    lines.push("");
  }
  if (pack.talk.length) {
    lines.push("Tageszone");
    for (const turn of pack.talk) lines.push(`${turn.who}: ${turn.text}`);
    lines.push("");
  }
  if (!pack.jobs.length && !pack.rooms.length && !pack.sessions.length && !pack.talk.length) lines.push("Noch nichts gespeichert.");
  return `${lines.join("\n").trim()}\n`;
}
