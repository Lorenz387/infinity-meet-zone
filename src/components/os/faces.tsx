import { useEffect, useRef } from "react";

export function Face({ stream, muted, mirror, name }: { stream: MediaStream | null; muted: boolean; mirror?: boolean; name: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.srcObject = stream;
    if (stream) void node.play().catch(() => {});
    return () => {
      node.srcObject = null;
    };
  }, [stream]);
  return (
    <figure className="relative h-28 w-40 shrink-0 overflow-hidden rounded-2xl border border-line bg-ink">
      {stream ? (
        <video ref={ref} autoPlay playsInline muted={muted} className={`h-full w-full object-cover ${mirror ? "-scale-x-100" : ""}`} />
      ) : (
        <div className="grid h-full place-items-center text-sm text-mist">{name.slice(0, 1).toUpperCase()}</div>
      )}
      <figcaption className="absolute inset-x-2 bottom-2 truncate text-xs text-paper">{name}</figcaption>
    </figure>
  );
}
