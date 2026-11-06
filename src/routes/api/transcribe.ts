import { createFileRoute } from "@tanstack/react-router";

async function handle({ request }: { request: Request }) {
  const { transcribeUpload } = await import("@/lib/meet/transcribe.server");
  return transcribeUpload(request);
}

export const Route = createFileRoute("/api/transcribe")({
  server: { handlers: { POST: handle } },
});
