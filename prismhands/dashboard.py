"""
dashboard.py — the PrismHands control room (Tkinter).

Everything the user touches lives in this file:

  * embedded live webcam feed (OpenCV frame -> PIL -> ImageTk label)
  * START / STOP capture, camera index selection
  * detection & tracking confidence sliders (fed straight to MediaPipe)
  * rainbow tuning: flow speed + fill opacity
  * display toggles: skeleton overlay, HUD overlay
  * live telemetry: FPS, hand count, confidences, fingertip gaps, state

Architecture note: the frame loop runs inside Tk's own after() scheduler
instead of a worker thread. MediaPipe Hands at 720p stays comfortably
within the ~30 ms budget, and a single-threaded loop makes shutdown
trivial — no locks, no queues, no orphaned captures.
"""

from __future__ import annotations

import time
import tkinter as tk
from typing import Optional

import cv2
import numpy as np
from PIL import Image, ImageTk

from gesture import FrameGestureRecognizer, FrameGesture
from hand_tracker import HandTracker, TrackedHand, INDEX_TIP, THUMB_TIP
from rainbow import RainbowPainter

# ── interface palette & metrics ───────────────────────────────────────────
INK   = "#0c1118"
PANEL = "#111826"
LINE  = "#24304a"
TEXT  = "#e8eef7"
MUTED = "#8fa0b8"
MINT  = "#3ecf8e"
AMBER = "#ffb454"
RED   = "#ff5d5d"

FEED_MAX_W = 780                     # embedded feed display width, px
FONT_UI    = ("Segoe UI", 10)
FONT_MONO  = ("Consolas", 10)


