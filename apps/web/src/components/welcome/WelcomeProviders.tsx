import { PROVIDERS } from "./WelcomeData";

export function WelcomeProviders() {
  return (
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
  );
}
