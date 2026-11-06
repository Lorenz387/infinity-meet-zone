import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Captions,
  Check,
  Copy,
  Hand,
  Heart,
  PartyPopper,
  ThumbsUp,
  LayoutGrid,
  ListChecks,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  Notebook,
  PanelsTopLeft,
  PhoneOff,
  Radio,
  RectangleHorizontal,
  ScrollText,
  Send,
  Settings2,
  Sparkles,
  Square,
  Video,
  VideoOff,
  Wand2,
  X,
} from "lucide-react";
import { Mark } from "@/components/meet/mark";
import { Tile } from "@/components/meet/tile";
import { ArcEngine } from "@/components/os/engine";
import { ArcPanel } from "@/components/os/panel";
import { cn } from "@/lib/cn";
import { clearAutostart, deviceLabel, formatElapsed, inviteUrl, linkLabel, primeCallDevices } from "@/lib/meet/media";
import { SPEECH_LANGS, TRANSLATE_LANGS } from "@/lib/meet/languages";
import { useCall, type ReactionKind } from "@/lib/meet/use-call";
import { emitArc, readHostCommand } from "@/lib/os/bridge";
import { ensureCue, getCue, setCue, subscribeCue } from "@/lib/os/cue";
import { getDraft, putDraft } from "@/lib/os/drafts";
import { Together } from "@/components/os/together";
import { AgendaBar, AgendaEditor } from "@/components/meet/agenda";
import { RoomMemory } from "@/components/meet/memory";
import { pushAgenda, readAgenda } from "@/lib/os/agenda";
import { currentLine } from "@/lib/os/routine";
import { publishMeeting, subscribeCmd } from "@/lib/os/bus";
import { dropCall, getHold } from "@/lib/os/hold";
import { rememberReturn, forgetReturn } from "@/lib/os/return";
import { THEME } from "@/lib/os/theme";
import { patchLook } from "@/lib/os/look";

const field =
  "w-full rounded-xl border border-line bg-ink px-3 py-3 text-base text-paper outline-none placeholder:text-mist";

const reactionChoices: { kind: ReactionKind; label: string; icon: typeof ThumbsUp }[] = [
  { kind: "up", label: "Daumen hoch", icon: ThumbsUp },
  { kind: "heart", label: "Herz", icon: Heart },
  { kind: "clap", label: "Applaus", icon: PartyPopper },
  { kind: "spark", label: "Funke", icon: Sparkles },
];

