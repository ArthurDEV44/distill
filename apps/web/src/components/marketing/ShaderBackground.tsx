'use client';

import { useEffect, useRef } from 'react';

const VERTEX_SHADER = `
  attribute vec2 p;
  void main(){ gl_Position = vec4(p, 0.0, 1.0); }
`;

// ASCII-style pixelated vortex — chunky glyphs swirl around a warm center.
const FRAGMENT_SHADER = `
  precision highp float;
  uniform vec2  uRes;
  uniform float uTime;
  uniform float uSpeed;
  uniform float uOrange;
  uniform float uDensity;
  uniform float uHue;
  uniform float uCell;

  float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
  float noise(vec2 p){
    vec2 i=floor(p), f=fract(p);
    float a=hash(i), b=hash(i+vec2(1,0)), c=hash(i+vec2(0,1)), d=hash(i+vec2(1,1));
    vec2 u=f*f*(3.0-2.0*f);
    return mix(a,b,u.x)+(c-a)*u.y*(1.0-u.x)+(d-b)*u.x*u.y;
  }
  float fbm(vec2 p){
    float v=0.0, a=0.5;
    for(int i=0;i<5;i++){ v+=a*noise(p); p=p*2.02+vec2(1.3,3.7); a*=0.5; }
    return v;
  }

  vec3 accentColor(float h){
    float t = clamp((h-30.0)/50.0, 0.0, 1.0);
    vec3 rust   = vec3(0.78, 0.34, 0.18);
    vec3 orange = vec3(0.86, 0.46, 0.28);
    vec3 gold   = vec3(0.92, 0.68, 0.36);
    vec3 c = mix(rust, orange, smoothstep(0.0, 0.5, t));
    c = mix(c, gold, smoothstep(0.5, 1.0, t));
    return c;
  }

  float glyph(vec2 sub, float level){
    vec2 c = sub - 0.5;
    float d = length(c);
    if (level < 0.5) return 0.0;
    if (level < 1.5) return smoothstep(0.14, 0.05, d);
    if (level < 2.5) {
      float bar = min(abs(c.x), abs(c.y));
      float arm = max(abs(c.x), abs(c.y));
      return smoothstep(0.09, 0.0, bar) * step(arm, 0.34);
    }
    float x = min(abs(c.x - c.y), abs(c.x + c.y));
    return smoothstep(0.10, 0.0, x) * step(length(c), 0.44);
  }

  void main(){
    vec2 frag = gl_FragCoord.xy;
    vec2 cellIdx = floor(frag / uCell);
    vec2 cellCenter = (cellIdx + 0.5) * uCell;
    vec2 sub = (frag - cellIdx * uCell) / uCell;

    vec2 uv = cellCenter / uRes.xy;
    vec2 p = uv - 0.5;
    p.x *= uRes.x / uRes.y;

    // Vortex swirl — angular speed inversely with radius
    float r = length(p);
    float a = atan(p.y, p.x);
    float swirl = uTime * (0.12 + uSpeed*0.55) / (0.35 + r*1.6);
    float ang = a + swirl;
    vec2 warped = vec2(cos(ang), sin(ang)) * r;

    // Wispy arms via layered fbm along warped coords
    float n1 = fbm(warped * 2.5 + vec2(uTime*0.05, 0.0));
    float n2 = fbm(warped * 5.0 - vec2(uTime*0.03, uTime*0.02));
    float field = n1*0.65 + n2*0.35;

    float coreBoost = smoothstep(0.85, 0.10, r);
    float edgeFade  = smoothstep(1.0, 0.2, r);
    field = field * (0.3 + coreBoost*0.9) * edgeFade;

    float thr = mix(0.60, 0.32, uDensity);
    float level = 0.0;
    if (field > thr)        level = 1.0;
    if (field > thr + 0.08) level = 2.0;
    if (field > thr + 0.18) level = 3.0;

    float g = glyph(sub, level);

    vec3 bg = vec3(0.043, 0.037, 0.032);
    vec3 ink = vec3(0.48, 0.43, 0.38);
    vec3 acc = accentColor(uHue);
    float warm = coreBoost * 0.7 + smoothstep(0.05, 0.9, uv.x) * 0.2;
    vec3 charColor = mix(ink, acc, warm * (0.3 + uOrange*0.8));
    charColor *= 0.35 + level * 0.22;

    vec3 col = mix(bg, charColor, g);
    col += acc * coreBoost * 0.05 * (0.25 + uOrange);

    float vig = smoothstep(1.1, 0.3, length((uv-0.5)*vec2(1.0,1.25)));
    col *= mix(0.6, 1.0, vig);

    gl_FragColor = vec4(col, 1.0);
  }
`;

