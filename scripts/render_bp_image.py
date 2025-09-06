#!/usr/bin/env python3
"""
Render a dynamic battle‑pass page image.

This script accepts arguments to generate a two‑row grid representing the
levels of a battle pass. The top row corresponds to the "free" reward
track and the bottom row corresponds to the "premium" track. Each row
contains five cells for a single page of the battle pass (e.g. levels
1‑5, 6‑10, …, 91‑95, 96‑100). Cells for already unlocked levels are
fully filled with a highlight colour, the current level is partially
filled based on the player's progress within that level, and future
levels are left empty. The script also draws the level numbers and
labels the rows as "FREE" and "PREM". If the user does not have a
premium subscription, the premium row is still drawn but left unfilled.

Arguments (positional):
    1. page        – page number (1‑10) representing the 10‑level slice
    2. level       – player's current level (1‑100)
    3. progress    – a float between 0 and 1 indicating progress within
                      the current level (0 means just started, 1 means
                      completed the level)
    4. premium     – 1 if the user has premium, 0 otherwise
    5. outpath     – output file path for the PNG image

Example:
    python render_bp_image.py 1 7 0.5 1 ./out.png

The above will render the first page (levels 1‑10) for a player at
level 7 with 50 % progress into level 7 on a premium account and save
the resulting PNG to ``./out.png``.
"""

import sys
from PIL import Image, ImageDraw, ImageFont


def parse_args():
    """Parse positional command line arguments with sensible defaults."""
    args = sys.argv[1:]
    page = int(args[0]) if len(args) > 0 else 1
    level = int(args[1]) if len(args) > 1 else 1
    try:
        progress = float(args[2]) if len(args) > 2 else 0.0
    except ValueError:
        progress = 0.0
    premium = bool(int(args[3])) if len(args) > 3 else False
    outpath = args[4] if len(args) > 4 else 'out.png'
    page = max(1, min(10, page))
    level = max(1, min(100, level))
    progress = max(0.0, min(1.0, progress))
    return page, level, progress, premium, outpath


def draw_grid(draw: ImageDraw.Draw, origin, cell_size, page_start, current_level, progress, premium, font):
    """
    Draw the two‑row grid for the battle pass.

    Parameters
    ----------
    draw : ImageDraw.Draw
        The drawing context.
    origin : tuple[int, int]
        Top‑left corner (x, y) of the grid.
    cell_size : tuple[int, int]
        Width and height of each cell (w, h).
    page_start : int
        Level number of the first cell on this page.
    current_level : int
        Player's current level.
    progress : float
        Fraction of current XP within the current level (0..1).
    premium : bool
        Indicates if the user has premium subscription.
    font : ImageFont.FreeTypeFont
        Font for rendering the level numbers and labels.
    """
    x0, y0 = origin
    cw, ch = cell_size

    # Colours
    bg_colour = (250, 250, 250)
    border_colour = (0, 0, 0)
    free_fill = (119, 221, 119)   # light green
    premium_fill = (255, 215, 0)  # gold/yellow
    text_colour = (0, 0, 0)

    # Draw row labels
    # For two sets of (free, prem) rows we need four rows: free/prem for
    # the first half of the page (levels page_start..page_start+4) and
    # free/prem for the second half (levels page_start+5..page_start+9).
    row_labels = ['FREE', 'PREM', 'FREE', 'PREM']
    label_bg = (230, 230, 230)
    label_w = int(cw * 0.8)  # width reserved for labels
    # Vertical gap between rows
    row_gap = 4
    for row, label in enumerate(row_labels):
        # compute vertical offset
        ly = y0 + row * (ch + row_gap)
        # label background box
        label_rect = [x0, ly, x0 + label_w, ly + ch]
        draw.rectangle(label_rect, fill=label_bg, outline=border_colour)
        # label text centered
        w, h = draw.textsize(label, font=font)
        tx = x0 + (label_w - w) / 2
        ty = ly + (ch - h) / 2
        draw.text((tx, ty), label, fill=text_colour, font=font)

    # Draw the cells for each of the four rows
    gx0 = x0 + label_w + 8  # horizontal offset for first column
    for row in range(4):
        # Determine which half of the page this row belongs to
        half = row // 2  # 0 for first half (levels start..start+4), 1 for second half (start+5..start+9)
        # row within the half: 0 => free, 1 => premium
        row_in_half = row % 2
        gy = y0 + row * (ch + row_gap)
        for col in range(5):
            level_num = page_start + half * 5 + col
            # Determine fill amount
            if level_num < current_level:
                fill_amount = 1.0
            elif level_num == current_level:
                fill_amount = progress
            else:
                fill_amount = 0.0
            # Determine cell fill colour
            cell_fill = None
            if row_in_half == 0:
                # free row
                if fill_amount > 0:
                    cell_fill = free_fill
            else:
                # premium row
                if premium and fill_amount > 0:
                    cell_fill = premium_fill
            # Calculate coordinates of cell
            cx = gx0 + col * (cw + 4)
            cy = gy
            rect = [cx, cy, cx + cw, cy + ch]
            # Background
            draw.rectangle(rect, fill=bg_colour, outline=border_colour)
            # Fill portion horizontally
            if cell_fill and fill_amount > 0:
                fill_w = int(cw * fill_amount)
                fill_rect = [cx, cy, cx + fill_w, cy + ch]
                draw.rectangle(fill_rect, fill=cell_fill)
            # Draw level number text at the bottom of the cell only for free rows.
            if row_in_half == 0:
                lvl_txt = str(level_num)
                tw, th = draw.textsize(lvl_txt, font=font)
                tx = cx + (cw - tw) / 2
                ty = cy + ch - th - 2  # bottom padding
                draw.text((tx, ty), lvl_txt, fill=text_colour, font=font)


def main():
    page, level, progress, premium, outpath = parse_args()
    # Determine start of page (1‑based)
    page_start = (page - 1) * 10 + 1

    # Image dimensions – chosen to be large enough for readability
    img_w = 1000
    img_h = 400
    img = Image.new('RGB', (img_w, img_h), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)

    # Try to load a nicer font; fall back to default
    try:
        font = ImageFont.truetype("DejaVuSans-Bold.ttf", 20)
    except Exception:
        font = ImageFont.load_default()

    # Grid cell size – compute based on available space
    # Reserve margins around grid
    margin_x = 20
    margin_y = 20
    grid_w = img_w - 2 * margin_x
    grid_h = img_h - 2 * margin_y

    # Dedicate left label area (approx 15 % of width) and the rest for 5 cells
    label_fraction = 0.15
    label_width = int(grid_w * label_fraction)
    cell_area_w = grid_w - label_width - 8  # subtract small horizontal padding
    cell_w = int((cell_area_w - 4 * 4) / 5)  # 4 gaps between 5 cells
    # Four rows (free/prem for two halves) with 3 gaps between them
    cell_h = int((grid_h - 3 * 4) / 4)

    # Draw grid with progress
    draw_grid(draw, (margin_x, margin_y), (cell_w, cell_h), page_start, level, progress, premium, font)

    # Save
    img.save(outpath)


if __name__ == '__main__':
    main()