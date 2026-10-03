"""
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
