import { useEffect, useRef, useState } from "react";
// prismSetup exposes the Prism core on globalThis — it must run before the
// language components below, which expect that global to exist.
import Prism from "../lib/prismSetup";
import "prismjs/components/prism-python";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-bash";
import { PY_FILES, PROJECT_FOLDER, lineCount, type PyFile } from "../data/pythonFiles";
import { copyText, downloadTextFile, downloadProjectZip } from "../lib/downloads";
import Reveal from "./Reveal";

const langDot: Record<PyFile["lang"], string> = {
  python: "bg-mint",
  bash: "bg-amber",
  markdown: "bg-cyanic",
};

function CopyButton({ text, label = "COPY" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "ok" | "err">("idle");
  const timer = useRef<number | null>(null);

  const go = async () => {
    const ok = await copyText(text);
    setState(ok ? "ok" : "err");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 1600);
  };

  return (
    <button
      onClick={go}
      className={`focus-ring flex items-center gap-2 rounded border px-3 py-1.5 font-mono text-[11px] tracking-wider transition-colors ${
        state === "ok"
          ? "border-mint/60 text-mint bg-mint/10"
          : state === "err"
            ? "border-signal/60 text-signal"
            : "border-line bg-raise text-muted hover:text-snow hover:border-faint"
      }`}
    >
      {state === "ok" ? (
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M2 6.5 4.8 9 10 3" />
        </svg>
      ) : (
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4">
          <rect x="3.5" y="3.5" width="7" height="7" rx="1" />
          <path d="M8.5 3.5v-1a1 1 0 0 0-1-1h-5a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h1" />
        </svg>
      )}
      {state === "ok" ? "COPIED" : state === "err" ? "FAILED" : label}
    </button>
  );
}

