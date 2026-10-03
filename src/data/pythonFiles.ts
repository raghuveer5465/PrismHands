export interface PyFile {
  name: string;
  lang: "python" | "markdown" | "bash";
  role: string;
  content: string;
}

export const PROJECT_FOLDER = "prismhands";

/* ══════════════════════════════════════════════════════════════════════
   The complete Python application. Every file below is shown verbatim
   in the code explorer and can be copied or downloaded (ZIP) as-is.
   ══════════════════════════════════════════════════════════════════════ */

const mainPy = `"""
PrismHands — entry point.

A two-hand gesture tracker that paints a flowing rainbow-gradient shape
between your hands the moment you form a "frame": both index fingertips
together and both thumb tips together.

Usage
-----
    python main.py                            # default webcam (index 0)
    python main.py --camera 1                 # pick a different webcam
    python main.py --width 960 --height 540   # lighter capture on slow machines
"""

import argparse

from dashboard import PrismDashboard


def parse_args() -> argparse.Namespace:
    """Collect the small set of command-line options."""
    parser = argparse.ArgumentParser(
        prog="prismhands",
        description="Two-hand rainbow shape tracker (OpenCV + MediaPipe + Tkinter).",
    )
    parser.add_argument("--camera", type=int, default=0,
                        help="webcam index, default 0")
    parser.add_argument("--width", type=int, default=1280,
                        help="capture width in pixels")
    parser.add_argument("--height", type=int, default=720,
                        help="capture height in pixels")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    app = PrismDashboard(
        camera_index=args.camera,
        frame_width=args.width,
        frame_height=args.height,
    )
    try:
        app.run()          # blocks inside the Tk main loop until the window closes
    finally:
        # Safety net: even if the window died in an unusual way, the camera
        # is released and every OpenCV window is destroyed.
        app.shutdown()


if __name__ == "__main__":
    main()
`;

