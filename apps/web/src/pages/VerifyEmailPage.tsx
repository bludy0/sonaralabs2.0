import { useEffect, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { AxiosError } from "axios";
import { api } from "../lib/api";
import { useAuthStore } from "../store/useAuthStore";
import { useT } from "../store/useI18nStore";

type State = "verifying" | "success" | "error";

export default function VerifyEmailPage() {
  const t = useT();
  const [searchParams]        = useSearchParams();
  const [state, setState]     = useState<State>("verifying");
  const [message, setMessage] = useState("");
  const navigate = useNavigate();
  const fetchMe  = useAuthStore(s => s.fetchMe);

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setState("error");
      setMessage(t.auth.invalidToken);
      return;
    }

    api
      .get(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(async () => {
        await fetchMe();
        setState("success");
        setTimeout(() => navigate("/generate", { replace: true }), 2000);
      })
      .catch((err: AxiosError<{ message?: string; error?: string }>) => {
        const msg =
          err.response?.data?.message ??
          err.response?.data?.error ??
          t.auth.verificationFailed;
        setState("error");
        setMessage(msg);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        <p className="text-[9px] font-semibold tracking-[0.25em] uppercase" style={{ color: "var(--text-2)" }}>
          AI_CORE_v2.0
        </p>

        {state === "verifying" && (
          <>
            <div
              className="mx-auto w-12 h-12 rounded-full border-2 animate-spin"
              style={{
                borderColor: "color-mix(in srgb, var(--accent) 20%, transparent)",
                borderTopColor: "var(--accent)",
              }}
            />
            <h1 className="text-xl font-bold uppercase" style={{ color: "var(--text-1)", letterSpacing: "-0.01em" }}>
              {t.auth.verifying}
            </h1>
            <p className="text-sm" style={{ color: "var(--text-3)" }}>
              {t.auth.verifyingWait}
            </p>
          </>
        )}

        {state === "success" && (
          <>
            <div
              className="mx-auto w-14 h-14 rounded-full flex items-center justify-center text-2xl"
              style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)" }}
            >
              ✓
            </div>
            <h1 className="text-xl font-bold uppercase" style={{ color: "var(--text-1)", letterSpacing: "-0.01em" }}>
              {t.auth.emailVerified}
            </h1>
            <p className="text-sm" style={{ color: "var(--text-2)" }}>
              {t.auth.accountActive}
            </p>
          </>
        )}

        {state === "error" && (
          <>
            <div
              className="mx-auto w-14 h-14 rounded-full flex items-center justify-center text-2xl"
              style={{ background: "color-mix(in srgb, var(--error) 12%, transparent)" }}
            >
              ✕
            </div>
            <h1 className="text-xl font-bold uppercase" style={{ color: "var(--text-1)", letterSpacing: "-0.01em" }}>
              {t.auth.verificationFailed}
            </h1>
            <p
              className="text-sm rounded-lg px-3 py-2"
              style={{ background: "color-mix(in srgb, var(--error) 8%, transparent)", color: "var(--error)" }}
            >
              {message}
            </p>
            <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
              <Link to="/login" style={{ color: "var(--accent)" }}>{t.auth.loginLink}</Link>{" "}
              — {t.auth.requestNewLink}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
