import { useRef, useEffect, useState } from 'react';
import { Renderer, Program, Triangle, Mesh } from 'ogl';
import './LightRays.css';

// ── Types ─────────────────────────────────────────────────────────────────────
export type RaysOrigin =
  | 'top-center' | 'top-left'    | 'top-right'
  | 'left'       | 'right'
  | 'bottom-center' | 'bottom-left' | 'bottom-right';

export interface LightRaysProps {
  raysOrigin?:     RaysOrigin;
  raysColor?:      string;
  raysSpeed?:      number;
  lightSpread?:    number;
  rayLength?:      number;
  pulsating?:      boolean;
  fadeDistance?:   number;
  saturation?:     number;
  followMouse?:    boolean;
  mouseInfluence?: number;
  noiseAmount?:    number;
  distortion?:     number;
  className?:      string;
  style?:          React.CSSProperties;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const hexToRgb = (hex: string): [number, number, number] => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m
    ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255]
    : [1, 1, 1];
};

const getAnchorAndDir = (
  origin: RaysOrigin,
  w: number,
  h: number,
): { anchor: [number, number]; dir: [number, number] } => {
  const out = 0.2;
  switch (origin) {
    case 'top-left':      return { anchor: [0,               -out * h],       dir: [0,  1] };
    case 'top-right':     return { anchor: [w,               -out * h],       dir: [0,  1] };
    case 'left':          return { anchor: [-out * w,          0.5 * h],      dir: [1,  0] };
    case 'right':         return { anchor: [(1 + out) * w,    0.5 * h],      dir: [-1, 0] };
    case 'bottom-left':   return { anchor: [0,               (1 + out) * h], dir: [0, -1] };
    case 'bottom-center': return { anchor: [0.5 * w,         (1 + out) * h], dir: [0, -1] };
    case 'bottom-right':  return { anchor: [w,               (1 + out) * h], dir: [0, -1] };
    default:              return { anchor: [0.5 * w,         -out * h],       dir: [0,  1] };
  }
};

// ── Shaders ───────────────────────────────────────────────────────────────────
const VERT = `
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const FRAG = `precision highp float;

uniform float iTime;
uniform vec2  iResolution;
uniform vec2  rayPos;
uniform vec2  rayDir;
uniform vec3  raysColor;
uniform float raysSpeed;
uniform float lightSpread;
uniform float rayLength;
uniform float pulsating;
uniform float fadeDistance;
uniform float saturation;
uniform vec2  mousePos;
uniform float mouseInfluence;
uniform float noiseAmount;
uniform float distortion;

varying vec2 vUv;