const handTrackerPy = `"""
hand_tracker.py — MediaPipe wrapper for simultaneous two-hand tracking.

MediaPipe returns normalised landmarks wrapped in its own object model.
This module converts results into plain NumPy arrays (pixel coordinates)
and hides every MediaPipe detail behind two methods:

    tracker.find_hands(frame)         ->  list[TrackedHand]   (0..2 hands)
    tracker.draw_skeleton(frame, hs)  ->  draws the overlay in place

Handedness labels ("Left" / "Right") follow MediaPipe's selfie-view
convention, i.e. they match what the user sees in the mirror-like feed.

API compatibility
-----------------
mediapipe >= 0.10.31 removed the legacy 'mp.solutions' module entirely.
This wrapper detects which generation is installed and, when needed,
transparently switches to the Tasks API ('mp.tasks.vision.HandLandmarker'),
downloading the hand_landmarker.task model on first run.
"""

from __future__ import annotations

import os
import time
import urllib.request
from dataclasses import dataclass

import cv2
import numpy as np

import mediapipe as mp

# Remote location of the Tasks-API hand model (needed only on mediapipe >= 0.10.31).
_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
)


def _legacy_available() -> bool:
    """True when the classic mp.solutions API is present (< 0.10.31)."""
    return hasattr(mp, "solutions") and hasattr(mp.solutions, "hands")


def _ensure_tasks_model() -> str:
    """Return a local .task model path, downloading it once if needed."""
    cache_dir = os.path.join(os.path.expanduser("~"), ".cache", "prismhands")
    os.makedirs(cache_dir, exist_ok=True)
    model_path = os.path.join(cache_dir, "hand_landmarker.task")
    if not os.path.exists(model_path):
        print(f"[prismhands] downloading hand model -> {model_path}")
        urllib.request.urlretrieve(_MODEL_URL, model_path)
    return model_path

# Landmark indices of the two fingertips that define the frame gesture.
INDEX_TIP = 8
THUMB_TIP = 4

# Bone connectivity (parent, child) used for the skeleton overlay.
HAND_BONES: list[tuple[int, int]] = [
    (0, 1), (1, 2), (2, 3), (3, 4),          # thumb
    (0, 5), (5, 6), (6, 7), (7, 8),          # index finger
    (5, 9), (9, 10), (10, 11), (11, 12),     # middle finger
    (9, 13), (13, 14), (14, 15), (15, 16),   # ring finger
    (13, 17), (17, 18), (18, 19), (19, 20),  # pinky
    (0, 17),                                 # palm base
]

# Per-hand BGR colours for the skeleton overlay.
_HAND_COLORS = {
    "Left":  (142, 207, 62),   # mint
    "Right": (232, 178, 90),   # warm sky
}


@dataclass
class TrackedHand:
    """One detected hand, already converted to pixel coordinates."""

    label: str                  # "Left" or "Right"
    landmarks_px: np.ndarray    # float32 array of shape (21, 2): (x, y) in px
    handedness_score: float     # classifier confidence for the label

    @property
    def index_tip(self) -> np.ndarray:
        """Landmark 8 — index fingertip."""
        return self.landmarks_px[INDEX_TIP]

    @property
    def thumb_tip(self) -> np.ndarray:
        """Landmark 4 — thumb tip."""
        return self.landmarks_px[THUMB_TIP]


class HandTracker:
    """MediaPipe wrapper that supports BOTH generations of the API.

    mediapipe < 0.10.31 exposes the classic mp.solutions.hands API.
    mediapipe >= 0.10.31 removed it in favour of the Tasks API
    (mp.tasks.vision.HandLandmarker), which needs a local .task model.
    We detect which one is installed and use it transparently — the rest
    of the app only ever sees TrackedHand objects.
    """

    def __init__(
        self,
        max_hands: int = 2,
        detection_confidence: float = 0.6,
        tracking_confidence: float = 0.5,
    ) -> None:
        self.max_hands = max_hands
        self.det_conf = detection_confidence
        self.trk_conf = tracking_confidence
        self._ts = 0                        # strictly increasing Tasks timestamp

        if _legacy_available():
            self._use_tasks = False
            self.landmarker = None
            self.hands = mp.solutions.hands.Hands(
                static_image_mode=False,    # video mode enables temporal tracking
                max_num_hands=max_hands,    # <<< explicitly allow BOTH hands
                model_complexity=1,         # 0 = lite (faster), 1 = full (accurate)
                min_detection_confidence=detection_confidence,
                min_tracking_confidence=tracking_confidence,
            )
        else:
            # mediapipe >= 0.10.31: Solutions is gone, use Tasks.
            self._use_tasks = True
            self.hands = None
            self.landmarker = self._build_tasks()

    # ── Tasks-API plumbing (mediapipe >= 0.10.31) ─────────────────────────
    def _build_tasks(self):
        """Create a HandLandmarker, downloading the model on first run."""
        import dataclasses

        opts_cls = mp.tasks.vision.HandLandmarkerOptions
        kwargs = {
            "base_options": mp.tasks.BaseOptions(
                model_asset_path=_ensure_tasks_model(),
            ),
            "running_mode": mp.tasks.vision.RunningMode.VIDEO,
            "num_hands": self.max_hands,
        }
        # Confidence field names shifted between mediapipe releases:
        #   some builds:  min_hand_detection_confidence / min_hand_tracking_confidence
        #   other builds: min_detection_confidence      / min_tracking_confidence
        # Inspect the dataclass and use whichever pair this install exposes.
        fields = {f.name for f in dataclasses.fields(opts_cls)}
        if "min_hand_detection_confidence" in fields:
            kwargs["min_hand_detection_confidence"] = self.det_conf
            kwargs["min_hand_tracking_confidence"] = self.trk_conf
        else:
            kwargs["min_detection_confidence"] = self.det_conf
            kwargs["min_tracking_confidence"] = self.trk_conf

        options = opts_cls(**kwargs)
        return mp.tasks.vision.HandLandmarker.create_from_options(options)

    def _next_timestamp(self) -> int:
        """VIDEO mode demands a strictly increasing millisecond clock."""
        now_ms = int(time.monotonic() * 1000)
        self._ts = max(self._ts + 1, now_ms)
        return self._ts

    # ── live tuning from the dashboard sliders ────────────────────────────
    def set_confidences(self, detection: float, tracking: float) -> None:
        """Re-apply thresholds while the camera is running."""
        self.det_conf = detection
        self.trk_conf = tracking
        if self._use_tasks:
            # Thresholds are baked into the options: rebuild the landmarker.
            self.landmarker.close()
            self.landmarker = self._build_tasks()
        else:
            self.hands.min_detection_confidence = detection
            self.hands.min_tracking_confidence = tracking

    # ── core detection ────────────────────────────────────────────────────
    def find_hands(self, bgr_frame: np.ndarray) -> list[TrackedHand]:
        """Run two-hand detection on one BGR frame.

        Returns 0..2 TrackedHand objects with pixel-space landmarks.
        The input frame is never modified.
        """
        if self._use_tasks:
            return self._find_hands_tasks(bgr_frame)
        return self._find_hands_legacy(bgr_frame)

    def _find_hands_legacy(self, bgr_frame: np.ndarray) -> list[TrackedHand]:
        """Path for mediapipe < 0.10.31 (mp.solutions.hands)."""
        height, width = bgr_frame.shape[:2]

        rgb = cv2.cvtColor(bgr_frame, cv2.COLOR_BGR2RGB)
        rgb.flags.writeable = False          # MediaPipe only reads: skip a copy
        results = self.hands.process(rgb)

        if not results.multi_hand_landmarks:
            return []

        tracked: list[TrackedHand] = []
        for lm_list, label in zip(results.multi_hand_landmarks,
                                  results.multi_handedness):
            pts = np.array(
                [(lm.x * width, lm.y * height) for lm in lm_list.landmark],
                dtype=np.float32,
            )
            tracked.append(
                TrackedHand(
                    label=label.label,
                    landmarks_px=pts,
                    handedness_score=label.score,
                )
            )
        return tracked

    def _find_hands_tasks(self, bgr_frame: np.ndarray) -> list[TrackedHand]:
        """Path for mediapipe >= 0.10.31 (Tasks HandLandmarker)."""
        height, width = bgr_frame.shape[:2]

        rgb = cv2.cvtColor(bgr_frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        results = self.landmarker.detect_for_video(
            mp_image, self._next_timestamp()
        )

        if not results.hand_landmarks:
            return []

        tracked: list[TrackedHand] = []
        for landmarks, categories in zip(results.hand_landmarks,
                                         results.handedness):
            pts = np.array(
                [(lm.x * width, lm.y * height) for lm in landmarks],
                dtype=np.float32,
            )
            best = categories[0]             # top handedness hypothesis
            tracked.append(
                TrackedHand(
                    label=best.category_name,
                    landmarks_px=pts,
                    handedness_score=best.score,
                )
            )
        return tracked

    # ── overlay ───────────────────────────────────────────────────────────
    def draw_skeleton(self, bgr_frame: np.ndarray, hands: list[TrackedHand]) -> None:
        """Draw bones + joints for every tracked hand (in place)."""
        for hand in hands:
            color = _HAND_COLORS.get(hand.label, (200, 200, 200))
            pts = hand.landmarks_px

            def px(i: int) -> tuple[int, int]:
                return (int(pts[i][0]), int(pts[i][1]))

            for a, b in HAND_BONES:
                cv2.line(bgr_frame, px(a), px(b), color, 2, cv2.LINE_AA)

            for i in range(len(pts)):
                # The fingertips that matter for the gesture get a bright core.
                if i in (INDEX_TIP, THUMB_TIP):
                    cv2.circle(bgr_frame, px(i), 6, color, -1, cv2.LINE_AA)
                    cv2.circle(bgr_frame, px(i), 6, (255, 255, 255), 2, cv2.LINE_AA)
                else:
                    cv2.circle(bgr_frame, px(i), 3, color, -1, cv2.LINE_AA)

    # ── cleanup ───────────────────────────────────────────────────────────
    def release(self) -> None:
        """Close the underlying MediaPipe graph."""
        if self._use_tasks:
            self.landmarker.close()
        else:
            self.hands.close()
`;

