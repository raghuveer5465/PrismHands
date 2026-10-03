import { useRef, useState } from "react";
import Reveal from "./Reveal";

const ENGAGE = 115; // 0.16 × 720
const RELEASE = 173; // 0.24 × 720
const MAXGAP = 240;

function Diagram() {
  return (
    <svg viewBox="0 0 460 320" className="w-full" role="img" aria-label="Two-hand frame gesture landmark diagram">
      <defs>
        <linearGradient id="quadbow" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ff5d5d" stopOpacity="0.4" />
          <stop offset="0.25" stopColor="#ffd25a" stopOpacity="0.4" />
          <stop offset="0.5" stopColor="#3ecf8e" stopOpacity="0.4" />
          <stop offset="0.75" stopColor="#56c8e8" stopOpacity="0.4" />
          <stop offset="1" stopColor="#b48cff" stopOpacity="0.4" />
        </linearGradient>
        <linearGradient id="quadbowLine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ff5d5d" />
          <stop offset="0.25" stopColor="#ffd25a" />
          <stop offset="0.5" stopColor="#3ecf8e" />
          <stop offset="0.75" stopColor="#56c8e8" />
          <stop offset="1" stopColor="#b48cff" />
        </linearGradient>
      </defs>

      {/* the quad between the four tips */}
      <polygon
        points="192,160 185,92 275,92 268,160"
        fill="url(#quadbow)"
        stroke="url(#quadbowLine)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />

      {/* left hand skeleton */}
      <g stroke="#3ecf8e" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.85">
        <path d="M95 250 L128 200 L135 185" />
        <path d="M135 185 L150 108" />
        <path d="M135 185 L127 102" />
        <path d="M135 185 L108 116" />
        <path d="M128 200 L165 176 L192 160" />
        <path d="M135 185 L170 122 L185 92" />
      </g>
      {/* right hand skeleton */}
      <g stroke="#56c8e8" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.85">
        <path d="M365 250 L332 200 L325 185" />
        <path d="M325 185 L310 108" />
        <path d="M325 185 L333 102" />
        <path d="M325 185 L352 116" />
        <path d="M332 200 L295 176 L268 160" />
        <path d="M325 185 L290 122 L275 92" />
      </g>

      {/* joints */}
      {[
        [95, 250], [128, 200], [150, 108], [127, 102], [108, 116], [165, 176], [170, 122],
        [365, 250], [332, 200], [310, 108], [333, 102], [352, 116], [295, 176], [290, 122],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3" fill={x < 230 ? "#3ecf8e" : "#56c8e8"} />
      ))}

      {/* threshold halos around the four gesture tips */}
      {[[185, 92], [192, 160], [275, 92], [268, 160]].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="20" fill="none" stroke="#ffb454" strokeWidth="1.2" strokeDasharray="4 4" opacity="0.75" />
          <circle cx={x} cy={y} r="5.5" fill="#ffb454" />
          <circle cx={x} cy={y} r="5.5" fill="none" stroke="#0b0f16" strokeWidth="1.5" />
        </g>
      ))}

      {/* gap annotations */}
      <line x1="185" y1="72" x2="275" y2="72" stroke="#93a1b8" strokeWidth="1" strokeDasharray="3 4" />
      <text x="230" y="62" textAnchor="middle" fill="#93a1b8" fontSize="11" fontFamily="JetBrains Mono, monospace">
        d(#8L, #8R)
      </text>
      <line x1="192" y1="184" x2="268" y2="184" stroke="#93a1b8" strokeWidth="1" strokeDasharray="3 4" />
      <text x="230" y="202" textAnchor="middle" fill="#93a1b8" fontSize="11" fontFamily="JetBrains Mono, monospace">
        d(#4L, #4R)
      </text>

      {/* labels */}
      <text x="150" y="86" fill="#ffb454" fontSize="10.5" fontFamily="JetBrains Mono, monospace">#8 L·INDEX</text>
      <text x="84" y="164" fill="#ffb454" fontSize="10.5" fontFamily="JetBrains Mono, monospace">#4 L·THUMB</text>
      <text x="284" y="86" fill="#ffb454" fontSize="10.5" fontFamily="JetBrains Mono, monospace">#8 R·INDEX</text>
      <text x="284" y="164" fill="#ffb454" fontSize="10.5" fontFamily="JetBrains Mono, monospace">#4 R·THUMB</text>

      <text x="230" y="296" textAnchor="middle" fill="#5c6b82" fontSize="11" fontFamily="JetBrains Mono, monospace">
        quad corners = [_order_quad] sorts tips by angle → no self-intersection
      </text>
    </svg>
  );
}

