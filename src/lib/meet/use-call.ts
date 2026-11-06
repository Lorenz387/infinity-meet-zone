import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { lensDrop, lensTake, lensYield } from "@/lib/meet/lens";
import { useCueTrack } from "@/lib/meet/cue-track";
import { getCue, subscribeCue } from "@/lib/os/cue";
import { profileLines } from "@/lib/os/arcy";
import { applyBrief, sessionBrief } from "@/lib/os/pack";
import { applySharedCard, applySharedLine, readSheets, subscribeSheets } from "@/lib/os/sheets";
import type { SheetCard } from "@/lib/os/types";
import { askRunde, type AssistantResult } from "@/lib/meet/assistant";
import { isSpeechId, isTranslateId, type TranslateId } from "@/lib/meet/languages";
import { MeetMesh, type MeshPeerState, type MeshRoomInfo } from "@/lib/meet/mesh";
import { translateUtterances } from "@/lib/meet/translate";
import { loadRoom, saveRoom } from "@/lib/meet/room-log";
import { noteCommitment } from "@/lib/os/commit";
import { DEMO_TASK, demoLive } from "@/lib/os/demo";
import { stripStealth } from "@/lib/os/guard";
import { flushSoon } from "@/lib/os/keep";
import {
  cleanName,
  deviceLabel,
  listDevices,
  makeId,
  mediaError,
  openCamera,
  openMic,
  openMicAndCamera,
  shouldAutostart,
  takePrimedDevices,
  type DeviceLists,
} from "@/lib/meet/media";

export type ReactionKind = "up" | "heart" | "clap" | "spark";

export type ChatLine = {
  id: string;
  name: string;
  text: string;
  at: number;
  kind: "user" | "system";
  self?: boolean;
};

export type CaptionLine = {
  id: string;
  name: string;
  text: string;
  at: number;
  translation?: string;
  translating?: boolean;
};

export type AiLine = { role: "user" | "assistant"; text: string };

export type PeerView = MeshPeerState & {
  mic: boolean;
  cam: boolean;
  hand: boolean;
  screen: boolean;
};

type Presence = { mic: boolean; cam: boolean; hand: boolean; screen: boolean; name: string };

type Reaction = { id: string; peerId: string; kind: ReactionKind; at: number };

const KINDS = new Set<ReactionKind>(["up", "heart", "clap", "spark"]);

