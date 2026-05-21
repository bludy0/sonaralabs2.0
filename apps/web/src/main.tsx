import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn:         import.meta.env.VITE_SENTRY_DSN as string,
    environment: import.meta.env.MODE,
    release:     import.meta.env.VITE_APP_VERSION as string | undefined,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,   // 10% of transactions
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
