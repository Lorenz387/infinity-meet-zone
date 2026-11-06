import { createFileRoute } from "@tanstack/react-router";

async function handle({ request }: { request: Request }) {
  const { handleShare } = await import("@/lib/os/share.server");
  return handleShare(request);
}

export const Route = createFileRoute("/api/share")({
  server: { handlers: { GET: handle, POST: handle } },
});