interface ShaderBackgroundProps {
  /** 0..1 — swirl speed */
  speed?: number;
  /** 0..1 — how much accent warmth bleeds into the glyphs */
  orange?: number;
  /** 0..1 — glyph density (lower = sparser) */
  density?: number;
  /** hue in [30..80] — rust/orange/gold */
  hue?: number;
  /** pixel cell size in CSS pixels */
  cell?: number;
}

/**
 * Renders the ASCII vortex inside its parent container.
 * Parent must be `position: relative` (and typically `overflow: hidden`).
 * The shader is clipped to the parent's box — it does NOT span the viewport.
 */
export default function ShaderBackground({
  speed = 0.35,
  orange = 0.55,
  density = 0.5,
  hue = 52,
  cell = 9,
}: ShaderBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', {
      antialias: false,
      premultipliedAlpha: false,
    });
    if (!gl) {
      canvas.style.display = 'none';
      return;
    }

    const compile = (type: number, src: string): WebGLShader | null => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(sh));
        gl.deleteShader(sh);
        return null;
      }
      return sh;
    };

    const vs = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vs || !fs) {
      canvas.style.display = 'none';
      return;
    }

    const prog = gl.createProgram();
    if (!prog) {
      canvas.style.display = 'none';
      return;
    }
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(prog));
      canvas.style.display = 'none';
      return;
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, 'uRes');
    const uTime = gl.getUniformLocation(prog, 'uTime');
    const uSpeed = gl.getUniformLocation(prog, 'uSpeed');
    const uOrange = gl.getUniformLocation(prog, 'uOrange');
    const uDensity = gl.getUniformLocation(prog, 'uDensity');
    const uHue = gl.getUniformLocation(prog, 'uHue');
    const uCell = gl.getUniformLocation(prog, 'uCell');

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    // Pause the animation loop when the canvas is scrolled out of view
    let visible = true;
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        const wasVisible = visible;
        visible = entry.isIntersecting;
        if (visible && !wasVisible) {
          raf = requestAnimationFrame(frame);
        }
      },
      { threshold: 0 },
    );
    io.observe(canvas);

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    // Pre-age time so the first rendered frame already shows a developed vortex.
    // The shader's arms come from `swirl = uTime * k / r` — angular velocity varies
    // with radius, so the inner core rotates faster than the outer edge. 30s gives
    // the edges (~0.34 rad/s) enough time to make a full turn, which is when the
    // vortex looks fully "mature" instead of mid-formation.
    const TIME_WARMUP_S = 30;
    const t0 = performance.now() - TIME_WARMUP_S * 1000;
    let raf = 0;
    let stopped = false;
    let firstFrame = true;

    const frame = () => {
      if (stopped) return;
      // On the very first paint, re-measure the canvas — layout may have settled
      // after the effect ran (fonts loading, dvh resolving, images pushing content).
      // Rendering with stale dimensions is what produced the distorted initial shape.
      if (firstFrame) {
        resize();
        firstFrame = false;
      }
      const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
      const t = reducedMotion
        ? TIME_WARMUP_S
        : (performance.now() - t0) / 1000;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, t);
      gl.uniform1f(uSpeed, speed);
      gl.uniform1f(uOrange, orange);
      gl.uniform1f(uDensity, density);
      gl.uniform1f(uHue, hue);
      gl.uniform1f(uCell, cell * dpr);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (reducedMotion) return; // one paint is enough
      if (!visible) return; // paused off-screen
      raf = requestAnimationFrame(frame);
    };

    // Defer the first draw by two rAF cycles so the browser has committed
    // its first post-mount layout + any font swap before we measure the canvas.
    raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(frame);
    });

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [speed, orange, density, hue, cell]);

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 w-full h-full"
      />
      {/* Mask — fade toward the bottom so the section edge blends into the page bg */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 0%, transparent 0%, #050505 78%), linear-gradient(to bottom, transparent 50%, #050505 95%)',
        }}
      />
    </>
  );
}
