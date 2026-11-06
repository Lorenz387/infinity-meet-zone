import { defaultIceServers } from "@/lib/multiplayer";
import type { SignalKind } from "@/lib/multiplayer";

export type MeshPeerState = {
  id: string;
  name: string;
  connectionState: RTCPeerConnectionState;
  camStream: MediaStream | null;
  screenStream: MediaStream | null;
};

export type MeshRoomInfo = {
  status: "connecting" | "live" | "error";
  full: boolean;
};

type Tracks = {
  audio: MediaStreamTrack | null;
  video: MediaStreamTrack | null;
  screen: MediaStreamTrack | null;
};

type MeshOptions = {
  room: string;
  selfId: string;
  name: string;
  getTracks: () => Tracks;
  onPeers: (peers: MeshPeerState[]) => void;
  onRoom: (info: MeshRoomInfo) => void;
  onData: (peerId: string, data: unknown) => void;
  onChannel: (peerId: string) => void;
};

type Slot = {
  id: string;
  name: string;
  pc: RTCPeerConnection;
  audioTx: RTCRtpTransceiver;
  videoTx: RTCRtpTransceiver;
  screenTx?: RTCRtpTransceiver;
  dc: RTCDataChannel | null;
  makingOffer: boolean;
  ignoreOffer: boolean;
  pending: RTCIceCandidateInit[];
  connectionState: RTCPeerConnectionState;
  remoteTracks: Map<string, MediaStreamTrack>;
  remoteCameraMid: string | null;
  remoteScreenMid: string | null;
  camStream: MediaStream | null;
  screenStream: MediaStream | null;
};

const FAST_MS = 450;
const IDLE_MS = 2000;
const ROOM_CAP = 6;

function asPayload(payload: unknown): unknown {
  if (typeof payload !== "string") return payload;
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    return payload;
  }
}

function sameTracks(stream: MediaStream, tracks: MediaStreamTrack[]) {
  const current = stream.getTracks();
  return current.length === tracks.length && tracks.every((track) => current.includes(track));
}

function reuseStream(prev: MediaStream | null, tracks: MediaStreamTrack[]) {
  if (!tracks.length) return null;
  if (prev && sameTracks(prev, tracks)) return prev;
  return new MediaStream(tracks);
}

async function replaceIfNeeded(tx: RTCRtpTransceiver, track: MediaStreamTrack | null) {
  if (tx.sender.track === track) return;
  await tx.sender.replaceTrack(track);
}

function setDir(tx: RTCRtpTransceiver, dir: RTCRtpTransceiverDirection) {
  if (tx.direction !== dir) tx.direction = dir;
}

export class MeetMesh {
  private readonly peers = new Map<string, Slot>();
  private readonly queues = new Map<string, Promise<void>>();
  private readonly screenStream = new MediaStream();
  private cursor = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private everPolled = false;
  private failures = 0;
  private full = false;
  private fingerprint = "";
  private status: MeshRoomInfo["status"] = "connecting";
  name: string;

  constructor(private readonly opts: MeshOptions) {
    this.name = opts.name.slice(0, 64);
  }

  async join() {
    try {
      await this.pollOnce();
    } catch {
      // The loop retries.
    }
    if (!this.closed) this.schedule(this.needsFast() ? FAST_MS : IDLE_MS);
  }

