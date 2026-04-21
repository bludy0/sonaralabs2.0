import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { AxiosError } from "axios";
import { useAuthStore } from "../store/useAuthStore";

export default function LoginPage() {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState<string | null>(null);

  const login      = useAuthStore(s => s.login);
  const loginDemo  = useAuthStore(s => s.loginDemo);
  const isLoading  = useAuthStore(s => s.isLoading);
  const navigate   = useNavigate();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    try {
      await login(email, password);
      navigate("/generate");
    } catch (err) {
      const axiosErr = err as AxiosError<{ error: string }>;
      setError(axiosErr.response?.data?.error ?? "Login failed. Please try again.");
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{ background: "#0e0e0e" }}
    >
      {/* Decorative grid lines */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, #ffdd73 0px, transparent 1px, transparent 48px), repeating-linear-gradient(90deg, #ffdd73 0px, transparent 1px, transparent 48px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div
        className="relative w-full max-w-sm rounded-lg p-8 space-y-7"
        style={{ background: "#131313" }}
      >
        {/* Brand */}
        <div>
          <p
            className="text-[9px] font-semibold tracking-[0.25em] uppercase mb-1"
            style={{ color: "#ababab" }}
          >
            AI_CORE_v2.0
          </p>
          <h1
            className="text-2xl font-bold uppercase leading-none"
            style={{ letterSpacing: "-0.01em", color: "#ffffff" }}
          >
            Sign in
          </h1>
          <p className="text-[12px] mt-1" style={{ color: "#484848" }}>
            Welcome back to Sonaralabs
          </p>
        </div>

        {/* Divider */}
        <div className="h-px" style={{ background: "#1f2937" }} />

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          {/* Email */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="email"
              className="text-[9px] font-bold tracking-[0.2em] uppercase"
              style={{ color: "#484848" }}
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
              onChange={e => setEmail(e.target.value)}
              className="rounded-lg px-3 py-3 text-sm outline-none transition-all duration-100"
              style={{
                background: "#1f2937",
                color: "#ffffff",
                border: "1px solid #1f2937",
              }}
              placeholder="you@example.com"
              onFocus={e => (e.currentTarget.style.borderColor = "#ffdd73")}
              onBlur={e => (e.currentTarget.style.borderColor = "#1f2937")}
            />
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="password"
              className="text-[9px] font-bold tracking-[0.2em] uppercase"
              style={{ color: "#484848" }}
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
                background: "#1f2937",
                color: "#ffffff",
                border: "1px solid #1f2937",
              }}
              placeholder="••••••••"
              onFocus={e => (e.currentTarget.style.borderColor = "#ffdd73")}
              onBlur={e => (e.currentTarget.style.borderColor = "#1f2937")}
            />
          </div>

          {error && (
            <p
              className="rounded-lg px-3 py-2 text-[11px]"
              style={{ background: "rgba(255,115,81,0.08)", color: "#ff7351" }}
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="mt-1 rounded-lg py-3 text-sm font-bold uppercase tracking-wider transition-all duration-100 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: "#ffdd73",
              color: "#624e00",
              boxShadow: "0px 0px 20px rgba(250,204,21,0.3)",
            }}
            onMouseEnter={e =>
              !isLoading && ((e.currentTarget as HTMLButtonElement).style.boxShadow = "0px 0px 28px rgba(250,204,21,0.5)")
            }
            onMouseLeave={e =>
              ((e.currentTarget as HTMLButtonElement).style.boxShadow = "0px 0px 20px rgba(250,204,21,0.3)")
            }
          >
            {isLoading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {/* Demo mode */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px" style={{ background: "#1f2937" }} />
            <span className="text-[10px]" style={{ color: "#484848" }}>or</span>
            <div className="flex-1 h-px" style={{ background: "#1f2937" }} />
          </div>
          <button
            type="button"
            onClick={() => { loginDemo(); navigate("/studio"); }}
            className="rounded-lg py-2.5 text-xs font-semibold uppercase tracking-wider transition-all duration-100"
            style={{
              background: "transparent",
              color: "#7c6dfa",
              border: "1px solid #3a3470",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = "#3a3470"
              e.currentTarget.style.borderColor = "#7c6dfa"
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = "transparent"
              e.currentTarget.style.borderColor = "#3a3470"
            }}
          >
            ⚡ Try Demo — No signup needed
          </button>
        </div>

        <p className="text-center text-[11px]" style={{ color: "#484848" }}>
          Don&apos;t have an account?{" "}
          <Link to="/register" style={{ color: "#ffdd73" }}>
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