const gesturePy = `"""
gesture.py — custom two-hand "frame" gesture recognizer.

The gesture
-----------
Bring both hands together so that the two INDEX fingertips approach each
other AND the two THUMB tips approach each other, forming a diamond /
rectangle "frame" in mid-air.

Recognition is pure geometry:

    d_idx = distance(left #8 , right #8)      # index fingertips
    d_thb = distance(left #4 , right #4)      # thumb tips

Both gaps must shrink below an ENGAGE threshold (a fraction of the frame
size) to lock, and either gap must grow past a larger RELEASE threshold
to unlock. The band between the two thresholds is hysteresis — it stops
the shape from flickering on/off while your hands hover at the boundary.
A small frame debounce adds further stability on lock.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional

import numpy as np

from hand_tracker import TrackedHand


@dataclass
class FrameGesture:
    """The outcome of one gesture evaluation."""

    locked: bool
    corners: Optional[np.ndarray] = None   # (4, 2) int quad, ordered for cv2.fillPoly
    index_gap: float = math.inf            # px between the two index tips
    thumb_gap: float = math.inf            # px between the two thumb tips
    engage_px: float = 0.0                 # lock threshold used this frame
    release_px: float = 0.0                # unlock threshold used this frame


def _order_quad(pts: np.ndarray) -> np.ndarray:
    """Sort 4 points by angle around their centroid.

    Guarantees a simple (non self-intersecting) quadrilateral no matter
    which hand is on which side of the frame, or whether the hands have
    crossed over each other.
    """
    centre = pts.mean(axis=0)
    angles = np.arctan2(pts[:, 1] - centre[1], pts[:, 0] - centre[0])
    return pts[np.argsort(angles)].astype(np.int32)


class FrameGestureRecognizer:
    """Stateful recognizer: hysteresis + debounce across frames."""

    def __init__(
        self,
        engage_ratio: float = 0.16,    # lock when both gaps < 16% of min(w, h)
        release_ratio: float = 0.24,   # unlock when any gap  > 24% of min(w, h)
        engage_frames: int = 2,        # condition must hold N frames to lock
    ) -> None:
        self.engage_ratio = engage_ratio
        self.release_ratio = release_ratio
        self.engage_frames = engage_frames

        self._locked = False
        self._pending = 0              # consecutive "close enough" frames

    # ──────────────────────────────────────────────────────────────────────
    def evaluate(
        self, hands: list[TrackedHand], frame_w: int, frame_h: int
    ) -> FrameGesture:
        """Inspect the current two-hand state and update lock state."""
        left = next((h for h in hands if h.label == "Left"), None)
        right = next((h for h in hands if h.label == "Right"), None)

        reference = float(min(frame_w, frame_h))
        engage_px = self.engage_ratio * reference
        release_px = self.release_ratio * reference

        # One of each hand is required before any geometry makes sense.
        if left is None or right is None:
            self._locked = False
            self._pending = 0
            return FrameGesture(locked=False, engage_px=engage_px,
                                release_px=release_px)

        index_gap = float(np.linalg.norm(left.index_tip - right.index_tip))
        thumb_gap = float(np.linalg.norm(left.thumb_tip - right.thumb_tip))

        close_enough = index_gap < engage_px and thumb_gap < engage_px
        pulled_apart = index_gap > release_px or thumb_gap > release_px

        if self._locked:
            if pulled_apart:               # unlock immediately on separation
                self._locked = False
                self._pending = 0
        else:
            self._pending = self._pending + 1 if close_enough else 0
            if self._pending >= self.engage_frames:
                self._locked = True

        corners = None
        if self._locked:
            # The shape connects exactly the four requested landmarks:
            # both index fingertips and both thumb tips.
            corners = _order_quad(
                np.array(
                    [left.thumb_tip, left.index_tip,
                     right.index_tip, right.thumb_tip],
                    dtype=np.float32,
                )
            )

        return FrameGesture(
            locked=self._locked,
            corners=corners,
            index_gap=index_gap,
            thumb_gap=thumb_gap,
            engage_px=engage_px,
            release_px=release_px,
        )
`;

