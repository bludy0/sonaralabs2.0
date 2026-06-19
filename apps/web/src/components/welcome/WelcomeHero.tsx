import { Link } from "react-router-dom";
import { useAuthStore } from "../../store/useAuthStore";
import Balatro from "../Balatro";
import { BARS } from "./WelcomeData";

export function WelcomeHero() {
  const user = useAuthStore(s => s.user);

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center text-center px-4 sm:px-6 pt-24 sm:pt-28 pb-0 overflow-hidden">
      {/* Balatro background */}
      <div className="absolute inset-0 pointer-events-none">
        <Balatro
          color1="#7a1a1a"
          color2="#3a0000"
          color3="#0e0e0e"
          spinRotation={-2.0}
          spinSpeed={5.0}
          spinAmount={0.25}
          pixelFilter={700}
          contrast={4.8}
          lighting={0.22}
          spinEase={1.0}
          isRotate={false}
          mouseInteraction={false}
        />
      </div>

      {/* ── Hero content ── */}
      <div className="relative z-10 max-w-4xl mx-auto">
        {/* Headline */}
        <h1
          lang="en"
          className="wu-fadeUp-2 font-black uppercase leading-[0.88] mb-5 sm:mb-6"
          style={{ fontSize: "clamp(2.6rem, 9.5vw, 7.5rem)", letterSpacing: "-0.035em" }}
        >
          <span style={{ color: "var(--text-1)" }}>Score your</span>
          <br />
          <span style={{ color: "var(--accent)" }}>game</span>
          <span style={{ color: "var(--text-1)" }}> with AI.</span>
        </h1>

        {/* Subtext */}
        <p
          className="wu-fadeUp-3 mb-8 sm:mb-10 mx-auto leading-relaxed"
          style={{
            fontSize: "clamp(0.9rem, 2.3vw, 1.25rem)",
            color: "var(--text-1)",
            opacity: 0.72,
            maxWidth: "540px",
            textShadow: "0 1px 12px rgba(0,0,0,0.8), 0 0 32px rgba(0,0,0,0.6)",
          }}
        >
          Generate professional loops from a text prompt or game screenshot.
          <br className="hidden sm:block" />
          Browser studio. No music theory. No waiting.
        </p>

        {/* CTAs */}
        <div className="wu-fadeUp-4 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mb-6 sm:mb-8">
          <Link
            to={user ? "/generate" : "/register"}
            className="w-full sm:w-auto px-8 sm:px-10 py-3.5 sm:py-4 rounded-xl text-sm font-black uppercase tracking-widest transition-all"
            style={{
              background: "var(--accent)",
              color: "var(--accent-on)",
              textDecoration: "none",
              boxShadow: "0 0 40px color-mix(in srgb, var(--accent) 40%, transparent)",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.boxShadow = "0 0 64px color-mix(in srgb, var(--accent) 65%, transparent)";
              e.currentTarget.style.transform = "translateY(-2px)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.boxShadow = "0 0 40px color-mix(in srgb, var(--accent) 40%, transparent)";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            {user ? "Go to Dashboard →" : "Start for free →"}
          </Link>
          <Link
            to="/explore"
            className="w-full sm:w-auto px-10 py-4 rounded-xl text-sm font-bold uppercase tracking-widest transition-all"
            style={{
              background: "transparent",
              color: "var(--text-2)",
              textDecoration: "none",
              border: "1px solid color-mix(in srgb, var(--text-3) 25%, transparent)",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = "color-mix(in srgb, var(--accent) 40%, transparent)";
              e.currentTarget.style.color       = "var(--accent)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = "color-mix(in srgb, var(--text-3) 25%, transparent)";
              e.currentTarget.style.color       = "var(--text-2)";
            }}
          >
            Explore tracks
          </Link>
        </div>

        {/* Trust line */}
        <p className="wu-fadeIn text-[11px] font-semibold tracking-wider" style={{ color: "var(--text-3)" }}>
          Free to start · No credit card · Game-ready exports
        </p>
      </div>

      {/* Waveform bars */}
      <div
        className="wu-waveform absolute bottom-0 left-0 right-0 flex items-end justify-center gap-[2px] sm:gap-[3px] px-2 sm:px-4 pointer-events-none"
      >
        {BARS.map((h, i) => (
          <div
            key={i}
            style={{
              width: "clamp(3px, 1.4vw, 8px)",
              height: `${h}%`,
              background: `color-mix(in srgb, var(--accent) ${22 + (h / 95) * 62}%, transparent)`,
              borderRadius: "3px 3px 0 0",
              transformOrigin: "bottom",
              "--lo": `${0.12 + (i % 4) * 0.08}`,
              "--hi": `${0.65 + (i % 3) * 0.18}`,
              animation: `wave ${3.2 + (i % 5) * 0.6}s ease-in-out ${(i * 120) % 2000}ms infinite`,
            } as React.CSSProperties}
          />
        ))}
        {/* Fade-up mask — sadece alt %20'yi örter */}
        <div
          className="absolute inset-x-0 bottom-0 h-full pointer-events-none"
          style={{ background: "linear-gradient(to top, var(--bg-page) 12%, transparent 60%)" }}
        />
      </div>
    </section>
  );
}
