# PrismHands

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
    .venv\Scripts\activate        (Windows)
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