const rainbowPy = `"""
rainbow.py — linear rainbow gradient renderer built on NumPy.

How the gradient is made
------------------------
1.  Pre-compute a full-frame HSV image whose HUE channel ramps linearly
    across the width: 0 deg -> 360 deg x N cycles. Saturation and value
    are maxed, so hue alone drives the colour.
2.  Animate it by rolling the hue channel with np.roll(). Because the
    ramp wraps at an integer number of 360 deg cycles, the roll is
    perfectly seamless — the rainbow flows forever without a seam.
3.  Convert HSV -> BGR once per frame.
4.  Rasterise the hand-quad as a fill mask, then alpha-composite the
    gradient onto the camera frame with pure NumPy broadcasting.
5.  Stroke the outline with the same gradient: each polygon edge is
    chopped into ~5 px segments and every segment is coloured by
    sampling the gradient at its own position — a rainbow border,
    not a monochrome one.
"""

from __future__ import annotations

import cv2
import numpy as np


class RainbowPainter:
    """Paints the between-hands shape with a flowing linear rainbow."""

    def __init__(
        self,
        width: int,
        height: int,
        cycles: int = 2,                     # rainbow repeats across the frame
        flow_px_per_second: float = 140.0,   # how fast the colours scroll
    ) -> None:
        # Integer cycle counts are required: only then does the hue ramp
        # end exactly where it began, so np.roll() wraps without a seam.
        self.cycles = max(1, int(round(cycles)))
        self.flow = flow_px_per_second

        self._hsv: np.ndarray | None = None
        self._cache_key: tuple[int, int] | None = None
        self._rebuild(width, height)

    # ── gradient cache ────────────────────────────────────────────────────
    def _rebuild(self, width: int, height: int) -> None:
        """(Re)compute the HSV rainbow ramp, cached per resolution."""
        if self._cache_key == (width, height):
            return

        # Hue ramp in degrees, squeezed into OpenCV's 0..179 hue range.
        ramp_deg = np.linspace(0.0, 360.0 * self.cycles, width, endpoint=False)
        hue_row = ((ramp_deg % 360.0) / 2.0).astype(np.uint8)

        hsv = np.empty((height, width, 3), dtype=np.uint8)
        hsv[..., 0] = hue_row                # broadcast the row over all lines
        hsv[..., 1] = 255                    # full saturation
        hsv[..., 2] = 255                    # full brightness

        self._hsv = hsv
        self._cache_key = (width, height)

    # ── public API ────────────────────────────────────────────────────────
    def paint(
        self,
        frame: np.ndarray,
        polygon: np.ndarray,
        time_s: float,
        fill_alpha: float = 0.5,
        stroke_px: int = 4,
        glow: bool = True,
    ) -> np.ndarray:
        """Return a new frame with the rainbow quad composited on top.

        polygon : (4, 2) integer corners (already ordered by the gesture
                  recognizer, but any simple quad works).
        time_s  : monotonic clock — drives the rainbow flow.
        """
        height, width = frame.shape[:2]
        self._rebuild(width, height)

        # 1) animate: roll the hue ramp, then convert HSV -> BGR
        shift = int(time_s * self.flow) % width
        gradient = cv2.cvtColor(np.roll(self._hsv, shift, axis=1),
                                cv2.COLOR_HSV2BGR)

        poly = np.asarray(polygon, dtype=np.int32)

        # 2) shape mask
        mask = np.zeros((height, width), dtype=np.uint8)
        cv2.fillPoly(mask, [poly], 255)

        # 3) NumPy alpha composite — a convex blend, so no overflow:
        #    out = frame * (1 - a) + gradient * a,  with a = fill_alpha
        #    inside the polygon and 0 everywhere else.
        a = (mask.astype(np.float32) * (fill_alpha / 255.0))[..., None]
        blended = (frame.astype(np.float32) * (1.0 - a)
                   + gradient.astype(np.float32) * a)
        out = blended.astype(np.uint8)

        # 4) rainbow outline (+ optional soft glow)
        stroke = np.zeros_like(frame)
        self._gradient_outline(stroke, poly, gradient, stroke_px)

        if glow:
            halo = cv2.GaussianBlur(stroke, (0, 0), sigmaX=7)
            out = cv2.add(out, cv2.addWeighted(halo, 0.55, stroke, 1.0, 0))
        else:
            out = cv2.add(out, stroke)

        return out

    # ── internals ─────────────────────────────────────────────────────────
    def _gradient_outline(
        self,
        canvas: np.ndarray,
        poly: np.ndarray,
        gradient: np.ndarray,
        stroke_px: int,
    ) -> None:
        """Stroke the quad edge-by-edge, colouring each short segment with
        the gradient colour at its own position."""
        height, width = canvas.shape[:2]
        n = len(poly)

        for i in range(n):
            ax, ay = poly[i]
            bx, by = poly[(i + 1) % n]
            length = float(np.hypot(bx - ax, by - ay))
            steps = max(2, int(length // 5))     # ~5 px segments

            for s in range(steps):
                t0 = s / steps
                t1 = (s + 1) / steps
                px, py = ax + (bx - ax) * t0, ay + (by - ay) * t0
                qx, qy = ax + (bx - ax) * t1, ay + (by - ay) * t1

                sx = int(min(max(px, 0), width - 1))
                sy = int(min(max(py, 0), height - 1))
                colour = gradient[sy, sx]

                cv2.line(
                    canvas,
                    (int(px), int(py)),
                    (int(qx), int(qy)),
                    (int(colour[0]), int(colour[1]), int(colour[2])),
                    stroke_px,
                    cv2.LINE_AA,
                )
`;

