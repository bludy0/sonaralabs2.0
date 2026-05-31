import type { CSSProperties } from "react";

// Ortak kırmızı→mor dikey gradyan tanımı
function Grad({ id }: { id: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#f0181c" />
      <stop offset="50%" stopColor="#c11650" />
      <stop offset="100%" stopColor="#4d1a86" />
    </linearGradient>
  );
}

interface Base {
  size?: number;
  idSuffix?: string;
  className?: string;
  style?: CSSProperties;
}

const f = (n: number) => n.toFixed(2);
const CX = 50,
  CY = 50;

// ── 1) Diyafram / Iris girdabı ─────────────────────────────────────────────────
// Kamera diyaframı gibi N bıçak, içte burgu yapan çokgen delik.
export function ApertureLogo({
  size = 64,
  blades = 6,
  twist = 0.9,
  idSuffix = "",
  className,
  style,
}: Base & { blades?: number; twist?: number }) {
  const gid = `ap-${idSuffix}`;
  const R = 46,
    r = 16;
  const step = (2 * Math.PI) / blades;
  const paths: string[] = [];
  for (let i = 0; i < blades; i++) {
    const a0 = i * step - Math.PI / 2;
    const a1 = a0 + step;
    const ox0 = CX + R * Math.cos(a0),
      oy0 = CY + R * Math.sin(a0);
    const ox1 = CX + R * Math.cos(a1),
      oy1 = CY + R * Math.sin(a1);
    const ain = a0 + step * twist;
    const ix = CX + r * Math.cos(ain),
      iy = CY + r * Math.sin(ain);
    paths.push(
      `M ${f(ox0)} ${f(oy0)} A ${f(R)} ${f(R)} 0 0 1 ${f(ox1)} ${f(oy1)} L ${f(ix)} ${f(iy)} Z`
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className} style={{ display: "block", flexShrink: 0, ...style }}>
      <defs><Grad id={gid} /></defs>
      {paths.map((d, i) => (
        <path key={i} d={d} fill={`url(#${gid})`} opacity={0.9} />
      ))}
    </svg>
  );
}

// ── 2) Sonar dalgaları (burgulu yaylar) ─────────────────────────────────────────
// İç içe kırık yaylar kademeli dönerek spiral oluşturur → ses/sonar + girdap.
export function SonarRingsLogo({ size = 64, idSuffix = "", className, style }: Base) {
  const gid = `sr-${idSuffix}`;
  const RINGS = 5;
  const arcs: { d: string; w: number }[] = [];
  for (let k = 0; k < RINGS; k++) {
    const r = 9 + k * 8.5;
    const span = Math.PI * 1.2;
    const start = -Math.PI / 2 + k * 0.6;
    const a0 = start,
      a1 = start + span;
    const x0 = CX + r * Math.cos(a0),
      y0 = CY + r * Math.sin(a0);
    const x1 = CX + r * Math.cos(a1),
      y1 = CY + r * Math.sin(a1);
    const large = span > Math.PI ? 1 : 0;
    arcs.push({ d: `M ${f(x0)} ${f(y0)} A ${f(r)} ${f(r)} 0 ${large} 1 ${f(x1)} ${f(y1)}`, w: 6.5 - k * 0.7 });
  }
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className} style={{ display: "block", flexShrink: 0, ...style }}>
      <defs><Grad id={gid} /></defs>
      {arcs.map((a, i) => (
        <path key={i} d={a.d} stroke={`url(#${gid})`} strokeWidth={a.w} strokeLinecap="round" fill="none" />
      ))}
      <circle cx={CX} cy={CY} r="3.2" fill={`url(#${gid})`} />
    </svg>
  );
}

// ── 3) Ekolayzer halkası ────────────────────────────────────────────────────────
// Çember boyunca yüksekliği dalgalanan radyal çubuklar → müzik görselleştirici.
export function EqualizerLogo({ size = 64, bars = 40, idSuffix = "", className, style }: Base & { bars?: number }) {
  const gid = `eq-${idSuffix}`;
  const rb = 20;
  const lines: { x0: number; y0: number; x1: number; y1: number }[] = [];
  for (let i = 0; i < bars; i++) {
    const a = (i * 2 * Math.PI) / bars - Math.PI / 2;
    // iki frekanslı dalga → organik yükseklik
    const h = 6 + 16 * (0.5 + 0.5 * Math.sin(i * 0.9)) * (0.6 + 0.4 * Math.cos(i * 0.37));
    lines.push({
      x0: CX + rb * Math.cos(a),
      y0: CY + rb * Math.sin(a),
      x1: CX + (rb + h) * Math.cos(a),
      y1: CY + (rb + h) * Math.sin(a),
    });
  }
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className} style={{ display: "block", flexShrink: 0, ...style }}>
      <defs><Grad id={gid} /></defs>
      {lines.map((l, i) => (
        <line key={i} x1={l.x0} y1={l.y0} x2={l.x1} y2={l.y1} stroke={`url(#${gid})`} strokeWidth={2.6} strokeLinecap="round" />
      ))}
    </svg>
  );
}

// ── 4) Burgu spiral (tek sürekli logaritmik spiral) ─────────────────────────────
// Tek hatlı, zarif galaksi/burgu — kalınlığı dışa doğru artan spiral şerit.
export function SpiralLogo({ size = 64, turns = 2.4, idSuffix = "", className, style }: Base & { turns?: number }) {
  const gid = `sp-${idSuffix}`;
  const STEPS = 220;
  const a = 3.2,
    b = 0.33;
  const pts: [number, number, number][] = []; // x,y,t
  for (let i = 0; i <= STEPS; i++) {
    const t = (i / STEPS) * turns * 2 * Math.PI;
    const r = a * Math.exp(b * t);
    pts.push([CX + r * Math.cos(t - Math.PI / 2), CY + r * Math.sin(t - Math.PI / 2), i / STEPS]);
  }
  let d = `M ${f(pts[0][0])} ${f(pts[0][1])} `;
  for (let i = 1; i < pts.length; i++) d += `L ${f(pts[i][0])} ${f(pts[i][1])} `;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className} style={{ display: "block", flexShrink: 0, ...style }}>
      <defs><Grad id={gid} /></defs>
      {/* kalından inceye katmanlı çizim → şerit hissi */}
      <path d={d} stroke={`url(#${gid})`} strokeWidth={7} strokeLinecap="round" fill="none" opacity={0.25} />
      <path d={d} stroke={`url(#${gid})`} strokeWidth={4} strokeLinecap="round" fill="none" />
    </svg>
  );
}
