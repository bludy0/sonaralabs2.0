import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/useAuthStore";
import { useThemeStore, applyTheme, PRESET_THEMES } from "../store/useThemeStore";
import Balatro from "../components/Balatro";

// ── Static data ───────────────────────────────────────────────────────────────
const BARS = [
  38,72,55,90,44,82,61,95,33,78,50,88,40,70,58,
  92,36,66,80,48,85,42,75,60,94,35,68,53,87,45,
  79,57,63,91,47,77,52,86,39,74,59,93,34,69,81,
  46,76,65,89,
];

const TICKER = [
  "Text → Music","Image → Music","Sound Effects","Browser DAW",
  "Seamless Loops","Cloud Library","Beatoven AI","Sonauto",
  "ElevenLabs","Google Gemini","Game Ready","Instant Export",
];

const FEATURES = [
  {
    icon: "✦",
    title: "Text to Music",
    desc: "Write a prompt like \"tense boss fight, heavy drums\". Get a game-ready loop in under 60 seconds. No music theory needed.",
  },
  {
    icon: "◈",
    title: "Screenshot to Music",
    desc: "Drop any game screenshot. Gemini Vision reads the atmosphere and color palette, then generates matching music automatically.",
  },
  {
    icon: "◉",
    title: "Sound Effects",
    desc: "Generate any SFX from one sentence. Footsteps, explosions, UI clicks, ambient noise — powered by ElevenLabs.",
  },
  {
    icon: "⬡",
    title: "Browser Studio",
    desc: "Fine-tune in your browser. Reverb, EQ, delay, loop points, BPM — everything WaveSurfer, zero installs.",
  },
  {
    icon: "↻",
    title: "Seamless Loops",
    desc: "Every track is engineered for perfect looping. Adjust BPM with pitch-preserving playback. Export for Unity, Unreal, or any engine.",
  },
  {
    icon: "⊞",
    title: "Cloud Library",
    desc: "All generations and uploads in one organized space. Favorite tracks, create collections, share publicly or keep private.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Describe or Drop",
    desc: "Type your scene or drag a game screenshot. Our AI understands mood, genre, tempo and context.",
  },
  {
    n: "02",
    title: "AI Composes",
    desc: "Beatoven or Sonauto generates your track while you work. Queue multiple generations at once.",
  },
  {
    n: "03",
    title: "Export & Ship",
    desc: "Download WAV or OGG, or open in Studio for final tweaks. Loop points, BPM, effects — all in browser.",
  },
];

const PROVIDERS = [
  { name: "Beatoven",   desc: "Music generation", col: "#7C3AED" },
  { name: "Sonauto",    desc: "Music generation", col: "#0EA5E9" },
  { name: "ElevenLabs", desc: "Sound effects",    col: "#F59E0B" },
  { name: "Gemini",     desc: "Vision + AI mix",  col: "#10B981" },
];

const MOCK_PROMPTS = [
  "Dark ambient dungeon crawl, ominous strings, distant drums...",
  "Epic boss battle, orchestral, intense percussion, rising tension...",
  "Peaceful village morning, flute melody, birds chirping, warm...",
  "Cyberpunk city chase, electronic, fast bass, synth leads...",
];