const dashboardPy = `"""
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
        self.telemetry_var.set("\\n".join(lines))

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
`;

const requirementsTxt = `# ── PrismHands ─────────────────────────────────────────────
# Python 3.10+ recommended (tested on 3.10 – 3.12)

opencv-python>=4.8.0     # webcam capture + image math
mediapipe>=0.10.9        # two-hand landmark model (21 points per hand)
numpy>=1.24.0            # HSV gradient ramps + alpha compositing
pillow>=10.0.0           # OpenCV frame -> Tkinter bridge (ImageTk)
`;

const readmeMd = `# PrismHands

Two-hand rainbow shape tracker. Form a "frame" with both hands — index
fingertips together, thumb tips together — and a flowing linear-rainbow
polygon is painted between your four fingertips in real time.

## Stack

- Python 3.10+
- opencv-python — webcam capture and pixel math
- mediapipe     — simultaneous two-hand landmark tracking (21 pts/hand)
- numpy         — HSV gradient ramps, rolling animation, alpha blending
- tkinter + Pillow — dashboard GUI with the video feed embedded in-window

## Install

    python -m venv .venv
    .venv\\Scripts\\activate        (Windows)
    source .venv/bin/activate     (macOS / Linux)
    pip install -r requirements.txt

## Run

    python main.py                          # default camera
    python main.py --camera 1               # second webcam
    python main.py --width 960 --height 540 # lighter capture

## Controls

- START / STOP        begin or end capture (also: SPACE)
- camera + REOPEN     switch the webcam index
- min detection       MediaPipe detection confidence
- min tracking        MediaPipe tracking confidence
- flow px/s           rainbow scroll speed
- fill %              opacity of the gradient fill
- ESC                 quit (releases the camera, closes all windows)

## Files

    main.py          entry point + CLI args
    dashboard.py     Tkinter GUI, embedded feed, clean shutdown
    hand_tracker.py  MediaPipe wrapper, both hands, pixel landmarks
    gesture.py       frame-gesture recognizer (hysteresis + debounce)
    rainbow.py       NumPy HSV rainbow gradient + polygon compositing

## Troubleshooting

- No camera: try a different --camera index (0, 1, 2, ...).
- Low FPS: pass --width 960 --height 540, or set model_complexity=0
  in hand_tracker.py.
- Apple Silicon: if mediapipe fails to install, use Python 3.10/3.11
  from python.org (not the system Python) and upgrade pip first.
- Linux "permission denied" on /dev/video0: add your user to the
  video group, then log out and back in.
- AttributeError: module 'mediapipe' has no attribute 'solutions':
  you are on mediapipe >= 0.10.31, which removed the legacy Solutions
  API. PrismHands detects this and automatically falls back to the
  Tasks API (it downloads the ~7 MB hand_landmarker.task model to
  ~/.cache/prismhands on first run). Just rerun python main.py.
  To force the classic API instead: pip install "mediapipe==0.10.21"
  (requires Python 3.11/3.12).
`;

