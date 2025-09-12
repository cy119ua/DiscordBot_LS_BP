#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import os, sys
from PIL import Image, ImageDraw, ImageFont

GREEN   = (0, 200, 100, 170)  # полупрозрачный
TEXTCOL = (25, 25, 25, 255)

def clamp(v, a, b): return max(a, min(b, v))

def load_font(size):
    # универсальная загрузка без падений
    candidates = [
        "assets/fonts/DejaVuSans-Bold.ttf",
        "assets/fonts/DejaVuSans.ttf",
        "assets/fonts/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
        "Arial.ttf","DejaVuSans.ttf","DejaVuSans-Bold.ttf",
        r"C:\Windows\Fonts\arial.ttf", r"C:\Windows\Fonts\arialbd.ttf",
        r"C:\Windows\Fonts\segoeui.ttf", r"C:\Windows\Fonts\tahoma.ttf"
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

def draw_band(draw, bar_x, bar_w, y, hbar, band_start, cur_lvl, lvl_frac):
    """Полоса поверх 5 ячеек ряда: заполняет высоту,
    скруглённые концы, не выходит за рамки."""
    # внутренний отступ ~3% высоты, чтобы точно не задевать рамку
    pad = max(2, int(hbar * 0.03))
    x0 = int(bar_x) + pad
    x_max = int(bar_x + bar_w) - pad
    y0 = int(y) + pad
    y1 = int(y + hbar) - pad
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

    x1 = int(x0 + seg_w * total_units + 0.5)
    if x1 > x_max: x1 = x_max

    radius = max(2, int((y1 - y0) / 2))
    _rounded_rect(draw, [x0, y0, x1, y1], radius, GREEN)

def draw_info(draw, w, h, level, xp_cur, xp_need, is_premium, invites, dd_tokens, raffle):
    """Информация в правом фиолетовом прямоугольнике (без переносов)."""
    # Подогнано под макет 16:9. Эти проценты можно тонко подкрутить.
    panel_x_pct, panel_w_pct = 76.8, 20.2
    panel_y_pct, panel_h_pct = 7.5, 85.0

    x0 = int(w * panel_x_pct / 100.0)
    y0 = int(h * panel_y_pct / 100.0)
    ww = int(w * panel_w_pct / 100.0)
    hh = int(h * panel_h_pct / 100.0)

    # поля внутри панели
    pad_x = max(14, int(ww * 0.08))
    pad_y = max(14, int(hh * 0.08))

    lines = [
        f"Уровень: {level}",
        f"До след.: {max(0, (xp_need or 0) - (xp_cur or 0))}",
        f"Статус: {'Премиум' if is_premium else 'Фри'}",
        "",
        f"Приглашения: {invites}",
        f"Двойные ставки: {dd_tokens}",
        f"Очки розыгрыша: {raffle}",
    ]

    # Стартовый размер крупнее, затем уменьшаем пока всё не влезет
    size = max(22, int(hh * 0.10))
    font = load_font(size)
    spacing = int(size * 0.35)

    def fits(fnt):
        max_w = max(text_wh(draw, ln, fnt)[0] for ln in lines)
        total_h = sum(text_wh(draw, ln, fnt)[1] for ln in lines) + spacing * (len(lines)-1)
        return max_w <= (ww - 2*pad_x) and total_h <= (hh - 2*pad_y)

    guard = 0
    while not fits(font) and guard < 25:
        size = max(16, int(size * 0.92))
        font = load_font(size)
        spacing = int(size * 0.33)
        guard += 1

    # Выводим
    y = y0 + pad_y
    for ln in lines:
        lw, lh = text_wh(draw, ln, font)
        draw.text((x0 + pad_x, y), ln, fill=TEXTCOL, font=font)
        y += lh + spacing

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

    level = xp_cur = xp_need = premium = invites = dd = raffle = None
    if len(sys.argv) >= 19:
        level   = int(sys.argv[12])
        xp_cur  = int(sys.argv[13])
        xp_need = int(sys.argv[14])
        premium = int(sys.argv[15])
        invites = int(sys.argv[16])
        dd      = int(sys.argv[17])
        raffle  = int(sys.argv[18])

    from PIL import Image
    img = Image.open(in_path).convert('RGBA')
    w, h = img.size
    draw = ImageDraw.Draw(img, 'RGBA')

    bar_x = int(w * xPct / 100.0)
    bar_w = int(w * widthPct / 100.0)

    top_y = int(h * top_yPct / 100.0)
    top_h = max(2, int(h * top_hPct / 100.0))
    bot_y = int(h * bot_yPct / 100.0)
    bot_h = max(2, int(h * bot_hPct / 100.0))

    page_end = page_start + 9
    if page_start <= cur_lvl <= page_end:
        draw_band(draw, bar_x, bar_w, top_y, top_h, page_start, cur_lvl, lvl_frac)
        draw_band(draw, bar_x, bar_w, bot_y, bot_h, page_start + 5, cur_lvl, lvl_frac)

    if level is not None:
        draw_info(draw, w, h, level, xp_cur, xp_need, premium, invites, dd, raffle)

    img.save(out_path)

if __name__ == "__main__":
    main()