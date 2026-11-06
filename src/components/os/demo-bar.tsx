import { Link } from "@tanstack/react-router";
import { DEMO_ROOM, DEMO_STEPS } from "@/lib/os/demo";

export function DemoBar({ index, onPick }: { index: number; onPick: (index: number) => void }) {
  const current = DEMO_STEPS[index] ?? DEMO_STEPS[0]!;
  return (
    <div className="border-b border-line px-4 py-3">
      <p className="text-xs text-copper">Demo · Atelier Nord · Beispiel, keine Zahlung</p>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
        {DEMO_STEPS.map((step, at) => (
          <button
            key={step.id}
            type="button"
            onClick={() => onPick(at)}
            className={`h-10 shrink-0 rounded-full px-3 text-sm ${at === index ? "bg-copper text-ink" : "border border-line text-paper"}`}
          >
            {step.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-sm text-paper">{current.text}</p>
      {current.room ? (
        <Link to="/r/$code" params={{ code: DEMO_ROOM }} className="mt-2 inline-flex h-11 items-center rounded-full bg-copper px-4 text-sm font-medium text-ink">
          Raum {DEMO_ROOM}
        </Link>
      ) : null}
    </div>
  );
}
