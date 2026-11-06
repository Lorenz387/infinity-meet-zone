import { useEffect, useState, type ReactNode } from "react";
import { Hand, Heart, MicOff, PartyPopper, Pin, Sparkles, ThumbsUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { initial } from "@/lib/meet/media";
import type { ReactionKind } from "@/lib/meet/use-call";

const REACTION_ICON = {
  up: ThumbsUp,
  heart: Heart,
  clap: PartyPopper,
  spark: Sparkles,
} as const;

export function useSpeaking(stream: MediaStream | null) {
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    const tracks = stream?.getAudioTracks().filter((track) => track.readyState === "live" && track.enabled) ?? [];
    if (!tracks.length) {
      setSpeaking(false);
      return;
    }
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    const source = ctx.createMediaStreamSource(new MediaStream(tracks));
    source.connect(analyser);
    const bins = new Uint8Array(analyser.frequencyBinCount);
    let hot = false;
    let last = 0;
    let frame = 0;
    const loop = () => {
      analyser.getByteFrequencyData(bins);
      let sum = 0;
      for (let i = 0; i < bins.length; i += 1) sum += bins[i] ?? 0;
      const level = sum / bins.length / 170;
      const next = hot ? level > 0.055 : level > 0.09;
      const time = performance.now();
      if (next !== hot && time - last > 140) {
        hot = next;
        last = time;
        setSpeaking(next);
      }
      frame = requestAnimationFrame(loop);
    };
    void ctx.resume();
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      source.disconnect();
      void ctx.close();
    };
  }, [stream]);
  return speaking;
}

function StreamVideo({ stream, muted, mirror, hidden }: { stream: MediaStream; muted: boolean; mirror: boolean; hidden: boolean }) {
  const [node, setNode] = useState<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (!node) return;
    node.srcObject = stream;
    void node.play().catch(() => {});
    return () => {
      node.srcObject = null;
    };
  }, [node, stream]);
  return (
    <video
      ref={setNode}
      autoPlay
      playsInline
      muted={muted}
      data-muted={muted ? "1" : "0"}
      className={cn("h-full w-full object-cover", hidden && "absolute inset-0 opacity-0", mirror && !hidden && "mirror")}
    />
  );
}

export function Tile({
  name,
  stream,
  speakingStream,
  muted,
  mirror,
  showVideo,
  mic,
  hand,
  status,
  reactions,
  pinned,
  onPin,
  children,
}: {
  name: string;
  stream: MediaStream | null;
  speakingStream: MediaStream | null;
  muted: boolean;
  mirror?: boolean;
  showVideo: boolean;
  mic: boolean;
  hand: boolean;
  status?: string | null;
  reactions: { id: string; kind: ReactionKind }[];
  pinned?: boolean;
  onPin?: () => void;
  children?: ReactNode;
}) {
  const speaking = useSpeaking(speakingStream);
  const audible = !!stream && stream.getAudioTracks().length > 0;
  return (
    <article
      className={cn(
        "relative flex h-full min-h-40 flex-col overflow-hidden rounded-2xl border border-line bg-raised",
        speaking && "ring-2 ring-copper",
        pinned && !speaking && "ring-2 ring-paper",
      )}
    >
      <div className="relative min-h-0 flex-1">
        {stream && (showVideo || audible) ? (
          <StreamVideo stream={stream} muted={muted} mirror={!!mirror} hidden={!showVideo} />
        ) : null}
        {!showVideo ? (
          <div className="grid h-full min-h-40 place-items-center">
            <span className="grid size-20 place-items-center rounded-full border border-line bg-panel font-display text-3xl text-paper">
              {initial(name)}
            </span>
          </div>
        ) : null}
        {children}
        {status ? (
          <p className="absolute left-3 top-3 rounded-full bg-ink/80 px-2.5 py-1 text-sm text-mist">{status}</p>
        ) : null}
        <div className="pointer-events-none absolute inset-x-0 bottom-16 flex justify-center gap-3">
          {reactions.map((reaction) => {
            const Icon = REACTION_ICON[reaction.kind];
            return (
              <span key={reaction.id} className="float-up grid size-10 place-items-center rounded-full border border-line bg-ink text-copper">
                <Icon className="size-4" />
              </span>
            );
          })}
        </div>
      </div>
      <div className="absolute inset-x-3 bottom-3 flex items-center gap-2">
        <p className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-ink/85 px-2.5 py-1.5 text-sm text-paper">
          {!mic ? <MicOff className="size-3.5 shrink-0 text-mist" aria-hidden /> : null}
          {hand ? <Hand className="size-3.5 shrink-0 text-copper" aria-hidden /> : null}
          <span className="truncate">{name}</span>
        </p>
        {onPin ? (
          <button
            type="button"
            onClick={onPin}
            aria-label={pinned ? "Anpinnen lösen" : "Anpinnen"}
            aria-pressed={pinned}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-ink/85 text-paper transition-transform duration-150 ease-out active:scale-[0.96]"
          >
            <Pin className="size-4" />
          </button>
        ) : null}
      </div>
    </article>
  );
}
