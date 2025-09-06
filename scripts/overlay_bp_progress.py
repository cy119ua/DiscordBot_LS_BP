#!/usr/bin/env python3
"""
Overlay a simple horizontal progress bar onto an existing battle‑pass page image.

This script reads an input image, draws a semi‑transparent progress bar
across the bottom of the image, and saves the result. The bar's length
corresponds to the provided progress fraction (0..1). A dark background
under the bar improves contrast, and the filled portion uses a green
colour.

Usage:
    python overlay_bp_progress.py <input_image> <progress_fraction> <output_image>

Example:
    python overlay_bp_progress.py page1.png 0.35 page1_progress.png

This will draw a progress bar filled to 35 % width on the bottom of
``page1.png`` and write the result to ``page1_progress.png``.
"""

import sys
from PIL import Image, ImageDraw


def main():
    if len(sys.argv) < 4:
        print("Usage: overlay_bp_progress.py <input_image> <progress_fraction> <output_image>")
        sys.exit(1)
    in_path = sys.argv[1]
    try:
        progress = float(sys.argv[2])
    except Exception:
        progress = 0.0
    out_path = sys.argv[3]
    progress = max(0.0, min(1.0, progress))
    # Load base image (convert to RGBA to support alpha overlay)
    base = Image.open(in_path).convert('RGBA')
    w, h = base.size
    # Determine bar dimensions
    bar_height = max(12, int(h * 0.045))  # ~4.5 % of image height
    margin_y = max(6, int(h * 0.03))      # ~3 % margin above bottom
    y_top = h - margin_y - bar_height
    # Create overlay layer
    overlay = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    # Background bar (dark semi‑transparent)
    bg_colour = (0, 0, 0, 180)
    draw.rectangle([(0, y_top), (w, y_top + bar_height)], fill=bg_colour)
    # Filled portion (green)
    fill_colour = (0, 200, 83, 200)
    fill_width = int(w * progress)
    if fill_width > 0:
        draw.rectangle([(0, y_top), (fill_width, y_top + bar_height)], fill=fill_colour)
    # Composite overlay onto base
    result = Image.alpha_composite(base, overlay)
    result.convert('RGB').save(out_path)


if __name__ == '__main__':
    main()