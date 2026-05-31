import { useId } from "react";
import type { CSSProperties } from "react";

// ── Tip ───────────────────────────────────────────────────────────────────────
interface SonarLogoProps {
  size?: number;
  variant?: "icon" | "full" | "wordmark";
  animated?: boolean;
  /** Animasyon yönünü tersine çevirir (easter egg vb.) */
  reverse?: boolean;
  /** Dönüş süresi (sn). Varsayılan 18. */
  spinDur?: number;
  className?: string;
  style?: CSSProperties;
}

// ── Vorteks parametreleri (seçilen tasarım: "B" — 6 kol, ters yön, altıgen) ─────
const ARMS = 6;
const SWEEP = 1.4; // girdap kıvrımı (radyan)
const WMAX = 0.42; // lob genişliği (radyan)
const DIR: 1 | -1 = -1; // dönüş yönü: -1 = saat yönünün tersi

// ── Tek kol (girdap kanadı) yol üreticisi ──────────────────────────────────────
//
// Her kanat iki spiral kenarla sınırlanır:
//   • İç uç (merkeze yakın) → sivri nokta   (w(0)=0)
//   • Dış uç (kenarda)      → şişkin yuvarlak lob, dış çember yayı ile kapatılır
// Kanat dışa giderken SWEEP kadar döner → girdap hissi.
// 6 kanat → altıgen dış silüet.
//
function armPath(base: number): string {
  const STEPS = 64;
  const CX = 50,
    CY = 50;
  const R_IN = 7;
  const R_OUT = 45;
  const P = 0.85; // yarıçap eğrisi

  const lead: [number, number][] = [];
  const trail: [number, number][] = [];

  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    const theta = base + DIR * SWEEP * t;
    const r = R_IN + (R_OUT - R_IN) * Math.pow(t, P);
    // genişlik: iç uçta 0 (sivri), dışa doğru açılır, uçta hâlâ geniş (yuvarlak kapak)
    const w = WMAX * Math.pow(t, 0.5) * (1 - 0.12 * t);
    lead.push([CX + r * Math.cos(theta + w), CY + r * Math.sin(theta + w)]);
    trail.push([CX + r * Math.cos(theta - w), CY + r * Math.sin(theta - w)]);
  }

  const f = (n: number) => n.toFixed(2);
  const sweepFlag = DIR === 1 ? 0 : 1;

  let d = `M ${f(lead[0][0])} ${f(lead[0][1])} `;
  for (let i = 1; i < lead.length; i++) d += `L ${f(lead[i][0])} ${f(lead[i][1])} `;
  // dış uçta yuvarlak kapak — dış çember boyunca yay
  d += `A ${f(R_OUT)} ${f(R_OUT)} 0 0 ${sweepFlag} ${f(trail[STEPS][0])} ${f(trail[STEPS][1])} `;
  for (let i = STEPS - 1; i >= 0; i--) d += `L ${f(trail[i][0])} ${f(trail[i][1])} `;
  d += "Z";
  return d;
}

// Yollar modül yüklenirken bir kez hesaplanır (her render'da değil).
const ARM_PATHS: string[] = Array.from({ length: ARMS }, (_, i) =>
  armPath((i * 2 * Math.PI) / ARMS - Math.PI / 2)
);

// ── Bileşen ───────────────────────────────────────────────────────────────────
/**
 * Sonaralabs marka logosu — kırmızı→mor girdap (vorteks) mark.
 *
 * 6 spiral kanat, saat yönünün tersine dönen, altıgen dış silüetli bir girdap.
 * Renk: temadan türeyen dikey gradyan (parlak accent → accent → koyu accent);
 *       aktif tema değişince logo da otomatik renk değiştirir.
 * Animasyon açıkken yavaşça döner.
 *
 * variant:
 *   • "icon"     → yalnızca mark
 *   • "full"     → mark + "Sonaralabs" yazısı
 *   • "wordmark" → yalnızca yazı
 */
export function SonarLogo({
  size = 32,
  variant = "icon",
  animated = false,
  reverse = false,
  spinDur = 18,
  className,
  style,
}: SonarLogoProps) {
  // Aynı sayfada birden fazla logo render edildiğinde id'ler çakışmasın.
  const uid = useId().replace(/:/g, "");
  const gid = `sonar-grad-${uid}`;
  const cid = `sonar-clip-${uid}`;
  const gap = Math.round(size * 0.3);
  const fs = Math.round(size * 0.6);

  return (
    <div
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        gap,
        flexShrink: 0,
        userSelect: "none",
        lineHeight: 1,
        ...style,
      }}
    >
      {/* ── MARK ─────────────────────────────────────────────────────────── */}
      {variant !== "wordmark" && (
        <svg
          width={size}
          height={size}
          viewBox="0 0 100 100"
          fill="none"
          aria-hidden="true"
          style={{ display: "block", flexShrink: 0 }}
        >
          <defs>
            {/*
             * Dikey gradyan — UZAYDA SABİT (userSpaceOnUse).
             * Şekiller dönerken gradyan dönmez → bir kanat tepedeyken parlak,
             * aşağı inince koyu olur. Renk uzayda sabit, şekiller döner.
             *   üst   = parlak accent  (--daw-accent-bright)
             *   orta  = accent         (--accent)
             *   alt   = koyu accent    (--accent-dim)
             */}
            <linearGradient
              id={gid}
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1="0"
              x2="0"
              y2="100"
            >
              <stop offset="0%" stopColor="var(--daw-accent-bright, var(--accent, #f0181c))" />
              <stop offset="50%" stopColor="var(--accent, #c11650)" />
              <stop offset="100%" stopColor="var(--accent-dim, #4d1a86)" />
            </linearGradient>

            {/*
             * Dönen şekiller yalnızca MASKE (boya değil).
             * Beyaz = görünür. Grubu döndürünce maske bölgesi döner,
             * altındaki sabit gradyan dikdörtgen yerinde kalır.
             * (clipPath içinde <g> SVG 1.1'de desteklenmez; mask destekler.)
             */}
            <mask id={cid} maskContentUnits="userSpaceOnUse">
              <g>
                {animated && (
                  <animateTransform
                    // reverse değişince yeniden mount edilsin (yön anında uygulanır)
                    key={reverse ? "rev" : "fwd"}
                    attributeName="transform"
                    type="rotate"
                    from="0 50 50"
                    to={reverse ? "-360 50 50" : "360 50 50"}
                    dur={`${spinDur}s`}
                    repeatCount="indefinite"
                  />
                )}
                {ARM_PATHS.map((d, i) => (
                  <path key={i} d={d} fill="#fff" />
                ))}
              </g>
            </mask>
          </defs>

          {/* Sabit gradyan dikdörtgen, dönen şekillerle maskelenir */}
          <rect
            x="0"
            y="0"
            width="100"
            height="100"
            fill={`url(#${gid})`}
            mask={`url(#${cid})`}
          />
        </svg>
      )}

      {/* ── METİN ────────────────────────────────────────────────────────── */}
      {variant !== "icon" && (
        <span
          style={{
            fontSize: fs,
            fontWeight: 900,
            letterSpacing: "-0.03em",
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ color: "var(--text-1)" }}>Sonara</span>
          <span style={{ color: "var(--accent)" }}>labs</span>
        </span>
      )}
    </div>
  );
}
