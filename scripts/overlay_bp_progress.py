#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import os, sys
from PIL import Image, ImageDraw, ImageFont

"""
Настройка визуала полосы прогресса:
- Цвета можно задавать через ENV:
  BP_BAR_R/G/B/ALPHA (общий цвет по умолчанию)
  BP_BAR_TOP_FREE_R/G/B/A,  BP_BAR_TOP_PREM_R/G/B/A
  BP_BAR_BOT_FREE_R/G/B/A,  BP_BAR_BOT_PREM_R/G/B/A
- Скругление задаётся через BP_BAR_RADIUS_PCT (0..1) — доля от высоты пары полос.
"""

def _get_int_env(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except Exception:
        return default

# Базовый цвет (fallback)
BAR_BASE_R = _get_int_env('BP_BAR_R', 64)
BAR_BASE_G = _get_int_env('BP_BAR_G', 128)
BAR_BASE_B = _get_int_env('BP_BAR_B', 255)
BAR_ALPHA  = _get_int_env('BP_BAR_ALPHA', 150)
try:
    BAR_RADIUS_PCT = float(os.environ.get('BP_BAR_RADIUS_PCT', '0.05'))
except Exception:
    BAR_RADIUS_PCT = 0.05

BAR_RGBA = (BAR_BASE_R, BAR_BASE_G, BAR_BASE_B, BAR_ALPHA)
# Colour for the textual overlays on the right panel.  The sample uses
# white text on a gradient background, so set the default colour to
# pure white (RGBA).  Should a different colour be desired via
# environment variables or other means, modify this constant.
TEXTCOL  = (255, 255, 255, 255)

# -----------------------------------------------------------------------------
# Position adjustment knobs
#
# The following offsets allow fine‑tuning of the horizontal (X) and vertical
# (Y) positioning of the three major text groups on the right‑hand panel:
#   1. TOP – the lines showing the current level and experience progress.
#   2. MID – the numeric counters for raffle points, double‑bet tokens and
#            card packs.
#   3. INV – the invitation statistics (e.g. “0/5” and “приглашений”).
#
# Each offset is read from an environment variable if provided, falling back
# to zero (no shift).  Positive X values move the text to the right, negative
# values to the left.  Positive Y values move the text down, negative values
# move it up.  These offsets are applied in draw_info when rendering the
# corresponding group.  This mechanism does not alter any existing font
# sizing or spacing logic and can be safely adjusted without breaking other
# functionality.

# Top group offsets (level and XP lines)
TOP_DX = _get_int_env('BP_TOP_DX', -80)
TOP_DY = _get_int_env('BP_TOP_DY', -20)

TOP_PAD_X = _get_int_env('BP_TOP_PAD_X', 0)
INV_PAD_X = _get_int_env('BP_INV_PAD_X', 0)

# Middle group offsets (raffle, double tokens, packs)
MID_DX = _get_int_env('BP_MID_DX', 0)
MID_DY = _get_int_env('BP_MID_DY', 15)

# Invitation group offsets (invites count and label)
INV_DX = _get_int_env('BP_INV_DX', -80)
INV_DY = _get_int_env('BP_INV_DY', 60)

# -----------------------------------------------------------------------------
# Individual numeric counter offsets
#
# In addition to the collective MID_DX/MID_DY adjustments above, the positions
# of each of the three numeric counters (raffle points, double‑bet tokens and
# card packs) can now be tweaked individually via environment variables.  Each
# value defaults to zero (no shift).  Positive X offsets push the number to
# the right, negative values to the left.  Positive Y offsets push it down,
# negative values up.  These are applied on top of MID_DX/MID_DY when
# rendering the numeric rows.  See draw_info for usage.
RAFFLE_DX = 60    # Сдвиг по X для raffle
RAFFLE_DY = -20   # Сдвиг по Y для raffle
DD_DX     = 60    # Сдвиг по X для double tokens
DD_DY     = -20   # Сдвиг по Y для double tokens
PACK_DX   = 60    # Сдвиг по X для packs
PACK_DY   = 0   # Сдвиг по Y для packs

def clamp(v, a, b):
    return max(a, min(b, v))

def _get_color(prefix, default):
    """Читает компоненты R,G,B,A из env для заданного префикса."""
    r = _get_int_env(f'{prefix}_R', default[0])
    g = _get_int_env(f'{prefix}_G', default[1])
    b = _get_int_env(f'{prefix}_B', default[2])
    a = _get_int_env(f'{prefix}_A', default[3])
    r = clamp(r, 0, 255)
    g = clamp(g, 0, 255)
    b = clamp(b, 0, 255)
    a = clamp(a, 0, 255)
    return (r, g, b, a)

TOP_FREE_RGBA  = _get_color('BP_BAR_TOP_FREE', BAR_RGBA)
TOP_PREM_RGBA  = _get_color('BP_BAR_TOP_PREM', BAR_RGBA)
BOT_FREE_RGBA  = _get_color('BP_BAR_BOT_FREE', BAR_RGBA)
BOT_PREM_RGBA  = _get_color('BP_BAR_BOT_PREM', BAR_RGBA)

def load_font(size):
    # Attempt to load Montserrat first.  If the file exists in the assets
    # folder or is otherwise accessible on the system, it will be used.
    candidates = [
        "assets/fonts/Montserrat-SemiBold.ttf",
        "Montserrat-SemiBold.ttf",
        "assets/fonts/DejaVuSans-Bold.ttf",
        "assets/fonts/DejaVuSans.ttf",
        "assets/fonts/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
        "Arial.ttf","DejaVuSans.ttf","DejaVuSans-Bold.ttf",
        r"C:\\Windows\\Fonts\\arial.ttf", r"C:\\Windows\\Fonts\\arialbd.ttf",
        r"C:\\Windows\\Fonts\\segoeui.ttf", r"C:\\Windows\\Fonts\\tahoma.ttf"
    ]
    for p in candidates:
        try:
            if os.path.isfile(p):
                return ImageFont.truetype(p, size)
            if os.path.sep not in p:
                return ImageFont.truetype(p, size)
        except Exception:
            pass
    return ImageFont.load_default()

def text_wh(draw, text, font):
    try:
        l,t,r,b = draw.textbbox((0,0), text, font=font)
        return (r-l, b-t)
    except Exception:
        try:
            return (int(draw.textlength(text, font=font)), getattr(font,'size',18))
        except Exception:
            return (len(text)*10, getattr(font,'size',18))

def _rounded_rect(draw, xy, radius, fill):
    try:
        draw.rounded_rectangle(xy, radius=radius, fill=fill)
    except Exception:
        draw.rectangle(xy, fill=fill)

def draw_split_pair_progress(overlay_img, bar_x, bar_w, y, h_pair, band_start, cur_lvl, lvl_frac, color_free, color_prem):
    """
    Рисует пару половинок (free/premium) как ЕДИНУЮ форму с внешними скруглёнными углами.
    Внутренняя граница между половинками остаётся прямой без скруглений.
    """
    pad = max(2, int(h_pair * 0.03))
    x0 = int(bar_x) + pad
    x_max = int(bar_x + bar_w) - pad
    y0 = int(y) + pad
    y1 = int(y + h_pair) - pad
    if x_max <= x0 or y1 <= y0:
        return

    seg_w = (x_max - x0) / 5.0

    if cur_lvl < band_start:
        total_units = 0.0
    elif cur_lvl > band_start + 4:
        total_units = 5.0
    else:
        total_units = (cur_lvl - band_start) + clamp(lvl_frac, 0.0, 1.0)

    if total_units <= 0:
        return

    w_prog = int(seg_w * total_units + 0.5)
    if w_prog <= 0:
        return

    X = x0
    Y = y0
    W = min(w_prog, x_max - x0)
    H = y1 - y0
    if W <= 0 or H <= 0:
        return

    radius = max(2, int(H * max(0.0, min(1.0, BAR_RADIUS_PCT))))
    radius = min(radius, H // 2, W // 2)

    # Картинка «пары» (верх — free, низ — premium)
    band = Image.new('RGBA', (W, H), (0,0,0,0))
    bd   = ImageDraw.Draw(band, 'RGBA')
    Hh = H // 2
    bd.rectangle([0, 0, W, Hh], fill=color_free)
    bd.rectangle([0, Hh, W, H], fill=color_prem)

    # Маска со скруглением только внешних углов (по сути круглится весь внешний прямоугольник пары)
    mask = Image.new('L', (W, H), 0)
    md   = ImageDraw.Draw(mask)
    try:
        md.rounded_rectangle([0, 0, W, H], radius=radius, fill=255)
    except Exception:
        md.rectangle([0, 0, W, H], fill=255)

    # Однократное наложение с маской — корректно и без ошибок PIL
    overlay_img.paste(band, (X, Y), mask)

def draw_info(draw, w, h, level, xp_cur, xp_need, is_premium, invites, dd_tokens, raffle, packs=None):
    """
    Draw the right‑hand information panel.  This custom implementation mimics
    the layout shown in the provided sample (образец.png).  The panel
    displays the player's level, current XP progress, counts for raffle
    points, double‑bet tokens and card packs, and invitation stats.  The
    design uses three distinct font sizes with specific line and letter
    spacing to achieve the desired hierarchy:

    * Level and XP lines use a 62 pt font with a slight negative letter
      spacing (−15 pt) to tighten the characters.
    * The numeric counters (raffle, double tokens, card packs) use a
      large 100 pt font with a generous 95 pt line spacing between rows.
    * The invites section at the bottom consists of two lines (e.g. “0/5”
      and “приглашений”) rendered at 48 pt with a 48 pt inter‑line gap.

    If any of the XP values are missing, they default to zero.
    """
    # Panel position and size as percentages of the overall image
    panel_x_pct, panel_w_pct = 76.8, 20.2
    panel_y_pct, panel_h_pct = 7.5, 85.0

    # Compute pixel dimensions of the panel
    x0 = int(w * panel_x_pct / 100.0)
    y0 = int(h * panel_y_pct / 100.0)
    ww = int(w * panel_w_pct / 100.0)
    hh = int(h * panel_h_pct / 100.0)

    # Basic padding inside the panel to avoid drawing on the edges
    pad_x = max(14, int(ww * 0.08))
    pad_y = max(14, int(hh * 0.08))

    # Ensure numeric values are defined
    lvl   = level if level is not None else 0
    xp_c  = xp_cur if xp_cur is not None else 0
    xp_n  = xp_need if xp_need is not None and xp_need > 0 else 0
    inv   = invites if invites is not None else 0
    dd    = dd_tokens if dd_tokens is not None else 0
    raf   = raffle if raffle is not None else 0
    pk    = packs if packs is not None else 0

    # Prepare strings for each section
    # Top lines: level and XP progress.  Always break onto separate lines as
    # shown in the sample: the level followed by the current and required
    # experience (e.g. “0/100”).
    top_line1 = f"{lvl} уровень"
    top_line2 = f"{xp_c}/{xp_n}"

    # Middle numeric counters: raffle points (R), double‑bet tokens (DD)
    # and card packs.  These are drawn as large numerals aligned to the
    # left of their respective icons on the base image.  Only the numbers
    # are drawn here; the icons reside in the base artwork.
    mid_lines = [str(raf), str(dd), str(pk)]

    # Bottom invites: show the number of invites collected out of 5 on
    # one line and the word “приглашений” beneath it.  We explicitly
    # separate these two strings so that line spacing can be applied.
    bottom_line1 = f"{inv}/5"
    bottom_line2 = "приглашений"

    # Load fonts at the requested sizes.  We attempt to load Montserrat
    # (semibold) if available; otherwise load_font falls back to a sane default.
    # Select fonts at the sizes specified in the task description.  The
    # Montserrat SemiBold typeface will be used if available via
    # load_font.  Should that fail, a reasonable fallback will be
    # returned by load_font.
    #
    # Top section: 62 pt
    font_top    = load_font(62)
    # Middle section: 100 pt
    font_mid    = load_font(100)
    # Invites section: 48 pt
    font_bottom = load_font(48)

    # Helper to draw text with custom letter spacing.  Negative spacing
    # tightens the characters by shifting the starting position of each
    # subsequent glyph to the left.
    def draw_text_with_spacing(start_pos, text, font, fill, letter_spacing):
        """
        Draw a string one character at a time applying a constant
        additional spacing between characters.  A negative value will
        cause characters to overlap slightly, while a positive value
        increases the space.  Whitespace characters are not adjusted;
        their natural width is used and the extra spacing is skipped.  This
        preserves normal word boundaries when using negative tracking.
        """
        x, y = start_pos
        for ch in text:
            draw.text((x, y), ch, font=font, fill=fill)
            cw, _ = text_wh(draw, ch, font)
            # Do not tighten/expand after whitespace characters
            if ch.isspace():
                x += cw
            else:
                x += cw + letter_spacing

    # Initialise sizes for dynamic layout.  These sizes correspond to the
    # specification and will be scaled down uniformly if the overall
    # content does not fit vertically within the panel.
    top_size_init    = font_top.size
    mid_size_init    = font_mid.size
    bottom_size_init = font_bottom.size
    mid_spacing_init    = 95
    bottom_spacing_init = 15
    gap_top_mid_init  = int(mid_size_init * 0.4)

    # Mutable copies of the sizes and spacings
    top_size    = top_size_init
    mid_size    = mid_size_init
    bottom_size = bottom_size_init
    mid_spacing    = mid_spacing_init
    bottom_spacing = bottom_spacing_init
    gap_top_mid    = gap_top_mid_init

    # Minimum allowable sizes to avoid text becoming unreadable
    min_top_size    = 28
    min_mid_size    = 40
    min_bottom_size = 24
    min_spacing     = 5
    shrink_factor   = 0.90

    # Dynamic scaling loop: shrink fonts and spacings until the overall
    # content height fits within the panel’s available vertical space.
    while True:
        # Load fonts at the current sizes
        font_top    = load_font(int(top_size))
        font_mid    = load_font(int(mid_size))
        font_bottom = load_font(int(bottom_size))
        # Measure individual line heights
        _, h1 = text_wh(draw, top_line1, font_top)
        _, h2 = text_wh(draw, top_line2, font_top)
        mid_heights = [text_wh(draw, s, font_mid)[1] for s in mid_lines]
        _, b1 = text_wh(draw, bottom_line1, font_bottom)
        _, b2 = text_wh(draw, bottom_line2, font_bottom)
        # Compute internal spacings
        top_spacing = int(font_top.size * 0.6)
        # Compute total heights
        top_total    = h1 + top_spacing + h2
        mid_total    = sum(mid_heights) + mid_spacing * (len(mid_heights) - 1)
        bottom_total = b1 + bottom_spacing + b2
        # Required total height including the gap between top and middle sections
        required_height = top_total + gap_top_mid + mid_total + bottom_total
        available_height = hh - 2 * pad_y
        # If it fits, break the loop
        if required_height <= available_height or (top_size <= min_top_size and mid_size <= min_mid_size and bottom_size <= min_bottom_size):
            break
        # Otherwise shrink fonts and spacings
        top_size    = max(min_top_size, int(top_size * shrink_factor))
        mid_size    = max(min_mid_size, int(mid_size * shrink_factor))
        bottom_size = max(min_bottom_size, int(bottom_size * shrink_factor))
        mid_spacing    = max(min_spacing, int(mid_spacing * shrink_factor))
        bottom_spacing = max(min_spacing, int(bottom_spacing * shrink_factor))
        gap_top_mid    = max(min_spacing, int(gap_top_mid * shrink_factor))


    # Жёстко задаём координаты для чисел (raffle, dd, packs)
    # top_y — для верхней секции, bottom_y — для приглашений, mid_y — для чисел
    top_y = y0 + pad_y
    bottom_y = y0 + hh - pad_y - bottom_total
    # Координаты для чисел: задаём вручную
    # Например, пусть первая строка чисел (raffle) всегда на mid_y1, вторая (dd) — mid_y2, третья (packs) — mid_y3
    mid_y1 = y0 + int(hh * 0.30)
    mid_y2 = y0 + int(hh * 0.48)
    mid_y3 = y0 + int(hh * 0.65)

    # X positions: use a fixed left padding inside the panel
    x_text = x0 + pad_x
    xp_dx = 0   # + вправо, - влево
    xp_dy = 0     # + вниз,  - вверх
    # Apply position offsets for each group of text.  These are read from
    # global constants (possibly set via environment variables) and allow
    # the caller to nudge the text blocks horizontally or vertically.  See
    # the definitions of TOP_DX, TOP_DY, MID_DX, MID_DY, INV_DX and INV_DY
    # at the top of the module for details.
    off_top_x = TOP_DX
    off_top_y = TOP_DY
    off_mid_x = MID_DX
    off_mid_y = MID_DY
    off_inv_x = INV_DX
    off_inv_y = INV_DY

    #-----------------------------------------------------------------------
    # Horizontal centring logic for top and invites sections
    #
    # When drawing the level/XP lines and the invites statistics, the sample
    # shows these lines centred horizontally within the content area of the
    # right panel.  To achieve this we compute the width of each line,
    # including the custom letter spacing, and then offset the X position
    # accordingly.  The available width is the width of the panel minus
    # horizontal padding on both sides.  If the text is wider than the
    # available space the calculated offset will be negative, in which case
    # the text will naturally extend to the panel edges.

    # Helper to compute the width of a string when drawn with a given font
    # and letter spacing.  This mirrors the draw_text_with_spacing logic by
    # summing the widths of individual glyphs and inserting the specified
    # letter spacing after non‑whitespace characters.
    def compute_text_width(text: str, font: ImageFont.ImageFont, letter_spacing: float) -> float:
        total = 0.0
        for i, ch in enumerate(text):
            cw, _ = text_wh(draw, ch, font)
            total += cw
            if not ch.isspace() and i < len(text) - 1:
                total += letter_spacing
        return total

    # Determine the width available for centring text.  This is the width of
    # the panel minus the left and right padding.
    avail_w = ww - 2 * pad_x

    # Letter spacing constants for the top and bottom lines.  These mirror
    # the values used when actually drawing the text.  Negative values
    # tighten the spacing.  See the comments above for details.
    letter_spacing_top = -0.15
    letter_spacing_bottom = -0.15

    # Compute widths of the top and bottom lines
    top_w1 = compute_text_width(top_line1, font_top, letter_spacing_top)
    top_w2 = compute_text_width(top_line2, font_top, letter_spacing_top)
    bot_w1 = compute_text_width(bottom_line1, font_bottom, letter_spacing_bottom)
    bot_w2 = compute_text_width(bottom_line2, font_bottom, letter_spacing_bottom)

    # Compute X positions to centre each line within the available width
    # Apply per‑group horizontal padding adjustments (TOP_PAD_X and INV_PAD_X).
    # These allow independent tuning of the left margin for the top (level/XP)
    # and invitations sections.  Without these terms, both groups would use
    # the same base pad_x offset.  TOP_PAD_X shifts the level/XP text, and
    # INV_PAD_X shifts the invitations text.
    x_top1 = x0 + pad_x + TOP_PAD_X + max((avail_w - top_w1) / 2.0, 0) + off_top_x
    x_top2 = x0 + pad_x + TOP_PAD_X + max((avail_w - top_w2) / 1.4, 0) + off_top_x
    x_bot1 = x0 + pad_x + INV_PAD_X + max((avail_w - bot_w1) / 1.7, 0) + off_inv_x
    x_bot2 = x0 + pad_x + INV_PAD_X + max((avail_w - bot_w2) / 2.0, 0) + off_inv_x

    # Draw the top (level/XP) lines at their centred positions.  Use
    # letter_spacing_top for both lines to tighten the glyphs slightly.
    draw_text_with_spacing((x_top1, top_y + off_top_y), top_line1, font_top, TEXTCOL, letter_spacing_top)
    draw_text_with_spacing((x_top2, top_y + h1 + top_spacing + off_top_y), top_line2, font_top, TEXTCOL, letter_spacing_top)

    # Draw the large numeric counters.  Each numeric row can be offset
    # individually via environment variables (RAFFLE_DX/DY, DD_DX/DY,
    # PACK_DX/DY).  These per‑row offsets are applied on top of the
    # MID_DX/MID_DY adjustments.  The X coordinate does not incorporate
    # centring because the numbers align with their icons on the base
    # artwork.
    # Рисуем каждое число на фиксированной координате
    mid_ys = [mid_y1, mid_y2, mid_y3]
    row_offsets_x = [RAFFLE_DX, DD_DX, PACK_DX]
    row_offsets_y = [RAFFLE_DY, DD_DY, PACK_DY]
    for idx, s in enumerate(mid_lines):
        w_s, _ = text_wh(draw, s, font_mid)
        x_anchor = x0 + pad_x + off_mid_x + row_offsets_x[idx]
        x_line = x_anchor - w_s
        y_line = mid_ys[idx] + row_offsets_y[idx]
        draw_text_with_spacing((x_line, y_line), s, font_mid, TEXTCOL, 0)

    # Draw the bottom invites section at its centred positions.  Use
    # letter_spacing_bottom to tighten the text horizontally.  Both lines
    # share the same vertical offsets (off_inv_y) so that they move
    # together when INV_DX/DY are modified.
    draw_text_with_spacing((x_bot1, bottom_y + off_inv_y), bottom_line1, font_bottom, TEXTCOL, letter_spacing_bottom)
    draw_text_with_spacing((x_bot2, bottom_y + b1 + bottom_spacing + off_inv_y), bottom_line2, font_bottom, TEXTCOL, letter_spacing_bottom)

def main():
    if len(sys.argv) < 12:
        print("usage: in out pageStart curLvl lvlFrac xPct widthPct topY topH botY botH "
              "[level xpCur xpNeed premium invites ddTokens raffle]")
        sys.exit(1)

    in_path, out_path = sys.argv[1], sys.argv[2]
    page_start = int(sys.argv[3])
    cur_lvl    = int(sys.argv[4])
    lvl_frac   = float(sys.argv[5])
    xPct       = float(sys.argv[6])
    widthPct   = float(sys.argv[7])
    top_yPct   = float(sys.argv[8])
    top_hPct   = float(sys.argv[9])
    bot_yPct   = float(sys.argv[10])
    bot_hPct   = float(sys.argv[11])

    level = xp_cur = xp_need = premium = invites = dd = raffle = packs = None
    # Если переданы дополнительные аргументы (level, xp_cur, xp_need, premium, invites, dd, raffle, packs)
    if len(sys.argv) >= 20:
        level   = int(sys.argv[12])
        xp_cur  = int(sys.argv[13])
        xp_need = int(sys.argv[14])
        premium = int(sys.argv[15])
        invites = int(sys.argv[16])
        dd      = int(sys.argv[17])
        raffle  = int(sys.argv[18])
        packs   = int(sys.argv[19])

    base = Image.open(in_path).convert('RGBA')
    w, h = base.size

    overlay = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay, 'RGBA')

    bar_x = int(w * xPct / 100.0)
    bar_w = int(w * widthPct / 100.0)

    top_y = int(h * top_yPct / 100.0)
    top_h = max(2, int(h * top_hPct / 100.0))
    bot_y = int(h * bot_yPct / 100.0)
    bot_h = max(2, int(h * bot_hPct / 100.0))

    # Always render the progress bars for pages that have been reached or
    # completed.  Originally bars were drawn only when the current level
    # resided within this page.  By relaxing the condition to
    # `cur_lvl >= page_start`, we ensure that fully completed pages show
    # fully filled bars, and the current page displays the appropriate
    # fractional progress.  Future pages (cur_lvl < page_start) remain
    # empty.
    page_end = page_start + 9
    if cur_lvl >= page_start:
        draw_split_pair_progress(
            overlay, bar_x, bar_w, top_y, top_h,
            band_start=page_start, cur_lvl=cur_lvl, lvl_frac=lvl_frac,
            color_free=TOP_FREE_RGBA, color_prem=TOP_PREM_RGBA
        )
        draw_split_pair_progress(
            overlay, bar_x, bar_w, bot_y, bot_h,
            band_start=page_start + 5, cur_lvl=cur_lvl, lvl_frac=lvl_frac,
            color_free=BOT_FREE_RGBA, color_prem=BOT_PREM_RGBA
        )

    if level is not None:
        draw_info(draw, w, h, level, xp_cur, xp_need, premium, invites, dd, raffle, packs)

    composed = Image.alpha_composite(base, overlay).convert('RGB')
    composed.save(out_path)

if __name__ == "__main__":
    main()
