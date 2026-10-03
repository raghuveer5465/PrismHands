import { useEffect, useState } from "react";
import { downloadProjectZip } from "../lib/downloads";

export function PrismLogo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="7" fill="#10161f" stroke="#223047" />
      <path d="M16 6.5 L25.5 23.5 H6.5 Z" fill="none" stroke="#e9eef6" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M3.5 14.5 L13 16.5" stroke="#e9eef6" strokeWidth="1.5" />
      <path d="M18.5 15.5 L28.5 11.5" stroke="#ff5d5d" strokeWidth="1.5" />
      <path d="M19 17.5 L29 16" stroke="#ffb454" strokeWidth="1.5" />
      <path d="M19 19.5 L28.5 21" stroke="#3ecf8e" strokeWidth="1.5" />
      <path d="M18.5 21.5 L27.5 25.5" stroke="#56c8e8" strokeWidth="1.5" />
    </svg>
  );
}

const NAV = [
  { href: "#demo", label: "SIMULATION" },
  { href: "#pipeline", label: "PIPELINE" },
  { href: "#gesture", label: "GESTURE" },
  { href: "#code", label: "SOURCE" },
  { href: "#setup", label: "SETUP" },
];

export function TopBar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled ? "bg-ink/85 backdrop-blur-md border-b border-linesoft" : "bg-transparent border-b border-transparent"
      }`}
    >
      <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center gap-6">
        <a href="#demo" className="flex items-center gap-2.5 focus-ring rounded">
          <PrismLogo />
          <span className="font-display font-bold tracking-tight text-[17px]">
            Prism<span className="text-mint">Hands</span>
          </span>
        </a>

        <nav className="hidden md:flex items-center gap-1 ml-6">
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className="focus-ring rounded px-3 py-1.5 font-mono text-[11px] tracking-[0.14em] text-muted hover:text-snow transition-colors"
            >
              {n.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden lg:inline font-mono text-[10.5px] text-faint border border-linesoft rounded-full px-3 py-1">
            v1.0 · PYTHON 3.10+
          </span>
          <button
            onClick={() => void downloadProjectZip()}
            className="focus-ring rounded border border-mint/50 bg-mint/10 px-3.5 py-2 font-mono text-[11px] tracking-wider text-mint hover:bg-mint/20 hover:-translate-y-px transition-all"
          >
            GET THE CODE
          </button>
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-linesoft mt-8">
      <div className="spectral" />
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-12 flex flex-col sm:flex-row items-start sm:items-center gap-6">
        <div className="flex items-center gap-2.5">
          <PrismLogo size={22} />
          <span className="font-display font-bold">PrismHands</span>
        </div>
        <p className="font-mono text-[11px] leading-relaxed text-faint max-w-xl">
          OPENCV-PYTHON · MEDIAPIPE · NUMPY · TKINTER — 21 LANDMARKS × 2 HANDS · HSV→BGR NUMPY RAMPS ·
          HYSTERESIS-DEBOUNCED GESTURE LOCK · CLEAN cap.release() + destroyAllWindows() ON EXIT
        </p>
        <a
          href="#demo"
          className="focus-ring rounded sm:ml-auto font-mono text-[11px] tracking-widest text-muted hover:text-mint transition-colors"
        >
          BACK TO TOP ↑
        </a>
      </div>
    </footer>
  );
}