type SpeechRec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((ev: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function speechRecognizer(): SpeechRec | null {
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

export function useCall(code: string) {
  const [phase, setPhase] = useState<"boot" | "gate" | "live">("boot");
  const [name, setName] = useState("");
  const [audioTrack, setAudioTrack] = useState<MediaStreamTrack | null>(null);
  const [videoTrack, setVideoTrack] = useState<MediaStreamTrack | null>(null);
  const [screenTrack, setScreenTrack] = useState<MediaStreamTrack | null>(null);
  const [micOn, setMicOn] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [hand, setHand] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(false);
  const [shareCaptions, setShareCaptions] = useState(true);
  const [lang, setLang] = useState("de-DE");
  const [translateTo, setTranslateToState] = useState<TranslateId>("off");
  const [mirror, setMirror] = useState(true);
  const [devices, setDevices] = useState<DeviceLists>({ mics: [], cams: [], speakers: [] });
  const [micId, setMicId] = useState("");
  const [camId, setCamId] = useState("");
  const [speakerId, setSpeakerId] = useState("");
  const [meshPeers, setMeshPeers] = useState<MeshPeerState[]>([]);
  const [presence, setPresence] = useState<Record<string, Presence>>({});
  const [room, setRoom] = useState<MeshRoomInfo>({ status: "connecting", full: false });
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [captions, setCaptions] = useState<CaptionLine[]>([]);
  const [interim, setInterim] = useState("");
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [notes, setNotes] = useState("");
  const [ai, setAi] = useState<AiLine[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);

  const tracksRef = useRef({ audio: null as MediaStreamTrack | null, video: null as MediaStreamTrack | null, screen: null as MediaStreamTrack | null });
  const cameraRef = useRef<MediaStreamTrack | null>(null);
  const [cueText, setCueText] = useState("");
  const gate = useRef("");
  const meshRef = useRef<MeetMesh | null>(null);
  const sharedRef = useRef(new Set<string>());
  const presenceRef = useRef<Presence>({ mic: false, cam: false, hand: false, screen: false, name: "Gast" });
  const nameRef = useRef("Gast");
  const shareRef = useRef(true);
  const seenRef = useRef(new Set<string>());
  const namesRef = useRef<Record<string, string>>({});
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunks = useRef<Blob[]>([]);
  const recordCtx = useRef<AudioContext | null>(null);
  const selfId = useRef("");
  const cacheRef = useRef(new Map<string, string>());
  const queueRef = useRef<{ id: string; text: string; lang: Exclude<TranslateId, "off"> }[]>([]);
  const flushingRef = useRef(false);
  const translateTimer = useRef<number | null>(null);
  const translateToRef = useRef<TranslateId>("off");
  const captionIdsRef = useRef(new Set<string>());
  const flushRef = useRef<() => void>(() => {});
  const lastTranslateError = useRef(0);

  useEffect(() => {
    const saved = loadRoom(code);
    gate.current = "";
    setChat(saved.chat);
    setCaptions(saved.captions);
    setAi(saved.ai);
    setNotes(saved.notes);
    const open = window.setTimeout(() => {
      gate.current = code;
    }, 0);
    return () => window.clearTimeout(open);
  }, [code]);

  useEffect(() => {
    if (gate.current !== code) return;
    saveRoom(code, { chat, captions, ai, notes });
  }, [code, chat, captions, ai, notes]);

  useEffect(() => () => flushSoon(), []);

  const flash = useCallback((text: string) => {
    setBanner(text);
    window.setTimeout(() => setBanner((current) => (current === text ? null : current)), 4600);
  }, []);

  const pushSystem = useCallback((text: string) => {
    setChat((lines) => [...lines, { id: makeId(8), name: "Raum", text, at: Date.now(), kind: "system" as const }].slice(-200));
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("runde-name") ?? "";
    setName(saved);
    if (localStorage.getItem("runde-mirror") === "0") setMirror(false);
    const storedLang = localStorage.getItem("runde-lang");
    if (storedLang && isSpeechId(storedLang)) setLang(storedLang);
    const storedTranslate = localStorage.getItem("runde-translate");
    if (storedTranslate && isTranslateId(storedTranslate)) {
      translateToRef.current = storedTranslate;
      setTranslateToState(storedTranslate);
    }
    if (shouldAutostart(code)) {
      try {
        sessionStorage.removeItem("runde-autostart");
      } catch {
        // ignore
      }
      setPhase("live");
    } else {
      setPhase("gate");
    }
  }, [code]);

  useEffect(() => {
    const trimmed = name.trim();
    if (trimmed) localStorage.setItem("runde-name", trimmed);
  }, [name]);

  useEffect(() => {
    localStorage.setItem("runde-mirror", mirror ? "1" : "0");
  }, [mirror]);

  useEffect(() => {
    localStorage.setItem("runde-lang", lang);
  }, [lang]);

  const refreshDevices = useCallback(() => {
    void listDevices().then(setDevices).catch(() => {});
  }, []);

  useEffect(() => {
    cameraRef.current = videoTrack;
  }, [videoTrack]);

  useEffect(() => {
    if (!videoTrack) {
      lensDrop("raum");
      return;
    }
    lensTake("raum", videoTrack, () => {
      videoTrack.stop();
      setVideoTrack(null);
      setCamOn(false);
    });
    return () => {
      lensDrop("raum");
    };
  }, [videoTrack]);

  useEffect(() => {
    setCueText(getCue());
    return subscribeCue(() => setCueText(getCue()));
  }, []);

  const cueTrack = useCueTrack(camOn ? videoTrack : null, cueText);

  useEffect(() => {
    tracksRef.current = { audio: audioTrack, video: cueTrack ?? videoTrack, screen: screenTrack };
    void meshRef.current?.syncTracks();
  }, [audioTrack, videoTrack, screenTrack, cueTrack]);

  useEffect(() => {
    const next: Presence = {
      mic: micOn,
      cam: camOn,
      hand,
      screen: Boolean(screenTrack),
      name: cleanName(name),
    };
    presenceRef.current = next;
    nameRef.current = next.name;
    if (meshRef.current) meshRef.current.name = next.name;
    meshRef.current?.send({ type: "presence", ...next });
  }, [micOn, camOn, hand, screenTrack, name]);

  useEffect(() => {
    shareRef.current = shareCaptions;
  }, [shareCaptions]);

  useEffect(() => {
    return () => {
      tracksRef.current.audio?.stop();
      cameraRef.current?.stop();
      if (tracksRef.current.video && tracksRef.current.video !== cameraRef.current) tracksRef.current.video.stop();
      tracksRef.current.screen?.stop();
      recorderRef.current?.state === "recording" && recorderRef.current.stop();
      void recordCtx.current?.close();
      if (translateTimer.current) window.clearTimeout(translateTimer.current);
    };
  }, []);

  const scheduleFlush = useCallback(() => {
    if (translateTimer.current) return;
    translateTimer.current = window.setTimeout(() => {
      translateTimer.current = null;
      flushRef.current();
    }, 600);
  }, []);

  const addCaption = useCallback(
    (line: CaptionLine) => {
      const text = line.text.trim().slice(0, 400);
      if (!text || captionIdsRef.current.has(line.id)) return;
      if (captionIdsRef.current.size > 480) captionIdsRef.current.clear();
      captionIdsRef.current.add(line.id);
      const lang = translateToRef.current;
      const cached = lang === "off" ? undefined : cacheRef.current.get(`${lang}\u0000${text}`);
      setCaptions((lines) =>
        [
          ...lines,
          {
            ...line,
            text,
            translation: cached,
            translating: lang !== "off" && !cached,
          },
        ].slice(-240),
      );
      const title = noteCommitment(code, { id: line.id, name: line.name, text });
      if (title) window.dispatchEvent(new CustomEvent("arc-task", { detail: title }));
      if (lang === "off" || cached) return;
      queueRef.current.push({ id: line.id, text, lang });
      scheduleFlush();
    },
    [scheduleFlush, code],
  );

  const flushTranslations = useCallback(async () => {
    if (flushingRef.current) return;
    const lang = translateToRef.current;
    if (lang === "off") {
      queueRef.current = [];
      return;
    }
    queueRef.current = queueRef.current.filter((item) => item.lang === lang);
    const batch = queueRef.current.slice(0, 12);
    if (!batch.length) return;
    queueRef.current = queueRef.current.slice(batch.length);
    flushingRef.current = true;
    const ids = new Set(batch.map((item) => item.id));
    const settle = (error?: string) => {
      setCaptions((lines) => lines.map((line) => (ids.has(line.id) ? { ...line, translating: false } : line)));
      if (!error) return;
      const now = Date.now();
      if (now - lastTranslateError.current < 8000) return;
      lastTranslateError.current = now;
      flash(error);
    };
    try {
      const result = await translateUtterances({ data: { lang, lines: batch.map((item) => item.text) } });
      if (translateToRef.current !== lang) return;
      if (!result.ok || result.lines.length !== batch.length) {
        settle(result.ok ? "Die Übersetzung kam unvollständig zurück." : result.error);
        return;
      }
      batch.forEach((item, index) => {
        const translation = result.lines[index];
        if (translation) cacheRef.current.set(`${lang}\u0000${item.text}`, translation);
      });
      setCaptions((lines) =>
        lines.map((line) => {
          const index = batch.findIndex((item) => item.id === line.id);
          const translation = index < 0 ? undefined : result.lines[index];
          if (!translation) return line;
          return { ...line, translation, translating: false };
        }),
      );
    } catch {
      if (translateToRef.current === lang) settle("Die Übersetzung ist nicht erreichbar.");
    } finally {
      flushingRef.current = false;
      if (queueRef.current.some((item) => item.lang === translateToRef.current)) scheduleFlush();
    }
  }, [flash, scheduleFlush]);

  flushRef.current = () => {
    void flushTranslations();
  };

  const setTranslateTo = useCallback(
    (next: string) => {
      const lang: TranslateId = isTranslateId(next) ? next : "off";
      translateToRef.current = lang;
      setTranslateToState(lang);
      try {
        localStorage.setItem("runde-translate", lang);
      } catch {
        // The choice still applies for this visit.
      }
      queueRef.current = [];
      if (lang === "off") {
        setCaptions((lines) => lines.map((line) => ({ ...line, translating: false })));
        return;
      }
      const target = lang;
      setCaptions((lines) => {
        const pending = lines.slice(-24).filter((line) => !cacheRef.current.has(`${target}\u0000${line.text}`));
        const ids = new Set(pending.map((line) => line.id));
        queueRef.current = pending.map((line) => ({ id: line.id, text: line.text, lang: target }));
        return lines.map((line) => {
          const hit = cacheRef.current.get(`${target}\u0000${line.text}`);
          if (hit) return { ...line, translation: hit, translating: false };
          if (ids.has(line.id)) return { ...line, translation: undefined, translating: true };
          return { ...line, translation: undefined, translating: false };
        });
      });
      setCaptionsOn(true);
      scheduleFlush();
    },
    [scheduleFlush],
  );

  const addReaction = useCallback((peerId: string, kind: ReactionKind, id = makeId(8)) => {
    const item = { id, peerId, kind, at: Date.now() };
    setReactions((list) => [...list, item].slice(-24));
  }, []);

  useEffect(() => {
    if (!reactions.length) return;
    const timer = window.setInterval(() => {
      const cutoff = Date.now() - 1700;
      setReactions((list) => (list.some((item) => item.at <= cutoff) ? list.filter((item) => item.at > cutoff) : list));
    }, 400);
    return () => window.clearInterval(timer);
  }, [reactions.length]);

  function relaySheet() {
    const mesh = meshRef.current;
    if (!mesh?.hasChannel()) return;
    const sheet = readSheets().find((item) => item.id === `live:${code}`);
    if (!sheet) return;
    for (const line of sheet.heard) {
      if (!line.id.startsWith("d-") && !line.id.startsWith("open-")) continue;
      if (sharedRef.current.has(line.id)) continue;
      sharedRef.current.add(line.id);
      mesh.send({ type: "sheet-line", id: line.id, name: line.name, text: line.text });
    }
    for (const card of sheet.cards) {
      if (card.kind !== "task" && card.kind !== "note" && card.kind !== "mail") continue;
      const token = card.kind === "task" ? `${card.id}:${card.done ? "1" : "0"}` : card.id;
      if (sharedRef.current.has(token)) continue;
      if (sharedRef.current.size > 480) sharedRef.current.clear();
      sharedRef.current.add(token);
      mesh.send({ type: "sheet-card", card });
    }
  }

  useEffect(() => subscribeSheets(relaySheet), [code]);

  useEffect(() => {
    if (phase !== "live") return;
    if (!selfId.current) selfId.current = `p${makeId(10)}`;
    setStartedAt(Date.now());
    const mesh = new MeetMesh({
      room: code,
      selfId: selfId.current,
      name: cleanName(nameRef.current),
      getTracks: () => tracksRef.current,
      onPeers: (peers) => {
        setMeshPeers(peers);
        for (const peer of peers) {
          if (!seenRef.current.has(peer.id)) {
            seenRef.current.add(peer.id);
            pushSystem(`${peer.name || "Jemand"} ist im Raum`);
          }
        }
        for (const id of [...seenRef.current]) {
          if (!peers.some((peer) => peer.id === id)) {
            seenRef.current.delete(id);
            pushSystem("Jemand hat den Raum verlassen");
          }
        }
      },
      onRoom: setRoom,
      onChannel: () => {
        mesh.send({ type: "presence", ...presenceRef.current });
        relaySheet();
        mesh.send({ type: "session", brief: sessionBrief(code) });
      },
      onData: (peerId, data) => {
        if (!isRecord(data) || typeof data.type !== "string") return;
        if (data.type === "presence") {
          setPresence((current) => ({
            ...current,
            [peerId]: {
              mic: Boolean(data.mic),
              cam: Boolean(data.cam),
              hand: Boolean(data.hand),
              screen: Boolean(data.screen),
              name: typeof data.name === "string" ? cleanName(data.name) : current[peerId]?.name || "Gast",
            },
          }));
          return;
        }
        if (data.type === "chat" && typeof data.text === "string" && typeof data.id === "string") {
          const id = data.id.slice(0, 40);
          const text = stripStealth(data.text).trim().slice(0, 500);
          if (!text) return;
          const who =
            typeof data.name === "string" && data.name.trim()
              ? cleanName(data.name)
              : namesRef.current[peerId] || "Gast";
          setChat((lines) => {
            if (lines.some((line) => line.id === id)) return lines;
            return [...lines, { id, name: who, text, at: Date.now(), kind: "user" as const }].slice(-200);
          });
          return;
        }
        if (data.type === "reaction" && typeof data.kind === "string" && KINDS.has(data.kind as ReactionKind)) {
          addReaction(peerId, data.kind as ReactionKind, typeof data.id === "string" ? data.id.slice(0, 40) : makeId(8));
          return;
        }
        if (data.type === "caption" && typeof data.text === "string" && typeof data.id === "string") {
          const id = data.id.slice(0, 40);
          const text = stripStealth(data.text).trim().slice(0, 300);
          if (!text) return;
          const who =
            typeof data.name === "string" && data.name.trim()
              ? cleanName(data.name)
              : namesRef.current[peerId] || "Gast";
          addCaption({
            id,
            name: who,
            text,
            at: Date.now(),
          });
          return;
        }
        if (data.type === "sheet-line" && typeof data.id === "string" && typeof data.text === "string") {
          const id = data.id.slice(0, 40);
          const text = stripStealth(data.text).trim().slice(0, 240);
          if (!text) return;
          if (sharedRef.current.size > 480) sharedRef.current.clear();
          sharedRef.current.add(id);
          const who = typeof data.name === "string" && data.name.trim() ? cleanName(data.name) : namesRef.current[peerId] || "Gast";
          applySharedLine(code, { id, name: who, text });
          return;
        }
        if (data.type === "sheet-card") {
          const card = sharedCard(data.card);
          if (!card) return;
          sharedRef.current.add(card.id);
          applySharedCard(code, card);
          return;
        }
        if (data.type === "session") {
          const label = applyBrief(data.brief);
          if (label) flash(`Sitzung eingeklinkt: ${label}`);
        }
      },
    });
    meshRef.current = mesh;
    void mesh.join();
    return () => {
      mesh.close();
      if (meshRef.current === mesh) meshRef.current = null;
    };
    // The room session is keyed by the code. Name updates travel over presence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, code]);

  useEffect(() => {
    const map: Record<string, string> = {};
    for (const peer of meshPeers) map[peer.id] = presence[peer.id]?.name || peer.name || "Gast";
    namesRef.current = map;
  }, [meshPeers, presence]);

  useEffect(() => {
    if (phase !== "live") return;
    refreshDevices();
    const pull = () => refreshDevices();
    navigator.mediaDevices?.addEventListener("devicechange", pull);
    return () => navigator.mediaDevices?.removeEventListener("devicechange", pull);
  }, [phase, refreshDevices]);

  useEffect(() => {
    if (phase !== "live" || !demoLive(code)) return;
    window.dispatchEvent(new CustomEvent("arc-task", { detail: DEMO_TASK }));
  }, [phase, code]);

  useEffect(() => {
    if (phase !== "live" || !startedAt) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [phase, startedAt]);

  useEffect(() => {
    if (!speakerId) return;
    document.querySelectorAll("video").forEach((node) => {
      const video = node as HTMLVideoElement & { setSinkId?: (id: string) => Promise<void> };
      void video.setSinkId?.(speakerId).catch(() => {});
    });
  }, [speakerId, meshPeers, videoTrack, screenTrack]);

  useEffect(() => {
    if (phase !== "live" || !captionsOn) {
      setInterim("");
      return;
    }
    const rec = speechRecognizer();
    if (!rec) {
      flash("Live-Untertitel brauchen Chrome oder Edge.");
      setCaptionsOn(false);
      return;
    }
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    let stopped = false;
    rec.onresult = (event) => {
      let pending = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result?.[0]?.transcript?.trim() ?? "";
        if (!text) continue;
        if (result?.isFinal) {
          const id = makeId(8);
          addCaption({ id, name: nameRef.current, text, at: Date.now() });
          if (shareRef.current) meshRef.current?.send({ type: "caption", id, text, name: nameRef.current });
        } else {
          pending = text;
        }
      }
      setInterim(pending);
    };
    rec.onerror = (event) => {
      if (event.error === "not-allowed") flash("Mikrofon für Untertitel blockiert.");
    };
    rec.onend = () => {
      if (stopped) return;
      try {
        rec.start();
      } catch {
        // The browser ended recognition; the next toggle can retry.
      }
    };
    try {
      rec.start();
    } catch {
      flash("Untertitel konnten nicht starten.");
    }
    return () => {
      stopped = true;
      setInterim("");
      try {
        rec.stop();
      } catch {
        // already stopped
      }
    };
  }, [phase, captionsOn, lang, addCaption, flash]);

  const takeTrack = useCallback((current: MediaStreamTrack | null, next: MediaStreamTrack | null) => {
    if (current && current !== next) current.stop();
    return next;
  }, []);

  const enableDevices = useCallback(async () => {
    lensYield(["tageszone", "gedanke", "hub", "pruefung", "stimme"]);
    try {
      const opened = await openMicAndCamera(micId || undefined, camId || undefined);
      if (opened.audio) {
        opened.audio.enabled = true;
        setAudioTrack((current) => takeTrack(current, opened.audio));
        setMicOn(true);
      }
      if (opened.video) {
        opened.video.enabled = true;
        setVideoTrack((current) => takeTrack(current, opened.video));
        setCamOn(true);
      }
      if (!opened.audio && !opened.video) flash("Kein Gerät gestartet.");
      else if (!opened.audio || !opened.video) flash("Nur ein Gerät konnte gestartet werden.");
      refreshDevices();
    } catch (error) {
      flash(mediaError(error));
    }
  }, [micId, camId, flash, refreshDevices, takeTrack]);

  const devicesArmed = useRef(false);
  useEffect(() => {
    if (phase !== "live" || devicesArmed.current) return;
    devicesArmed.current = true;
    const pending = takePrimedDevices();
    if (!pending) {
      void enableDevices();
      return;
    }
    void pending.then((opened) => {
      if (opened.audio) {
        opened.audio.enabled = true;
        setAudioTrack((current) => takeTrack(current, opened.audio));
        setMicOn(true);
      }
      if (opened.video) {
        opened.video.enabled = true;
        setVideoTrack((current) => takeTrack(current, opened.video));
        setCamOn(true);
      }
      if (opened.error) flash(opened.error);
      else if (!opened.audio || !opened.video) flash("Nur ein Gerät konnte gestartet werden.");
      refreshDevices();
    });
  }, [phase, enableDevices, flash, refreshDevices, takeTrack]);

  const toggleMic = useCallback(async () => {
    if (audioTrack) {
      audioTrack.enabled = !micOn;
      setMicOn(!micOn);
      return;
    }
    try {
      const track = await openMic(micId || undefined);
      if (!track) return;
      track.enabled = true;
      setAudioTrack(track);
      setMicOn(true);
      refreshDevices();
    } catch (error) {
      flash(mediaError(error));
    }
  }, [audioTrack, micOn, micId, flash, refreshDevices]);

  const toggleCam = useCallback(async () => {
    if (videoTrack) {
      videoTrack.enabled = !camOn;
      setCamOn(!camOn);
      return;
    }
    try {
      lensYield(["tageszone", "gedanke", "hub", "pruefung", "stimme"]);
      const track = await openCamera(camId || undefined);
      if (!track) return;
      track.enabled = true;
      setVideoTrack(track);
      setCamOn(true);
      refreshDevices();
    } catch (error) {
      flash(mediaError(error));
    }
  }, [videoTrack, camOn, camId, flash, refreshDevices]);

  const toggleScreen = useCallback(async () => {
    if (screenTrack) {
      screenTrack.stop();
      setScreenTrack(null);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = stream.getVideoTracks()[0];
      if (!track) return;
      track.onended = () => setScreenTrack((current) => (current === track ? null : current));
      setScreenTrack(track);
    } catch (error) {
      if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "AbortError")) return;
      flash(mediaError(error));
    }
  }, [screenTrack, flash]);

  const chooseMic = useCallback(
    async (id: string) => {
      setMicId(id);
      if (!audioTrack) return;
      try {
        const track = await openMic(id);
        if (!track) return;
        track.enabled = micOn;
        setAudioTrack((current) => takeTrack(current, track));
      } catch (error) {
        flash(mediaError(error));
      }
    },
    [audioTrack, micOn, flash, takeTrack],
  );

  const chooseCam = useCallback(
    async (id: string) => {
      setCamId(id);
      if (!videoTrack) return;
      try {
        lensYield(["tageszone", "gedanke", "hub", "pruefung", "stimme"]);
        const track = await openCamera(id);
        if (!track) return;
        track.enabled = camOn;
        setVideoTrack((current) => takeTrack(current, track));
      } catch (error) {
        flash(mediaError(error));
      }
    },
    [videoTrack, camOn, flash, takeTrack],
  );

  const sendChat = useCallback((text: string) => {
    const trimmed = text.trim().slice(0, 500);
    if (!trimmed) return;
    const id = makeId(8);
    setChat((lines) =>
      [...lines, { id, name: nameRef.current, text: trimmed, at: Date.now(), kind: "user" as const, self: true }].slice(-200),
    );
    meshRef.current?.send({ type: "chat", id, text: trimmed, name: nameRef.current });
  }, []);

  const sayAs = useCallback((speaker: string, text: string) => {
    const trimmed = text.trim().slice(0, 500);
    if (!trimmed) return;
    const id = makeId(8);
    const who = cleanName(speaker);
    setChat((lines) => [...lines, { id, name: who, text: trimmed, at: Date.now(), kind: "user" as const }].slice(-200));
    meshRef.current?.send({ type: "chat", id, text: trimmed, name: who });
  }, []);

  const react = useCallback(
    (kind: ReactionKind) => {
      const id = makeId(8);
      addReaction("self", kind, id);
      meshRef.current?.send({ type: "reaction", id, kind });
    },
    [addReaction],
  );

  const peers: PeerView[] = useMemo(
    () =>
      meshPeers.map((peer) => {
        const state = presence[peer.id];
        return {
          ...peer,
          name: state?.name || peer.name || "Gast",
          mic: state?.mic ?? false,
          cam: state?.cam ?? false,
          hand: state?.hand ?? false,
          screen: state?.screen ?? Boolean(peer.screenStream),
        };
      }),
    [meshPeers, presence],
  );

  const contextText = useMemo(() => {
    const transcript = captions.map((line) => `${line.name}: ${line.text}`).join("\n") || "(leer)";
    const talk =
      chat
        .filter((line) => line.kind === "user")
        .map((line) => `${line.name}: ${line.text}`)
        .join("\n") || "(leer)";
    const note = notes.trim() || "(leer)";
    return `TRANSKRIPT:\n${transcript}\n\nCHAT:\n${talk}\n\nNOTIZEN:\n${note}`.slice(0, 8000);
  }, [captions, chat, notes]);

  const contextEmpty = captions.length === 0 && chat.every((line) => line.kind !== "user") && !notes.trim();

  const ask = useCallback(
    async (intent: "summary" | "actions" | "reply" | "ask", question = "") => {
      if (aiBusy) return;
      if ((intent === "summary" || intent === "actions") && contextEmpty) {
        setAi((lines) => [
          ...lines,
          {
            role: "assistant" as const,
            text: "Noch nichts zum Auswerten. Schalte Untertitel ein, schreib im Chat oder mach eine Notiz.",
          },
        ]);
        return;
      }
      if (intent === "ask" && !question.trim() && contextEmpty) {
        setAi((lines) => [
          ...lines,
          { role: "assistant" as const, text: "Stell eine Frage, oder sammle erst ein paar Untertitel und Notizen." },
        ]);
        return;
      }
      const label =
        intent === "summary"
          ? "Fasse das Gespräch zusammen"
          : intent === "actions"
            ? "Welche nächsten Schritte stehen an?"
            : intent === "reply"
              ? question.trim() || "Formuliere eine Wortmeldung"
              : question.trim();
      setAi((lines) => [...lines, { role: "user" as const, text: label }].slice(-30));
      setAiBusy(true);
      let result: AssistantResult;
      try {
        result = await askRunde({ data: { intent, context: `${profileLines()}\n\n${contextText}`, question: question.trim() } });
      } catch {
        result = { ok: false, error: "Die Anfrage ist fehlgeschlagen." };
      }
      setAiBusy(false);
      setAi((lines) => [...lines, { role: "assistant" as const, text: result.ok ? result.text : result.error }].slice(-30));
    },
    [aiBusy, contextEmpty, contextText],
  );

  const toggleRecord = useCallback(async () => {
    const active = recorderRef.current;
    if (active && active.state === "recording") {
      active.stop();
      return;
    }
    const ctx = new AudioContext();
    recordCtx.current = ctx;
    await ctx.resume().catch(() => {});
    const dest = ctx.createMediaStreamDestination();
    let sources = 0;
    const attach = (track: MediaStreamTrack | null | undefined) => {
      if (!track || track.readyState !== "live" || !track.enabled) return;
      ctx.createMediaStreamSource(new MediaStream([track])).connect(dest);
      sources += 1;
    };
    if (micOn) attach(audioTrack);
    for (const peer of meshPeers) {
      if (presence[peer.id]?.mic === false) continue;
      for (const track of peer.camStream?.getAudioTracks() ?? []) attach(track);
    }
    if (!sources) {
      await ctx.close();
      recordCtx.current = null;
      flash("Kein offenes Mikrofon zum Aufnehmen.");
      return;
    }
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(dest.stream, { mimeType: mime });
    } catch {
      await ctx.close();
      flash("Aufnahme wird von diesem Browser nicht unterstützt.");
      return;
    }
    recordChunks.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) recordChunks.current.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(recordChunks.current, { type: recorder.mimeType || "audio/webm" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      link.href = url;
      link.download = `runde-${code}-${stamp}.webm`;
      link.click();
      URL.revokeObjectURL(url);
      void ctx.close();
      recordCtx.current = null;
      recorderRef.current = null;
      setRecording(false);
    };
    recorderRef.current = recorder;
    recorder.start();
    setRecording(true);
  }, [audioTrack, micOn, meshPeers, presence, flash, code]);

  const enter = useCallback(() => setPhase("live"), []);

  const localAudioStream = useMemo(
    () => (audioTrack && micOn ? new MediaStream([audioTrack]) : null),
    [audioTrack, micOn],
  );
  const localVideoStream = useMemo(() => {
    const shown = cueTrack ?? (videoTrack && camOn ? videoTrack : null);
    return shown ? new MediaStream([shown]) : null;
  }, [cueTrack, videoTrack, camOn]);
  const localScreenStream = useMemo(
    () => (screenTrack ? new MediaStream([screenTrack]) : null),
    [screenTrack],
  );

  return {
    phase,
    enter,
    name,
    setName,
    displayName: cleanName(name),
    audioTrack,
    videoTrack,
    screenTrack,
    micOn,
    camOn,
    hand,
    setHand,
    captionsOn,
    setCaptionsOn,
    shareCaptions,
    setShareCaptions,
    lang,
    setLang,
    translateTo,
    setTranslateTo,
    mirror,
    setMirror,
    devices,
    deviceLabel,
    micId,
    camId,
    speakerId,
    setSpeakerId,
    chooseMic,
    chooseCam,
    peers,
    room,
    chat,
    captions,
    interim,
    reactions,
    notes,
    setNotes,
    ai,
    aiBusy,
    banner,
    recording,
    elapsed: startedAt ? now - startedAt : 0,
    enableDevices,
    toggleMic,
    toggleCam,
    toggleScreen,
    sendChat,
    sayAs,
    react,
    ask,
    toggleRecord,
    localAudioStream,
    localVideoStream,
    localScreenStream,
    burned: Boolean(cueTrack),
  };
}

function sharedCard(value: unknown): SheetCard | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.kind !== "string") return null;
  const id = value.id.slice(0, 40);
  const at = Date.now();
  if (value.kind === "task" && typeof value.title === "string") {
    return { id, at, kind: "task", title: value.title.slice(0, 140), body: typeof value.body === "string" ? value.body.slice(0, 280) : "", ...(value.done === true ? { done: true } : {}) };
  }
  if (value.kind === "note" && typeof value.text === "string") {
    return { id, at, kind: "note", text: value.text.slice(0, 500) };
  }
  if (value.kind === "mail" && typeof value.subject === "string") {
    return { id, at, kind: "mail", subject: value.subject.slice(0, 120), body: typeof value.body === "string" ? value.body.slice(0, 500) : "" };
  }
  return null;
}