export function Call({ code, embedded = false, docked = false }: { code: string; embedded?: boolean; docked?: boolean }) {
  const navigate = useNavigate();
  const call = useCall(code);
  const [layout, setLayout] = useState<"gallery" | "focus">("gallery");
  const [pinned, setPinned] = useState<string | null>(null);
  const [panel, setPanel] = useState<"chat" | "ai" | "devices" | "script" | "arc" | null>(null);
  const [more, setMore] = useState(false);
  const [draft, setDraft] = useState("");
  const [question, setQuestion] = useState("");
  const [copied, setCopied] = useState(false);
  const [cueDraft, setCueDraft] = useState("");
  const [points, setPoints] = useState(0);
  const actions = useRef(call);
  actions.current = call;
  const forcedScreen = useRef(false);
  const chatEnd = useRef<HTMLDivElement>(null);
  const pendingContext = useRef(false);
  const dockedRef = useRef(docked);
  const shellRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef({ phase: call.phase, people: call.peers.length + 1, mic: call.micOn });
  dockedRef.current = docked;
  statusRef.current = { phase: call.phase, people: call.peers.length + 1, mic: call.micOn };

  useEffect(() => {
    if (docked) {
      document.title = THEME;
      return;
    }
    document.title = `${THEME} · ${code}`;
    return () => {
      document.title = THEME;
    };
  }, [code, docked]);

  useEffect(() => {
    if (call.phase === "live") ensureCue(currentLine());
  }, [call.phase]);

  useEffect(() => {
    const pull = () => setCueDraft(getCue());
    pull();
    return subscribeCue(pull);
  }, []);

  useEffect(() => {
    setDraft(getDraft(`chat:${code}`));
    setQuestion(getDraft(`ask:${code}`));
  }, [code]);

  function keepChat(value: string) {
    setDraft(value);
    putDraft(`chat:${code}`, value);
  }

  function keepAsk(value: string) {
    setQuestion(value);
    putDraft(`ask:${code}`, value);
  }

  useEffect(() => {
    if (embedded) return;
    const send = () => {
      const status = statusRef.current;
      publishMeeting({
        type: "meeting",
        active: status.phase === "live",
        code,
        people: status.phase === "live" ? status.people : 0,
        mic: status.mic,
        at: Date.now(),
      });
    };
    send();
    const timer = window.setInterval(send, 3000);
    return () => {
      window.clearInterval(timer);
      publishMeeting({ type: "meeting", active: false, code, people: 0, mic: false, at: Date.now() });
    };
  }, [embedded, code]);

  useEffect(() => {
    if (embedded || call.phase !== "live") return;
    rememberReturn(code);
    const timer = window.setInterval(() => rememberReturn(code), 60_000);
    return () => window.clearInterval(timer);
  }, [embedded, call.phase, code]);

  useEffect(() => {
    return subscribeCmd((cmd) => {
      if (cmd.code !== code) return;
      if (cmd.cmd === "mic") void actions.current.toggleMic();
      if (cmd.cmd === "hang") leave();
    });
  }, [code]);

  useEffect(() => {
    const root = shellRef.current;
    if (!root) return;
    root.querySelectorAll("video").forEach((node) => {
      const video = node as HTMLVideoElement;
      video.muted = docked || video.dataset.muted === "1";
    });
  }, [docked, call.phase, call.peers.length, call.camOn, call.micOn]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (dockedRef.current) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "m") {
        event.preventDefault();
        void actions.current.toggleMic();
      } else if (key === "v") {
        event.preventDefault();
        void actions.current.toggleCam();
      } else if (key === "c") {
        event.preventDefault();
        actions.current.setCaptionsOn(!actions.current.captionsOn);
      } else if (key === "t") {
        event.preventDefault();
        setPanel((current) => (current === "script" ? null : "script"));
      } else if (key === "k") {
        event.preventDefault();
        pendingContext.current = true;
        setPanel("arc");
      } else if (key === "h") {
        event.preventDefault();
        actions.current.setHand(!actions.current.hand);
      } else if (key === "s") {
        event.preventDefault();
        void actions.current.toggleScreen();
      } else if (key === "escape") {
        setPanel(null);
        setMore(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const sharing = Boolean(call.screenTrack) || call.peers.some((peer) => peer.screenStream);
  useEffect(() => {
    if (sharing && !forcedScreen.current) {
      forcedScreen.current = true;
      setLayout("focus");
    }
    if (!sharing) forcedScreen.current = false;
  }, [sharing]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "end" });
  }, [call.chat.length, panel]);

  useEffect(() => {
    if (!embedded) return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      const command = readHostCommand(event.data);
      if (!command) return;
      if (command.type === "set-look") {
        patchLook({
          ...(command.scale ? { scale: command.scale } : {}),
          ...(typeof command.contrast === "boolean" ? { contrast: command.contrast } : {}),
        });
      } else if (command.type === "copy-context") {
        pendingContext.current = true;
        setPanel("arc");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [code, embedded]);

  useEffect(() => {
    if (panel !== "arc" || !pendingContext.current) return;
    pendingContext.current = false;
    window.dispatchEvent(new CustomEvent("arc-context"));
  }, [panel]);

  useEffect(() => {
    if (!embedded) return;
    emitArc("room", {
      room: code,
      captions: call.captions.slice(-8).map((line) => ({ name: line.name, text: line.text, at: line.at })),
    });
  }, [call.captions, code, embedded]);

  const tiles = useMemo(() => {
    const self = {
      key: "self",
      name: `${call.displayName} · Du`,
      stream: call.localVideoStream,
      speakingStream: call.localAudioStream,
      muted: true,
      mirror: call.burned ? false : call.mirror,
      showVideo: call.camOn && !!call.videoTrack,
      mic: call.micOn,
      hand: call.hand,
      status: null as string | null,
    };
    const screens = [
      ...(call.localScreenStream
        ? [
            {
              key: "screen-self",
              name: "Dein Bildschirm",
              stream: call.localScreenStream,
              speakingStream: null,
              muted: true,
              mirror: false,
              showVideo: true,
              mic: true,
              hand: false,
              status: null,
            },
          ]
        : []),
      ...call.peers
        .filter((peer) => peer.screenStream)
        .map((peer) => ({
          key: `screen-${peer.id}`,
          name: `${peer.name} · Bildschirm`,
          stream: peer.screenStream,
          speakingStream: null,
          muted: true,
          mirror: false,
          showVideo: true,
          mic: true,
          hand: false,
          status: null,
        })),
    ];
    const people = call.peers.map((peer) => ({
      key: peer.id,
      name: peer.name,
      stream: peer.camStream,
      speakingStream: peer.mic ? peer.camStream : null,
      muted: false,
      mirror: false,
      showVideo: peer.cam,
      mic: peer.mic,
      hand: peer.hand,
      status: linkLabel(peer.connectionState),
    }));
    return [...screens, self, ...people];
  }, [call]);

  function togglePin(key: string) {
    setPinned((current) => (current === key ? null : key));
    setLayout("focus");
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteUrl(code));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  function leave() {
    clearAutostart();
    forgetReturn();
    if (getHold() === code) dropCall();
    void navigate({ to: "/" });
  }

  if (call.phase !== "live") {
    return (
      <>
        {docked ? null : (
      <main className="studio flex h-full items-center justify-center px-4 py-4">
        <div className="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-3xl border border-line bg-panel">
          <form
            className="flex min-h-0 max-h-full flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              if (call.phase !== "gate") return;
              const agenda = readAgenda(code);
              if (!agenda.points.length) return;
              primeCallDevices();
              void pushAgenda(code, { ...agenda, startedAt: agenda.startedAt ?? Date.now() });
              call.enter();
            }}
          >
            <div className="min-h-0 overflow-y-auto p-6">
              <div className="flex items-center gap-3">
                <Mark className="size-11" />
                <p className="font-display text-2xl">Infinity-Meet-Zone</p>
              </div>
              <h1 className="mt-6 font-display text-4xl text-paper">
                {call.phase === "boot" ? "Der Raum öffnet sich" : "Du bist eingeladen"}
              </h1>
              <p className="mt-3 text-mist">
                Raum <span className="tracking-widest text-paper">{code}</span>
              </p>
              <RoomMemory room={code} live={false} place="gate" />
              {call.phase === "gate" ? (
                <div className="mt-6">
                  <label className="text-sm text-mist" htmlFor="join-name">
                    Dein Name
                  </label>
                  <input
                    id="join-name"
                    value={call.name}
                    onChange={(event) => call.setName(event.target.value)}
                    placeholder="Gast"
                    maxLength={32}
                    className={`${field} mt-2`}
                  />
                  <AgendaEditor room={code} onCount={setPoints} />
                </div>
              ) : (
                <p className="mt-6 text-mist">Einen Moment.</p>
              )}
            </div>
            {call.phase === "gate" ? (
              <div className="shrink-0 px-6 pb-6">
                <button
                  type="submit"
                  disabled={points < 1}
                  className="flex h-12 w-full items-center justify-center rounded-full bg-copper font-medium text-ink transition-transform duration-150 ease-out active:scale-[0.96] disabled:opacity-40"
                >
                  Beitreten
                </button>
              </div>
            ) : null}
          </form>
        </div>
      </main>
        )}
        {docked ? <DockBar code={code} live={false} people={0} mic={false} onMic={() => {}} onHang={leave} streams={[]} /> : null}
      </>
    );
  }

  const screenLabel = call.screenTrack
    ? "Dein Bildschirm"
    : call.peers.find((peer) => peer.screenStream)?.name
      ? `${call.peers.find((peer) => peer.screenStream)?.name} teilt`
      : null;

  const stageKey =
    pinned && tiles.some((tile) => tile.key === pinned)
      ? pinned
      : (tiles.find((tile) => tile.key.startsWith("screen-"))?.key ??
        tiles.find((tile) => tile.key !== "self")?.key ??
        "self");
  const stage = tiles.find((tile) => tile.key === stageKey) ?? tiles[0]!;
  const rest = tiles.filter((tile) => tile.key !== stage.key);
  const latestCaption = call.interim
    ? { name: call.displayName, text: call.interim, translation: undefined as string | undefined, translating: false }
    : call.captions[call.captions.length - 1];

  return (
    <>
    <div ref={shellRef} inert={docked || undefined} className="relative flex h-dvh flex-col overflow-hidden bg-ink">
      <header className="flex items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4">
        <Link to="/" aria-label="Zum Schreibtisch" className="shrink-0">
          <Mark className="size-9" />
        </Link>
        <p className="hidden min-w-0 truncate font-display text-xl sm:block">{THEME}</p>
        <button
          type="button"
          onClick={() => void copyLink()}
          className="flex h-10 items-center gap-2 rounded-full border border-line bg-panel px-3 text-sm tracking-widest text-paper transition-transform duration-150 ease-out active:scale-[0.96]"
        >
          {code}
          {copied ? <Check className="size-3.5 text-copper" /> : <Copy className="size-3.5 text-mist" />}
          <span className="sr-only">{copied ? "Link kopiert" : "Einladungslink kopieren"}</span>
        </button>
        <p className="tabular-nums text-sm text-mist">{formatElapsed(call.elapsed)}</p>
        <p className="hidden text-sm text-mist sm:block">{call.peers.length + 1} von 6</p>
        {call.recording ? (
          <p className="flex items-center gap-1.5 text-sm text-copper">
            <span className="rec-pulse size-2 rounded-full bg-copper" /> Aufnahme
          </p>
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          <IconButton label="Lese-Blatt" pressed={panel === "arc"} onClick={() => setPanel((current) => (current === "arc" ? null : "arc"))}>
            <PanelsTopLeft className="size-4" />
          </IconButton>
          <IconButton label="Galerie" pressed={layout === "gallery"} onClick={() => setLayout("gallery")}>
            <LayoutGrid className="size-4" />
          </IconButton>
          <IconButton label="Fokus" pressed={layout === "focus"} onClick={() => setLayout("focus")}>
            <RectangleHorizontal className="size-4" />
          </IconButton>
        </div>
      </header>

      {call.banner ? (
        <p className="mx-3 mb-2 rounded-xl border border-line bg-panel px-3 py-2 text-sm text-paper sm:mx-4" role="status">
          {call.banner}
        </p>
      ) : null}
      {call.room.full ? (
        <p className="mx-3 mb-2 rounded-xl border border-line bg-panel px-3 py-2 text-sm text-paper sm:mx-4" role="status">
          Dieser Raum ist voll. Sechs Personen sind das Maximum.
        </p>
      ) : null}
      {call.room.status === "error" ? (
        <p className="mx-3 mb-2 rounded-xl border border-line bg-panel px-3 py-2 text-sm text-paper sm:mx-4" role="status">
          Der Raum antwortet gerade nicht. Kamera, Notizen und der Assistent gehen trotzdem.
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1 flex-col">
          <RoomMemory room={code} live place="camera" />
          {call.peers.length === 0 && call.room.status === "live" && !call.room.full ? (
            <p className="relative z-30 px-4 pb-2 text-sm text-mist">Du bist allein. Kopiere den Code, dann kann jemand dazukommen.</p>
          ) : null}
          {layout === "gallery" ? (
            <div
              className={cn(
                "grid min-h-0 flex-1 gap-3 px-3 pb-3 sm:px-4",
                tiles.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2",
                tiles.length > 4 && "xl:grid-cols-3",
              )}
            >
              {tiles.map((tile) => (
                <StageTile
                  key={tile.key}
                  tile={tile}
                  pinned={pinned === tile.key}
                  onPin={() => togglePin(tile.key)}
                  reactions={call.reactions.filter((item) =>
                    tile.key === "self" ? item.peerId === "self" : item.peerId === tile.key,
                  )}
                  lone={tiles.length === 1}
                  action={
                    tile.key === "self" && !call.micOn && !call.camOn && !call.audioTrack && !call.videoTrack ? (
                      <button
                        type="button"
                        onClick={() => void call.enableDevices()}
                        className="absolute inset-x-8 bottom-14 rounded-full bg-copper px-4 py-3 text-sm font-medium text-ink transition-transform duration-150 ease-out active:scale-[0.96]"
                      >
                        Kamera und Mikrofon einschalten
                      </button>
                    ) : null
                  }
                />
              ))}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pb-3 sm:px-4">
              <div className="min-h-0 flex-1">
                <StageTile
                  tile={stage}
                  pinned={pinned === stage.key}
                  onPin={() => togglePin(stage.key)}
                  reactions={call.reactions.filter((item) =>
                    stage.key === "self" ? item.peerId === "self" : item.peerId === stage.key,
                  )}
                  lone
                  action={
                    stage.key === "self" && !call.micOn && !call.camOn && !call.audioTrack && !call.videoTrack ? (
                      <button
                        type="button"
                        onClick={() => void call.enableDevices()}
                        className="absolute bottom-14 left-1/2 -translate-x-1/2 rounded-full bg-copper px-4 py-3 text-sm font-medium text-ink"
                      >
                        Kamera und Mikrofon einschalten
                      </button>
                    ) : null
                  }
                />
              </div>
              {rest.length ? (
                <div className="flex gap-2 overflow-x-auto">
                  {rest.map((tile) => (
                    <div key={tile.key} className="w-36 shrink-0 sm:w-44">
                      <StageTile tile={tile} pinned={false} onPin={() => togglePin(tile.key)} reactions={[]} />
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )}
          {call.captionsOn && latestCaption ? (
            <div className="mx-3 mb-2 rounded-xl bg-panel px-3 py-2 text-sm text-paper sm:mx-4" aria-live="polite">
              <p>
                <span className="text-mist">{latestCaption.name}: </span>
                {latestCaption.text}
              </p>
              {latestCaption.translation ? (
                <p dir="auto" className="mt-1 text-copper">
                  {latestCaption.translation}
                </p>
              ) : latestCaption.translating ? (
                <p className="mt-1 text-mist">Wird übersetzt…</p>
              ) : null}
            </div>
          ) : null}
        </div>
        {panel ? (
          <aside className="hidden w-96 shrink-0 border-l border-line lg:flex lg:flex-col">
            <SidePanel
              call={call}
              code={code}
              screenLabel={screenLabel}
              panel={panel}
              draft={draft}
              setDraft={keepChat}
              question={question}
              setQuestion={keepAsk}
              onClose={() => setPanel(null)}
              chatEnd={chatEnd}
            />
          </aside>
        ) : null}
      </div>

      {panel ? (
        <div className="absolute inset-0 z-40 flex flex-col bg-ink lg:hidden">
          <SidePanel
            call={call}
            code={code}
            screenLabel={screenLabel}
            panel={panel}
            draft={draft}
            setDraft={keepChat}
            question={question}
            setQuestion={keepAsk}
            onClose={() => setPanel(null)}
            chatEnd={chatEnd}
          />
        </div>
      ) : null}

      <ArcEngine room={code} captions={call.captions} sayAs={call.sayAs} />

      <AgendaBar room={code} captions={call.captions} />

      <form
        className="flex flex-wrap items-center gap-2 px-3 pb-2"
        onSubmit={(event) => {
          event.preventDefault();
          setCue(cueDraft);
        }}
      >
        <label className="sr-only" htmlFor="cue-line">
          Text auf der Kamera
        </label>
        <input
          id="cue-line"
          value={cueDraft}
          onChange={(event) => setCueDraft(event.target.value)}
          placeholder="Text auf der Kamera"
          className="h-11 min-w-0 flex-1 rounded-full border border-line bg-panel px-4 text-sm text-paper"
        />
        <button type="submit" className="h-11 rounded-full bg-copper px-3 text-sm font-medium text-ink">
          Einblenden
        </button>
        <button type="button" onClick={() => setCue("")} className="h-11 rounded-full border border-line px-3 text-sm text-paper">
          Aus
        </button>
      </form>
      <Together roomHint={code} compact />

      <footer className="pad-safe relative z-30 flex flex-wrap items-center justify-center gap-1.5 px-2 pt-1">
        <IconButton label={call.micOn ? "Mikrofon aus" : "Mikrofon an"} pressed={call.micOn} onClick={() => void call.toggleMic()}>
          {call.micOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}
        </IconButton>
        <IconButton label={call.camOn ? "Kamera aus" : "Kamera an"} pressed={call.camOn} onClick={() => void call.toggleCam()}>
          {call.camOn ? <Video className="size-5" /> : <VideoOff className="size-5" />}
        </IconButton>
        <IconButton label={call.screenTrack ? "Teilen beenden" : "Bildschirm teilen"} pressed={!!call.screenTrack} onClick={() => void call.toggleScreen()}>
          <MonitorUp className="size-5" />
        </IconButton>
        <IconButton label={call.captionsOn ? "Untertitel aus" : "Untertitel an"} pressed={call.captionsOn} onClick={() => call.setCaptionsOn(!call.captionsOn)}>
          <Captions className="size-5" />
        </IconButton>
        <IconButton label="Transkript" pressed={panel === "script"} onClick={() => setPanel((current) => (current === "script" ? null : "script"))}>
          <ScrollText className="size-5" />
        </IconButton>
        <IconButton label="Chat" pressed={panel === "chat"} onClick={() => setPanel((current) => (current === "chat" ? null : "chat"))}>
          <MessageSquare className="size-5" />
        </IconButton>
        <IconButton label="Arcy" pressed={panel === "ai"} onClick={() => setPanel((current) => (current === "ai" ? null : "ai"))}>
          <Sparkles className="size-5" />
        </IconButton>
        <div className="relative">
          <IconButton label="Mehr" pressed={more || panel === "devices"} onClick={() => setMore((open) => !open)}>
            <Settings2 className="size-5" />
          </IconButton>
          {more ? (
            <div className="absolute bottom-14 right-0 z-30 w-56 rounded-2xl border border-line bg-panel p-2 shadow-none">
              <MenuButton
                icon={PanelsTopLeft}
                label="Lese-Blatt"
                onClick={() => {
                  setPanel("arc");
                  setMore(false);
                }}
              />
              <MenuButton
                icon={Hand}
                label={call.hand ? "Hand senken" : "Hand heben"}
                onClick={() => {
                  call.setHand(!call.hand);
                  setMore(false);
                }}
              />
              <p className="px-2 pt-2 text-xs text-mist">Reaktion</p>
              <div className="grid grid-cols-4 gap-1 p-1">
                {reactionChoices.map((choice) => {
                  const Icon = choice.icon;
                  return (
                    <button
                      key={choice.kind}
                      type="button"
                      aria-label={choice.label}
                      onClick={() => {
                        call.react(choice.kind);
                        setMore(false);
                      }}
                      className="grid h-11 place-items-center rounded-xl bg-raised text-paper"
                    >
                      <Icon className="size-4" />
                    </button>
                  );
                })}
              </div>
              <MenuButton
                icon={call.recording ? Square : Radio}
                label={call.recording ? "Aufnahme stoppen" : "Audio aufnehmen"}
                onClick={() => {
                  void call.toggleRecord();
                  setMore(false);
                }}
              />
              <MenuButton
                icon={Settings2}
                label="Geräte"
                onClick={() => {
                  setPanel("devices");
                  setMore(false);
                }}
              />
              <MenuButton
                icon={ScrollText}
                label="Transkript und Übersetzung"
                onClick={() => {
                  setPanel("script");
                  setMore(false);
                }}
              />
              <MenuButton
                icon={Captions}
                label={call.shareCaptions ? "Untertitel werden geteilt" : "Untertitel nur lokal"}
                onClick={() => call.setShareCaptions(!call.shareCaptions)}
              />
            </div>
          ) : null}
        </div>
        <IconButton label="Raum verlassen" danger onClick={leave}>
          <PhoneOff className="size-5" />
        </IconButton>
        <button type="button" onClick={() => void navigate({ to: "/" })} className="h-11 rounded-full border border-line px-3 text-sm text-paper">
          Schreibtisch
        </button>
      </footer>
    </div>
    {docked ? (
      <DockBar
        code={code}
        live
        people={call.peers.length + 1}
        mic={call.micOn}
        onMic={() => void call.toggleMic()}
        onHang={leave}
        streams={call.peers.map((peer) => peer.camStream).filter((stream): stream is MediaStream => !!stream)}
      />
    ) : null}
    </>
  );
}

function DockBar({
  code,
  live,
  people,
  mic,
  onMic,
  onHang,
  streams,
}: {
  code: string;
  live: boolean;
  people: number;
  mic: boolean;
  onMic: () => void;
  onHang: () => void;
  streams: MediaStream[];
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-2">
      {streams.map((stream, index) => (
        <PeerAudio key={stream.id || index} stream={stream} />
      ))}
      <p className="min-w-0 flex-1 truncate text-sm text-paper">
        {live ? `${THEME} ${code} läuft weiter · ${people} ${people === 1 ? "Person" : "Personen"}` : `${THEME} ${code} wartet`}
      </p>
      {live ? (
        <button type="button" onClick={onMic} className="h-10 shrink-0 rounded-full border border-line px-3 text-sm text-paper">
          {mic ? "Stumm" : "Ton an"}
        </button>
      ) : null}
      <Link to="/r/$code" params={{ code }} className="grid h-10 shrink-0 place-items-center rounded-full bg-copper px-3 text-sm font-medium text-ink">
        Raum
      </Link>
      <button type="button" onClick={onHang} className="h-10 shrink-0 rounded-full border border-line px-3 text-sm text-paper">
        Auflegen
      </button>
    </div>,
    document.body,
  );
}

function PeerAudio({ stream }: { stream: MediaStream }) {
  const [node, setNode] = useState<HTMLAudioElement | null>(null);
  useEffect(() => {
    if (!node) return;
    node.srcObject = stream;
    void node.play().catch(() => {});
    return () => {
      node.srcObject = null;
    };
  }, [node, stream]);
  return <audio ref={setNode} autoPlay />;
}

function StageTile({
  tile,
  pinned,
  onPin,
  reactions: reactionList,
  action,
  lone,
}: {
  tile: {
    key: string;
    name: string;
    stream: MediaStream | null;
    speakingStream: MediaStream | null;
    muted: boolean;
    mirror: boolean;
    showVideo: boolean;
    mic: boolean;
    hand: boolean;
    status: string | null;
  };
  pinned: boolean;
  onPin: () => void;
  reactions: { id: string; kind: ReactionKind }[];
  action?: ReactNode;
  lone?: boolean;
}) {
  return (
    <div className={cn("h-full", lone ? "min-h-64" : "min-h-40")}>
      <Tile
        name={tile.name}
        stream={tile.stream}
        speakingStream={tile.speakingStream}
        muted={tile.muted}
        mirror={tile.mirror}
        showVideo={tile.showVideo}
        mic={tile.mic}
        hand={tile.hand}
        status={tile.status}
        reactions={reactionList}
        pinned={pinned}
        onPin={onPin}
      >
        {action}
      </Tile>
    </div>
  );
}

function IconButton({
  label,
  pressed,
  danger,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
      className={cn(
        "grid size-12 place-items-center rounded-full border border-line transition-transform duration-150 ease-out active:scale-[0.96]",
        danger ? "border-transparent bg-leave text-paper" : pressed ? "border-transparent bg-copper text-ink" : "bg-raised text-paper",
      )}
    >
      {children}
    </button>
  );
}

function MenuButton({ icon: Icon, label, onClick }: { icon: typeof Hand; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 w-full items-center gap-2 rounded-xl px-2 text-left text-sm text-paper hover:bg-raised"
    >
      <Icon className="size-4 text-copper" />
      {label}
    </button>
  );
}

function SidePanel({
  call,
  code,
  screenLabel,
  panel,
  draft,
  setDraft,
  question,
  setQuestion,
  onClose,
  chatEnd,
}: {
  call: ReturnType<typeof useCall>;
  code: string;
  screenLabel: string | null;
  panel: "chat" | "ai" | "devices" | "script" | "arc";
  draft: string;
  setDraft: (value: string) => void;
  question: string;
  setQuestion: (value: string) => void;
  onClose: () => void;
  chatEnd: RefObject<HTMLDivElement | null>;
}) {
  const title =
    panel === "chat" ? "Chat" : panel === "ai" ? "Arcy" : panel === "script" ? "Transkript" : panel === "arc" ? "Blatt" : "Geräte";
  const scriptEnd = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (panel === "script") scriptEnd.current?.scrollIntoView({ block: "end" });
  }, [panel, call.captions.length]);
  return (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="font-display text-2xl text-paper">{title}</h2>
        <button type="button" aria-label="Schließen" onClick={onClose} className="grid size-10 place-items-center rounded-full text-paper">
          <X className="size-4" />
        </button>
      </div>
      {panel === "chat" ? (
        <>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {call.chat.length === 0 ? (
              <p className="text-sm text-mist">Nachrichten laufen direkt zwischen euch und werden nicht gespeichert.</p>
            ) : null}
            {call.chat.map((line) =>
              line.kind === "system" ? (
                <p key={line.id} className="text-center text-xs text-mist">
                  {line.text}
                </p>
              ) : (
                <p key={line.id} className={cn("max-w-[90%] rounded-2xl px-3 py-2 text-sm", line.self ? "ml-auto bg-copper text-ink" : "bg-raised text-paper")}>
                  {!line.self ? <span className="mb-0.5 block text-xs text-mist">{line.name}</span> : null}
                  {line.text}
                </p>
              ),
            )}
            <div ref={chatEnd} />
          </div>
          <form
            className="flex gap-2 border-t border-line p-3"
            onSubmit={(event) => {
              event.preventDefault();
              call.sendChat(draft);
              setDraft("");
            }}
          >
            <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={500} placeholder="Nachricht" className={field} />
            <button type="submit" aria-label="Senden" className="grid size-12 shrink-0 place-items-center rounded-full bg-copper text-ink">
              <Send className="size-4" />
            </button>
          </form>
        </>
      ) : null}
      {panel === "ai" ? (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          <p className="text-sm text-mist">
            Untertitel, Chat und Notizen bleiben hier, bis du fragst. Arcy richtet sich nach Anrede, Ton und Merkzettel.
          </p>
          <div className="flex flex-wrap gap-2">
            <Chip icon={Wand2} label="Zusammenfassen" onClick={() => void call.ask("summary")} disabled={call.aiBusy} />
            <Chip icon={ListChecks} label="Aufgaben" onClick={() => void call.ask("actions")} disabled={call.aiBusy} />
            <Chip icon={Sparkles} label="Wortmeldung" onClick={() => void call.ask("reply", question)} disabled={call.aiBusy} />
          </div>
          <label className="block text-sm text-mist" htmlFor="notes">
            Notizen, nur in diesem Tab
          </label>
          <textarea
            id="notes"
            value={call.notes}
            onChange={(event) => call.setNotes(event.target.value)}
            rows={4}
            className={field}
            placeholder="Was du nicht vergessen willst"
          />
          <div className="space-y-2">
            {call.ai.map((line, index) => (
              <p key={`${line.role}-${index}`} className={cn("rounded-2xl px-3 py-2 text-sm", line.role === "user" ? "bg-raised text-mist" : "bg-ink text-paper")}>
                {line.text}
              </p>
            ))}
            {call.aiBusy ? <p className="text-sm text-mist">Denkt nach…</p> : null}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!question.trim()) return;
              void call.ask("ask", question);
              setQuestion("");
            }}
          >
            <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Frag zu diesem Gespräch" className={field} />
            <button type="submit" aria-label="Fragen" disabled={call.aiBusy} className="grid size-12 shrink-0 place-items-center rounded-full bg-copper text-ink disabled:opacity-40">
              <Notebook className="size-4" />
            </button>
          </form>
        </div>
      ) : null}
      {panel === "script" ? <ScriptPanel call={call} scriptEnd={scriptEnd} /> : null}
      {panel === "arc" ? (
        <div className="min-h-0 flex-1">
          <ArcPanel room={code} captions={call.captions} screen={screenLabel} />
        </div>
      ) : null}
      {panel === "devices" ? (
        <div className="space-y-4 overflow-y-auto px-4 py-4">
          <DeviceSelect label="Mikrofon" value={call.micId} onChange={(id) => void call.chooseMic(id)} options={call.devices.mics} fallback="Mikrofon" />
          <DeviceSelect label="Kamera" value={call.camId} onChange={(id) => void call.chooseCam(id)} options={call.devices.cams} fallback="Kamera" />
          <DeviceSelect label="Lautsprecher" value={call.speakerId} onChange={call.setSpeakerId} options={call.devices.speakers} fallback="Ausgang" />
          <label className="flex items-center gap-3 text-sm text-paper">
            <input type="checkbox" checked={call.mirror} onChange={(event) => call.setMirror(event.target.checked)} />
            Eigenes Bild spiegeln
          </label>
          <div className="text-sm text-mist">
            <p className="text-paper">Tasten</p>
            <p className="mt-1">M Mikrofon, V Kamera, C Untertitel, T Transkript, K Kontext, H Hand, S Bildschirm, Esc schließt.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ScriptPanel({ call, scriptEnd }: { call: ReturnType<typeof useCall>; scriptEnd: RefObject<HTMLDivElement | null> }) {
  const textOf = () =>
    call.captions
      .map((line) => {
        const stamp = new Date(line.at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
        return `${stamp} ${line.name}: ${line.text}${line.translation ? `\n${line.translation}` : ""}`;
      })
      .join("\n\n");
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3 border-b border-line px-4 py-3">
        <label className="block text-sm text-mist">
          Gesprochene Sprache
          <select value={call.lang} onChange={(event) => call.setLang(event.target.value)} className={`${field} mt-2`}>
            {SPEECH_LANGS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-mist">
          Live übersetzen nach
          <select value={call.translateTo} onChange={(event) => call.setTranslateTo(event.target.value)} className={`${field} mt-2`}>
            {TRANSLATE_LANGS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.id === "off" ? "Nicht übersetzen" : item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-3 text-sm text-paper">
          <input type="checkbox" checked={call.shareCaptions} onChange={(event) => call.setShareCaptions(event.target.checked)} />
          Original mit den anderen teilen
        </label>
        {!call.captionsOn ? (
          <button type="button" onClick={() => call.setCaptionsOn(true)} className="flex h-10 items-center gap-2 rounded-full bg-copper px-3 text-sm font-medium text-ink">
            <Captions className="size-3.5" />
            Untertitel einschalten
          </button>
        ) : (
          <p className="text-sm text-mist">Untertitel laufen. Die Übersetzung bleibt bei dir.</p>
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {call.captions.length === 0 ? (
          <p className="text-sm text-mist">Noch nichts gehört. Sobald jemand spricht und Untertitel an sind, steht es hier.</p>
        ) : null}
        {call.captions.map((line) => (
          <div key={line.id} className="rounded-2xl bg-ink px-3 py-2">
            <p className="text-xs text-mist">
              {line.name} · {new Date(line.at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
            </p>
            <p className="mt-1 text-sm text-paper">{line.text}</p>
            {line.translation ? (
              <p dir="auto" className="mt-1 text-sm text-copper">
                {line.translation}
              </p>
            ) : line.translating ? (
              <p className="mt-1 text-sm text-mist">Wird übersetzt…</p>
            ) : null}
          </div>
        ))}
        <div ref={scriptEnd} />
      </div>
      <div className="flex gap-2 border-t border-line p-3">
        <button type="button" onClick={() => void navigator.clipboard.writeText(textOf()).catch(() => {})} className="h-10 flex-1 rounded-full border border-line text-sm text-paper">
          Kopieren
        </button>
        <button
          type="button"
          onClick={() => {
            const blob = new Blob([textOf()], { type: "text/plain;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "runde-transkript.txt";
            link.click();
            URL.revokeObjectURL(url);
          }}
          className="h-10 flex-1 rounded-full border border-line text-sm text-paper"
        >
          Download
        </button>
      </div>
    </div>
  );
}

function Chip({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: typeof Wand2;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-raised px-3 text-sm text-paper disabled:opacity-40"
    >
      <Icon className="size-3.5 text-copper" />
      {label}
    </button>
  );
}

function DeviceSelect({
  label,
  value,
  onChange,
  options,
  fallback,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  options: MediaDeviceInfo[];
  fallback: string;
}) {
  return (
    <label className="block text-sm text-mist">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className={`${field} mt-2`}>
        <option value="">Standard</option>
        {options.map((device, index) => (
          <option key={device.deviceId || index} value={device.deviceId}>
            {deviceLabel(device, index, fallback)}
          </option>
        ))}
      </select>
    </label>
  );
}