export default function GestureSpec() {
  const [gap, setGap] = useState(64);
  const [locked, setLocked] = useState(true);
  const lockedRef = useRef(true);

  const onGap = (g: number) => {
    setGap(g);
    if (!lockedRef.current && g < ENGAGE) {
      lockedRef.current = true;
      setLocked(true);
    } else if (lockedRef.current && g > RELEASE) {
      lockedRef.current = false;
      setLocked(false);
    }
  };

  const pct = (v: number) => `${(v / MAXGAP) * 100}%`;

  return (
    <section id="gesture" className="relative max-w-6xl mx-auto px-5 sm:px-8 py-24 sm:py-32">
      <Reveal>
        <p className="font-mono text-[11px] tracking-[0.3em] text-amber mb-4">// 03 — GESTURE RECOGNITION</p>
        <h2 className="font-display text-4xl sm:text-5xl font-bold leading-[1.04] max-w-2xl mb-14">
          Four landmarks.
          <br />
          One diamond.
        </h2>
      </Reveal>

      <div className="grid lg:grid-cols-[1.05fr_1fr] gap-10 lg:gap-14 items-start">
        <Reveal className="rounded-lg border border-line bg-panel p-5 sm:p-7">
          <Diagram />
        </Reveal>

        <div>
          <Reveal delay={80}>
            <div className="rounded-lg border border-line bg-panel p-6 mb-5">
              <p className="font-mono text-[11px] tracking-[0.25em] text-faint mb-4">LOCK CONDITIONS</p>
              <div className="font-mono text-[13px] leading-[2.1] text-snow">
                <p>
                  <span className="text-muted">d_idx</span> = √((x<sub>8L</sub>−x<sub>8R</sub>)² + (y<sub>8L</sub>−y<sub>8R</sub>)²){" "}
                  <span className="text-mint">&lt; 0.16 · min(w,h)</span>
                </p>
                <p>
                  <span className="text-muted">d_thb</span> = √((x<sub>4L</sub>−x<sub>4R</sub>)² + (y<sub>4L</sub>−y<sub>4R</sub>)²){" "}
                  <span className="text-mint">&lt; 0.16 · min(w,h)</span>
                </p>
                <p className="text-muted">
                  both gaps, for <span className="text-amber">2 consecutive frames</span> → <span className="text-mint font-bold">LOCK</span>
                </p>
                <p className="text-muted">
                  either gap <span className="text-signal">&gt; 0.24 · min(w,h)</span> → <span className="text-signal font-bold">RELEASE</span>
                </p>
              </div>
            </div>
          </Reveal>

          {/* live hysteresis playground */}
          <Reveal delay={160}>
            <div className="rounded-lg border border-line bg-panel p-6">
              <div className="flex items-center justify-between mb-5">
                <p className="font-mono text-[11px] tracking-[0.25em] text-faint">HYSTERESIS — DRAG THE GAP</p>
                <span
                  className={`font-mono text-[11px] font-bold tracking-widest px-3 py-1.5 rounded border transition-colors duration-200 ${
                    locked
                      ? "text-mint border-mint/50 bg-mint/10"
                      : "text-muted border-line bg-ink"
                  }`}
                >
                  {locked ? "● LOCKED" : "○ UNLOCKED"}
                </span>
              </div>

              {/* zone track */}
              <div className="relative h-9 rounded border border-linesoft bg-ink overflow-hidden mb-2">
                <div className="absolute inset-y-0 left-0 bg-mint/12" style={{ width: pct(ENGAGE) }} />
                <div
                  className="absolute inset-y-0 bg-amber/10"
                  style={{ left: pct(ENGAGE), width: `calc(${pct(RELEASE)} - ${pct(ENGAGE)})` }}
                />
                <div className="absolute inset-y-0 border-l border-dashed border-mint/60" style={{ left: pct(ENGAGE) }} />
                <div className="absolute inset-y-0 border-l border-dashed border-signal/60" style={{ left: pct(RELEASE) }} />
                {/* marker */}
                <div
                  className={`absolute top-1 bottom-1 w-[3px] rounded-full transition-colors ${locked ? "bg-mint" : "bg-signal"}`}
                  style={{ left: `calc(${pct(gap)} - 1px)` }}
                />
              </div>
              <div className="relative h-4 font-mono text-[10px] text-faint mb-5">
                <span className="absolute -translate-x-1/2" style={{ left: pct(ENGAGE) }}>engage {ENGAGE}px</span>
                <span className="absolute -translate-x-1/2" style={{ left: pct(RELEASE) }}>release {RELEASE}px</span>
              </div>

              <input
                type="range" min={0} max={MAXGAP} value={gap}
                onChange={(e) => onGap(Number(e.target.value))}
                className="fader w-full mb-4"
                style={{ ["--fill" as string]: `${(gap / MAXGAP) * 100}%` }}
                aria-label="Fingertip gap in pixels"
              />

              <div className="flex items-baseline justify-between font-mono text-[12px]">
                <span className="text-muted">current gap</span>
                <span className={`text-lg font-bold ${locked ? "text-mint" : "text-snow"}`}>{gap} px</span>
              </div>
              <p className="text-[13px] leading-relaxed text-muted mt-4">
                Push past <span className="text-signal">{RELEASE}px</span> to unlock — then sweep back. The shape
                re-locks only below <span className="text-mint">{ENGAGE}px</span>. That dead band is the hysteresis:
                hover anywhere inside it and nothing flickers.
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
