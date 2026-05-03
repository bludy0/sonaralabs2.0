import { useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { AxiosError } from "axios";
import { useAuthStore } from "../store/useAuthStore";
import { api } from "../lib/api";

export default function LoginPage() {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState<string | null>(null);
  const [emailNotVerified, setEmailNotVerified] = useState(false);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const login         = useAuthStore(s => s.login);
  const isLoading     = useAuthStore(s => s.isLoading);
  const navigate      = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionExpired = searchParams.get("reason") === "expired";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setEmailNotVerified(false);
    try {
      await login(email, password);
      navigate("/generate");
    } catch (err) {
      const axiosErr = err as AxiosError<{ error: string; message?: string }>;
      const errCode  = axiosErr.response?.data?.error;
      if (errCode === "email_not_verified") {
        setEmailNotVerified(true);
      } else {
        setError(axiosErr.response?.data?.message ?? axiosErr.response?.data?.error ?? "Login failed. Please try again.");
      }
    }
  }

  async function handleResend() {
    setResendState("sending");
    try {
      await api.post("/api/auth/resend-verification", { email });
      setResendState("sent");
    } catch {
      setResendState("error");
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{ background: "var(--bg-page)" }}
    >
      {/* Decorative grid lines */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, var(--accent) 0px, transparent 1px, transparent 48px), repeating-linear-gradient(90deg, var(--accent) 0px, transparent 1px, transparent 48px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div
        className="relative w-full max-w-sm rounded-lg p-8 space-y-7"
        style={{ background: "var(--bg-card)" }}
      >
        {/* Brand */}
        <div>
          <p
            className="text-[9px] font-semibold tracking-[0.25em] uppercase mb-1"
            style={{ color: "var(--text-2)" }}
          >
            AI_CORE_v2.0
          </p>
          <h1
            className="text-2xl font-bold uppercase leading-none"
            style={{ letterSpacing: "-0.01em", color: "var(--text-1)" }}
          >
            Sign in
          </h1>
          <p className="text-[12px] mt-1" style={{ color: "var(--text-3)" }}>
            Welcome back to Sonaralabs
          </p>
        </div>

        {/* Session-expired banner */}
        {sessionExpired && (
          <div
            className="rounded-lg px-3 py-2.5 text-[11px] leading-relaxed"
            style={{
              background: "color-mix(in srgb, var(--warning) 10%, transparent)",
              border:     "1px solid color-mix(in srgb, var(--warning) 30%, transparent)",
              color:      "var(--warning)",
            }}
          >
            Your session has expired. Please sign in again.
          </div>
        )}

        {/* Divider */}
        <div className="h-px" style={{ background: "var(--bg-input)" }} />

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          {/* Email */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="email"
              className="text-[9px] font-bold tracking-[0.2em] uppercase"
              style={{ color: "var(--text-3)" }}
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={e => { setEmail(e.target.value); setEmailNotVerified(false); setResendState("idle"); }}
              className="rounded-lg px-3 py-3 text-sm outline-none transition-all duration-100"
              style={{
                background: "var(--bg-input)",
                color: "var(--text-1)",
                border: "1px solid var(--bg-border)",
              }}
              placeholder="you@example.com"
              onFocus={e => (e.currentTarget.style.borderColor = "var(--accent)")}
              onBlur={e => (e.currentTarget.style.borderColor = "var(--bg-input)")}
            />
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="password"
              className="text-[9px] font-bold tracking-[0.2em] uppercase"
              style={{ color: "var(--text-3)" }}
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="rounded-lg px-3 py-3 text-sm outline-none transition-all duration-100"
              style={{
                background: "var(--bg-input)",
                color: "var(--text-1)",
                border: "1px solid var(--bg-border)",
              }}
              placeholder="••••••••"
              onFocus={e => (e.currentTarget.style.borderColor = "var(--accent)")}
              onBlur={e => (e.currentTarget.style.borderColor = "var(--bg-input)")}
            />
          </div>

          {/* Generic error */}
          {error && (
            <p
              className="rounded-lg px-3 py-2 text-[11px]"
              style={{ background: "color-mix(in srgb, var(--error) 8%, transparent)", color: "var(--error)" }}
            >
              {error}
            </p>
          )}

          {/* Email not verified banner */}
          {emailNotVerified && (
            <div
              className="rounded-lg px-3 py-3 flex flex-col gap-2"
              style={{ background: "color-mix(in srgb, var(--accent) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 20%, transparent)" }}
            >
              <p className="text-[11px]" style={{ color: "var(--text-1)" }}>
                Your email address isn't verified yet. Check your inbox for the activation link.
              </p>

              {resendState === "sent" ? (
                <p className="text-[11px]" style={{ color: "var(--accent)" }}>
                  ✓ New verification email sent — check your inbox.
                </p>
              ) : resendState === "error" ? (
                <p className="text-[11px]" style={{ color: "var(--error)" }}>
                  Failed to resend. Try again in a moment.
                </p>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendState === "sending"}
                  className="self-start text-[11px] font-semibold underline underline-offset-2 disabled:opacity-50"
                  style={{ color: "var(--accent)" }}
                >
                  {resendState === "sending" ? "Sending…" : "Resend verification email"}
                </button>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="mt-1 rounded-lg py-3 text-sm font-bold uppercase tracking-wider transition-all duration-100 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: "var(--accent)",
              color: "var(--accent-on)",
              boxShadow: "0px 0px 20px color-mix(in srgb, var(--accent) 30%, transparent)",
            }}
            onMouseEnter={e =>
              !isLoading && ((e.currentTarget as HTMLButtonElement).style.boxShadow = "0px 0px 28px color-mix(in srgb, var(--accent) 50%, transparent)")
            }
            onMouseLeave={e =>
              ((e.currentTarget as HTMLButtonElement).style.boxShadow = "0px 0px 20px color-mix(in srgb, var(--accent) 30%, transparent)")
            }
          >
            {isLoading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="text-center text-[11px]" style={{ color: "var(--text-3)" }}>
          Don&apos;t have an account?{" "}
          <Link to="/register" style={{ color: "var(--accent)" }}>
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