class PrismDashboard:
    """Main window: control sidebar + embedded camera feed."""

    def __init__(self, camera_index: int = 0,
                 frame_width: int = 1280, frame_height: int = 720) -> None:
        self.camera_index = camera_index
        self.frame_width = frame_width
        self.frame_height = frame_height

        self.cap: Optional[cv2.VideoCapture] = None
        self.running = False
        self._after_id: Optional[str] = None
        self._tk_image: Optional[ImageTk.PhotoImage] = None   # ref! else Tk GCs it
        self._fps = 0.0
        self._last_tick = time.perf_counter()
        self._dead = False

        # the engine
        self.tracker = HandTracker(max_hands=2)
        self.gesture = FrameGestureRecognizer()
        self.painter = RainbowPainter(frame_width, frame_height)

        self._build_ui()

    # ════════════════════════ UI CONSTRUCTION ════════════════════════
    def _build_ui(self) -> None:
        self.root = tk.Tk()
        self.root.title("PrismHands — two-hand rainbow shape tracker")
        self.root.configure(bg=INK)
        self.root.geometry("1180x720")
        self.root.minsize(1040, 620)

        # Window close button -> clean shutdown; ESC does the same,
        # SPACE toggles capture.
        self.root.protocol("WM_DELETE_WINDOW", self.shutdown)
        self.root.bind("<Escape>", lambda e: self.shutdown())
        self.root.bind("<space>", lambda e: self.toggle_capture())

        self.root.columnconfigure(1, weight=1)
        self.root.rowconfigure(0, weight=1)

        self._build_sidebar()
        self._build_feed_area()

    # ── left column: controls + telemetry ──
    def _build_sidebar(self) -> None:
        side = tk.Frame(self.root, bg=PANEL, width=300)
        side.grid(row=0, column=0, sticky="nsew", padx=(0, 1))
        side.grid_propagate(False)

        inner = tk.Frame(side, bg=PANEL)
        inner.pack(fill="both", expand=True, padx=18, pady=16)

        # header
        tk.Label(inner, text="PRISMHANDS", bg=PANEL, fg=TEXT,
                 font=("Segoe UI", 16, "bold")).pack(anchor="w")
        tk.Label(inner, text="two-hand rainbow shape tracker", bg=PANEL,
                 fg=MUTED, font=FONT_UI).pack(anchor="w", pady=(0, 10))

        # ── CAPTURE ──
        self._section(inner, "CAPTURE")
        btns = tk.Frame(inner, bg=PANEL)
        btns.pack(fill="x", pady=(0, 8))
        tk.Button(btns, text="START", font=FONT_UI, bg=MINT, fg="#08130d",
                  activebackground="#63e0a8", relief="flat", bd=0, padx=14,
                  pady=5, command=self.start_capture
                  ).pack(side="left", expand=True, fill="x", padx=(0, 4))
        tk.Button(btns, text="STOP", font=FONT_UI, bg="#2a1a1c", fg=RED,
                  activebackground="#3a2325", relief="flat", bd=0, padx=14,
                  pady=5, command=self.stop_capture
                  ).pack(side="left", expand=True, fill="x", padx=(4, 0))

        cam_row = tk.Frame(inner, bg=PANEL)
        cam_row.pack(fill="x", pady=(0, 8))
        tk.Label(cam_row, text="camera", bg=PANEL, fg=MUTED,
                 font=FONT_UI).pack(side="left")
        self.cam_var = tk.IntVar(value=self.camera_index)
        tk.Spinbox(cam_row, from_=0, to=9, width=3, textvariable=self.cam_var,
                   font=FONT_MONO, bg=INK, fg=TEXT, buttonbackground=PANEL,
                   relief="flat").pack(side="left", padx=8)
        tk.Button(cam_row, text="REOPEN", font=("Segoe UI", 8), bg=INK,
                  fg=MUTED, relief="flat", command=self._reopen_camera
                  ).pack(side="left")

        # ── DETECTION ──
        self._section(inner, "DETECTION")
        self.det_var = tk.DoubleVar(value=0.6)
        self.trk_var = tk.DoubleVar(value=0.5)
        self._slider(inner, "min detection", self.det_var, 0.1, 0.95,
                     self._on_confidence)
        self._slider(inner, "min tracking", self.trk_var, 0.1, 0.95,
                     self._on_confidence)

        # ── RAINBOW ──
        self._section(inner, "RAINBOW")
        self.flow_var = tk.DoubleVar(value=140.0)
        self.alpha_var = tk.DoubleVar(value=55.0)
        self._slider(inner, "flow px/s", self.flow_var, 0.0, 420.0,
                     self._on_rainbow)
        self._slider(inner, "fill %", self.alpha_var, 10.0, 90.0,
                     self._on_rainbow)

        # ── DISPLAY ──
        self._section(inner, "DISPLAY")
        self.show_skeleton = tk.BooleanVar(value=True)
        self.show_hud = tk.BooleanVar(value=True)
        tk.Checkbutton(inner, text="hand skeleton overlay",
                       variable=self.show_skeleton, bg=PANEL, fg=TEXT,
                       selectcolor=INK, activebackground=PANEL,
                       activeforeground=TEXT, font=FONT_UI, anchor="w"
                       ).pack(fill="x")
        tk.Checkbutton(inner, text="HUD + gap readouts",
                       variable=self.show_hud, bg=PANEL, fg=TEXT,
                       selectcolor=INK, activebackground=PANEL,
                       activeforeground=TEXT, font=FONT_UI, anchor="w"
                       ).pack(fill="x")

        # ── TELEMETRY ──
        self._section(inner, "TELEMETRY")
        self.telemetry_var = tk.StringVar(value="press START to begin")
        tk.Label(inner, textvariable=self.telemetry_var, bg=INK, fg=MINT,
                 font=FONT_MONO, justify="left", anchor="nw", padx=10,
                 pady=8).pack(fill="x")

        tk.Label(inner, text="SPACE start/stop    ESC quit", bg=PANEL,
                 fg="#5c6b82", font=("Segoe UI", 8)
                 ).pack(side="bottom", anchor="w", pady=(10, 0))

    def _build_feed_area(self) -> None:
        area = tk.Frame(self.root, bg=INK)
        area.grid(row=0, column=1, sticky="nsew")
        area.rowconfigure(0, weight=1)
        area.columnconfigure(0, weight=1)

        # The webcam feed is rendered into this label via ImageTk.
        self.feed_label = tk.Label(area, bg=PANEL, text="")
        self.feed_label.grid(row=0, column=0, sticky="nsew", padx=14, pady=(14, 6))

        self.state_var = tk.StringVar(value="STANDBY")
        self.state_label = tk.Label(area, textvariable=self.state_var, bg=INK,
                                    fg=AMBER, font=("Consolas", 10, "bold"),
                                    anchor="w")
        self.state_label.grid(row=1, column=0, sticky="ew", padx=18, pady=(0, 12))

    # ── small UI helpers ──
    def _section(self, parent: tk.Frame, title: str) -> None:
        row = tk.Frame(parent, bg=PANEL)
        row.pack(fill="x", pady=(12, 6))
        tk.Label(row, text=title, bg=PANEL, fg=MINT,
                 font=("Consolas", 9, "bold")).pack(side="left")
        tk.Frame(row, bg=LINE, height=1).pack(side="left", fill="x",
                                              expand=True, padx=(8, 0))

    def _slider(self, parent: tk.Frame, label: str, var: tk.DoubleVar,
                lo: float, hi: float, on_change) -> None:
        row = tk.Frame(parent, bg=PANEL)
        row.pack(fill="x", pady=2)
        tk.Label(row, text=label, bg=PANEL, fg=MUTED, font=FONT_UI,
                 width=12, anchor="w").pack(side="left")
        tk.Scale(row, variable=var, from_=lo, to=hi, orient="horizontal",
                 length=130, showvalue=False, bg=PANEL, fg=TEXT,
                 troughcolor=INK, highlightthickness=0, sliderrelief="flat",
                 command=on_change).pack(side="left", fill="x", expand=True)

    # ════════════════════════ LIVE CALLBACKS ════════════════════════
    def _on_confidence(self, _value: str) -> None:
        self.tracker.set_confidences(self.det_var.get(), self.trk_var.get())

    def _on_rainbow(self, _value: str) -> None:
        self.painter.flow = self.flow_var.get()

    def _reopen_camera(self) -> None:
        was_running = self.running
        self.stop_capture()
        self.camera_index = int(self.cam_var.get())
        if was_running:
            self.start_capture()

    # ════════════════════════ CAPTURE CONTROL ════════════════════════
    def toggle_capture(self) -> None:
        if self.running:
            self.stop_capture()
        else:
            self.start_capture()

    def start_capture(self) -> None:
        if self.running:
            return

        self.cap = cv2.VideoCapture(self.camera_index)
        if self.cap is None or not self.cap.isOpened():
            self.cap = None
            self._set_state(f"CAMERA {self.camera_index} NOT FOUND", RED)
            return

        # Best-effort request; the driver may negotiate a different size.
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.frame_width)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.frame_height)

        self.running = True
        self._last_tick = time.perf_counter()
        self._set_state("LIVE", MINT)
        self._tick()                            # kick the frame loop

    def stop_capture(self) -> None:
        self.running = False
        if self._after_id is not None:
            self.root.after_cancel(self._after_id)
            self._after_id = None
        if self.cap is not None:
            self.cap.release()                  # <<< release the camera
            self.cap = None
        self._show_standby()
        self._set_state("STANDBY", AMBER)

    # ════════════════════════ FRAME LOOP ════════════════════════
    def _tick(self) -> None:
        """One full pipeline pass, re-scheduled via Tk's after()."""
        if not self.running or self.cap is None:
            return

        ok, frame = self.cap.read()
        if not ok:
            self._set_state("FRAME DROPPED — STOPPED", RED)
            self.stop_capture()
            return

        # 1 · track BOTH hands
        hands = self.tracker.find_hands(frame)

        # 2 · evaluate the two-hand frame gesture
        height, width = frame.shape[:2]
        g = self.gesture.evaluate(hands, width, height)

        # 3 · paint the rainbow quad while the gesture is locked
        if g.locked and g.corners is not None:
            frame = self.painter.paint(
                frame, g.corners,
                time_s=time.perf_counter(),
                fill_alpha=self.alpha_var.get() / 100.0,
            )

        # 4 · overlays
        if self.show_skeleton.get():
            self.tracker.draw_skeleton(frame, hands)
        if self.show_hud.get():
            self._draw_hud(frame, hands, g)

        self._push_frame(frame)
        self._refresh_telemetry(hands, g)

        # FPS — exponential moving average of the loop period
        now = time.perf_counter()
        dt = now - self._last_tick
        self._last_tick = now
        if dt > 0:
            self._fps = 0.9 * self._fps + 0.1 / dt

        self._after_id = self.root.after(1, self._tick)

    # ════════════════════════ RENDERING ════════════════════════
    def _push_frame(self, frame: np.ndarray) -> None:
        """Resize for display, convert BGR -> RGB, hand it to the label."""
        height, width = frame.shape[:2]
        if width > FEED_MAX_W:
            scale = FEED_MAX_W / width
            frame = cv2.resize(frame, (FEED_MAX_W, int(height * scale)))

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        self._tk_image = ImageTk.PhotoImage(Image.fromarray(rgb))  # keep ref!
        self.feed_label.configure(image=self._tk_image)

    def _show_standby(self) -> None:
        frame = np.full((self.frame_height, self.frame_width, 3), 14,
                        dtype=np.uint8)
        cv2.rectangle(frame, (0, 0), (frame.shape[1] - 1, frame.shape[0] - 1),
                      (36, 48, 71), 2)
        msg = "STANDBY - press SPACE or START"
        (tw, th), _ = cv2.getTextSize(msg, cv2.FONT_HERSHEY_SIMPLEX, 0.8, 2)
        x = (frame.shape[1] - tw) // 2
        y = (frame.shape[0] + th) // 2
        cv2.putText(frame, msg, (x, y), cv2.FONT_HERSHEY_SIMPLEX, 0.8,
                    (140, 150, 168), 2, cv2.LINE_AA)
        self._push_frame(frame)

    def _draw_hud(self, frame: np.ndarray, hands: list[TrackedHand],
                  g: FrameGesture) -> None:
        # Crosshairs on the four gesture fingertips.
        for hand in hands:
            for idx in (INDEX_TIP, THUMB_TIP):
                pt = hand.landmarks_px[idx]
                cv2.drawMarker(frame, (int(pt[0]), int(pt[1])),
                               (84, 180, 255), cv2.MARKER_CROSS, 18, 1,
                               cv2.LINE_AA)

        # Live gap readouts between matching fingertips.
        if g.index_gap < 1e9:
            self._gap_label(frame, "IDX", g.index_gap, hands)
            self._gap_label(frame, "THB", g.thumb_gap, hands)

        # Corner brackets + banner around the locked shape.
        if g.locked and g.corners is not None:
            x0 = int(g.corners[:, 0].min()) - 14
            y0 = int(g.corners[:, 1].min()) - 14
            x1 = int(g.corners[:, 0].max()) + 14
            y1 = int(g.corners[:, 1].max()) + 14
            for a, b in [
                ((x0, y0), (x0 + 26, y0)), ((x0, y0), (x0, y0 + 26)),
                ((x1, y0), (x1 - 26, y0)), ((x1, y0), (x1, y0 + 26)),
                ((x0, y1), (x0 + 26, y1)), ((x0, y1), (x0, y1 - 26)),
                ((x1, y1), (x1 - 26, y1)), ((x1, y1), (x1, y1 - 26)),
            ]:
                cv2.line(frame, a, b, (142, 207, 62), 2, cv2.LINE_AA)
            cv2.putText(frame, "FRAME LOCKED", (x0, max(20, y0 - 10)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (142, 207, 62), 2,
                        cv2.LINE_AA)

    def _gap_label(self, frame: np.ndarray, tag: str, gap: float,
                   hands: list[TrackedHand]) -> None:
        left = next((h for h in hands if h.label == "Left"), None)
        right = next((h for h in hands if h.label == "Right"), None)
        if left is None or right is None:
            return
        idx = INDEX_TIP if tag == "IDX" else THUMB_TIP
        mid = (left.landmarks_px[idx] + right.landmarks_px[idx]) / 2
        cv2.putText(frame, f"{tag} {gap:.0f}px",
                    (int(mid[0]) + 12, int(mid[1])),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (232, 238, 247), 1,
                    cv2.LINE_AA)

    def _refresh_telemetry(self, hands: list[TrackedHand],
                           g: FrameGesture) -> None:
        left = next((h for h in hands if h.label == "Left"), None)
        right = next((h for h in hands if h.label == "Right"), None)

        def conf(h: Optional[TrackedHand]) -> str:
            return f"{h.handedness_score:.2f}" if h else " -- "

        if g.locked:
            state = "FRAME LOCKED"
        elif g.index_gap < g.release_px:
            state = "CLOSING..."
        else:
            state = "TRACKING"

        idx_txt = f"{g.index_gap:6.0f} px" if g.index_gap < 1e9 else "    --"
        thb_txt = f"{g.thumb_gap:6.0f} px" if g.thumb_gap < 1e9 else "    --"

        lines = [
            f"FPS        {self._fps:5.1f}",
            f"HANDS      {len(hands)}/2",
            f"CONF L/R   {conf(left)} / {conf(right)}",
            f"GAP INDEX  {idx_txt}",
            f"GAP THUMB  {thb_txt}",
            f"THRESH     {g.engage_px:.0f} in / {g.release_px:.0f} out",
            f"STATE      {state}",
        ]
        self.telemetry_var.set("\n".join(lines))

    # ════════════════════════ LIFECYCLE ════════════════════════
    def _set_state(self, text: str, colour: str) -> None:
        self.state_var.set("  " + text)
        self.state_label.configure(fg=colour)

    def run(self) -> None:
        """Show the window and enter the Tk event loop (blocks)."""
        self._show_standby()
        self.root.mainloop()

    def shutdown(self) -> None:
        """Tear everything down exactly once: loop, camera, windows, Tk."""
        if self._dead:
            return
        self._dead = True

        try:
            self.stop_capture()        # cancels the after() loop + releases capture
        except tk.TclError:
            pass                       # widgets already gone — camera still released below
        self.tracker.release()         # closes the MediaPipe graph
        cv2.destroyAllWindows()        # belt and braces for any stray window

        try:
            self.root.destroy()
        except tk.TclError:
            pass                       # already gone — nothing left to do
