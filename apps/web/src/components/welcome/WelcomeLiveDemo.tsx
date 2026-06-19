import { useEffect, useState } from "react";
import { BARS, MOCK_PROMPTS } from "./WelcomeData";

export function WelcomeLiveDemo() {
  const [mockIdx,      setMockIdx]      = useState(0);
  const [mockTyped,    setMockTyped]    = useState("");
  const [mockStatus,   setMockStatus]   = useState<"typing"|"generating"|"done">("typing");
  const [mockProgress, setMockProgress] = useState(0);

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

  return (
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
  );
}