export default function CodeExplorer() {
  const [activeName, setActiveName] = useState("dashboard.py");
  const [zipState, setZipState] = useState<"idle" | "busy" | "done">("idle");
  const codeRef = useRef<HTMLElement | null>(null);

  const file = PY_FILES.find((f) => f.name === activeName) ?? PY_FILES[0];
  const lines = lineCount(file);

  useEffect(() => {
    if (codeRef.current) {
      codeRef.current.removeAttribute("data-highlighted");
      Prism.highlightElement(codeRef.current);
    }
  }, [activeName]);

  const onZip = async () => {
    setZipState("busy");
    await downloadProjectZip();
    setZipState("done");
    window.setTimeout(() => setZipState("idle"), 2000);
  };

  return (
    <section id="code" className="relative max-w-6xl mx-auto px-5 sm:px-8 py-24 sm:py-32">
      <Reveal>
        <div className="flex flex-wrap items-end justify-between gap-6 mb-10">
          <div>
            <p className="font-mono text-[11px] tracking-[0.3em] text-cyanic mb-4">// 04 — SOURCE CODE</p>
            <h2 className="font-display text-4xl sm:text-5xl font-bold leading-[1.04]">
              Six files.
              <br />
              Zero magic.
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-muted text-sm max-w-[260px] leading-relaxed mr-2 hidden md:block">
              Every file, complete and commented — copy one or take the whole project.
            </p>
            <button
              onClick={onZip}
              disabled={zipState === "busy"}
              className={`focus-ring flex items-center gap-2.5 rounded border px-4 py-2.5 font-mono text-[12px] tracking-wider transition-all ${
                zipState === "done"
                  ? "border-mint/60 bg-mint/10 text-mint"
                  : "border-mint/50 bg-mint/10 text-mint hover:bg-mint/20 hover:-translate-y-0.5"
              }`}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M7 1v8M3.5 5.5 7 9l3.5-3.5M2 12h10" />
              </svg>
              {zipState === "busy" ? "ZIPPING…" : zipState === "done" ? "SAVED ✓" : "DOWNLOAD .ZIP"}
            </button>
          </div>
        </div>
      </Reveal>

      <Reveal delay={100}>
        <div className="grid lg:grid-cols-[280px_1fr] rounded-lg border border-line bg-panel overflow-hidden">
          {/* ── file tree ── */}
          <aside className="border-b lg:border-b-0 lg:border-r border-linesoft bg-panel2/60">
            <div className="flex items-center gap-2.5 px-5 py-4 border-b border-linesoft">
              <svg width="14" height="13" viewBox="0 0 14 13" fill="none" stroke="#ffb454" strokeWidth="1.4">
                <path d="M1.5 3.5v-1a1 1 0 0 1 1-1h3l1.2 1.5h4.8a1 1 0 0 1 1 1v1" />
                <path d="M1.5 3.5h11l-1 7a1 1 0 0 1-1 .9h-7a1 1 0 0 1-1-.9z" />
              </svg>
              <span className="font-mono text-[12px] text-snow">{PROJECT_FOLDER}/</span>
              <span className="ml-auto font-mono text-[10px] text-faint">{PY_FILES.length} files</span>
            </div>
            <ul>
              {PY_FILES.map((f) => {
                const active = f.name === activeName;
                return (
                  <li key={f.name}>
                    <button
                      onClick={() => setActiveName(f.name)}
                      className={`focus-ring w-full flex items-center gap-2.5 px-5 py-2.5 text-left font-mono text-[12.5px] transition-colors border-l-2 ${
                        active
                          ? "border-mint bg-ink/70 text-snow"
                          : "border-transparent text-muted hover:text-snow hover:bg-ink/40"
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${langDot[f.lang]}`} />
                      {f.name}
                      <span className="ml-auto text-[10px] text-faint">{lineCount(f)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="px-5 py-4 mt-2 border-t border-linesoft">
              <p className="font-mono text-[10.5px] leading-relaxed text-faint">
                PYTHON 3.10+ · OPENCV · MEDIAPIPE
                <br />
                NUMPY · TKINTER · PILLOW
              </p>
            </div>
          </aside>

          {/* ── viewer ── */}
          <div className="min-w-0 flex flex-col">
            <div className="flex flex-wrap items-center gap-3 px-4 sm:px-5 py-3.5 border-b border-linesoft bg-panel2/60">
              <div className="min-w-0 mr-auto">
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-[13px] text-snow">{file.name}</span>
                  <span className="font-mono text-[10px] text-faint uppercase tracking-wider border border-linesoft rounded px-1.5 py-0.5">
                    {file.lang}
                  </span>
                  <span className="font-mono text-[10px] text-faint hidden sm:inline">{lines} lines</span>
                </div>
                <p className="text-[12px] text-muted truncate mt-0.5 max-w-[420px]">{file.role}</p>
              </div>
              <CopyButton text={file.content} />
              <button
                onClick={() => downloadTextFile(file.name, file.content)}
                className="focus-ring flex items-center gap-2 rounded border border-line bg-raise px-3 py-1.5 font-mono text-[11px] tracking-wider text-muted hover:text-snow hover:border-faint transition-colors"
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4">
                  <path d="M6 1v7M3 5.5 6 8.5l3-3M1.5 10.5h9" />
                </svg>
                SAVE
              </button>
            </div>

            <div className="codewell overflow-auto max-h-[620px] bg-ink">
              <div className="flex min-w-max">
                <div
                  aria-hidden
                  className="sticky left-0 z-10 select-none bg-ink border-r border-linesoft text-right font-mono text-[13px] leading-[1.7] text-faint/70 py-4 pl-4 pr-3"
                >
                  {Array.from({ length: lines }, (_, i) => (
                    <div key={i}>{i + 1}</div>
                  ))}
                </div>
                <pre className={`language-${file.lang} py-4 pl-5 pr-8`}>
                  <code key={file.name} ref={codeRef} className={`language-${file.lang}`}>
                    {file.content}
                  </code>
                </pre>
              </div>
            </div>
          </div>
        </div>
      </Reveal>

      <Reveal delay={160}>
        <p className="mt-5 font-mono text-[11.5px] text-faint flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-mint">$</span> unzip prismhands.zip · pip install -r requirements.txt · python main.py
          <span className="text-faint/70">— that's the entire install story.</span>
        </p>
      </Reveal>
    </section>
  );
}
