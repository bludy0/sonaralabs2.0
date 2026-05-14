import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { AxiosError } from "axios";
import { useAuthStore } from "../store/useAuthStore";
import { api } from "../lib/api";
import { useT } from "../store/useI18nStore";

export default function RegisterPage() {
  const t = useT();
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

    // ── İstemci tarafı doğrulamalar ────────────────────────────────────────
    if (username && !/^[a-z0-9_]{3,30}$/.test(username)) {
      setError(t.auth.usernameInvalid);
      return;
    }

    const strongPassword = /^(?=.*[A-Z])(?=.*[0-9]).{8,}$/;
    if (!strongPassword.test(password)) {
      setError(t.auth.passwordWeak);
      return;
    }

    // ── Kayıt isteği ───────────────────────────────────────────────────────
    let requiresVerification = false;
    try {
      requiresVerification = await register(email, password);
    } catch (err) {
      const axiosErr = err as AxiosError<any>;
      if (!axiosErr.response) {
        setError("Sunucuya bağlanılamadı. İnternet bağlantını kontrol et.");
        return;
      }
      const data   = axiosErr.response.data;
      const status = axiosErr.response.status;
      const errStr = typeof data?.error   === "string" ? data.error   : null;
      const msgStr = typeof data?.message === "string" ? data.message : null;
      if (status === 409 || errStr?.toLowerCase().includes("already registered")) {
        setError("Bu e-posta adresi zaten kayıtlı. Giriş yapmayı dene.");
      } else if (errStr?.toLowerCase().includes("password")) {
        setError(t.auth.passwordWeak);
      } else {
        setError(msgStr ?? errStr ?? t.auth.registrationFailed);
      }
      return;
    }

    if (requiresVerification) {
      setVerifyNeeded(true);
      return;
    }

    if (username.trim()) {
      try {
        await api.put("/api/profile/me", { username: username.trim() });
      } catch (err) {
        const axiosErr = err as AxiosError<any>;
        if (axiosErr.response?.status === 409) {
          setError(t.auth.usernameTaken);
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

  if (verifyNeeded) {
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
        <div className="relative w-full max-w-sm rounded-lg p-8 space-y-6 text-center" style={{ background: "var(--bg-card)" }}>
          <div
            className="mx-auto w-14 h-14 rounded-full flex items-center justify-center text-2xl"
            style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)" }}
          >
            ✉️
          </div>
          <div>
            <p className="text-[9px] font-semibold tracking-[0.25em] uppercase mb-1" style={{ color: "var(--text-2)" }}>
              AI_CORE_v2.0
            </p>
            <h1 className="text-xl font-bold uppercase leading-none" style={{ letterSpacing: "-0.01em", color: "var(--text-1)" }}>
              {t.auth.checkInbox}
            </h1>
          </div>
          <p className="text-sm" style={{ color: "var(--text-2)" }}>
            {t.auth.verificationSent.replace("{email}", email)}
          </p>
          <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
            {t.auth.spamHint.replace("{link}", "")}{" "}
            <Link to="/login" style={{ color: "var(--accent)" }}>{t.auth.goToSignIn}</Link>{" "}
            {t.auth.spamHint.includes("{link}") ? "" : ""}
          </p>
        </div>
      </div>
    );
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
            {t.auth.register}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--accent)" }} />
            <p className="text-[11px]" style={{ color: "var(--text-2)" }}>
              {t.auth.startFreeCredits}
            </p>
          </div>
        </div>

        <div className="h-px" style={{ background: "var(--bg-input)" }} />

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-[9px] font-bold tracking-[0.2em] uppercase" style={{ color: "var(--text-3)" }}>
              {t.auth.email}
            </label>
            <input
              id="email" name="email" type="email" autoComplete="email" required
              value={email} onChange={e => setEmail(e.target.value)}
              className="rounded-lg px-3 py-3 text-sm outline-none transition-all duration-100"
              style={inputStyle}
              placeholder="you@example.com"
              onFocus={e => (e.currentTarget.style.borderColor = "var(--accent)")}
              onBlur={e =>  (e.currentTarget.style.borderColor = "var(--bg-input)")}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="username" className="text-[9px] font-bold tracking-[0.2em] uppercase" style={{ color: "var(--text-3)" }}>
              {t.auth.username}{" "}
              <span className="normal-case font-normal" style={{ color: "var(--text-3)" }}>
                {t.auth.usernameOptional}
              </span>
            </label>
            <input
              id="username" name="username" type="text" autoComplete="username"
              value={username} onChange={e => setUsername(e.target.value.toLowerCase())}
              className="rounded-lg px-3 py-3 text-sm outline-none transition-all duration-100"
              style={inputStyle}
              placeholder="e.g. pixel_composer"
              maxLength={30}
              onFocus={e => (e.currentTarget.style.borderColor = "var(--accent)")}
              onBlur={e =>  (e.currentTarget.style.borderColor = "var(--bg-input)")}
            />
            <p className="text-[9px]" style={{ color: "var(--text-3)" }}>
              {t.auth.usernameHint}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-[9px] font-bold tracking-[0.2em] uppercase" style={{ color: "var(--text-3)" }}>
              {t.auth.password}
            </label>
            <input
              id="password" name="password" type="password" autoComplete="new-password" required
              value={password} onChange={e => setPassword(e.target.value)}
              className="rounded-lg px-3 py-3 text-sm outline-none transition-all duration-100"
              style={inputStyle}
              placeholder="••••••••"
              onFocus={e => (e.currentTarget.style.borderColor = "var(--accent)")}
              onBlur={e =>  (e.currentTarget.style.borderColor = "var(--bg-input)")}
            />
          </div>

          {error && (
            <p className="rounded-lg px-3 py-2 text-[11px]" style={{ background: "color-mix(in srgb, var(--error) 8%, transparent)", color: "var(--error)" }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="mt-1 rounded-lg py-3 text-sm font-bold uppercase tracking-wider transition-all duration-100 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "var(--accent)", color: "var(--accent-on)", boxShadow: "0px 0px 20px color-mix(in srgb, var(--accent) 30%, transparent)" }}
            onMouseEnter={e => !isLoading && ((e.currentTarget as HTMLButtonElement).style.boxShadow = "0px 0px 28px color-mix(in srgb, var(--accent) 50%, transparent)")}
            onMouseLeave={e =>               ((e.currentTarget as HTMLButtonElement).style.boxShadow = "0px 0px 20px color-mix(in srgb, var(--accent) 30%, transparent)")}
          >
            {isLoading ? t.auth.registering : t.auth.registerBtn}
          </button>
        </form>

        <p className="text-center text-[11px]" style={{ color: "var(--text-3)" }}>
          {t.auth.hasAccount}{" "}
          <Link to="/login" style={{ color: "var(--accent)" }}>{t.auth.loginLink}</Link>
        </p>
      </div>
    </div>
  );
}
