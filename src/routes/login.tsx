import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  return (
    <main id="inhalt" className="studio grid min-h-dvh place-items-center px-4 py-8">
      <div className="w-full max-w-sm">
        <p className="text-sm text-mist">
          <Link to="/" className="text-paper underline-offset-4 hover:underline">
            Zum Schreibtisch
          </Link>
        </p>
        <h1 className="mt-4 font-display text-4xl text-paper">Konto</h1>
        <p className="mt-3 text-sm text-paper">Die Anmeldung bindet neue Zeilen an den Namen des Kontos. Sie verkauft nichts.</p>
        {authEnabled ? (
          <div className="mt-6 space-y-2">
            {GROK_PROVIDERS.map((provider) => (
              <button
                key={provider.providerId}
                type="button"
                onClick={() => signIn(provider.providerId, { callbackURL: "/" })}
                className="h-11 w-full rounded-full border border-line bg-panel text-sm text-paper"
              >
                Weiter mit {provider.label}
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-6 text-sm text-mist">Die Anmeldung ist aus.</p>
        )}
      </div>
    </main>
  );
}
