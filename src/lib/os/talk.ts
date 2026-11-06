export type TalkShare = { name: string; words: number; share: number };

export function talkShares(lines: { name: string; text: string }[]): TalkShare[] {
  const counts = new Map<string, number>();
  for (const line of lines) {
    const name = line.name.trim() || "Gast";
    const words = line.text.trim().split(/\s+/).filter(Boolean).length;
    if (!words) continue;
    counts.set(name, (counts.get(name) ?? 0) + words);
  }
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  if (!total) return [];
  return [...counts.entries()]
    .map(([name, words]) => ({ name, words, share: Math.round((words / total) * 100) }))
    .sort((a, b) => b.words - a.words)
    .slice(0, 6);
}