export const PY_FILES: PyFile[] = [
  {
    name: "main.py",
    lang: "python",
    role: "Entry point — CLI args, launches the dashboard, guarantees teardown",
    content: mainPy,
  },
  {
    name: "dashboard.py",
    lang: "python",
    role: "Tkinter GUI — embedded feed, start/stop, sliders, telemetry, clean shutdown",
    content: dashboardPy,
  },
  {
    name: "hand_tracker.py",
    lang: "python",
    role: "MediaPipe wrapper — both hands at once; auto-falls back to the Tasks API on mediapipe ≥ 0.10.31",
    content: handTrackerPy,
  },
  {
    name: "gesture.py",
    lang: "python",
    role: "Custom recognizer — fingertip distances, hysteresis, debounce, quad ordering",
    content: gesturePy,
  },
  {
    name: "rainbow.py",
    lang: "python",
    role: "NumPy rainbow engine — seamless HSV ramp, np.roll animation, gradient stroke",
    content: rainbowPy,
  },
  {
    name: "requirements.txt",
    lang: "bash",
    role: "Pinned dependency list",
    content: requirementsTxt,
  },
  {
    name: "README.md",
    lang: "markdown",
    role: "Quick start, controls and troubleshooting",
    content: readmeMd,
  },
];

export const lineCount = (f: PyFile) => f.content.trimEnd().split("\n").length;
