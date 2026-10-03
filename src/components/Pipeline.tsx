import type { ReactNode } from "react";
import Reveal from "./Reveal";

interface Stage {
  n: string;
  title: string;
  body: string;
  chip: string;
  icon: ReactNode;
  tint: string;
}

const icon = (paths: ReactNode) => (
  <svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    {paths}
  </svg>
);

const STAGES: Stage[] = [
  {
    n: "01",
    title: "Capture",
    body: "cv2.VideoCapture pulls a BGR frame from the webcam. The Tk after() loop re-schedules the whole pipeline every tick — no threads, no queues.",
    chip: "cap.read() → 1280×720 BGR",
    tint: "text-signal",
    icon: icon(
      <>
        <rect x="3" y="6" width="15" height="14" rx="2" />
        <path d="M18 11l5-3v10l-5-3z" />
        <circle cx="10.5" cy="13" r="3.2" />
      </>
    ),
  },
  {
    n: "02",
    title: "Both hands",
    body: "MediaPipe Hands runs with max_num_hands=2 and returns 21 normalized landmarks per hand. We convert them to pixel-space NumPy arrays immediately.",
    chip: "Hands(max_num_hands=2)",
    tint: "text-mint",
    icon: icon(
      <>
        <path d="M8 21v-6.5L5.5 12a1.8 1.8 0 0 1 2.6-2.5L10 11V4.8a1.5 1.5 0 0 1 3 0V10V3.5a1.5 1.5 0 0 1 3 0V10V5a1.5 1.5 0 0 1 3 0v8.5c0 3-2 7.5-6 7.5s-5-2-5-4" />
      </>
    ),
  },
  {
    n: "03",
    title: "Gesture logic",
    body: "d(#8L,#8R) and d(#4L,#4R) — the two fingertip gaps — are tested against engage/release thresholds with hysteresis and a 2-frame debounce.",
    chip: "gap < 0.16 · min(w,h) → lock",
    tint: "text-amber",
    icon: icon(
      <>
        <circle cx="7" cy="8" r="3" />
        <circle cx="19" cy="8" r="3" />
        <circle cx="7" cy="19" r="3" />
        <circle cx="19" cy="19" r="3" />
        <path d="M10 8h6M10 19h6M7 11v5M19 11v5" strokeDasharray="2.5 2.5" />
      </>
    ),
  },
  {
    n: "04",
    title: "Rainbow mask",
    body: "A precomputed HSV hue ramp is rolled with np.roll (seamless — integer 360° cycles), converted HSV→BGR, then alpha-blended through the quad mask.",
    chip: "np.roll(hsv, shift, axis=1)",
    tint: "text-cyanic",
    icon: icon(
      <>
        <path d="M3 20 L13 4 L23 20 Z" />
        <path d="M13 12l8-4M14.5 14.5l8-1M15.5 17l7.5 2" />
      </>
    ),
  },
  {
    n: "05",
    title: "Composite",
    body: "The gradient-filled quad plus a per-segment rainbow stroke (and gaussian glow) are composited onto the frame, then pushed into the Tk label via PIL.",
    chip: "ImageTk.PhotoImage(frame)",
    tint: "text-snow",
    icon: icon(
      <>
        <rect x="3" y="3" width="14" height="14" rx="2" />
        <rect x="9" y="9" width="14" height="14" rx="2" />
      </>
    ),
  },
];

export default function Pipeline() {
  return (
    <section id="pipeline" className="relative max-w-6xl mx-auto px-5 sm:px-8 py-24 sm:py-32">
      <Reveal>
        <p className="font-mono text-[11px] tracking-[0.3em] text-mint mb-4">// 02 — THE PIPELINE</p>
        <div className="flex flex-wrap items-end justify-between gap-6 mb-14">
          <h2 className="font-display text-4xl sm:text-5xl font-bold leading-[1.04] max-w-xl">
            Pixels in,
            <br />
            prism out.
          </h2>
          <p className="text-muted max-w-sm text-[15px] leading-relaxed">
            Five stages run on every frame — capture to composite in about
            30&nbsp;ms, which is what keeps the rainbow glued to your hands.
          </p>
        </div>
      </Reveal>

      <ol className="relative">
        {/* connector rail */}
        <div className="hidden lg:block absolute left-0 right-0 top-[52px] h-px bg-line" aria-hidden />
        <div className="grid gap-4 lg:grid-cols-5 lg:gap-3">
          {STAGES.map((s, i) => (
            <Reveal key={s.n} delay={i * 90} as="li" className="relative">
              <div className="group relative h-full rounded-lg border border-line bg-panel p-5 pt-6 transition-all duration-300 hover:-translate-y-1.5 hover:border-faint/60 hover:bg-panel2 hover:shadow-[0_18px_50px_-20px_rgba(0,0,0,0.9)]">
                <div className="flex items-center justify-between mb-6">
                  <span className={`relative z-10 flex items-center justify-center w-11 h-11 rounded-md border border-line bg-ink ${s.tint}`}>
                    {s.icon}
                  </span>
                  <span className="font-mono text-[11px] text-faint group-hover:text-muted transition-colors">
                    STAGE {s.n}
                  </span>
                </div>
                <h3 className="font-display text-lg font-bold mb-2.5">{s.title}</h3>
                <p className="text-[13.5px] leading-relaxed text-muted mb-5">{s.body}</p>
                <code className="block font-mono text-[11px] leading-relaxed text-cyanic bg-ink border border-linesoft rounded px-2.5 py-2 overflow-x-auto whitespace-nowrap">
                  {s.chip}
                </code>
              </div>
              {i < STAGES.length - 1 && (
                <svg
                  className="hidden lg:block absolute -right-[13px] top-[46px] z-10 text-faint"
                  width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6"
                >
                  <path d="M4 2l6 5-6 5" />
                </svg>
              )}
            </Reveal>
          ))}
        </div>
      </ol>
    </section>
  );
}
