import { useEffect, useRef, useState, type CSSProperties } from "react";

/* ──────────────────────────────────────────────────────────────────────
   A faithful browser simulation of the Python pipeline:
   two 21-landmark hands drift, close into the "frame" gesture, and a
   rainbow quad (hue ramp → roll → fill + gradient stroke, just like
   rainbow.py) is painted between the four fingertips.
   ────────────────────────────────────────────────────────────────────── */

type Pt = { x: number; y: number };

// 21 MediaPipe-style landmarks, hand-local (x: 0..1, y: 0..1).
const HAND_PTS: [number, number][] = [
  [0.5, 1.0],
  [0.36, 0.88], [0.27, 0.74], [0.2, 0.62], [0.15, 0.52],            // thumb 1–4
  [0.42, 0.66],                                                     // index MCP
  [0.4, 0.48], [0.39, 0.34], [0.38, 0.21],                          // index 6–8
  [0.5, 0.64], [0.51, 0.46], [0.52, 0.31], [0.53, 0.18],            // middle
  [0.58, 0.66], [0.61, 0.5], [0.63, 0.37], [0.65, 0.26],            // ring
  [0.65, 0.7], [0.7, 0.58], [0.74, 0.48], [0.78, 0.4],              // pinky
];

const BONES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const TIPS = [4, 8]; // thumb tip, index tip
const CYCLE = 11;    // seconds per approach → lock → release loop

const rot = (p: Pt, a: number): Pt => ({
  x: p.x * Math.cos(a) - p.y * Math.sin(a),
  y: p.x * Math.sin(a) + p.y * Math.cos(a),
});
const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

interface HandSpec {
  mirror: boolean;
  phase: number;
  bone: string;
  joint: string;
}

const HANDS: HandSpec[] = [
  { mirror: true, phase: 0.0, bone: "rgba(62,207,142,0.82)", joint: "#3ecf8e" },
  { mirror: false, phase: 2.1, bone: "rgba(86,200,232,0.82)", joint: "#56c8e8" },
];

function poseHand(spec: HandSpec, t: number, c: number, W: number, H: number): Pt[] {
  const s = H * 0.5;
  const loc: Pt[] = HAND_PTS.map(([px, py]) => ({
    x: (px - 0.48) * s * (spec.mirror ? -1 : 1),
    y: (py - 0.62) * s,
  }));
  const locIdx = loc[8];
  const locThb = loc[4];

  // wander pose: loose Lissajous drift + gentle sway
  const wob = Math.sin(t * 0.55 + spec.phase) * 0.12;
  const cx = W * (spec.mirror ? 0.27 : 0.73) + Math.sin(t * 0.5 + spec.phase) * W * 0.055;
  const cy = H * 0.56 + Math.cos(t * 0.37 + spec.phase * 1.3) * H * 0.085;
  const wander = loc.map((p) => {
    const r = rot(p, wob);
    return { x: r.x + cx, y: r.y + cy };
  });

  // locked pose: rigid transform placing index & thumb tips on targets
  const breathe = 1 + 0.025 * Math.sin(t * 2.6);
  const gx = W / 2;
  const gy = H * 0.5;
  const side = spec.mirror ? -1 : 1;
  const tIdx: Pt = { x: gx + side * 16 * breathe, y: gy - 72 * breathe };
  const tThb: Pt = { x: gx + side * 36 * breathe, y: gy + 62 * breathe };
  const angLoc = Math.atan2(locIdx.y - locThb.y, locIdx.x - locThb.x);
  const angTgt = Math.atan2(tIdx.y - tThb.y, tIdx.x - tThb.x);
  const phi = angTgt - angLoc;
  const rThb = rot(locThb, phi);
  const ax = tThb.x - rThb.x;
  const ay = tThb.y - rThb.y;
  const lock = loc.map((p) => {
    const r = rot(p, phi);
    return { x: r.x + ax, y: r.y + ay };
  });

  // blend + residual finger flutter that dies out as the lock engages
  const amp = 2.6 * (1 - c);
  return wander.map((w, i) => {
    const l = lock[i];
    return {
      x: w.x + (l.x - w.x) * c + Math.sin(t * 2.1 + i * 1.9 + spec.phase) * amp,
      y: w.y + (l.y - w.y) * c + Math.cos(t * 1.7 + i * 1.3 + spec.phase) * amp,
    };
  });
}

// same trick as gesture.py: order the 4 corners by angle around centroid
function orderQuad(pts: Pt[]): Pt[] {
  const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
  const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  return [...pts].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx)
  );
}

