import { Link, createFileRoute } from "@tanstack/react-router";
import { useLayoutEffect } from "react";
import { Mark } from "@/components/meet/mark";
import { cleanCode } from "@/lib/meet/media";
import { holdCall } from "@/lib/os/hold";

export const Route = createFileRoute("/r/$code")({
  component: RoomPage,
});

function RoomPage() {
  const { code } = Route.useParams();
  const normalized = code.toLowerCase();
  const clean = cleanCode(code);
  if (clean !== normalized || clean.length < 4) {
    return (
      <main className="studio grid min-h-dvh place-items-center px-4">
        <div className="w-full max-w-md rounded-3xl border border-line bg-panel p-6 text-center">
          <Mark className="mx-auto size-11" />
          <h1 className="mt-4 font-display text-3xl text-paper">Dieser Code trägt nicht</h1>
          <p className="mt-2 text-mist">Raumcodes sind vier bis zwölf Buchstaben oder Ziffern.</p>
          <Link
            to="/"
            className="mt-6 inline-flex h-12 items-center justify-center rounded-full bg-copper px-5 font-medium text-ink"
          >
            Zurück zum Schreibtisch
          </Link>
        </div>
      </main>
    );
  }
  return <HoldRoom code={clean} />;
}

function HoldRoom({ code }: { code: string }) {
  useLayoutEffect(() => {
    holdCall(code);
  }, [code]);
  return null;
}
