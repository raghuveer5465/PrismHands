"""
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
