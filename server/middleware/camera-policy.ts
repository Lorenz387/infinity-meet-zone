const POLICY = "camera=(self), microphone=(self), display-capture=(self), autoplay=(self)";

export default async function cameraPolicy(_event: unknown, next: () => Promise<unknown> | unknown) {
  const result = await next();
  if (!(result instanceof Response)) return result;
  if (result.headers.has("permissions-policy")) return result;
  const headers = new Headers(result.headers);
  headers.set("Permissions-Policy", POLICY);
  return new Response(result.body, { status: result.status, statusText: result.statusText, headers });
}
