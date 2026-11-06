export type RoomJob = {
  id: string;
  room: string;
  status: string;
  at: number;
  touch?: { status?: number };
};

export type FillState = {
  code: string;
  touched: boolean;
  joined: boolean;
  restored: boolean;
  imported: string;
};

export function jobRoom(job: RoomJob) {
  return job.room.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
}

export function suggestJob(jobs: RoomJob[]): RoomJob | null {
  const usable = jobs.filter((job) => jobRoom(job).length >= 4);
  const running = usable.filter((job) => job.status === "läuft");
  if (running.length) {
    return [...running].sort((a, b) => (b.touch?.status ?? b.at) - (a.touch?.status ?? a.at) || b.at - a.at)[0] ?? null;
  }
  return [...usable].sort((a, b) => b.at - a.at)[0] ?? null;
}

export function nextCode(state: FillState, jobs: RoomJob[]): { code: string; imported: string } {
  if (state.joined || state.restored || state.touched) return { code: state.code, imported: state.imported };
  const room = jobRoom(suggestJob(jobs) ?? { id: "", room: "", status: "", at: 0 });
  if (room.length < 4) return { code: state.code, imported: state.imported };
  if (!state.code || state.code === state.imported) return { code: room, imported: room };
  return { code: state.code, imported: state.imported };
}
