import { addCard } from "@/lib/os/sheets";

const COMMIT = /\b(ich kümmere mich|ich übernehme|ich mache das|ich mach das|bis morgen|ich schreibe|ich liefere|mache ich)\b/i;
const seen = new Set<string>();

export function noteCommitment(room: string, line: { id: string; name: string; text: string }) {
  const text = line.text.trim();
  if (!COMMIT.test(text)) return "";
  const key = `${room}:${line.id}`;
  if (seen.has(key)) return "";
  seen.add(key);
  const title = text.slice(0, 80);
  addCard(room, {
    id: `task-${line.id}`,
    at: Date.now(),
    kind: "task",
    title,
    body: line.name.trim().slice(0, 40) || "Du",
  });
  return title;
}
