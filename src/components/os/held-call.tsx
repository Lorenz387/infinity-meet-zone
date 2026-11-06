import { useEffect, useState } from "react";
import { useSyncExternalStore } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Call } from "@/components/meet/call";
import { publishCmd, subscribeMeeting, type MeetingNote } from "@/lib/os/bus";
import { getHold, subscribeHold } from "@/lib/os/hold";
import { forgetReturn, getReturn, subscribeReturn } from "@/lib/os/return";
import { THEME } from "@/lib/os/theme";

export function HeldCall() {
  const code = useSyncExternalStore(subscribeHold, getHold, () => null);
  const path = useRouterState({ select: (state) => state.location.pathname });
  if (!code) {
    return (
      <>
        <ForeignMeeting />
        <ReturnBar path={path} />
      </>
    );
  }
  const foreground = path === `/r/${code}`;
  return (
    <div className={foreground ? "fixed inset-0 z-40 bg-ink" : "pointer-events-none fixed inset-0 -z-10 opacity-0"}>
      <Call code={code} docked={!foreground} />
    </div>
  );
}

function ReturnBar({ path }: { path: string }) {
  const held = useSyncExternalStore(subscribeHold, getHold, () => null);
  const mark = useSyncExternalStore(subscribeReturn, getReturn, () => null);
  const [note, setNote] = useState<MeetingNote | null>(null);
  const [now, setNow] = useState(0);
  useEffect(() => subscribeMeeting(setNote), []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 2000);
    return () => window.clearInterval(timer);
  }, []);
  const foreignLive = !!note?.active && (now === 0 || now - note.at < 8000);
  if (held || foreignLive || !mark || path === `/r/${mark.code}`) return null;
  return (
    <div className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-2">
      <p className="min-w-0 flex-1 truncate text-sm text-paper">
        {THEME} {mark.code} war offen
      </p>
      <Link to="/r/$code" params={{ code: mark.code }} className="grid h-10 shrink-0 place-items-center rounded-full bg-copper px-3 text-sm font-medium text-ink">
        Zurück
      </Link>
      <button type="button" onClick={forgetReturn} className="h-10 shrink-0 rounded-full border border-line px-3 text-sm text-paper">
        Weg
      </button>
    </div>
  );
}

function ForeignMeeting() {
  const held = useSyncExternalStore(subscribeHold, getHold, () => null);
  const [note, setNote] = useState<MeetingNote | null>(null);
  const [now, setNow] = useState(0);
  useEffect(() => subscribeMeeting(setNote), []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 2000);
    return () => window.clearInterval(timer);
  }, []);
  if (held || !note?.active || now - note.at > 8000) return null;
  const live = note;
  return (
    <div className="fixed inset-x-3 bottom-20 z-50 flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-2">
      <p className="min-w-0 flex-1 truncate text-sm text-paper">
        {THEME} {live.code} läuft in einem anderen Fenster · {live.people} {live.people === 1 ? "Person" : "Personen"}
      </p>
      <button
        type="button"
        onClick={() => publishCmd({ type: "meeting-cmd", code: live.code, cmd: "mic" })}
        className="h-10 shrink-0 rounded-full border border-line px-3 text-sm text-paper"
      >
        {live.mic ? "Stumm" : "Ton an"}
      </button>
      <Link to="/r/$code" params={{ code: live.code }} className="grid h-10 shrink-0 place-items-center rounded-full bg-copper px-3 text-sm font-medium text-ink">
        Raum
      </Link>
      <button
        type="button"
        onClick={() => publishCmd({ type: "meeting-cmd", code: live.code, cmd: "hang" })}
        className="h-10 shrink-0 rounded-full border border-line px-3 text-sm text-paper"
      >
        Auflegen
      </button>
    </div>
  );
}
