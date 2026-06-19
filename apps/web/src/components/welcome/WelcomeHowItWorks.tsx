import { STEPS } from "./WelcomeData";

export function WelcomeHowItWorks() {
  return (
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

          {STEPS.map(s => (
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
  );
}
