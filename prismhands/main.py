"""
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
