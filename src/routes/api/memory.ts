import { createFileRoute } from "@tanstack/react-router";

async function handle({ request }: { request: Request }) {
  const { handleMemory } = await import("@/lib/os/memory.server");
  return handleMemory(request);
}

export const Route = createFileRoute("/api/memory")({
  server: { handlers: { GET: handle, POST: handle } },
});
