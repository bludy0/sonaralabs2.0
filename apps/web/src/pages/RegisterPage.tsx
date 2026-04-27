import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { AxiosError } from "axios";
import { useAuthStore } from "../store/useAuthStore";
import { api } from "../lib/api";

export default function RegisterPage() {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError]       = useState<string | null>(null);
  const [verifyNeeded, setVerifyNeeded] = useState(false);

  const register  = useAuthStore(s => s.register);
  const isLoading = useAuthStore(s => s.isLoading);
  const navigate  = useNavigate();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (username && !/^[a-z0-9_]{3,30}$/.test(username)) {
      setError("Username must be 3–30 chars: lowercase letters, numbers, underscores only.");
      return;
    }

    let requiresVerification = false;
    try {
      requiresVerification = await register(email, password);
    } catch (err) {
      const axiosErr = err as AxiosError<{ error: string }>;
      setError(axiosErr.response?.data?.error ?? "Registration failed. Please try again.");
      return;
    }

    if (requiresVerification) {
      setVerifyNeeded(true);
      return;
    }

    // Immediate login path (dev mode / email disabled)
    if (username.trim()) {
      try {
        await api.put("/api/profile/me", { username: username.trim() });
      } catch (err) {
        const axiosErr = err as AxiosError<{ error: string }>;
        if (axiosErr.response?.status === 409) {
          setError("Username already taken. You can update it later from your profile.");
        }
      }
    }

    navigate("/generate");
  }

  const inputStyle = {
    background: "var(--bg-input)",
    color: "var(--text-1)",
    border: "1px solid var(--bg-border)",
  };

  // ── Email check state ─────────────────────────────────────────────────────────
  if (verifyNeeded) {
    return (
      <div
        className="flex min-h-screen items-center justify-center px-4"
        style={{ background: "var(--bg-page)" }}
      >
        <div
          className="fixed inset-0 pointer-events-none opacity-[0.04]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, var(--accent) 0px, transparent 1px, transparent 48px), repeating-linear-gradient(90deg, var(--accent) 0px, transparent 1px, transparent 48px)",
            backgroundSize: "48px 48px",
          }}
        />

        <div
          className="relative w-full max-w-sm rounded-lg p-8 space-y-6 text-center"
          style={{ background: "var(--bg-card)" }}
        >
          {/* Icon */}
          <div
            className="mx-auto w-14 h-14 rounded-full flex items-center justify-center text-2xl"
            style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)" }}
          >
            ✉️
          </div>

          <div>
            <p
              className="text-[9px] font-semibold tracking-[0.25em] uppercase mb-1"
              style={{ color: "var(--text-2)" }}
            >
              AI_CORE_v2.0
            </p>
            <h1
              className="text-xl font-bold uppercase leading-none"
              style={{ letterSpacing: "-0.01em", color: "var(--text-1)" }}
            >
              Check your inbox
            </h1>
          </div>

          <p className="text-sm" style={{ color: "var(--text-2)" }}>
            We sent a verification link to{" "}
            <span style={{ color: "var(--accent)" }}>{email}</span>.
            <br />
            Click the link to activate your account.
          </p>

          <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
            Didn't receive the email? Check your spam folder or{" "}
            <Link to="/login" style={{ color: "var(--accent)" }}>
              go to sign in
            </Link>{" "}
            to resend.
          </p>
        </div>
      </div>
    );
  }

  // ── Register form ─────────────────────────────────────────────────────────────
  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{ background: "var(--bg-page)" }}
    >
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
            Create account
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--accent)" }} />
            <p className="text-[11px]" style={{ color: "var(--text-2)" }}>
              Start with 100 free credits
            </p>
          </div>
        </div>

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
              id="email" name="email" type="email"
              autoComplete="email" required
              value={email} onChange={e => setEmail(e.target.value)}
              className="rounded-lg px-3 py-3 text-sm outline-none transition-all duration-100"
              style={inputStyle}
              placeholder="you@example.com"
              onFocus={e => (e.currentTarget.style.borderColor = "var(--accent)")}
              onBlur={e =>  (e.currentTarget.style.borderColor = "var(--bg-input)")}
            />
          </div>

          {/* Username (optional) */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="username"
              className="text-[9px] font-bold tracking-[0.2em] uppercase"
              style={{ color: "var(--text-3)" }}
            >
              Username{" "}
              <span className="normal-case font-normal" style={{ color: "var(--text-3)" }}>
                (optional)
              </span>
            </label>
            <input
              id="username" name="username" type="text"
              autoComplete="username"
              value={username} onChange={e => setUsername(e.target.value.toLowerCase())}
              className="rounded-lg px-3 py-3 text-sm outline-none transition-all duration-100"
              style={inputStyle}
              placeholder="e.g. pixel_composer"
              maxLength={30}
              onFocus={e => (e.currentTarget.style.borderColor = "var(--accent)")}
              onBlur={e =>  (e.currentTarget.style.borderColor = "var(--bg-input)")}
            />
            <p className="text-[9px]" style={{ color: "var(--text-3)" }}>
              3–30 chars · lowercase · letters, numbers, underscores
            </p>
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
              id="password" name="password" type="password"
              autoComplete="new-password" required
              value={password} onChange={e => setPassword(e.target.value)}
              className="rounded-lg px-3 py-3 text-sm outline-none transition-all duration-100"
              style={inputStyle}
              placeholder="••••••••"
              onFocus={e => (e.currentTarget.style.borderColor = "var(--accent)")}
              onBlur={e =>  (e.currentTarget.style.borderColor = "var(--bg-input)")}
            />
          </div>

          {error && (
            <p
              className="rounded-lg px-3 py-2 text-[11px]"
              style={{ background: "color-mix(in srgb, var(--error) 8%, transparent)", color: "var(--error)" }}
            >
              {error}
            </p>
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
            onMouseEnter={e => !isLoading && ((e.currentTarget as HTMLButtonElement).style.boxShadow = "0px 0px 28px color-mix(in srgb, var(--accent) 50%, transparent)")}
            onMouseLeave={e =>                ((e.currentTarget as HTMLButtonElement).style.boxShadow = "0px 0px 20px color-mix(in srgb, var(--accent) 30%, transparent)")}
          >
            {isLoading ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="text-center text-[11px]" style={{ color: "var(--text-3)" }}>
          Already have an account?{" "}
          <Link to="/login" style={{ color: "var(--accent)" }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