interface Params {
  paused: boolean;
  skeleton: boolean;
  hueSpeed: number; // deg/s
  alpha: number;    // 0..1
}

export default function LiveDemo() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const [paused, setPaused] = useState(false);
  const [skeleton, setSkeleton] = useState(true);
  const [hueSpeed, setHueSpeed] = useState(95);
  const [alpha, setAlpha] = useState(0.42);

  const paramsRef = useRef<Params>({ paused: false, skeleton: true, hueSpeed: 95, alpha: 0.42 });
  paramsRef.current = { paused, skeleton, hueSpeed, alpha };

  const tRef = useRef(3.2);
  const forceGesture = () => {
    tRef.current = CYCLE * 0.3;
    setPaused(false);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let last = performance.now();
    let W = 0;
    let H = 0;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = wrap.clientWidth;
      H = wrap.clientHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    function render(t: number) {
      if (!ctx) return;
      const p = paramsRef.current;

      // ── camera-feed backdrop ──
      ctx.fillStyle = "#0a0e15";
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(147,161,184,0.07)";
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 46) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 0; y < H; y += 46) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      // scanline sweep
      const sy = ((t * 42) % (H + 160)) - 80;
      const scan = ctx.createLinearGradient(0, sy - 50, 0, sy + 50);
      scan.addColorStop(0, "rgba(233,238,246,0)");
      scan.addColorStop(0.5, "rgba(233,238,246,0.045)");
      scan.addColorStop(1, "rgba(233,238,246,0)");
      ctx.fillStyle = scan;
      ctx.fillRect(0, sy - 50, W, 100);

      // ── gesture timeline ──
      const ph = ((t % CYCLE) + CYCLE) % CYCLE / CYCLE;
      let c = 0;
      if (ph >= 0.3 && ph < 0.44) c = smooth((ph - 0.3) / 0.14);
      else if (ph >= 0.44 && ph < 0.74) c = 1;
      else if (ph >= 0.74 && ph < 0.88) c = 1 - smooth((ph - 0.74) / 0.14);
      const locked = c > 0.985;

      const poses = HANDS.map((h) => poseHand(h, t, c, W, H));
      const [L, R] = poses;
      const idxGap = Math.hypot(L[8].x - R[8].x, L[8].y - R[8].y);
      const thbGap = Math.hypot(L[4].x - R[4].x, L[4].y - R[4].y);

      // ── closing tethers + gap labels ──
      if (c > 0.03 && !locked) {
        ctx.save();
        ctx.setLineDash([5, 7]);
        ctx.strokeStyle = "rgba(255,180,84,0.6)";
        ctx.lineWidth = 1.4;
        for (const [a, b] of [[L[8], R[8]], [L[4], R[4]]] as [Pt, Pt][]) {
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
        ctx.restore();
        ctx.font = "11px 'JetBrains Mono', monospace";
        ctx.fillStyle = "rgba(255,180,84,0.95)";
        ctx.fillText(`ΔIDX ${Math.round(idxGap)}px`, (L[8].x + R[8].x) / 2 + 10, (L[8].y + R[8].y) / 2 - 8);
        ctx.fillText(`ΔTHB ${Math.round(thbGap)}px`, (L[4].x + R[4].x) / 2 + 10, (L[4].y + R[4].y) / 2 + 16);
      }

      // ── the rainbow quad (mirrors rainbow.py) ──
      if (locked) {
        const quad = orderQuad([L[4], L[8], R[8], R[4]]);
        const xs = quad.map((q) => q.x);
        const x0 = Math.min(...xs) - 26;
        const x1 = Math.max(...xs) + 26;
        const hueOff = (t * p.hueSpeed) % 360;
        const grad = ctx.createLinearGradient(x0, 0, x1, 0);
        for (let i = 0; i <= 6; i++) {
          grad.addColorStop(i / 6, `hsla(${(hueOff + i * 60) % 360}, 96%, 60%, ${p.alpha})`);
        }
        ctx.beginPath();
        quad.forEach((q, i) => (i === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y)));
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        // gradient stroke + glow
        const strokeGrad = ctx.createLinearGradient(x0, 0, x1, 0);
        for (let i = 0; i <= 6; i++) {
          strokeGrad.addColorStop(i / 6, `hsl(${(hueOff + i * 60) % 360}, 96%, 64%)`);
        }
        ctx.save();
        ctx.shadowColor = `hsla(${hueOff}, 95%, 60%, 0.85)`;
        ctx.shadowBlur = 20;
        ctx.strokeStyle = strokeGrad;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
      }

      // ── hand skeletons ──
      HANDS.forEach((spec, hi) => {
        const pose = poses[hi];
        if (p.skeleton) {
          ctx.strokeStyle = spec.bone;
          ctx.lineWidth = 2;
          for (const [a, b] of BONES) {
            ctx.beginPath();
            ctx.moveTo(pose[a].x, pose[a].y);
            ctx.lineTo(pose[b].x, pose[b].y);
            ctx.stroke();
          }
          pose.forEach((pt, i) => {
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, TIPS.includes(i) ? 4.5 : 2.4, 0, Math.PI * 2);
            ctx.fillStyle = spec.joint;
            ctx.fill();
          });
        }
        // gesture fingertips always get a target marker
        for (const i of TIPS) {
          const pt = pose[i];
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 8.5, 0, Math.PI * 2);
          ctx.strokeStyle = locked ? "rgba(255,255,255,0.9)" : "rgba(255,180,84,0.85)";
          ctx.lineWidth = 1.6;
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(pt.x - 13, pt.y); ctx.lineTo(pt.x - 5, pt.y);
          ctx.moveTo(pt.x + 5, pt.y); ctx.lineTo(pt.x + 13, pt.y);
          ctx.moveTo(pt.x, pt.y - 13); ctx.lineTo(pt.x, pt.y - 5);
          ctx.moveTo(pt.x, pt.y + 5); ctx.lineTo(pt.x, pt.y + 13);
          ctx.stroke();
        }
      });

      // ── vignette ──
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72);
      vg.addColorStop(0, "rgba(6,9,14,0)");
      vg.addColorStop(1, "rgba(6,9,14,0.55)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);

      // ── HUD ──
      ctx.font = "12px 'JetBrains Mono', monospace";
      const blink = Math.sin(t * 4.2) > -0.2;
      ctx.fillStyle = blink ? "#ff5d5d" : "rgba(255,93,93,0.25)";
      ctx.beginPath(); ctx.arc(26, 26, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(233,238,246,0.92)";
      const secs = Math.floor(t % 60).toString().padStart(2, "0");
      const mins = Math.floor((t / 60) % 60).toString().padStart(2, "0");
      ctx.fillText(`REC 00:${mins}:${secs}`, 40, 30);

      const fps = 29.4 + Math.sin(t * 1.7) * 1.2;
      ctx.textAlign = "right";
      ctx.fillText(`FPS ${fps.toFixed(1)}`, W - 22, 30);
      ctx.fillStyle = "rgba(147,161,184,0.75)";
      ctx.fillText("1280×720 · BGR24", W - 22, 48);

      ctx.textAlign = "left";
      const confL = (0.965 + Math.sin(t * 0.9) * 0.012).toFixed(2);
      const confR = (0.951 + Math.cos(t * 0.8) * 0.014).toFixed(2);
      ctx.fillStyle = "rgba(233,238,246,0.9)";
      ctx.fillText(`HANDS 2/2  ·  L ${confL}  ·  R ${confR}`, 22, H - 22);

      ctx.textAlign = "right";
      if (locked) {
        ctx.fillStyle = "#3ecf8e";
        ctx.fillText("GESTURE: FRAME — LOCKED", W - 22, H - 22);
      } else if (c > 0.02) {
        ctx.fillStyle = "#ffb454";
        ctx.fillText(`CLOSING · ΔIDX ${Math.round(idxGap)}PX`, W - 22, H - 22);
      } else {
        ctx.fillStyle = "rgba(147,161,184,0.8)";
        ctx.fillText("TRACKING · NO GESTURE", W - 22, H - 22);
      }
      ctx.textAlign = "left";

      // corner brackets that tighten while locked
      const bl = 16 + 9 * c;
      ctx.strokeStyle = locked ? "rgba(62,207,142,0.9)" : "rgba(147,161,184,0.4)";
      ctx.lineWidth = 2;
      const m = 10;
      for (const [bx, by, dx, dy] of [
        [m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1],
      ] as [number, number, number, number][]) {
        ctx.beginPath();
        ctx.moveTo(bx + dx * bl, by);
        ctx.lineTo(bx, by);
        ctx.lineTo(bx, by + dy * bl);
        ctx.stroke();
      }
    }

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!paramsRef.current.paused) tRef.current += dt;
      render(tRef.current);
      raf = requestAnimationFrame(loop);
    };

    if (reduced) {
      tRef.current = CYCLE * 0.58;
      render(tRef.current);
    } else {
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const sliderFill = (v: number, min: number, max: number) =>
    ({ ["--fill" as string]: `${((v - min) / (max - min)) * 100}%` } as CSSProperties);

  return (
    <div className="rounded-lg border border-line bg-panel shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)] overflow-hidden">
      {/* viewport chrome */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-linesoft bg-panel2">
        <div className="flex items-center gap-2.5">
          <span className="flex gap-1.5">
            <i className="w-2.5 h-2.5 rounded-full bg-[#ff5d5d]/80" />
            <i className="w-2.5 h-2.5 rounded-full bg-amber/80" />
            <i className="w-2.5 h-2.5 rounded-full bg-mint/80" />
          </span>
          <span className="font-mono text-[11px] tracking-[0.18em] text-muted">
            PRISMHANDS · LIVE VIEWPORT
          </span>
        </div>
        <span className="font-mono text-[11px] text-faint hidden sm:block">
          mediapipe hands · max_num_hands=2
        </span>
      </div>

      <div ref={wrapRef} className="relative w-full aspect-[16/8.6] max-h-[560px] bg-[#0a0e15]">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
        <span className="absolute top-2.5 left-1/2 -translate-x-1/2 font-mono text-[10px] tracking-[0.22em] text-faint/90 border border-linesoft rounded-full px-3 py-1 bg-ink/60 backdrop-blur-sm">
          SIMULATED FEED — THE REAL PIPELINE RUNS ON YOUR WEBCAM
        </span>
      </div>

      {/* control deck */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4 px-4 sm:px-5 py-4 border-t border-linesoft bg-panel2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPaused((v) => !v)}
            className="focus-ring flex items-center gap-2 rounded border border-line bg-raise px-3.5 py-2 font-mono text-[12px] tracking-wider text-snow hover:border-mint/60 hover:text-mint transition-colors"
          >
            {paused ? (
              <svg width="11" height="12" viewBox="0 0 11 12" fill="currentColor"><path d="M0 0l11 6-11 6z" /></svg>
            ) : (
              <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor"><rect width="3.4" height="12" /><rect x="6.6" width="3.4" height="12" /></svg>
            )}
            {paused ? "RESUME" : "PAUSE"}
          </button>
          <button
            onClick={forceGesture}
            className="focus-ring flex items-center gap-2 rounded border border-line bg-raise px-3.5 py-2 font-mono text-[12px] tracking-wider text-snow hover:border-amber/70 hover:text-amber transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M6 1 L11 6 L6 11 L1 6 Z" />
            </svg>
            FORCE GESTURE
          </button>
        </div>

        <button
          onClick={() => setSkeleton((v) => !v)}
          aria-pressed={skeleton}
          className={`focus-ring flex items-center gap-2.5 rounded border px-3.5 py-2 font-mono text-[12px] tracking-wider transition-colors ${
            skeleton
              ? "border-mint/50 bg-mint/10 text-mint"
              : "border-line bg-raise text-faint hover:text-muted"
          }`}
        >
          <span className={`w-7 h-4 rounded-full relative transition-colors ${skeleton ? "bg-mint/70" : "bg-line"}`}>
            <span
              className={`absolute top-0.5 w-3 h-3 rounded-full bg-ink transition-all ${skeleton ? "left-3.5" : "left-0.5"}`}
            />
          </span>
          SKELETON
        </button>

        <label className="flex items-center gap-3 min-w-[190px] flex-1 max-w-[260px]">
          <span className="font-mono text-[11px] tracking-widest text-muted whitespace-nowrap">HUE FLOW</span>
          <input
            type="range" min={0} max={240} value={hueSpeed}
            onChange={(e) => setHueSpeed(Number(e.target.value))}
            className="fader w-full" style={sliderFill(hueSpeed, 0, 240)}
            aria-label="Rainbow hue flow speed"
          />
          <span className="font-mono text-[11px] text-cyanic w-12 text-right">{hueSpeed}°/s</span>
        </label>

        <label className="flex items-center gap-3 min-w-[190px] flex-1 max-w-[260px]">
          <span className="font-mono text-[11px] tracking-widest text-muted whitespace-nowrap">FILL</span>
          <input
            type="range" min={8} max={85} value={Math.round(alpha * 100)}
            onChange={(e) => setAlpha(Number(e.target.value) / 100)}
            className="fader w-full" style={sliderFill(Math.round(alpha * 100), 8, 85)}
            aria-label="Rainbow fill opacity"
          />
          <span className="font-mono text-[11px] text-cyanic w-12 text-right">{Math.round(alpha * 100)}%</span>
        </label>
      </div>
    </div>
  );
}