// ── Component ─────────────────────────────────────────────────────────────────
export default function WelcomePage() {
  const user     = useAuthStore(s => s.user);
  const navigate = useNavigate();
  const getTheme = useThemeStore(s => s.getTheme);

  const [mockIdx,      setMockIdx]      = useState(0);
  const [mockTyped,    setMockTyped]    = useState("");
  const [mockStatus,   setMockStatus]   = useState<"typing"|"generating"|"done">("typing");
  const [mockProgress, setMockProgress] = useState(0);

  // Tanıtım sayfası her zaman varsayılan temada görünür.
  // Unmount'ta kullanıcının kendi teması geri yüklenir.
  useEffect(() => {
    const welcomeTheme = PRESET_THEMES.find(t => t.id === "cyber-red") ?? PRESET_THEMES[0];
    applyTheme(welcomeTheme.vars);
    return () => { applyTheme(getTheme().vars); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // (parallax kaldırıldı)

  // Mock typing loop
  useEffect(() => {
    const prompt = MOCK_PROMPTS[mockIdx];
    let i = 0;
    setMockTyped("");
    setMockStatus("typing");
    setMockProgress(0);

    const typeTimer = setInterval(() => {
      i++;
      setMockTyped(prompt.slice(0, i));
      if (i >= prompt.length) {
        clearInterval(typeTimer);
        setMockStatus("generating");
        let p = 0;
        const progTimer = setInterval(() => {
          p += 2.2;
          setMockProgress(Math.min(p, 100));
          if (p >= 100) {
            clearInterval(progTimer);
            setMockStatus("done");
            setTimeout(() => setMockIdx(prev => (prev + 1) % MOCK_PROMPTS.length), 2400);
          }
        }, 80);
      }
    }, 32);

    return () => clearInterval(typeTimer);
  }, [mockIdx]);

  if (user) return null;

  return (
    <>
      {/* ── Keyframes ──────────────────────────────────────────────────────── */}
      <style>{`
        @keyframes wave {
          0%,100% { transform: scaleY(var(--lo,0.25)); }
          50%      { transform: scaleY(var(--hi,1)); }
        }
        @keyframes fadeUp {
          from { opacity:0; transform:translateY(28px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity:0; }
          to   { opacity:1; }
        }
        @keyframes ticker {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        @keyframes blink {
          0%,49% { opacity:1; }
          50%,100%{ opacity:0; }
        }

        .wu-fadeUp   { animation: fadeUp 0.85s cubic-bezier(0.16,1,0.3,1) both; }
        .wu-fadeUp-2 { animation: fadeUp 0.85s cubic-bezier(0.16,1,0.3,1) 0.12s both; }
        .wu-fadeUp-3 { animation: fadeUp 0.85s cubic-bezier(0.16,1,0.3,1) 0.24s both; }
        .wu-fadeUp-4 { animation: fadeUp 0.85s cubic-bezier(0.16,1,0.3,1) 0.36s both; }
        .wu-fadeIn   { animation: fadeIn 1.2s ease both; }

        .wu-hover-card { transition: all 0.22s ease; }
        .wu-hover-card:hover {
          border-color: color-mix(in srgb, var(--accent) 40%, transparent) !important;
          box-shadow: 0 0 40px color-mix(in srgb, var(--accent) 8%, transparent), 0 12px 40px rgba(0,0,0,0.35);
          transform: translateY(-3px);
        }
        .wu-ticker-wrap  { overflow: hidden; mask-image: linear-gradient(90deg, transparent, black 8%, black 92%, transparent); }
        .wu-ticker-track {
          display: flex;
          width: max-content;
          animation: ticker 72s linear infinite;
        }
        .wu-ticker-track:hover { animation-play-state: paused; }
        .wu-cursor {
          display: inline-block;
          width: 2px; height: 1em;
          margin-left: 2px;
          vertical-align: text-bottom;
          background: var(--accent);
          animation: blink 1s step-end infinite;
        }

        /* ── Floating pill wrapper (tam genişlik, ortalar) ──────── */
        .wu-nav-wrap {
          position: fixed; top: 16px; left: 0; right: 0; z-index: 50;
          display: flex; justify-content: center;
          padding: 0 24px;
          pointer-events: none;
        }

        /* ── Solid glass pill navbar (backdrop-filter yok → Chrome WebGL glitch yok) */
        .wu-nav {
          pointer-events: all;
          display: flex; align-items: center; justify-content: space-between;
          gap: 8px;
          width: 100%; max-width: 860px;
          padding: 10px 14px 10px 18px;
          border-radius: 9999px;
          /* solid — backdrop-filter kullanmıyoruz */
          background: color-mix(in srgb, var(--bg-page) 92%, transparent);
          border: 1px solid rgba(255,255,255,0.08);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.08),
            0 4px 6px rgba(0,0,0,0.12),
            0 16px 40px rgba(0,0,0,0.32);
          transition: background 0.25s, border-color 0.25s;
        }
        .wu-nav:hover {
          background: color-mix(in srgb, var(--bg-page) 97%, transparent);
          border-color: rgba(255,255,255,0.12);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.11),
            0 4px 6px rgba(0,0,0,0.14),
            0 20px 48px rgba(0,0,0,0.38);
        }

        /* ── Nav link hover pill ─────────────────────────────────── */
        .wu-nav-link {
          position: relative;
          padding: 6px 13px;
          border-radius: 8px;
          font-size: 11px; font-weight: 700;
          letter-spacing: 0.12em; text-transform: uppercase;
          color: var(--text-3);
          text-decoration: none;
          transition: color 0.18s;
          z-index: 1;
        }
        .wu-nav-link::before {
          content: '';
          position: absolute; inset: 0;
          border-radius: 8px;
          background: color-mix(in srgb, var(--accent) 8%, rgba(255,255,255,0.04));
          border: 1px solid color-mix(in srgb, var(--accent) 14%, rgba(255,255,255,0.06));
          opacity: 0;
          transform: scale(0.88);
          transition: opacity 0.2s ease, transform 0.2s ease;
          z-index: -1;
        }
        .wu-nav-link:hover { color: var(--text-1); }
        .wu-nav-link:hover::before { opacity: 1; transform: scale(1); }

        /* ── Sign in button glass style ─────────────────────────── */
        .wu-signin {
          position: relative;
          padding: 7px 16px;
          border-radius: 9px;
          font-size: 11px; font-weight: 700;
          letter-spacing: 0.12em; text-transform: uppercase;
          color: var(--text-2);
          text-decoration: none;
          background: color-mix(in srgb, var(--bg-page) 70%, transparent);
          border: 1px solid rgba(255,255,255,0.08);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.06);
          transition: color 0.2s ease, background 0.2s ease, border-color 0.2s ease;
          will-change: transform;
          z-index: 1;
        }
        .wu-signin:hover {
          color: var(--text-1);
          background: color-mix(in srgb, var(--bg-page) 45%, transparent);
          border-color: rgba(255,255,255,0.14);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.10), 0 4px 16px rgba(0,0,0,0.15);
          transform: translateY(-1px);
        }

        /* ── Get Started glass button ────────────────────────────── */
        .wu-cta-btn {
          position: relative;
          padding: 8px 20px;
          border-radius: 10px;
          font-size: 11px; font-weight: 900;
          letter-spacing: 0.14em; text-transform: uppercase;
          color: var(--accent-on);
          text-decoration: none;
          background: var(--accent);
          border: 1px solid rgba(255,255,255,0.15);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.25),
            0 4px 20px color-mix(in srgb, var(--accent) 35%, transparent);
          transition: transform 0.2s ease;
          will-change: transform;
          overflow: hidden;
        }
        /* inner gloss */
        .wu-cta-btn::before {
          content: '';
          position: absolute; top: 0; left: 0; right: 0;
          height: 50%;
          background: linear-gradient(to bottom, rgba(255,255,255,0.16), transparent);
          border-radius: 10px 10px 0 0;
          pointer-events: none;
        }
        .wu-cta-btn:hover {
          transform: translateY(-2px);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.3),
            0 8px 32px color-mix(in srgb, var(--accent) 55%, transparent);
        }
        .wu-cta-btn:active { transform: translateY(0); }

        /* ── Responsive navbar ───────────────────────────────────── */
        @media (max-width: 640px) {
          .wu-nav-wrap { top: 10px; padding: 0 12px; }
          .wu-nav { padding: 8px 8px 8px 14px; }
          .wu-signin { display: none; }
        }
        @media (max-width: 360px) {
          .wu-nav-wrap { top: 8px; padding: 0 8px; }
          .wu-cta-btn { padding: 7px 13px; font-size: 10px; letter-spacing: 0.08em; }
        }

        /* ── Responsive hover (touch'ta hover efekti olmasın) ────── */
        @media (hover: none) {
          .wu-hover-card:hover { transform: none; box-shadow: none; border-color: inherit !important; }
          .wu-nav:hover { background: color-mix(in srgb, var(--bg-page) 52%, transparent); }
        }

        /* ── Waveform height ─────────────────────────────────────── */
        .wu-waveform { height: 200px; }
        @media (max-width: 640px) { .wu-waveform { height: 130px; } }
        @media (max-width: 360px) { .wu-waveform { height: 100px; } }

        /* ── Live demo dynamic area ───────────────────────────────── */
        .wu-demo-body { min-height: 148px; }
        @media (max-width: 640px) { .wu-demo-body { min-height: 110px; } }

        /* ── Section padding mobile ──────────────────────────────── */
        @media (max-width: 640px) {
          .wu-section-py { padding-top: 3.5rem; padding-bottom: 3.5rem; }
          .wu-section-py-lg { padding-top: 3rem; padding-bottom: 3rem; }
        }
      `}</style>

      <div style={{ background: "var(--bg-page)", color: "var(--text-1)", overflowX: "hidden" }}>

        {/* ════════════════════════════════ NAVBAR ══════════════════════════ */}
        <div className="wu-nav-wrap">
          <nav className="wu-nav">
            {/* Logo */}
            <div className="flex items-center gap-2.5 shrink-0" style={{ position: "relative", zIndex: 1 }}>
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-black shrink-0"
                style={{
                  background: "var(--accent)",
                  color: "var(--accent-on)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25)",
                }}
              >
                SL
              </div>
              <span className="text-sm font-black tracking-tight hidden sm:block" style={{ color: "var(--text-1)" }}>
                SONARALABS
              </span>
            </div>

            {/* Center links */}
            <div className="hidden md:flex items-center gap-1 flex-1 justify-center" style={{ position: "relative", zIndex: 1 }}>
              {(["Features","How it works","Explore"] as const).map(label => (
                <a
                  key={label}
                  href={label === "Explore" ? "/explore" : `#${label.toLowerCase().replace(/ /g,"-")}`}
                  className="wu-nav-link"
                >
                  {label}
                </a>
              ))}
            </div>

            {/* Auth buttons */}
            <div className="flex items-center gap-2 shrink-0" style={{ position: "relative", zIndex: 1 }}>
              {user ? (
                <Link to="/generate" className="wu-cta-btn">
                  Dashboard →
                </Link>
              ) : (
                <>
                  <Link to="/login" className="wu-signin">
                    Sign in
                  </Link>
                  <Link to="/register" className="wu-cta-btn">
                    Get Started
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>

        {/* ════════════════════════════════ HERO ════════════════════════════ */}
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
            {/* Fade-up mask */}
            <div
              className="absolute inset-x-0 bottom-0 h-full pointer-events-none"
              style={{ background: "linear-gradient(to top, var(--bg-page) 35%, transparent 100%)" }}
            />
          </div>
        </section>

        {/* ════════════════════════════════ TICKER ══════════════════════════ */}
        <div
          style={{
            borderTop: "1px solid color-mix(in srgb, var(--accent) 12%, transparent)",
            borderBottom: "1px solid color-mix(in srgb, var(--accent) 12%, transparent)",
            background: "color-mix(in srgb, var(--accent) 3%, var(--bg-page))",
            padding: "13px 0",
          }}
        >
          <div className="wu-ticker-wrap">
            <div className="wu-ticker-track">
              {[...TICKER, ...TICKER].map((item, i) => (
                <span key={i} className="inline-flex items-center gap-5 px-5">
                  <span
                    className="text-[10px] font-black tracking-[0.25em] uppercase whitespace-nowrap"
                    style={{ color: i % 3 === 0 ? "var(--accent)" : "var(--text-3)" }}
                  >
                    {item}
                  </span>
                  <span style={{ color: "color-mix(in srgb, var(--accent) 35%, transparent)", fontSize: "8px" }}>◆</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ════════════════════════════════ STATS ═══════════════════════════ */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-5">
            {[
              { val: "4",         label: "AI Models"          },
              { val: "~60s",      label: "Avg. generation"    },
              { val: "WAV·OGG",   label: "Export formats"     },
              { val: "∞",         label: "Loop-ready tracks"  },
            ].map(s => (
              <div
                key={s.label}
                className="text-center py-5 sm:py-6 px-3 sm:px-4 rounded-xl"
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid color-mix(in srgb, var(--text-3) 10%, transparent)",
                }}
              >
                <p
                  className="font-black tracking-tight mb-1"
                  style={{ fontSize: "clamp(1.6rem, 3.5vw, 2.4rem)", color: "var(--accent)" }}
                >
                  {s.val}
                </p>
                <p
                  className="text-[10px] font-bold tracking-[0.18em] uppercase"
                  style={{ color: "var(--text-3)" }}
                >
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ════════════════════════════════ LIVE DEMO ═══════════════════════ */}
        <section
          className="relative px-4 sm:px-6 py-12 sm:py-20 overflow-hidden"
          style={{
            background: "color-mix(in srgb, var(--bg-card) 35%, transparent)",
            borderTop: "1px solid color-mix(in srgb, var(--text-3) 8%, transparent)",
            borderBottom: "1px solid color-mix(in srgb, var(--text-3) 8%, transparent)",
          }}
        >
          <div className="relative max-w-4xl mx-auto">
            <div className="text-center mb-8 sm:mb-12">
              <h2
                className="font-black uppercase"
                style={{ fontSize: "clamp(1.8rem, 4vw, 3rem)", letterSpacing: "-0.02em", color: "var(--text-1)" }}
              >
                See it in action.
              </h2>
              <p className="text-sm mt-3" style={{ color: "var(--text-3)" }}>
                Watch the AI generate music from a text prompt — in real time.
              </p>
            </div>

            {/* Mock card */}
            <div
              className="max-w-2xl mx-auto rounded-2xl overflow-hidden"
              style={{
                background: "var(--bg-page)",
                border: "1px solid color-mix(in srgb, var(--accent) 22%, transparent)",
                boxShadow:
                  "0 0 64px color-mix(in srgb, var(--accent) 8%, transparent)," +
                  "0 32px 72px rgba(0,0,0,0.45)",
              }}
            >
              {/* Title bar */}
              <div
                className="flex items-center gap-3 px-3 sm:px-5 py-2.5 sm:py-3.5"
                style={{ borderBottom: "1px solid color-mix(in srgb, var(--text-3) 10%, transparent)" }}
              >
                <div className="flex gap-1 sm:gap-1.5 shrink-0">
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full" style={{ background: "#ff5f57" }} />
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full" style={{ background: "#ffbd2e" }} />
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full" style={{ background: "#28c840" }} />
                </div>
                <div className="flex-1" />
              </div>

              {/* Prompt */}
              <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-2 sm:pb-3">
                <div
                  className="rounded-xl px-4 py-3 min-h-[58px] text-sm font-mono"
                  style={{
                    background: "color-mix(in srgb, var(--text-3) 5%, transparent)",
                    border: `1px solid ${mockStatus === "typing"
                      ? "color-mix(in srgb, var(--accent) 30%, transparent)"
                      : "color-mix(in srgb, var(--text-3) 12%, transparent)"}`,
                    color: "var(--text-2)",
                    transition: "border-color 0.3s",
                  }}
                >
                  {mockTyped}
                  {mockStatus === "typing" && <span className="wu-cursor" />}
                </div>
              </div>

              {/* Option chips */}
              <div className="px-4 sm:px-6 pb-3 sm:pb-4 flex flex-wrap gap-1.5 sm:gap-2">
                {[
                  { l: "PROVIDER", v: "Beatoven" },
                  { l: "DURATION", v: "30s"      },
                  { l: "STYLE",    v: "Ambient"  },
                  { l: "MOOD",     v: "Dark"     },
                ].map(opt => (
                  <div
                    key={opt.l}
                    className="rounded-lg px-3 py-1.5"
                    style={{
                      background: "color-mix(in srgb, var(--text-3) 6%, transparent)",
                      border: "1px solid color-mix(in srgb, var(--text-3) 12%, transparent)",
                    }}
                  >
                    <span
                      className="text-[8px] font-black tracking-[0.2em] uppercase mr-1.5"
                      style={{ color: "var(--text-3)" }}
                    >
                      {opt.l}
                    </span>
                    <span className="text-[11px] font-bold" style={{ color: "var(--text-1)" }}>
                      {opt.v}
                    </span>
                  </div>
                ))}
              </div>

              {/* Dinamik alan — sabit yükseklik, layout kayması yok */}
              <div className="wu-demo-body px-4 sm:px-6 pb-4 sm:pb-6">

                {/* Progress */}
                {mockStatus !== "typing" && (
                  <div
                    className="rounded-xl px-4 py-3 mb-3"
                    style={{
                      background: mockStatus === "done"
                        ? "color-mix(in srgb, #22c55e 8%, transparent)"
                        : "color-mix(in srgb, var(--accent) 6%, transparent)",
                      border: `1px solid ${mockStatus === "done"
                        ? "color-mix(in srgb, #22c55e 22%, transparent)"
                        : "color-mix(in srgb, var(--accent) 16%, transparent)"}`,
                      transition: "background 0.4s, border-color 0.4s",
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className="text-[10px] font-black tracking-[0.18em] uppercase"
                        style={{ color: mockStatus === "done" ? "#22c55e" : "var(--accent)" }}
                      >
                        {mockStatus === "done" ? "✓ Generation Complete" : "⟳ Generating..."}
                      </span>
                      <span className="text-[10px] font-mono" style={{ color: "var(--text-3)" }}>
                        {mockStatus === "done" ? "100%" : `${Math.round(mockProgress)}%`}
                      </span>
                    </div>
                    <div
                      className="h-1 rounded-full overflow-hidden"
                      style={{ background: "color-mix(in srgb, var(--text-3) 15%, transparent)" }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${mockProgress}%`,
                          background: mockStatus === "done" ? "#22c55e" : "var(--accent)",
                          transition: "width 0.08s linear",
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Audio result */}
                {mockStatus === "done" && (
                  <div
                    className="rounded-xl px-4 py-3 flex items-center gap-3"
                    style={{
                      background: "color-mix(in srgb, var(--bg-card) 80%, transparent)",
                      border: "1px solid color-mix(in srgb, var(--text-3) 12%, transparent)",
                    }}
                  >
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0"
                      style={{
                        background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                        color: "var(--accent)",
                        border: "1px solid color-mix(in srgb, var(--accent) 20%, transparent)",
                      }}
                    >
                      ▶
                    </div>
                    {/* Mini waveform */}
                    <div className="flex-1 flex items-end gap-[2px]" style={{ height: "26px" }}>
                      {BARS.slice(0, 32).map((h, i) => (
                        <div
                          key={i}
                          style={{
                            flex: 1,
                            height: `${20 + (h / 95) * 80}%`,
                            background: `color-mix(in srgb, var(--accent) ${40 + (h / 95) * 50}%, transparent)`,
                            borderRadius: "1px",
                            transformOrigin: "bottom",
                            "--lo": `${0.2 + (i % 3) * 0.1}`,
                            "--hi": `${0.7 + (i % 4) * 0.08}`,
                            animation: `wave ${0.8 + (i % 4) * 0.2}s ease-in-out ${(i * 38) % 550}ms infinite`,
                          } as React.CSSProperties}
                        />
                      ))}
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <span className="text-[10px] font-mono" style={{ color: "var(--text-3)" }}>0:30</span>
                      <span
                        className="text-[9px] font-black tracking-wider uppercase px-2.5 py-1 rounded-md"
                        style={{ background: "var(--accent)", color: "var(--accent-on)" }}
                      >
                        ↓ WAV
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════ FEATURES ════════════════════════ */}
        <section id="features" className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-24">
          <div className="text-center mb-10 sm:mb-16">
            <h2
              lang="en"
              className="font-black uppercase"
              style={{ fontSize: "clamp(2rem, 4.5vw, 3.5rem)", letterSpacing: "-0.025em", color: "var(--text-1)" }}
            >
              Built for game devs.
              <br />
              <span style={{ color: "var(--text-3)" }}>By design.</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className="wu-hover-card cursor-default rounded-2xl p-5 sm:p-7"
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid color-mix(in srgb, var(--text-3) 12%, transparent)",
                  transitionDelay: `${i * 30}ms`,
                }}
              >
                <div className="flex items-center gap-4 mb-4">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0"
                    style={{
                      background: "color-mix(in srgb, var(--accent) 10%, transparent)",
                      border: "1px solid color-mix(in srgb, var(--accent) 20%, transparent)",
                      color: "var(--accent)",
                    }}
                  >
                    {f.icon}
                  </div>
                  <h3
                    className="font-black uppercase text-base"
                    style={{ color: "var(--text-1)", letterSpacing: "-0.01em" }}
                  >
                    {f.title}
                  </h3>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-3)", lineHeight: 1.65 }}>
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ════════════════════════════════ HOW IT WORKS ════════════════════ */}
        <section
          id="how-it-works"
          style={{
            background: "color-mix(in srgb, var(--bg-card) 40%, transparent)",
            borderTop: "1px solid color-mix(in srgb, var(--text-3) 8%, transparent)",
            borderBottom: "1px solid color-mix(in srgb, var(--text-3) 8%, transparent)",
          }}
        >
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14 sm:py-24">
            <div className="text-center mb-10 sm:mb-16">
              <h2
                className="font-black uppercase"
                style={{ fontSize: "clamp(2rem, 4.5vw, 3.5rem)", letterSpacing: "-0.025em", color: "var(--text-1)" }}
              >
                Idea to loop
                <br />
                <span style={{ color: "var(--text-3)" }}>in three steps.</span>
              </h2>
            </div>

            <div className="relative grid grid-cols-1 md:grid-cols-3 gap-8 sm:gap-12">
              {/* Connecting line */}
              <div
                className="absolute top-10 left-[17%] right-[17%] h-px hidden md:block pointer-events-none"
                style={{
                  background:
                    "linear-gradient(90deg," +
                    "color-mix(in srgb, var(--accent) 20%, transparent)," +
                    "color-mix(in srgb, var(--accent) 65%, transparent)," +
                    "color-mix(in srgb, var(--accent) 20%, transparent))",
                }}
              />

              {STEPS.map((s, i) => (
                <div key={s.n} className="text-center">
                  {/* Circle */}
                  <div
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-full mx-auto mb-5 sm:mb-6 flex items-center justify-center"
                    style={{
                      background: "var(--bg-page)",
                      border: "2px solid color-mix(in srgb, var(--accent) 30%, transparent)",
                    }}
                  >
                    <span className="font-black text-2xl sm:text-3xl leading-none" style={{ color: "var(--accent)", letterSpacing: "-0.03em" }}>
                      {s.n}
                    </span>
                  </div>

                  <h3
                    className="font-black uppercase text-lg mb-2"
                    style={{ letterSpacing: "-0.01em", color: "var(--text-1)" }}
                  >
                    {s.title}
                  </h3>
                  <p
                    className="text-sm leading-relaxed mx-auto"
                    style={{ color: "var(--text-3)", maxWidth: "220px", lineHeight: 1.6 }}
                  >
                    {s.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ════════════════════════════════ AI STACK ════════════════════════ */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
          <div className="text-center mb-8 sm:mb-10">
            <h2
              className="font-black uppercase"
              style={{ fontSize: "clamp(1.6rem, 3.5vw, 2.6rem)", letterSpacing: "-0.02em", color: "var(--text-1)" }}
            >
              Powered by the best.
            </h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            {PROVIDERS.map(p => (
              <div
                key={p.name}
                className="wu-hover-card text-center rounded-xl p-4 sm:p-6"
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid color-mix(in srgb, var(--text-3) 12%, transparent)",
                }}
              >
                <div
                  className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl mx-auto mb-3 flex items-center justify-center font-black text-sm"
                  style={{
                    background: `color-mix(in srgb, ${p.col} 12%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${p.col} 25%, transparent)`,
                    color: p.col,
                  }}
                >
                  {p.name.slice(0, 2).toUpperCase()}
                </div>
                <p className="font-black uppercase text-sm tracking-tight mb-1" style={{ color: "var(--text-1)" }}>
                  {p.name}
                </p>
                <p className="text-[10px] font-semibold tracking-wider uppercase" style={{ color: "var(--text-3)" }}>
                  {p.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ════════════════════════════════ FINAL CTA ═══════════════════════ */}
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

        {/* ════════════════════════════════ FOOTER ══════════════════════════ */}
        <footer style={{ borderTop: "1px solid color-mix(in srgb, var(--text-3) 8%, transparent)" }}>
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10 flex flex-col md:flex-row items-center justify-between gap-4 sm:gap-6">
            {/* Logo */}
            <div className="flex items-center gap-2.5">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black"
                style={{ background: "var(--accent)", color: "var(--accent-on)" }}
              >
                SL
              </div>
              <p className="text-xs font-black tracking-wider uppercase" style={{ color: "var(--text-2)" }}>
                SONARALABS
              </p>
            </div>

            <p className="text-[11px] text-center" style={{ color: "var(--text-3)" }}>
              © 2026 Sonaralabs. Built for game developers.
            </p>

            {/* Links */}
            <div className="flex items-center gap-6">
              <Link
                to="/explore"
                className="text-[11px] font-semibold tracking-widest uppercase transition-colors"
                style={{ color: "var(--text-3)", textDecoration: "none" }}
                onMouseEnter={e => (e.currentTarget.style.color = "var(--text-1)")}
                onMouseLeave={e => (e.currentTarget.style.color = "var(--text-3)")}
              >
                Explore
              </Link>
              <a
                href="mailto:yunuseaslan427@gmail.com"
                className="text-[11px] font-semibold tracking-widest uppercase transition-colors"
                style={{ color: "var(--text-3)", textDecoration: "none" }}
                onMouseEnter={e => (e.currentTarget.style.color = "var(--text-1)")}
                onMouseLeave={e => (e.currentTarget.style.color = "var(--text-3)")}
              >
                Contact
              </a>
            </div>
          </div>
        </footer>

      </div>
    </>
  );
}
