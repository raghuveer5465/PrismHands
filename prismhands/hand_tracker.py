"""
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
