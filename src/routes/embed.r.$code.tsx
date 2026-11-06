import { Link, createFileRoute } from "@tanstack/react-router";
import { Call } from "@/components/meet/call";
import { Mark } from "@/components/meet/mark";
import { cleanCode } from "@/lib/meet/media";

export const Route = createFileRoute("/embed/r/$code")({
  component: EmbedRoom,
});

function EmbedRoom() {
  const { code } = Route.useParams();
  const clean = cleanCode(code);
  if (clean !== code.toLowerCase() || clean.length < 4) {
    return (
      <main className="grid min-h-dvh place-items-center bg-ink px-4">
        <div className="w-full max-w-md rounded-3xl border border-line bg-panel p-6 text-center">
          <Mark className="mx-auto size-11" />
          <h1 className="mt-4 font-display text-3xl text-paper">Dieser Code trägt nicht</h1>
          <Link to="/" className="mt-6 inline-flex h-12 items-center rounded-full bg-copper px-5 font-medium text-ink">
            Zum Schreibtisch
          </Link>
        </div>
      </main>
    );
  }
  return <Call code={clean} embedded />;
}
