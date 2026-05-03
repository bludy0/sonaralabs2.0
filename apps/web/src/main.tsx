import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App";
import "./index.css";

// Sentry is only active when VITE_SENTRY_DSN is set (production builds).
// In development the DSN is absent so the SDK becomes a no-op.
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN as string,
    environment: import.meta.env.MODE,
    release:     import.meta.env.VITE_APP_VERSION,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: false }),
    ],
    tracesSampleRate:         0.1,   // 10% of page loads
    replaysSessionSampleRate: 0,     // no replays on normal sessions
    replaysOnErrorSampleRate: 1.0,   // full replay on errors
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
