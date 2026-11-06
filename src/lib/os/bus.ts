export type MeetingNote = {
  type: "meeting";
  active: boolean;
  code: string;
  people: number;
  mic: boolean;
  at: number;
};

export type MeetingCmd = {
  type: "meeting-cmd";
  code: string;
  cmd: "mic" | "hang";
};

const NAME = "arc-os-bus";

function channel() {
  try {
    return new BroadcastChannel(NAME);
  } catch {
    return null;
  }
}

export function publishMeeting(note: MeetingNote) {
  window.dispatchEvent(new CustomEvent("arc-bus", { detail: note }));
  const bus = channel();
  bus?.postMessage(note);
  bus?.close();
}

export function publishCmd(cmd: MeetingCmd) {
  const bus = channel();
  bus?.postMessage(cmd);
  bus?.close();
}

export function subscribeMeeting(onNote: (note: MeetingNote) => void) {
  const onEvent = (event: Event) => {
    const detail = (event as CustomEvent<MeetingNote>).detail;
    if (detail?.type === "meeting") onNote(detail);
  };
  window.addEventListener("arc-bus", onEvent);
  const bus = channel();
  if (bus) {
    bus.onmessage = (event: MessageEvent<MeetingNote | MeetingCmd>) => {
      if (event.data?.type === "meeting") onNote(event.data);
    };
  }
  return () => {
    window.removeEventListener("arc-bus", onEvent);
    bus?.close();
  };
}

export function subscribeCmd(onCmd: (cmd: MeetingCmd) => void) {
  const bus = channel();
  if (!bus) return () => {};
  bus.onmessage = (event: MessageEvent<MeetingNote | MeetingCmd>) => {
    if (event.data?.type === "meeting-cmd") onCmd(event.data);
  };
  return () => bus.close();
}
