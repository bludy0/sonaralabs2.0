import { useEffect, useRef, memo } from 'react';
import './Balatro.css';

export interface BalatroPops {
  spinRotation?:     number;
  spinSpeed?:        number;
  offset?:           [number, number];
  color1?:           string;
  color2?:           string;
  color3?:           string;
  contrast?:         number;
  lighting?:         number;
  spinAmount?:       number;
  pixelFilter?:      number;
  spinEase?:         number;
  isRotate?:         boolean;
  mouseInteraction?: boolean;
  style?:            React.CSSProperties;
  className?:        string;
}

function hexToVec4(hex: string): [number, number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
    1,
  ];
}

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  return sh;
}

const VERT = `#version 300 es
in vec2 uv;
in vec2 position;
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;

uniform float iTime;
uniform vec3  iResolution;
uniform float uSpinRotation;
uniform float uSpinSpeed;
uniform vec2  uOffset;
uniform vec4  uColor1;
uniform vec4  uColor2;
uniform vec4  uColor3;
uniform float uContrast;
uniform float uLighting;
uniform float uSpinAmount;
uniform float uPixelFilter;
uniform float uSpinEase;
uniform bool  uIsRotate;
uniform vec2  uMouse;
in vec2 vUv;
out vec4 fragColor;

vec4 effect(vec2 screenSize, vec2 screen_coords) {
  float pixel_size = length(screenSize.xy) / uPixelFilter;
  vec2 uv = (floor(screen_coords.xy * (1.0 / pixel_size)) * pixel_size
             - 0.5 * screenSize.xy) / length(screenSize.xy) - uOffset;
  float uv_len = length(uv);

  float speed = uSpinRotation * uSpinEase * 0.2;
  if (uIsRotate) speed = iTime * speed;
  speed += 302.2;

  float mouseInfluence = uMouse.x * 2.0 - 1.0;
  speed += mouseInfluence * 0.1;

  float new_pixel_angle = atan(uv.y, uv.x) + speed
    - uSpinEase * 20.0 * (uSpinAmount * uv_len + (1.0 - uSpinAmount));
  vec2 mid = (screenSize.xy / length(screenSize.xy)) / 2.0;
  uv = vec2(
    uv_len * cos(new_pixel_angle) + mid.x,
    uv_len * sin(new_pixel_angle) + mid.y
  ) - mid;

  uv *= 30.0;
  float baseSpeed = iTime * uSpinSpeed;
  speed = baseSpeed + mouseInfluence * 2.0;
  vec2 uv2 = vec2(uv.x + uv.y);

  for (int i = 0; i < 5; i++) {
    uv2 += sin(max(uv.x, uv.y)) + uv;
    uv  += 0.5 * vec2(
      cos(5.1123314 + 0.353 * uv2.y + speed * 0.131121),
      sin(uv2.x - 0.113 * speed)
    );
    uv -= cos(uv.x + uv.y) - sin(uv.x * 0.711 - uv.y);
  }

  float contrast_mod = 0.25 * uContrast + 0.5 * uSpinAmount + 1.2;
  float paint_res    = min(2.0, max(0.0, length(uv) * 0.035 * contrast_mod));
  float c1p  = max(0.0, 1.0 - contrast_mod * abs(1.0 - paint_res));
  float c2p  = max(0.0, 1.0 - contrast_mod * abs(paint_res));
  float c3p  = 1.0 - min(1.0, c1p + c2p);
  float light = (uLighting - 0.2) * max(c1p * 5.0 - 4.0, 0.0)
              +  uLighting * max(c2p * 5.0 - 4.0, 0.0);

  return (0.3 / uContrast) * uColor1
       + (1.0 - 0.3 / uContrast)
         * (uColor1 * c1p + uColor2 * c2p + vec4(c3p * uColor3.rgb, c3p * uColor1.a))
       + light;
}

void main() {
  fragColor = effect(iResolution.xy, vUv * iResolution.xy);
}`;

// Stable reference — prevents useEffect re-running when parent re-renders
// with a default offset (inline `[0,0]` literal creates a new array each render).
const DEFAULT_OFFSET: [number, number] = [0.0, 0.0];

