import { FEATURES } from "./WelcomeData";

export function WelcomeFeatures() {
  return (
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
  );
}
