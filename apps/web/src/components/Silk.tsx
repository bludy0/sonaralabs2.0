import { useEffect, useRef } from "react";

export interface SilkProps {
  speed?: number;
  scale?: number;
  color?: string;
  noiseIntensity?: number;
  rotation?: number;
  style?: React.CSSProperties;
  className?: string;
}

// ── Shader sources ────────────────────────────────────────────────────────────
const VS = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FS = `
precision mediump float;
varying vec2 vUv;

uniform float uTime;
uniform vec3  uColor;
uniform float uSpeed;
uniform float uScale;
uniform float uRotation;
uniform float uNoiseIntensity;

const float e = 2.71828182845904523536;

float noise(vec2 p) {
  float G = e;
  vec2  r = G * sin(G * p);
  return fract(r.x * r.y * (1.0 + p.x));
}

vec2 rotateUv(vec2 uv, float a) {
  float c = cos(a); float s = sin(a);
  return mat2(c, -s, s, c) * uv;
}

void main() {
  float rnd     = noise(gl_FragCoord.xy);
  vec2  uv      = rotateUv(vUv * uScale, uRotation);
  vec2  tex     = uv * uScale;
  float tOffset = uSpeed * uTime;

  tex.y += 0.03 * sin(8.0 * tex.x - tOffset);

  float pattern = 0.6 + 0.4 * sin(
    5.0 * (tex.x + tex.y + cos(3.0 * tex.x + 5.0 * tex.y) + 0.02 * tOffset)
    + sin(20.0 * (tex.x + tex.y - 0.1 * tOffset))
  );

  vec3 col = uColor * pattern - rnd / 15.0 * uNoiseIntensity;
  gl_FragColor = vec4(col, 1.0);
}
`;

// ── Helpers ───────────────────────────────────────────────────────────────────
function hexToRGB(hex: string): [number, number, number] {
  hex = hex.replace("#", "");
  return [
    parseInt(hex.slice(0, 2), 16) / 255,
    parseInt(hex.slice(2, 4), 16) / 255,
    parseInt(hex.slice(4, 6), 16) / 255,
  ];
}

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  return sh;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Silk({
  speed         = 5,
  scale         = 1,
  color         = "#7B7481",
  noiseIntensity= 1.5,
  rotation      = 0,
  style,
  className,
}: SilkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl");
    if (!gl) return;

    // Compile & link
    const vs   = compileShader(gl, gl.VERTEX_SHADER,   VS);
    const fs   = compileShader(gl, gl.FRAGMENT_SHADER, FS);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.useProgram(prog);

    // Full-screen quad
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1,  1, -1, -1,  1,  1,  1]),
      gl.STATIC_DRAW,
    );
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // Uniform locations
    const uTime          = gl.getUniformLocation(prog, "uTime");
    const uColor         = gl.getUniformLocation(prog, "uColor");
    const uSpeed         = gl.getUniformLocation(prog, "uSpeed");
    const uScale         = gl.getUniformLocation(prog, "uScale");
    const uRotation      = gl.getUniformLocation(prog, "uRotation");
    const uNoiseIntensity= gl.getUniformLocation(prog, "uNoiseIntensity");

    const rgb = hexToRGB(color);
    gl.uniform3f(uColor,          rgb[0], rgb[1], rgb[2]);
    gl.uniform1f(uSpeed,          speed);
    gl.uniform1f(uScale,          scale);
    gl.uniform1f(uRotation,       rotation);
    gl.uniform1f(uNoiseIntensity, noiseIntensity);

    // Resize observer
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, 2);
      const w   = canvas.clientWidth  * dpr;
      const h   = canvas.clientHeight * dpr;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width  = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    // Render loop
    let t = 0;
    const render = (ms: number) => {
      t = ms * 0.001;
      gl.uniform1f(uTime, t);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      gl.deleteProgram(prog);
      gl.deleteBuffer(buf);
    };
  }, [speed, scale, color, noiseIntensity, rotation]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: "100%", height: "100%", display: "block", ...style }}
    />
  );
}
