export type TranscriptWord = {
  text: string;
  start: number;
  end: number;
  speaker?: number;
};

export type TranscriptCue = {
  start: number;
  end: number;
  text: string;
  speaker?: number;
};

export function wordsToCues(words: TranscriptWord[], fallbackText: string): TranscriptCue[] {
  const clean = words.filter(
    (word) => word.text.trim() && Number.isFinite(word.start) && Number.isFinite(word.end),
  );
  if (!clean.length) {
    const text = fallbackText.trim();
    return text ? [{ start: 0, end: 0, text }] : [];
  }
  const cues: TranscriptCue[] = [];
  let buf: TranscriptWord[] = [];
  const flush = () => {
    if (!buf.length) return;
    const text = buf
      .map((word) => word.text.trim())
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const first = buf[0];
    const last = buf[buf.length - 1];
    if (text && first && last) {
      cues.push({
        start: first.start,
        end: last.end,
        text,
        ...(first.speaker === undefined ? {} : { speaker: first.speaker }),
      });
    }
    buf = [];
  };
  for (const word of clean) {
    const prev = buf[buf.length - 1];
    const joined = buf.map((item) => item.text).join(" ");
    const gap = prev ? word.start - prev.end : 0;
    const split =
      !!prev &&
      (prev.speaker !== word.speaker || gap > 0.85 || /[.!?…]$/.test(prev.text) || joined.length > 160);
    if (split) flush();
    buf.push(word);
  }
  flush();
  return cues;
}

export function formatStamp(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}