  close() {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    for (const slot of this.peers.values()) slot.pc.close();
    this.peers.clear();
    void fetch("/api/rtc", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "leave", room: this.opts.room, peer: this.opts.selfId }),
      keepalive: true,
    }).catch(() => {});
  }

  send(data: unknown) {
    const wire = JSON.stringify(data);
    for (const slot of this.peers.values()) {
      if (slot.dc?.readyState === "open") slot.dc.send(wire);
    }
  }

  hasChannel() {
    for (const slot of this.peers.values()) {
      if (slot.dc?.readyState === "open") return true;
    }
    return false;
  }

  async syncTracks() {
    const tracks = this.opts.getTracks();
    await Promise.all(
      [...this.peers.values()].map((slot) => this.applyTracks(slot, tracks).catch(() => {})),
    );
  }

  private async applyTracks(slot: Slot, tracks: Tracks) {
    await replaceIfNeeded(slot.audioTx, tracks.audio);
    setDir(slot.audioTx, tracks.audio ? "sendrecv" : "recvonly");
    await replaceIfNeeded(slot.videoTx, tracks.video);
    setDir(slot.videoTx, tracks.video ? "sendrecv" : "recvonly");
    if (tracks.screen) {
      if (!slot.screenTx) {
        slot.screenTx = slot.pc.addTransceiver(tracks.screen, {
          direction: "sendrecv",
          streams: [this.screenStream],
        });
      } else {
        await replaceIfNeeded(slot.screenTx, tracks.screen);
        setDir(slot.screenTx, "sendrecv");
      }
    } else if (slot.screenTx) {
      await replaceIfNeeded(slot.screenTx, null);
      setDir(slot.screenTx, "recvonly");
    }
  }

  private schedule(delay: number) {
    if (this.closed) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.poll(), delay);
  }

  private needsFast() {
    for (const slot of this.peers.values()) {
      if (slot.connectionState !== "connected") return true;
    }
    return false;
  }

  private setRoom(status: MeshRoomInfo["status"]) {
    this.status = status;
    this.opts.onRoom({ status, full: this.full });
  }

  private async poll() {
    if (this.closed) return;
    try {
      await this.pollOnce();
    } catch {
      this.failures += 1;
      if (!this.everPolled && this.failures >= 3) this.setRoom("error");
    }
    this.schedule(this.needsFast() ? FAST_MS : IDLE_MS);
  }

  private async pollOnce() {
    const params = new URLSearchParams({
      room: this.opts.room,
      peer: this.opts.selfId,
      name: this.name,
      since: String(this.cursor),
    });
    const res = await fetch(`/api/rtc?${params}`);
    if (this.closed) return;
    if (!res.ok) throw new Error(`signaling ${res.status}`);
    const body = (await res.json()) as {
      peers?: { id: string; name: string }[];
      signals?: { id: number; from: string; kind: SignalKind; payload: unknown }[];
    };
    if (this.closed) return;
    this.failures = 0;
    if (!this.everPolled) {
      this.everPolled = true;
      this.setRoom("live");
    }
    const peers = body.peers ?? [];
    this.reconcile(peers);
    const roster = new Set(peers.map((peer) => peer.id));
    const names = new Map(peers.map((peer) => [peer.id, peer.name]));
    for (const signal of body.signals ?? []) {
      const id = Number(signal.id);
      if (Number.isFinite(id)) this.cursor = Math.max(this.cursor, id);
      await this.onSignal(signal.from, signal.kind, signal.payload, roster, names.get(signal.from) ?? "");
      if (this.closed) return;
    }
  }

  private allowedIds(peers: { id: string }[]) {
    return new Set(
      [...peers]
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .slice(0, ROOM_CAP)
        .map((peer) => peer.id),
    );
  }

  private reconcile(peers: { id: string; name: string }[]) {
    const allowed = this.allowedIds(peers);
    const selfIn = allowed.has(this.opts.selfId);
    const wasFull = this.full;
    this.full = !selfIn;
    if (!selfIn) {
      this.dropAll();
      this.emit();
      if (!wasFull) this.opts.onRoom({ status: this.status, full: true });
      return;
    }
    if (wasFull) this.opts.onRoom({ status: this.status, full: false });
    const alive = new Set<string>();
    for (const peer of peers) {
      if (peer.id === this.opts.selfId || !allowed.has(peer.id)) continue;
      alive.add(peer.id);
      const existing = this.peers.get(peer.id);
      if (existing) {
        if (existing.name !== peer.name) {
          existing.name = peer.name;
        }
      } else {
        this.connectTo(peer.id, peer.name, this.opts.selfId > peer.id);
      }
    }
    for (const [id, slot] of this.peers) {
      if (!alive.has(id)) {
        slot.pc.close();
        this.peers.delete(id);
      }
    }
    this.emit();
  }

  private dropAll() {
    for (const slot of this.peers.values()) slot.pc.close();
    this.peers.clear();
  }

  private connectTo(peerId: string, name: string, initiator: boolean): Slot | null {
    if (this.closed) return null;
    const existing = this.peers.get(peerId);
    if (existing) return existing;
    const pc = new RTCPeerConnection({
      iceServers: defaultIceServers(),
      bundlePolicy: "max-bundle",
    });
    const tracks = this.opts.getTracks();
    const audioTx = tracks.audio
      ? pc.addTransceiver(tracks.audio, { direction: "sendrecv" })
      : pc.addTransceiver("audio", { direction: "recvonly" });
    const videoTx = tracks.video
      ? pc.addTransceiver(tracks.video, { direction: "sendrecv" })
      : pc.addTransceiver("video", { direction: "recvonly" });
    const slot: Slot = {
      id: peerId,
      name,
      pc,
      audioTx,
      videoTx,
      dc: null,
      makingOffer: false,
      ignoreOffer: false,
      pending: [],
      connectionState: pc.connectionState,
      remoteTracks: new Map(),
      remoteCameraMid: null,
      remoteScreenMid: null,
      camStream: null,
      screenStream: null,
    };
    if (tracks.screen) {
      slot.screenTx = pc.addTransceiver(tracks.screen, {
        direction: "sendrecv",
        streams: [this.screenStream],
      });
    }
    this.peers.set(peerId, slot);

    pc.onicecandidate = (event) => {
      if (event.candidate) void this.sendSignal(peerId, "ice", event.candidate.toJSON());
    };
    pc.onconnectionstatechange = () => {
      slot.connectionState = pc.connectionState;
      this.emit();
      if (pc.connectionState === "failed") {
        try {
          pc.restartIce();
        } catch {
          // A dead pair stays visible as failed.
        }
      }
    };
    pc.onsignalingstatechange = () => {
      if (pc.signalingState === "stable") this.sendMap(slot);
    };
    pc.onnegotiationneeded = () => {
      void this.offer(slot);
    };
    pc.ondatachannel = (event) => {
      if (event.channel.label === "meet") this.bindDc(slot, event.channel);
    };
    pc.ontrack = (event) => {
      const mid = event.transceiver.mid || event.track.id;
      slot.remoteTracks.set(mid, event.track);
      const drop = () => {
        if (slot.remoteTracks.get(mid) === event.track) slot.remoteTracks.delete(mid);
        this.reclassify(slot);
        this.emit();
      };
      event.track.addEventListener("ended", drop);
      this.reclassify(slot);
      this.emit();
    };
    if (initiator) this.bindDc(slot, pc.createDataChannel("meet"));
    if (initiator) {
      queueMicrotask(() => {
        if (!this.closed && this.peers.get(peerId) === slot && !slot.pc.localDescription) {
          void this.offer(slot);
        }
      });
    }
    return slot;
  }

  private async offer(slot: Slot) {
    const pc = slot.pc;
    if (slot.makingOffer || pc.signalingState !== "stable") return;
    try {
      slot.makingOffer = true;
      await pc.setLocalDescription();
      if (this.closed || !pc.localDescription) return;
      await this.sendSignal(slot.id, "offer", pc.localDescription.toJSON());
    } catch {
      // The next negotiationneeded retries.
    } finally {
      slot.makingOffer = false;
    }
  }

  private bindDc(slot: Slot, channel: RTCDataChannel) {
    slot.dc = channel;
    let windowStart = 0;
    let seen = 0;
    channel.onopen = () => {
      this.sendMap(slot);
      this.opts.onChannel(slot.id);
    };
    channel.onmessage = (event) => {
      const now = Date.now();
      if (now - windowStart > 10_000) {
        windowStart = now;
        seen = 0;
      }
      seen += 1;
      if (seen > 40) return;
      const raw = typeof event.data === "string" ? event.data : "";
      if (!raw || raw.length > 12_000) return;
      let msg: { type?: string; cameraMid?: string | null; screenMid?: string | null };
      try {
        msg = JSON.parse(raw) as typeof msg;
      } catch {
        return;
      }
      if (msg.type === "media-map") {
        slot.remoteCameraMid = typeof msg.cameraMid === "string" ? msg.cameraMid : null;
        slot.remoteScreenMid = typeof msg.screenMid === "string" ? msg.screenMid : null;
        this.reclassify(slot);
        this.emit();
        return;
      }
      this.opts.onData(slot.id, msg);
    };
  }

  private sendMap(slot: Slot) {
    if (slot.dc?.readyState !== "open" || !slot.videoTx.mid) return;
    slot.dc.send(
      JSON.stringify({
        type: "media-map",
        cameraMid: slot.videoTx.mid,
        screenMid: slot.screenTx?.mid ?? null,
      }),
    );
  }

  private reclassify(slot: Slot) {
    const cam: MediaStreamTrack[] = [];
    const screen: MediaStreamTrack[] = [];
    for (const [mid, track] of slot.remoteTracks) {
      if (track.readyState === "ended") continue;
      if (track.kind === "video" && slot.remoteScreenMid && mid === slot.remoteScreenMid) screen.push(track);
      else cam.push(track);
    }
    slot.camStream = reuseStream(slot.camStream, cam);
    slot.screenStream = reuseStream(slot.screenStream, screen);
  }

  private emit() {
    const peers = [...this.peers.values()].map((slot) => ({
      id: slot.id,
      name: slot.name,
      connectionState: slot.connectionState,
      camStream: slot.camStream,
      screenStream: slot.screenStream,
    }));
    const fingerprint = peers
      .map((peer) =>
        [
          peer.id,
          peer.name,
          peer.connectionState,
          peer.camStream?.getTracks().map((track) => track.id).join(",") ?? "",
          peer.screenStream?.getTracks().map((track) => track.id).join(",") ?? "",
        ].join(":"),
      )
      .join("|");
    if (fingerprint === this.fingerprint) return;
    this.fingerprint = fingerprint;
    this.opts.onPeers(peers);
  }

  private async onSignal(
    from: string,
    kind: SignalKind,
    payload: unknown,
    roster: Set<string>,
    name: string,
  ) {
    if (this.closed || from === this.opts.selfId) return;
    let slot = this.peers.get(from);
    if (!slot) {
      if (!roster.has(from)) return;
      const created = this.connectTo(from, name, false);
      if (!created) return;
      slot = created;
    }
    const polite = this.opts.selfId < from;
    try {
      if (kind === "offer" || kind === "answer") {
        const description = asPayload(payload) as RTCSessionDescriptionInit;
        const collision = kind === "offer" && (slot.makingOffer || slot.pc.signalingState !== "stable");
        slot.ignoreOffer = !polite && collision;
        if (slot.ignoreOffer) return;
        await slot.pc.setRemoteDescription(description);
        if (this.closed) return;
        await this.flush(slot);
        if (kind === "offer") {
          await slot.pc.setLocalDescription();
          if (this.closed || !slot.pc.localDescription) return;
          await this.sendSignal(from, "answer", slot.pc.localDescription.toJSON());
        }
      } else if (kind === "ice") {
        const candidate = asPayload(payload) as RTCIceCandidateInit;
        if (!slot.pc.remoteDescription) {
          slot.pending.push(candidate);
          return;
        }
        await slot.pc.addIceCandidate(candidate);
      }
    } catch {
      // The next offer cycle converges.
    }
  }

  private async flush(slot: Slot) {
    while (slot.pending.length) {
      const candidate = slot.pending.shift();
      if (!candidate) return;
      try {
        await slot.pc.addIceCandidate(candidate);
      } catch {
        if (!slot.ignoreOffer) return;
      }
    }
  }

  private sendSignal(to: string, kind: SignalKind, payload: unknown) {
    const prev = this.queues.get(to) ?? Promise.resolve();
    const next = prev.then(() => this.postSignal(to, kind, payload));
    this.queues.set(
      to,
      next.catch(() => {}),
    );
    return next;
  }

  private async postSignal(to: string, kind: SignalKind, payload: unknown) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (this.closed) return;
      try {
        const res = await fetch("/api/rtc", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            op: "signal",
            room: this.opts.room,
            from: this.opts.selfId,
            to,
            kind,
            payload,
          }),
        });
        if (res.ok) return;
      } catch {
        // retry
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
}
