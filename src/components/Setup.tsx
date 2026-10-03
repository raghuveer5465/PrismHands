import { useRef, useState } from "react";
import Reveal from "./Reveal";
import { copyText, downloadTextFile } from "../lib/downloads";
import { PY_FILES } from "../data/pythonFiles";

const STEPS: { title: string; cmd: string; note: string }[] = [
  {
    title: "Create the environment",
    cmd: "python -m venv .venv && source .venv/bin/activate",
    note: "On Windows activate with .venv\\Scripts\\activate instead. Python 3.10 – 3.12 works best with mediapipe.",
  },
  {
    title: "Install the stack",
    cmd: "pip install -r requirements.txt",
    note: "Pulls opencv-python, mediapipe, numpy and pillow. First run downloads the hand model weights (~15 MB).",
  },
  {
    title: "Launch the dashboard",
    cmd: "python main.py",
    note: "Hit START (or SPACE), hold both hands up to the camera, and pinch index-to-index and thumb-to-thumb.",
  },
];

const ISSUES: { symptom: string; fix: string; tag: string }[] = [
  {
    tag: "CAPTURE",
    symptom: "“CAMERA 0 NOT FOUND” flashes in the status bar",
    fix: "Try another index — spin the camera field to 1 or 2 and hit REOPEN. On Linux, check that your user is in the video group.",
  },
  {
    tag: "PERF",
    symptom: "Feed stutters below ~15 FPS",
    fix: "Start with --width 960 --height 540, or set model_complexity=0 in hand_tracker.py to switch MediaPipe to the lite model.",
  },
  {
    tag: "INSTALL",
    symptom: "mediapipe fails to install on Apple Silicon",
    fix: "Use Python 3.10 or 3.11 from python.org (not the system interpreter), run python -m pip install --upgrade pip first, then retry.",
  },
  {
    tag: "GESTURE",
    symptom: "Shape flickers on and off at the boundary",
    fix: "Widen the hysteresis band: raise release_ratio in gesture.py, or increase engage_frames for a longer debounce.",
  },
  {
    tag: "MEDIAPIPE",
    symptom: "AttributeError: module 'mediapipe' has no attribute 'solutions'",
    fix: "You're on mediapipe ≥ 0.10.31, which deleted the legacy Solutions API. PrismHands detects this and falls back to the Tasks API automatically — it downloads the ~7 MB hand_landmarker model on first run, so just rerun python main.py. Prefer the classic path? pip install \"mediapipe==0.10.21\" (needs Python 3.11/3.12).",
  },
];

function CmdBlock({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  const go = async () => {
    if (await copyText(cmd)) {
      setCopied(true);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1500);
    }
  };
  return (
    <div className="group flex items-center gap-3 rounded border border-line bg-ink px-4 py-3">
      <span className="font-mono text-[12px] text-mint shrink-0">$</span>
      <code className="font-mono text-[12.5px] text-snow truncate">{cmd}</code>
      <button
        onClick={go}
        aria-label={`Copy command: ${cmd}`}
        className={`focus-ring ml-auto shrink-0 font-mono text-[10.5px] tracking-wider transition-colors ${
          copied ? "text-mint" : "text-faint hover:text-snow"
        }`}
      >
        {copied ? "COPIED ✓" : "COPY"}
      </button>
    </div>
  );
}

