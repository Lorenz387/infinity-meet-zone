export const ARC_SOURCE = "arc-os";
export const HOST_SOURCE = "arc-host";

export type HostCommand =
  | { type: "set-look"; scale?: "base" | "read" | "large"; contrast?: boolean }
  | { type: "invite-agent"; id?: string }
  | { type: "copy-context" };

export function emitArc(type: string, payload: unknown) {
  if (typeof window === "undefined" || window.parent === window) return;
  window.parent.postMessage({ source: ARC_SOURCE, type, payload }, "*");
}

export function readHostCommand(data: unknown): HostCommand | null {
  if (!data || typeof data !== "object") return null;
  const row = data as { source?: unknown; type?: unknown; scale?: unknown; contrast?: unknown; id?: unknown };
  if (row.source !== HOST_SOURCE || typeof row.type !== "string") return null;
  if (row.type === "set-look") {
    const scale = row.scale === "read" || row.scale === "large" || row.scale === "base" ? row.scale : undefined;
    return { type: "set-look", scale, contrast: typeof row.contrast === "boolean" ? row.contrast : undefined };
  }
  if (row.type === "invite-agent") return { type: "invite-agent", id: typeof row.id === "string" ? row.id : undefined };
  if (row.type === "copy-context") return { type: "copy-context" };
  return null;
}
