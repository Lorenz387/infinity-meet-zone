import { useSyncExternalStore } from "react";
import { MeetMesh, type MeshPeerState, type MeshRoomInfo } from "@/lib/meet/mesh";
import { lensDrop, lensTake, lensYield } from "@/lib/meet/lens";
import { cleanName, makeId, mediaError, openCamera, openMic, openMicAndCamera } from "@/lib/meet/media";
import { getHold } from "@/lib/os/hold";
import { THEME } from "@/lib/os/theme";

export type VoicePeer = { id: string; name: string; stream: MediaStream | null; failed?: boolean };

export const VOICE_LIMIT = "Ohne direkte Verbindung der Netze kommt Ton und Bild nicht zustande.";

export type VoiceSnap = {
  live: boolean;
  mic: boolean;
  cam: boolean;
  note: string;
  self: MediaStream | null;
  peers: VoicePeer[];
  room: string;
};

const QUIET: VoiceSnap = { live: false, mic: false, cam: false, note: "", self: null, peers: [], room: "" };

let snap: VoiceSnap = QUIET;
let mesh: MeetMesh | null = null;
let audio: MediaStreamTrack | null = null;
let video: MediaStreamTrack | null = null;
let micOn = false;
let camOn = false;
let generation = 0;
const listeners = new Set<() => void>();

function emit(next: VoiceSnap) {
  snap = next;
  listeners.forEach((listen) => listen());
}

function peerId() {
  const existing = sessionStorage.getItem("arc-voice-peer");
  if (existing && /^v[a-z0-9]{8}$/.test(existing)) return existing;
  const next = `v${makeId(8)}`;
  sessionStorage.setItem("arc-voice-peer", next);
  return next;
}

function liveTracks() {
  return [audio, video].filter((track): track is MediaStreamTrack => !!track && track.enabled && track.readyState === "live");
}

function sameStream(stream: MediaStream | null, tracks: MediaStreamTrack[]) {
  if (!stream) return tracks.length === 0;
  const current = stream.getTracks();
  return current.length === tracks.length && tracks.every((track) => current.includes(track));
}

let voiceRoom = "";

function paint(note = snap.note) {
  const failed = snap.peers.some((peer) => peer.failed);
  const shown = !note && failed ? VOICE_LIMIT : !failed && note === VOICE_LIMIT ? "" : note;
  const tracks = liveTracks();
  const self = sameStream(snap.self, tracks) ? snap.self : tracks.length ? new MediaStream(tracks) : null;
  emit({ live: Boolean(mesh), mic: micOn, cam: camOn, note: shown, self, peers: snap.peers, room: mesh ? voiceRoom : "" });
}

function tracks() {
  return {
    audio: micOn ? audio : null,
    video: camOn ? video : null,
    screen: null,
  };
}

export function getVoice() {
  return snap;
}

export function subscribeVoice(listen: () => void) {
  listeners.add(listen);
  return () => listeners.delete(listen);
}

export function useVoice() {
  return useSyncExternalStore(subscribeVoice, getVoice, () => QUIET);
}

export function stopVoice() {
  generation += 1;
  voiceRoom = "";
  lensDrop("stimme");
  audio?.stop();
  video?.stop();
  audio = null;
  video = null;
  micOn = false;
  camOn = false;
  mesh?.close();
  mesh = null;
  emit({ ...QUIET });
}

export async function startVoice(room: string, name: string) {
  if (getHold()) {
    emit({ ...snap, note: `Ton und Bild laufen schon in ${THEME}.` });
    return;
  }
  if (mesh) return;
  lensYield(["tageszone", "gedanke", "hub", "pruefung"]);
  const gen = generation + 1;
  generation = gen;
  try {
    const opened = await openMicAndCamera();
    if (gen !== generation) {
      opened.audio?.stop();
      opened.video?.stop();
      return;
    }
    audio = opened.audio;
    video = opened.video;
    micOn = Boolean(audio);
    camOn = Boolean(video);
    voiceRoom = room;
    if (audio) audio.enabled = true;
    if (video) video.enabled = true;
    if (video) lensTake("stimme", video, () => stopVoice());
    const next = new MeetMesh({
      room,
      selfId: peerId(),
      name: cleanName(name),
      getTracks: tracks,
      onPeers: (peers: MeshPeerState[]) => {
        if (gen !== generation) return;
        snap = {
          ...snap,
          peers: peers.map((peer) => ({
            id: peer.id,
            name: peer.name || "Gast",
            stream: peer.camStream,
            failed: peer.connectionState === "failed",
          })),
        };
        paint();
      },
      onRoom: (info: MeshRoomInfo) => {
        if (gen !== generation) return;
        if (info.full) paint("Sechs Personen sprechen schon. Mehr gehen in diesem Gespräch nicht.");
        else if (info.status === "error") paint("Ton und Bild erreichen den Raum nicht.");
        else paint(opened.audio && opened.video ? "" : "Nur ein Gerät konnte starten.");
      },
      onData: () => {},
      onChannel: () => {
        void next.syncTracks();
      },
    });
    mesh = next;
    paint(micOn || camOn ? "" : "Kein Gerät gestartet.");
    void next.join();
  } catch (error) {
    if (gen !== generation) return;
    stopVoice();
    emit({ ...QUIET, note: mediaError(error) });
  }
}

export async function toggleVoiceMic() {
  if (!mesh) return;
  if (!audio) {
    try {
      audio = await openMic();
    } catch (error) {
      paint(mediaError(error));
      return;
    }
  }
  if (!audio) return;
  micOn = !micOn;
  audio.enabled = micOn;
  paint("");
  void mesh.syncTracks();
}

export async function toggleVoiceCam() {
  if (!mesh) return;
  if (!video) {
    lensYield(["tageszone", "gedanke", "hub", "pruefung"]);
    try {
      video = await openCamera();
    } catch (error) {
      paint(mediaError(error));
      return;
    }
  }
  if (!video) return;
  lensTake("stimme", video, () => stopVoice());
  camOn = !camOn;
  video.enabled = camOn;
  paint("");
  void mesh.syncTracks();
}
