import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { OsBoot } from "@/components/os/boot";
import { ConsentBanner } from "@/components/os/consent-banner";
import { HeldCall } from "@/components/os/held-call";
import { THEME } from "@/lib/os/theme";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: THEME },
      {
        name: "description",
        content: `${THEME} ist das Gespräch. Arcy ist der persönliche Assistent. Der Schreibtisch bleibt auf diesem Rechner, bis du ihn mitnimmst.`,
      },
      { name: "theme-color", content: "#101410" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
    ],
  }),
  component: () => (
    <html lang="de" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <PreviewHostBridge />
        <OsBoot />
        <AuthProvider>
          <Outlet />
          <HeldCall />
          <ConsentBanner />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
