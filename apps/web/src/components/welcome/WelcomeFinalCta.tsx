import { Link } from "react-router-dom";
import { useAuthStore } from "../../store/useAuthStore";

export function WelcomeFinalCta() {
  const user = useAuthStore(s => s.user);

  return (
    <section className="px-4 sm:px-6 pb-16 sm:pb-28">
      <div
        className="max-w-4xl mx-auto rounded-2xl p-8 sm:p-12 md:p-16 text-center relative overflow-hidden"
        style={{
          background: "var(--bg-card)",
          border: "1px solid color-mix(in srgb, var(--accent) 28%, transparent)",
        }}
      >
        {/* Glow — sabit, hafif */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 80% 55% at 50% 110%, color-mix(in srgb, var(--accent) 8%, transparent), transparent)",
          }}
        />

        <div className="relative z-10">
          <h2
            className="font-black uppercase mb-4 sm:mb-5 leading-[0.9]"
            style={{
              fontSize: "clamp(2rem, 6.5vw, 5rem)",
              letterSpacing: "-0.03em",
              color: "var(--text-1)",
            }}
          >
            Your game deserves
            <br />
            <span style={{ color: "var(--accent)" }}>
              better audio.
            </span>
          </h2>
          <p
            className="text-sm mb-7 sm:mb-10 mx-auto"
            style={{ color: "var(--text-3)", maxWidth: "400px", lineHeight: 1.75 }}
          >
            Join game developers using Sonaralabs to compose, mix and export
            game-ready audio — without leaving the browser.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
            <Link
              to={user ? "/generate" : "/register"}
              className="w-full sm:w-auto px-8 sm:px-12 py-3.5 sm:py-4 rounded-xl text-sm font-black uppercase tracking-widest transition-all"
              style={{
                background: "var(--accent)",
                color: "var(--accent-on)",
                textDecoration: "none",
                boxShadow: "0 0 52px color-mix(in srgb, var(--accent) 48%, transparent)",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.boxShadow = "0 0 80px color-mix(in srgb, var(--accent) 70%, transparent)";
                e.currentTarget.style.transform = "translateY(-2px) scale(1.02)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.boxShadow = "0 0 52px color-mix(in srgb, var(--accent) 48%, transparent)";
                e.currentTarget.style.transform = "translateY(0) scale(1)";
              }}
            >
              {user ? "Go to Dashboard →" : "Create Free Account →"}
            </Link>
            {!user && (
              <Link
                to="/login"
                className="text-sm font-semibold tracking-wider transition-colors"
                style={{ color: "var(--text-3)", textDecoration: "none" }}
                onMouseEnter={e => (e.currentTarget.style.color = "var(--text-1)")}
                onMouseLeave={e => (e.currentTarget.style.color = "var(--text-3)")}
              >
                Already have an account? Sign in
              </Link>
            )}
          </div>

          <p className="mt-8 text-[11px] font-semibold tracking-wider" style={{ color: "var(--text-3)" }}>
            Free to start · No credit card required · Contact us for credits
          </p>
        </div>
      </div>
    </section>
  );
}
