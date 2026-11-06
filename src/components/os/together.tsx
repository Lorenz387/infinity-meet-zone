import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getCue, setCue, subscribeCue } from "@/lib/os/cue";
import { getDraft, putDraft } from "@/lib/os/drafts";
import { loadProfile } from "@/lib/os/arcy";
import { getHold, subscribeHold } from "@/lib/os/hold";
import { useJobs } from "@/lib/os/jobs";
import { nextCode } from "@/lib/os/room-fill";
import { getShare, joinShare, leaveShare, savedShareRoom, useShare } from "@/lib/os/share";
import { startVoice, stopVoice, toggleVoiceCam, toggleVoiceMic, useVoice, VOICE_LIMIT } from "@/lib/os/voice";
import { Face } from "@/components/os/faces";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { THEME } from "@/lib/os/theme";

export function Together({ roomHint = "", compact = false }: { roomHint?: string; compact?: boolean }) {
  const share = useShare();
  const jobs = useJobs();
  const voice = useVoice();
  const held = useSyncExternalStore(subscribeHold, getHold, () => null);
  const [code, setCode] = useState(roomHint);
  const [who, setWho] = useState("");
  const [line, setLine] = useState("");
  const [warn, setWarn] = useState("");
  const [fromJob, setFromJob] = useState(false);
  const flags = useRef({ touched: false, joined: false, restored: false, imported: "", ready: false });
  const account = useCurrentUser();
  const accountName = account && !account.isDevFallback ? account.displayName?.trim() || "" : "";

  useEffect(() => {
    if (!accountName) return;
    setWho(accountName);
    putDraft("togetherName", accountName);
  }, [accountName]);

  useEffect(() => {
    if (share.room) setCode(share.room);
  }, [share.room]);

  useEffect(() => {
    const saved = savedShareRoom();
    if (!saved) return;
    return joinShare(saved, loadProfile().address || "Gast");
  }, []);

  useEffect(() => {
    if (!flags.current.ready) {
      flags.current.restored = Boolean(savedShareRoom());
      flags.current.ready = true;
    }
    if (share.room) flags.current.joined = true;
    if (compact || roomHint) return;
    const next = nextCode(
      {
        code,
        touched: flags.current.touched,
        joined: flags.current.joined,
        restored: flags.current.restored,
        imported: flags.current.imported,
      },
      jobs,
    );
    flags.current.imported = next.imported;
    if (next.code !== code) setCode(next.code);
    setFromJob(!flags.current.touched && !flags.current.joined && !flags.current.restored && next.imported !== "" && next.code === next.imported);
  }, [jobs, code, share.room, compact, roomHint]);

  useEffect(() => {
    const pull = () => setLine(getCue());
    pull();
    return subscribeCue(pull);
  }, []);

  useEffect(() => {
    setWho((current) => current || getDraft("togetherName") || loadProfile().address || "");
    setCode((current) => current || roomHint);
  }, [roomHint]);

  const names = share.people.map((person) => person.name).filter(Boolean);

  return (
    <div className={compact ? "flex flex-wrap items-center gap-2 px-3 pb-2" : "mt-4 rounded-2xl border border-line bg-panel p-4"}>
      {compact || share.room ? null : (
        <>
          <p className="text-xs text-mist">Gemeinsam</p>
          <p className="mt-1 text-sm text-paper">Bis zu 8 Personen im selben Code. Aufträge, Protokolle und Zettel sind sofort bei allen. Ton und Bild gehen an bis zu 6. Dateien und die Reflexion bleiben hier.</p>
        </>
      )}
      <div className={compact ? "contents" : "mt-3 flex flex-wrap gap-2"}>
        <label className="sr-only" htmlFor="together-name">Dein Name</label>
        <input
          id="together-name"
          value={accountName || who}
          readOnly={Boolean(accountName)}
          onChange={(event) => {
            if (accountName) return;
            setWho(event.target.value);
            putDraft("togetherName", event.target.value);
          }}
          placeholder="Dein Name"
          className="h-11 w-32 rounded-full border border-line bg-ink px-4 text-sm text-paper"
        />
        <label className="sr-only" htmlFor="together-code">Code</label>
        <input
          id="together-code"
          value={code}
          onChange={(event) => {
            flags.current.touched = true;
            setFromJob(false);
            setCode(event.target.value);
          }}
          placeholder="Code"
          className="h-11 w-36 rounded-full border border-line bg-ink px-4 text-sm text-paper"
        />
        {share.room ? (
          <button type="button" onClick={() => leaveShare()} className="h-11 rounded-full border border-line px-4 text-sm text-paper">
            Allein
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              joinShare(code, accountName || who || "Gast");
              setWarn(getShare().room ? "" : "Der Code braucht mindestens 4 Zeichen.");
            }}
            className="h-11 rounded-full bg-copper px-4 text-sm font-medium text-ink"
          >
            Dabei
          </button>
        )}
      </div>
      {warn ? <p className="mt-2 text-sm text-copper">{warn}</p> : null}
      {fromJob && !share.room ? <p className={compact ? "text-sm text-mist" : "mt-2 text-sm text-mist"}>Code aus dem Auftrag. Dabei tritt bei.</p> : null}
      {share.note ? <p className={compact ? "text-sm text-copper" : "mt-2 text-sm text-copper"}>{share.note}</p> : null}
      {share.status === "error" && !share.note ? <p className="mt-2 text-sm text-copper">Die gemeinsame Sitzung ist gerade nicht erreichbar. Deine Daten bleiben auf diesem Rechner.</p> : null}
      {share.status === "live" ? (
        <p className={compact ? "text-sm text-mist" : "mt-2 text-sm text-mist"}>
          {share.people.length} {share.people.length === 1 ? "Person" : "Personen"} in {share.room}
          {names.length ? `: ${names.join(", ")}` : ""}
        </p>
      ) : null}
      {share.room && !line.trim() ? <p className={compact ? "text-sm text-mist" : "mt-2 text-sm text-mist"}>Noch kein Satz.</p> : null}
      {share.room ? (
        <form
          className={compact ? "contents" : "mt-3 flex gap-2"}
          onSubmit={(event) => {
            event.preventDefault();
            setCue(line);
          }}
        >
          <input value={line} onChange={(event) => setLine(event.target.value)} placeholder="Satz für alle" className="h-11 min-w-0 flex-1 rounded-full border border-line bg-ink px-4 text-sm text-paper" />
          <button type="submit" className="h-11 rounded-full border border-line px-3 text-sm text-paper">
            Senden
          </button>
        </form>
      ) : null}
      {!compact && share.room && held ? <p className="mt-3 text-sm text-mist">Ton und Bild laufen in {THEME}.</p> : null}
      {!compact && share.room && !held ? (
        <div className="mt-3">
          {voice.live ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void toggleVoiceMic()} className="h-11 rounded-full border border-line px-4 text-sm text-paper">
                {voice.mic ? "Ton aus" : "Ton an"}
              </button>
              <button type="button" onClick={() => void toggleVoiceCam()} className="h-11 rounded-full border border-line px-4 text-sm text-paper">
                {voice.cam ? "Kamera aus" : "Kamera an"}
              </button>
              <button type="button" onClick={() => stopVoice()} className="h-11 rounded-full border border-line px-4 text-sm text-paper">
                Auflegen
              </button>
            </div>
          ) : (
            <>
              {voice.note ? null : <p className="text-sm text-mist">{VOICE_LIMIT}</p>}
              <button type="button" onClick={() => void startVoice(share.room, who || "Gast")} className="mt-2 h-11 rounded-full bg-copper px-4 text-sm font-medium text-ink">
                Ton und Bild
              </button>
            </>
          )}
          {voice.note ? <p className="mt-2 text-sm text-copper">{voice.note}</p> : null}
          {voice.live ? (
            <div className="mt-3 flex gap-2 overflow-x-auto">
              <Face stream={voice.cam ? voice.self : null} muted mirror name="Du" />
              {voice.peers.map((peer) => (
                <Face key={peer.id} stream={peer.stream} muted={false} name={peer.name} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
