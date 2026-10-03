import Reveal from "./components/Reveal";
import LiveDemo from "./components/LiveDemo";
import Pipeline from "./components/Pipeline";
import GestureSpec from "./components/GestureSpec";
import CodeExplorer from "./components/CodeExplorer";
import Setup from "./components/Setup";
import { TopBar, Footer } from "./components/Chrome";
import { downloadProjectZip } from "./lib/downloads";

const TICKER = [
  "21 LANDMARKS × 2 HANDS",
  "max_num_hands=2",
  "HSV → BGR NUMPY RAMPS",
  "np.roll() SEAMLESS HUE FLOW",
  "HYSTERESIS 0.16 / 0.24",
  "2-FRAME DEBOUNCE",
  "QUAD = #8L · #8R · #4R · #4L",
  "cv2.fillPoly MASK",
  "GRADIENT-SAMPLED STROKE",
  "TKINTER + IMAGETK FEED",
  "cap.release() + destroyAllWindows()",
];

function Ticker() {
  return (
    <div className="relative border-y border-linesoft bg-panel/60 overflow-hidden py-3" aria-hidden>
      <div className="ticker-track">
        {[0, 1].map((half) => (
          <div key={half} className="flex items-center shrink-0">
            {TICKER.map((t) => (
              <span key={`${half}-${t}`} className="flex items-center">
                <span className="font-mono text-[11px] tracking-[0.22em] text-muted px-6 whitespace-nowrap">{t}</span>
                <svg width="8" height="8" viewBox="0 0 8 8">
                  <path d="M4 0 L8 4 L4 8 L0 4 Z" fill="url(#tickbow)" />
                  <defs>
                    <linearGradient id="tickbow" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0" stopColor="#ff5d5d" />
                      <stop offset="0.5" stopColor="#3ecf8e" />
                      <stop offset="1" stopColor="#56c8e8" />
                    </linearGradient>
                  </defs>
                </svg>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <div className="min-h-screen">
      <div className="ambient" aria-hidden />
      <div className="noise" aria-hidden />
      <TopBar />

      <main>
        {/* ═══ 01 · OPEN ON THE VIEWPORT ═══ */}
        <section id="demo" className="max-w-6xl mx-auto px-5 sm:px-8 pt-24 sm:pt-28 pb-16">
          <Reveal>
            <div className="flex items-center justify-between mb-5">
              <p className="font-mono text-[11px] tracking-[0.3em] text-mint">// 01 — LIVE SIMULATION</p>
              <p className="font-mono text-[11px] tracking-[0.2em] text-faint hidden sm:block">
                TWO-HAND RAINBOW SHAPE TRACKER
              </p>
            </div>
          </Reveal>

          <Reveal delay={80}>
            <LiveDemo />
          </Reveal>

          {/* intro — asymmetric, below the fold of the viewport */}
          <div className="grid lg:grid-cols-[1.35fr_1fr] gap-10 lg:gap-16 mt-16 items-start">
            <Reveal delay={60}>
              <h1 className="font-display text-[42px] sm:text-6xl font-extrabold leading-[1.02] tracking-tight">
                Your hands
                <br />
                are the <span className="relative inline-block">
                  stylus.
                  <span className="spectral absolute left-0 -bottom-1.5 w-full rounded-full" />
                </span>
              </h1>
              <p className="text-muted text-[16px] sm:text-[17px] leading-relaxed mt-7 max-w-xl">
                PrismHands is a self-contained Python application: a{" "}
                <span className="text-snow">Tkinter dashboard</span> with the webcam feed embedded in the
                window, <span className="text-snow">MediaPipe tracking both hands simultaneously</span>, a
                custom recognizer that locks when your index fingertips and thumb tips come together — and a{" "}
                <span className="text-snow">NumPy rainbow gradient</span> swept across the shape connecting
                those four landmarks, flowing in real time.
              </p>
              <div className="flex flex-wrap gap-3.5 mt-8">
                <a
                  href="#code"
                  className="focus-ring group flex items-center gap-2.5 rounded border border-mint/50 bg-mint/10 px-5 py-3 font-mono text-[12px] tracking-wider text-mint hover:bg-mint/20 hover:-translate-y-0.5 transition-all"
                >
                  READ THE SOURCE
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" className="group-hover:translate-y-0.5 transition-transform">
                    <path d="M6 1v9M2.5 6.5 6 10l3.5-3.5" />
                  </svg>
                </a>
                <button
                  onClick={() => void downloadProjectZip()}
                  className="focus-ring flex items-center gap-2.5 rounded border border-line bg-panel px-5 py-3 font-mono text-[12px] tracking-wider text-snow hover:border-faint hover:-translate-y-0.5 transition-all"
                >
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M2 4.5 7 2l5 2.5v5L7 12 2 9.5z" />
                    <path d="M2 4.5 7 7l5-2.5M7 7v5" />
                  </svg>
                  DOWNLOAD .ZIP
                </button>
              </div>
            </Reveal>

            <Reveal delay={160}>
              <dl className="rounded-lg border border-line bg-panel divide-y divide-linesoft">
                {[
                  ["STACK", "opencv-python · mediapipe · numpy"],
                  ["GUI", "tkinter + pillow ImageTk, feed in-window"],
                  ["TRACKING", "2 hands × 21 landmarks, video mode"],
                  ["GESTURE", "#8+#8 and #4+#4 proximity, hysteresis"],
                  ["RENDER", "HSV ramp → np.roll → mask → composite"],
                  ["BUDGET", "720p pipeline in ~30 ms / frame"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-baseline gap-4 px-5 py-3.5">
                    <dt className="font-mono text-[10.5px] tracking-[0.22em] text-mint w-20 shrink-0">{k}</dt>
                    <dd className="text-[13.5px] text-muted leading-snug">{v}</dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>
        </section>

        <Ticker />

        {/* ═══ 02–05 ═══ */}
        <Pipeline />
        <div className="spectral max-w-6xl mx-auto rounded-full opacity-60" />
        <GestureSpec />
        <CodeExplorer />
        <div className="spectral max-w-6xl mx-auto rounded-full opacity-60" />
        <Setup />
      </main>

      <Footer />
    </div>
  );
}