export default memo(function Balatro({
  spinRotation     = -2.0,
  spinSpeed        = 7.0,
  offset           = DEFAULT_OFFSET,
  color1           = '#DE443B',
  color2           = '#006BB4',
  color3           = '#162325',
  contrast         = 3.5,
  lighting         = 0.4,
  spinAmount       = 0.25,
  pixelFilter      = 745.0,
  spinEase         = 1.0,
  isRotate         = false,
  mouseInteraction = false,
  style,
  className,
}: BalatroPops) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctn = containerRef.current;
    if (!ctn) return;

    // ── WebGL context — preserveDrawingBuffer doğrudan burada ──
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2', {
      alpha:                 false,
      antialias:             false,
      preserveDrawingBuffer: true,
      powerPreference:       'high-performance',
      // desynchronized: skip compositor sync — eliminates Chrome mouse-move blink
      desynchronized:        true,
    } as WebGLContextAttributes) as WebGL2RenderingContext | null
      // fallback to webgl1 if webgl2 unavailable
      ?? canvas.getContext('webgl', {
        alpha:                 false,
        antialias:             false,
        preserveDrawingBuffer: true,
        powerPreference:       'high-performance',
        desynchronized:        true,
      } as WebGLContextAttributes);
    if (!gl) return;

    canvas.style.width       = '100%';
    canvas.style.height      = '100%';
    canvas.style.display     = 'block';
    // Force a stable, isolated GPU layer — prevents Chrome from re-compositing
    // the canvas during mouse-move / hover-state updates on sibling elements.
    canvas.style.transform   = 'translateZ(0)';
    canvas.style.willChange  = 'transform';
    canvas.style.isolation   = 'isolate';
    ctn.appendChild(canvas);

    // ── Compile & link ──
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER,   VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    // ── Full-screen triangle: interleaved position + uv ──
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,  0, 0,
       3, -1,  2, 0,
      -1,  3,  0, 2,
    ]), gl.STATIC_DRAW);

    const stride = 4 * Float32Array.BYTES_PER_ELEMENT;
    const posLoc = gl.getAttribLocation(prog, 'position');
    const uvLoc  = gl.getAttribLocation(prog, 'uv');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(uvLoc);
    gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);

    // ── Uniform locations ──
    const uTime      = gl.getUniformLocation(prog, 'iTime');
    const uRes       = gl.getUniformLocation(prog, 'iResolution');
    const uSpinRot   = gl.getUniformLocation(prog, 'uSpinRotation');
    const uSpinSpd   = gl.getUniformLocation(prog, 'uSpinSpeed');
    const uOff       = gl.getUniformLocation(prog, 'uOffset');
    const uCol1      = gl.getUniformLocation(prog, 'uColor1');
    const uCol2      = gl.getUniformLocation(prog, 'uColor2');
    const uCol3      = gl.getUniformLocation(prog, 'uColor3');
    const uCont      = gl.getUniformLocation(prog, 'uContrast');
    const uLight     = gl.getUniformLocation(prog, 'uLighting');
    const uSpinAmt   = gl.getUniformLocation(prog, 'uSpinAmount');
    const uPxFilter  = gl.getUniformLocation(prog, 'uPixelFilter');
    const uSpinEaseU = gl.getUniformLocation(prog, 'uSpinEase');
    const uIsRot     = gl.getUniformLocation(prog, 'uIsRotate');
    const uMouseU    = gl.getUniformLocation(prog, 'uMouse');

    // ── Static uniforms ──
    const [c1r, c1g, c1b, c1a] = hexToVec4(color1);
    const [c2r, c2g, c2b, c2a] = hexToVec4(color2);
    const [c3r, c3g, c3b, c3a] = hexToVec4(color3);
    gl.uniform1f(uSpinRot,   spinRotation);
    gl.uniform1f(uSpinSpd,   spinSpeed);
    gl.uniform2f(uOff,       offset[0], offset[1]);
    gl.uniform4f(uCol1,      c1r, c1g, c1b, c1a);
    gl.uniform4f(uCol2,      c2r, c2g, c2b, c2a);
    gl.uniform4f(uCol3,      c3r, c3g, c3b, c3a);
    gl.uniform1f(uCont,      contrast);
    gl.uniform1f(uLight,     lighting);
    gl.uniform1f(uSpinAmt,   spinAmount);
    gl.uniform1f(uPxFilter,  pixelFilter);
    gl.uniform1f(uSpinEaseU, spinEase);
    gl.uniform1i(uIsRot,     isRotate ? 1 : 0);
    gl.uniform2f(uMouseU,    0.5, 0.5);

    // ── non-null aliases for closures ──
    const safeGl  = gl  as WebGLRenderingContext;
    const safeCtn = ctn as HTMLDivElement;

    // ── Resize ──
    const dpr = Math.min(window.devicePixelRatio, 2);
    function resize() {
      const w = Math.floor(safeCtn.offsetWidth  * dpr);
      const h = Math.floor(safeCtn.offsetHeight * dpr);
      canvas.width  = w;
      canvas.height = h;
      safeGl.viewport(0, 0, w, h);
      safeGl.uniform3f(uRes, w, h, w / h);
    }
    window.addEventListener('resize', resize);
    resize();

    // ── Render loop ──
    // No clearColor / clear() call — the full-screen triangle covers every pixel,
    // so clearing is redundant. Skipping it removes the one-frame "black gap"
    // between clear and draw that Chrome's async GPU pipeline can expose.
    let raf: number;
    function render(t: number) {
      safeGl.uniform1f(uTime, t * 0.001);
      safeGl.drawArrays(safeGl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(render);
    }
    raf = requestAnimationFrame(render);

    // ── Mouse ──
    function onMouseMove(e: MouseEvent) {
      if (!mouseInteraction) return;
      const rect = safeCtn.getBoundingClientRect();
      safeGl.uniform2f(
        uMouseU,
        (e.clientX - rect.left) / rect.width,
        1.0 - (e.clientY - rect.top) / rect.height,
      );
    }
    safeCtn.addEventListener('mousemove', onMouseMove);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      safeCtn.removeEventListener('mousemove', onMouseMove);
      if (safeCtn.contains(canvas)) safeCtn.removeChild(canvas);
      safeGl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [
    // offset primitive values — not the array reference — so a new [x,y] literal
    // from a parent render doesn't tear down and recreate the whole WebGL context.
    spinRotation, spinSpeed, offset[0], offset[1], color1, color2, color3,
    contrast, lighting, spinAmount, pixelFilter, spinEase,
    isRotate, mouseInteraction,
  ]);

  return (
    <div
      ref={containerRef}
      className={`balatro-container${className ? ` ${className}` : ''}`}
      style={style}
    />
  );
});