function RequirementsCard() {
  const req = PY_FILES.find((f) => f.name === "requirements.txt");
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  if (!req) return null;

  const go = async () => {
    if (await copyText(req.content)) {
      setCopied(true);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1500);
    }
  };

  const pkgCount = req.content.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).length;

  return (
    <div className="rounded-lg border border-line bg-panel overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-5 py-3.5 border-b border-linesoft bg-panel2/60">
        <svg width="14" height="15" viewBox="0 0 14 15" fill="none" stroke="#ffb454" strokeWidth="1.4">
          <path d="M3 1.5h5.5L12 5v8a.5.5 0 0 1-.5.5h-8A.5.5 0 0 1 3 13z" />
          <path d="M8.5 1.5V5H12" />
        </svg>
        <span className="font-mono text-[13px] text-snow">requirements.txt</span>
        <span className="font-mono text-[10px] tracking-widest text-faint border border-linesoft rounded px-2 py-0.5">
          {pkgCount} DEPENDENCIES
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={go}
            className={`focus-ring rounded border px-3 py-1.5 font-mono text-[11px] tracking-wider transition-colors ${
              copied
                ? "border-mint/60 text-mint bg-mint/10"
                : "border-line bg-raise text-muted hover:text-snow hover:border-faint"
            }`}
          >
            {copied ? "COPIED ✓" : "COPY"}
          </button>
          <button
            onClick={() => downloadTextFile("requirements.txt", req.content)}
            className="focus-ring rounded border border-line bg-raise px-3 py-1.5 font-mono text-[11px] tracking-wider text-muted hover:text-snow hover:border-faint transition-colors"
          >
            SAVE
          </button>
        </div>
      </div>
      <div className="px-5 py-4 font-mono text-[12.5px] leading-[1.9]">
        {req.content.split("\n").map((line, i) => {
          if (!line.trim()) return <div key={i} className="h-2" />;
          if (line.trim().startsWith("#"))
            return (
              <div key={i} className="text-faint italic">
                {line}
              </div>
            );
          const [pkg, ...rest] = line.split(">=");
          return (
            <div key={i} className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-snow font-medium">{pkg.trim()}</span>
              {rest.length > 0 && <span className="text-amber">&gt;={rest.join(">=").split(/\s{2,}/)[0]}</span>}
              {/\s{2,}#/.test(line) && (
                <span className="text-faint italic">{line.match(/\s{2,}#.*$/)?.[0].trim()}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Setup() {
  return (
    <section id="setup" className="relative max-w-6xl mx-auto px-5 sm:px-8 py-24 sm:py-32">
      <Reveal>
        <p className="font-mono text-[11px] tracking-[0.3em] text-signal mb-4">// 05 — SETUP & RUN</p>
        <div className="flex flex-wrap items-end justify-between gap-6 mb-14">
          <h2 className="font-display text-4xl sm:text-5xl font-bold leading-[1.04]">
            From zero to
            <br />
            rainbow in 90 seconds.
          </h2>
          <p className="text-muted max-w-sm text-[15px] leading-relaxed">
            A plain venv, four dependencies, one command. No build step, no cloud,
            no account — the whole pipeline runs locally on your webcam.
          </p>
        </div>
      </Reveal>

      <div className="grid lg:grid-cols-2 gap-12 lg:gap-16">
        {/* steps */}
        <div className="space-y-6">
        <ol className="space-y-4">
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delay={i * 90} as="li">
              <div className="flex gap-5">
                <div className="flex flex-col items-center">
                  <span className="flex items-center justify-center w-10 h-10 rounded-md border border-line bg-panel font-display font-bold text-mint">
                    {i + 1}
                  </span>
                  {i < STEPS.length - 1 && <span className="w-px flex-1 bg-line my-1.5" />}
                </div>
                <div className="pb-8 min-w-0 flex-1">
                  <h3 className="font-display text-lg font-bold mb-2">{s.title}</h3>
                  <CmdBlock cmd={s.cmd} />
                  <p className="text-[13px] text-muted leading-relaxed mt-2.5">{s.note}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </ol>

        <Reveal delay={260}>
          <RequirementsCard />
        </Reveal>
        </div>

        {/* field notes */}
        <div>
          <Reveal delay={120}>
            <h3 className="font-mono text-[11px] tracking-[0.25em] text-faint mb-5">FIELD NOTES — WHEN THINGS MISBEHAVE</h3>
          </Reveal>
          <div className="space-y-3">
            {ISSUES.map((iss, i) => (
              <Reveal key={iss.tag} delay={140 + i * 70}>
                <div className="group rounded border border-line bg-panel p-5 border-l-2 border-l-transparent hover:border-l-amber/70 hover:bg-panel2 transition-colors">
                  <div className="flex items-center gap-2.5 mb-2">
                    <span className="font-mono text-[10px] tracking-[0.2em] text-amber border border-amber/30 rounded px-2 py-0.5">
                      {iss.tag}
                    </span>
                  </div>
                  <p className="text-[14px] text-snow font-medium leading-snug mb-1.5">{iss.symptom}</p>
                  <p className="text-[13px] text-muted leading-relaxed">{iss.fix}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
