import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useT } from "../store/useI18nStore";
import { useFixedTheme } from "../hooks/useFixedTheme";

export default function ForgotPasswordPage() {
  useFixedTheme();
  const t = useT();
  const [email, setEmail]   = useState("");
  const [state, setState]   = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setState("loading");
    setErrMsg(null);
    try {
      await api.post("/api/auth/forgot-password", { email: email.trim() });
      setState("sent");
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? t.common.error;
      setErrMsg(msg);
      setState("error");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: "var(--bg-page)" }}>
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, var(--accent) 0px, transparent 1px, transparent 48px), repeating-linear-gradient(90deg, var(--accent) 0px, transparent 1px, transparent 48px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div className="relative w-full max-w-sm rounded-lg p-8 space-y-7" style={{ background: "var(--bg-card)" }}>
        <div>
          <p className="text-[9px] font-semibold tracking-[0.25em] uppercase mb-1" style={{ color: "var(--text-2)" }}>
            AI_CORE_v2.0
          </p>
          <h1 className="text-2xl font-bold uppercase leading-none" style={{ letterSpacing: "-0.01em", color: "var(--text-1)" }}>
            {t.auth.forgotTitle}
          </h1>
          <p className="text-[12px] mt-1" style={{ color: "var(--text-3)" }}>
            {t.auth.forgotSubtitle}
          </p>
        </div>

        <div className="h-px" style={{ background: "var(--bg-input)" }} />

        {state === "sent" ? (
          <div className="space-y-4 text-center">
            <span className="material-symbols-outlined block" style={{ fontSize: 40, color: "var(--accent)" }}>
              mark_email_read
            </span>
            <p className="text-[13px]" style={{ color: "var(--text-1)" }}>
              {t.auth.resetSent}
            </p>
            <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
              {t.auth.resetSentHint}
            </p>
            <Link to="/login" className="inline-block mt-2 text-[11px] font-semibold underline underline-offset-2" style={{ color: "var(--accent)" }}>
              {t.auth.loginLink}
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-[9px] font-bold tracking-[0.2em] uppercase" style={{ color: "var(--text-3)" }}>
                {t.auth.email}
              </label>
              <input
                id="email" type="email" autoComplete="email" required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="rounded-lg px-3 py-3 text-sm outline-none transition-all duration-100"
                style={{ background: "var(--bg-input)", color: "var(--text-1)", border: "1px solid var(--bg-border)" }}
                placeholder="you@example.com"
                onFocus={e => (e.currentTarget.style.borderColor = "var(--accent)")}
                onBlur={e =>  (e.currentTarget.style.borderColor = "var(--bg-border)")}
              />
            </div>

            {state === "error" && errMsg && (
              <p className="rounded-lg px-3 py-2 text-[11px]" style={{ background: "color-mix(in srgb, var(--error) 8%, transparent)", color: "var(--error)" }}>
                {errMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={state === "loading"}
              className="mt-1 rounded-lg py-3 text-sm font-bold uppercase tracking-wider transition-all duration-100 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "var(--accent)", color: "var(--accent-on)", boxShadow: "0px 0px 20px color-mix(in srgb, var(--accent) 30%, transparent)" }}
            >
              {state === "loading" ? t.auth.sending : t.auth.sendResetLink}
            </button>

            <p className="text-center text-[11px]" style={{ color: "var(--text-3)" }}>
              <Link to="/login" style={{ color: "var(--accent)" }}>{t.auth.loginLink}</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