float noise(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

float rayStrength(vec2 raySource, vec2 rayRefDirection, vec2 coord,
                  float seedA, float seedB, float speed) {
  vec2  sourceToCoord = coord - raySource;
  vec2  dirNorm       = normalize(sourceToCoord);
  float cosAngle      = dot(dirNorm, rayRefDirection);

  float distortedAngle = cosAngle +
    distortion * sin(iTime * 2.0 + length(sourceToCoord) * 0.01) * 0.2;

  float spreadFactor = pow(max(distortedAngle, 0.0), 1.0 / max(lightSpread, 0.001));

  float distance     = length(sourceToCoord);
  float maxDistance  = iResolution.x * rayLength;
  float lengthFalloff = clamp((maxDistance - distance) / maxDistance, 0.0, 1.0);
  float fadeFalloff   = clamp(
    (iResolution.x * fadeDistance - distance) / (iResolution.x * fadeDistance),
    0.5, 1.0
  );
  float pulse = pulsating > 0.5 ? (0.8 + 0.2 * sin(iTime * speed * 3.0)) : 1.0;

  float baseStrength = clamp(
    (0.45 + 0.15 * sin(distortedAngle * seedA + iTime * speed)) +
    (0.30 + 0.20 * cos(-distortedAngle * seedB + iTime * speed)),
    0.0, 1.0
  );

  return baseStrength * lengthFalloff * fadeFalloff * spreadFactor * pulse;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 coord = vec2(fragCoord.x, iResolution.y - fragCoord.y);

  vec2 finalRayDir = rayDir;
  if (mouseInfluence > 0.0) {
    vec2 mouseScreenPos = mousePos * iResolution.xy;
    vec2 mouseDirection = normalize(mouseScreenPos - rayPos);
    finalRayDir = normalize(mix(rayDir, mouseDirection, mouseInfluence));
  }

  vec4 rays1 = vec4(1.0) *
    rayStrength(rayPos, finalRayDir, coord, 36.2214, 21.11349, 1.5 * raysSpeed);
  vec4 rays2 = vec4(1.0) *
    rayStrength(rayPos, finalRayDir, coord, 22.3991, 18.0234,  1.1 * raysSpeed);

  fragColor = rays1 * 0.5 + rays2 * 0.4;

  if (noiseAmount > 0.0) {
    float n = noise(coord * 0.01 + iTime * 0.1);
    fragColor.rgb *= (1.0 - noiseAmount + noiseAmount * n);
  }

  float brightness = 1.0 - (coord.y / iResolution.y);
  fragColor.x *= 0.1 + brightness * 0.8;
  fragColor.y *= 0.3 + brightness * 0.6;
  fragColor.z *= 0.5 + brightness * 0.5;

  if (saturation != 1.0) {
    float gray = dot(fragColor.rgb, vec3(0.299, 0.587, 0.114));
    fragColor.rgb = mix(vec3(gray), fragColor.rgb, saturation);
  }

  fragColor.rgb *= raysColor;
}

void main() {
  vec4 color;
  mainImage(color, gl_FragCoord.xy);
  gl_FragColor = color;
}`;

// ── Component ─────────────────────────────────────────────────────────────────
export default function LightRays({
  raysOrigin     = 'top-center',
  raysColor      = '#ffffff',
  raysSpeed      = 1,
  lightSpread    = 1,
  rayLength      = 2,
  pulsating      = false,
  fadeDistance   = 1.0,
  saturation     = 1.0,
  followMouse    = false,
  mouseInfluence = 0.1,
  noiseAmount    = 0.0,
  distortion     = 0.0,
  className      = '',
  style,
}: LightRaysProps) {
  const containerRef     = useRef<HTMLDivElement>(null);
  const uniformsRef      = useRef<Record<string, { value: any }> | null>(null);
  const rendererRef      = useRef<Renderer | null>(null);
  const mouseRef         = useRef({ x: 0.5, y: 0.5 });
  const smoothMouseRef   = useRef({ x: 0.5, y: 0.5 });
  const animationIdRef   = useRef<number | null>(null);
  const cleanupRef       = useRef<(() => void) | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  // ── Intersection observer ──
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new IntersectionObserver(
      entries => setIsVisible(entries[0].isIntersecting),
      { threshold: 0.1 },
    );
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // ── WebGL init / teardown ──
  useEffect(() => {
    if (!isVisible || !containerRef.current) return;

    // teardown previous instance
    cleanupRef.current?.();
    cleanupRef.current = null;

    let cancelled = false;

    const init = async () => {
      await new Promise(r => setTimeout(r, 10));
      if (cancelled || !containerRef.current) return;

      const renderer = new Renderer({
        dpr: Math.min(window.devicePixelRatio, 2),
        alpha: true,
        preserveDrawingBuffer: true,
      } as any);
      rendererRef.current = renderer;

      const gl = renderer.gl;
      gl.canvas.style.width  = '100%';
      gl.canvas.style.height = '100%';

      // clear existing children
      while (containerRef.current.firstChild) {
        containerRef.current.removeChild(containerRef.current.firstChild);
      }
      containerRef.current.appendChild(gl.canvas);

      const uniforms: Record<string, { value: any }> = {
        iTime:          { value: 0 },
        iResolution:    { value: [1, 1] },
        rayPos:         { value: [0, 0] },
        rayDir:         { value: [0, 1] },
        raysColor:      { value: hexToRgb(raysColor) },
        raysSpeed:      { value: raysSpeed },
        lightSpread:    { value: lightSpread },
        rayLength:      { value: rayLength },
        pulsating:      { value: pulsating ? 1.0 : 0.0 },
        fadeDistance:   { value: fadeDistance },
        saturation:     { value: saturation },
        mousePos:       { value: [0.5, 0.5] },
        mouseInfluence: { value: mouseInfluence },
        noiseAmount:    { value: noiseAmount },
        distortion:     { value: distortion },
      };
      uniformsRef.current = uniforms;

      const geometry = new Triangle(gl);
      const program  = new Program(gl, { vertex: VERT, fragment: FRAG, uniforms });
      const mesh     = new Mesh(gl, { geometry, program });

      const updatePlacement = () => {
        if (!containerRef.current) return;
        renderer.dpr = Math.min(window.devicePixelRatio, 2);
        const { clientWidth: wCSS, clientHeight: hCSS } = containerRef.current;
        renderer.setSize(wCSS, hCSS);
        const dpr = renderer.dpr;
        const w = wCSS * dpr, h = hCSS * dpr;
        uniforms.iResolution.value = [w, h];
        const { anchor, dir } = getAnchorAndDir(raysOrigin, w, h);
        uniforms.rayPos.value = anchor;
        uniforms.rayDir.value = dir;
      };

      const loop = (t: number) => {
        if (!rendererRef.current || cancelled) return;
        uniforms.iTime.value = t * 0.001;

        if (followMouse && mouseInfluence > 0) {
          const s = 0.92;
          smoothMouseRef.current.x = smoothMouseRef.current.x * s + mouseRef.current.x * (1 - s);
          smoothMouseRef.current.y = smoothMouseRef.current.y * s + mouseRef.current.y * (1 - s);
          uniforms.mousePos.value  = [smoothMouseRef.current.x, smoothMouseRef.current.y];
        }

        try {
          renderer.render({ scene: mesh });
        } catch (e) {
          console.warn('LightRays render error:', e);
          return;
        }
        animationIdRef.current = requestAnimationFrame(loop);
      };

      window.addEventListener('resize', updatePlacement);
      updatePlacement();
      animationIdRef.current = requestAnimationFrame(loop);

      cleanupRef.current = () => {
        cancelled = true;
        if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current);
        window.removeEventListener('resize', updatePlacement);
        try {
          const canvas = renderer.gl.canvas;
          renderer.gl.getExtension('WEBGL_lose_context')?.loseContext();
          canvas.parentNode?.removeChild(canvas);
        } catch { /* ignore */ }
        rendererRef.current  = null;
        uniformsRef.current  = null;
      };
    };

    init();
    return () => { cleanupRef.current?.(); cleanupRef.current = null; };
  }, [
    isVisible, raysOrigin, raysColor, raysSpeed, lightSpread, rayLength,
    pulsating, fadeDistance, saturation, followMouse, mouseInfluence,
    noiseAmount, distortion,
  ]);

  // ── Live prop sync (no re-init) ──
  useEffect(() => {
    const u = uniformsRef.current;
    const r = rendererRef.current;
    if (!u || !r || !containerRef.current) return;
    u.raysColor.value      = hexToRgb(raysColor);
    u.raysSpeed.value      = raysSpeed;
    u.lightSpread.value    = lightSpread;
    u.rayLength.value      = rayLength;
    u.pulsating.value      = pulsating ? 1.0 : 0.0;
    u.fadeDistance.value   = fadeDistance;
    u.saturation.value     = saturation;
    u.mouseInfluence.value = mouseInfluence;
    u.noiseAmount.value    = noiseAmount;
    u.distortion.value     = distortion;
    const { clientWidth: wCSS, clientHeight: hCSS } = containerRef.current;
    const dpr = r.dpr;
    const { anchor, dir } = getAnchorAndDir(raysOrigin, wCSS * dpr, hCSS * dpr);
    u.rayPos.value = anchor;
    u.rayDir.value = dir;
  }, [
    raysColor, raysSpeed, lightSpread, raysOrigin, rayLength, pulsating,
    fadeDistance, saturation, mouseInfluence, noiseAmount, distortion,
  ]);

  // ── Mouse tracking ──
  useEffect(() => {
    if (!followMouse) return;
    const onMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      mouseRef.current = {
        x: (e.clientX - rect.left)  / rect.width,
        y: (e.clientY - rect.top) / rect.height,
      };
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [followMouse]);

  return (
    <div
      ref={containerRef}
      className={`light-rays-container${className ? ` ${className}` : ''}`}
      style={style}
    />
  );
}
