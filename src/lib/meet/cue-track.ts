import { useEffect, useState } from "react";

function wrapText(ctx: CanvasRenderingContext2D, text: string, max: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > max) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(0, 2);
}

export function useCueTrack(camera: MediaStreamTrack | null, text: string) {
  const [track, setTrack] = useState<MediaStreamTrack | null>(null);
  useEffect(() => {
    const line = text.trim();
    if (!camera || !line || typeof HTMLCanvasElement === "undefined") {
      setTrack(null);
      return;
    }
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = new MediaStream([camera]);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx || !canvas.captureStream) {
      setTrack(null);
      return;
    }
    let frame = 0;
    let stopped = false;
    const draw = () => {
      if (stopped) return;
      const width = video.videoWidth || 640;
      const height = video.videoHeight || 360;
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      ctx.drawImage(video, 0, 0, width, height);
      const size = Math.max(22, Math.round(height * 0.05));
      ctx.font = `600 ${size}px Outfit, sans-serif`;
      const rows = wrapText(ctx, line, width - 48);
      const bar = Math.round(size * (rows.length + 1.2));
      ctx.fillStyle = "rgba(16,20,16,0.78)";
      ctx.fillRect(0, height - bar, width, bar);
      ctx.fillStyle = "#f3efe4";
      ctx.textBaseline = "top";
      rows.forEach((row, index) => ctx.fillText(row, 24, height - bar + size * 0.45 + index * (size + 6), width - 48));
      frame = requestAnimationFrame(draw);
    };
    void video.play().then(() => {
      if (!stopped) frame = requestAnimationFrame(draw);
    }).catch(() => {});
    const next = canvas.captureStream(15).getVideoTracks()[0] ?? null;
    setTrack(next);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      next?.stop();
      video.srcObject = null;
    };
  }, [camera, text]);
  return track;
}
