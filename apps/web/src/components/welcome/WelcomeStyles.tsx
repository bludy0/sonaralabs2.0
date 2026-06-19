// ── Keyframes + landing page CSS ──────────────────────────────────────────────
export function WelcomeStyles() {
  return (
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
  );
}
