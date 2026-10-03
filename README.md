# PrismHands: Two-Hand Rainbow Tracker

A real-time computer vision and web application that tracks hand gestures via webcam and dynamically paints a flowing rainbow polygon between your hands. Built using React, OpenCV, MediaPipe, NumPy, and Tkinter.

## Overview

This application captures live video input from a webcam, performs real-time simultaneous two-hand tracking using MediaPipe, and renders a dynamic, color-shifting overlay when a specific "frame" gesture is recognized. It features a React-based web dashboard for documentation and a Python Tkinter control room with embedded video feeds and real-time telemetry.

## Features

* **Real-Time Hand Tracking:** Low-latency 21-landmark dual-hand detection powered by MediaPipe.
* **Custom Gesture Recognition:** Geometric distance calculations between index and thumb fingertips with built-in hysteresis and 2-frame debouncing for extreme stability.
* **Dynamic Rainbow Rendering:** Seamless HSV gradient ramps using `np.roll` and custom alpha-channel blending for smooth polygon overlays.
* **Interactive Dashboard:** Tkinter GUI with an embedded live video feed, allowing on-the-fly threshold adjustments and confidence tracking.

## Gesture Mapping

| Hand State | Fingertip Distance | System Action |
| :--- | :--- | :--- |
| Tracking | Far apart | Standard hand skeleton overlay |
| Closing | Approaching threshold | Live pixel gap readout displayed |
| Frame Locked | Touching (Index to Index, Thumb to Thumb) | Rainbow polygon rendered between hands |

## Requirements

* Node.js (for the web dashboard)
* Python 3.10 or higher (up to 3.12 recommended)
* OpenCV ( `opencv-python` )
* MediaPipe ( `mediapipe` )
* NumPy ( `numpy` )
* Pillow ( `pillow` )

## Installation and Setup

### 1. Clone the Repository

```bash
git clone [https://github.com/raghuveer5465/prismhands.git](https://github.com/raghuveer5465/prismhands.git)
cd prismhands
