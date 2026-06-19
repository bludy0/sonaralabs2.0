export function WelcomeStats() {
  return (
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
  );
}
