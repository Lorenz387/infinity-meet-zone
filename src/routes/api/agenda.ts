import { createFileRoute } from "@tanstack/react-router";

async function handle({ request }: { request: Request }) {
  const { handleAgenda } = await import("@/lib/os/agenda.server");
  return handleAgenda(request);
}

export const Route = createFileRoute("/api/agenda")({
  server: { handlers: { GET: handle, POST: handle } },
});
