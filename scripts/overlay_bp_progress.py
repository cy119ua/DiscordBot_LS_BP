#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# Оверлей прогресса на странице БП: две полосы (1–5 и 6–10) + правые инфоблоки.
# Особенности:
#  • крупный текст, автоподбор размера под высоту/ширину блока;
#  • перенос по словам (и по символам при очень длинных «словах»);
#  • совместимость с Pillow 10+ (без font.getsize);
#  • загрузка шрифта с кириллицей с автопоиском (Windows/macOS/Linux или assets/fonts),
#    можно задать переменной окружения BP_FONT_PATH.

import os
import sys
from PIL import Image, ImageDraw, ImageFont

def clamp(v, a, b): return max(a, min(b, v))

GREEN   = (0, 200, 100, 178)  # ~70% прозрачность
DIVIDER = (0, 0, 0, 190)      # разделители
TEXTCOL = (0, 0, 0, 255)

# -------------------- ШРИФТ --------------------

def _candidate_font_paths():
    """Список кандидатов для шрифта с кириллицей на разных ОС."""
    here = os.path.abspath(os.path.dirname(__file__))
    proj_root = os.path.abspath(os.path.join(here, ".."))
    candidates = []

    # 1) Явно задан пользователем
    env = os.getenv("BP_FONT_PATH")
    if env:
        candidates.append(env)

    # 2) Внутри проекта (рекомендуется положить сюда DejaVuSans.ttf)
    for nm in [
        os.path.join(proj_root, "assets", "fonts", "DejaVuSans-Bold.ttf"),
        os.path.join(proj_root, "assets", "fonts", "DejaVuSans.ttf"),
        os.path.join(proj_root, "assets", "fonts", "Arial.ttf"),
        "DejaVuSans-Bold.ttf",
        "DejaVuSans.ttf",
        "Arial.ttf",
    ]:
        candidates.append(nm)

    # 3) Windows
    win_fonts = r"C:\Windows\Fonts"
    for nm in ["arial.ttf", "arialbd.ttf", "segoeui.ttf", "tahoma.ttf", "verdana.ttf", "times.ttf"]:
        candidates.append(os.path.join(win_fonts, nm))

    # 4) Linux (часто есть DejaVu)
    for nm in [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
    ]:
        candidates.append(nm)

    # 5) macOS
    for nm in [
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        "/Library/Fonts/Arial Unicode.ttf",
        "/Library/Fonts/Arial.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    ]:
        candidates.append(nm)

    return candidates

def load_font(size):
    """Пытается загрузить TTF с кириллицей. Если не нашёл — load_default()."""
    for path in _candidate_font_paths():
        try:
            if path and os.path.isfile(path):
                return ImageFont.truetype(path, size)
            # В некоторых окружениях Pillow найдёт по одному имени, если шрифт в системном path
            if path and os.path.sep not in path:
                return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()

# -------------------- УТИЛИТЫ ТЕКСТА --------------------

def text_wh(draw, text, font):
    """Размер текста (w, h) — совместимо с Pillow 10+."""
    try:
        l, t, r, b = font.getbbox(text)
        return (r - l, b - t)
    except Exception:
        pass
    try:
        l, t, r, b = draw.textbbox((0, 0), text, font=font)
        return (r - l, b - t)
    except Exception:
        pass
    try:
        return (int(draw.textlength(text, font=font)), getattr(font, 'size', 16))
    except Exception:
        return (len(text) * max(6, getattr(font, 'size', 16) // 2), getattr(font, 'size', 16))

def wrap_line_by_width(draw, line, font, max_w):
    """Перенос строки по словам, при необходимости — по символам."""
    words = line.split(' ')
    out = []
    cur = ''
    for wtok in words:
        test = (cur + ' ' + wtok).strip() if cur else wtok
        if text_wh(draw, test, font)[0] <= max_w:
            cur = test
        else:
            if cur:
                out.append(cur)
            # слово само шире строки — режем по символам
            if text_wh(draw, wtok, font)[0] > max_w:
                piece = ''
                for ch in wtok:
                    t2 = piece + ch
                    if text_wh(draw, t2, font)[0] <= max_w:
                        piece = t2
                    else:
                        if piece: out.append(piece)
                        piece = ch
                if piece: out.append(piece)
                cur = ''
            else:
                cur = wtok
    if cur:
        out.append(cur)
    return out

# -------------------- ПРОГРЕСС-БАНДЫ --------------------

def draw_band(draw, bar_x, bar_w, y, hbar, band_start, cur_lvl, lvl_frac, show_dividers_to_end=False):
    """Рисует одну полосу из 5 уровней."""
    seg_w = bar_w / 5.0

    if cur_lvl < band_start:
        fill_full = 0
        partial = 0.0
        last_divider_idx = 0
    elif cur_lvl > band_start + 4:
        fill_full = 5
        partial = 0.0
        last_divider_idx = 5 if show_dividers_to_end else 4
    else:
        fill_full = cur_lvl - band_start
        partial = clamp(lvl_frac, 0.0, 1.0)
        last_divider_idx = fill_full

    # Полные ячейки
    for i in range(fill_full):
        x0 = int(bar_x + seg_w * i)
        x1 = int(x0 + seg_w)
        draw.rectangle([x0, y, x1, y + hbar], fill=GREEN)

    # Частичная текущая
    if 0 <= fill_full < 5 and partial > 0:
        x0 = int(bar_x + seg_w * fill_full)
        pw = int(seg_w * partial)
        if pw > 0:
            draw.rectangle([x0, y, x0 + pw, y + hbar], fill=GREEN)

    # Разделители
    max_lines = min(4, last_divider_idx)
    for i in range(1, max_lines + 1):
        xi = int(bar_x + seg_w * i)
        draw.line([(xi, y), (xi, y + hbar)], fill=DIVIDER, width=2)

# -------------------- ОСНОВНОЙ РЕНДЕР --------------------

def main():
    """
    Параметры:
      in_path out_path pageStart curLvl lvlFrac xPct widthPct topY topH botY botH
      [level xpCur xpNeed premium invites doubleTokens rafflePoints]
    """
    if len(sys.argv) < 12:
        print("usage: in out pageStart curLvl lvlFrac xPct widthPct topY topH botY botH "
              "[level xpCur xpNeed premium invites doubleTokens rafflePoints]")
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

    # Доп.параметры для инфо-блоков
    player_level = xp_current = xp_needed = premium_flag = None
    invites_count = double_tokens = raffle_points = None
    if len(sys.argv) >= 19:
        try:
            player_level  = int(sys.argv[12])
            xp_current    = int(sys.argv[13])
            xp_needed     = int(sys.argv[14])
            premium_flag  = int(sys.argv[15])
            invites_count = int(sys.argv[16])
            double_tokens = int(sys.argv[17])
            raffle_points = int(sys.argv[18])
        except Exception:
            player_level = None

    img = Image.open(in_path).convert('RGBA')
    w, h = img.size
    draw = ImageDraw.Draw(img, 'RGBA')

    # Геометрия полос
    bar_x = int(w * xPct / 100.0)
    bar_w = int(w * widthPct / 100.0)
    top_y = int(h * top_yPct / 100.0)
    top_h = max(2, int(h * top_hPct / 100.0))
    bot_y = int(h * bot_yPct / 100.0)
    bot_h = max(2, int(h * bot_hPct / 100.0))

    page_end = page_start + 9
    if page_start <= cur_lvl <= page_end:
        draw_band(draw, bar_x, bar_w, top_y, top_h,
                  page_start, cur_lvl, lvl_frac,
                  show_dividers_to_end=(cur_lvl > page_start + 4))
        draw_band(draw, bar_x, bar_w, bot_y, bot_h,
                  page_start + 5, cur_lvl, lvl_frac, show_dividers_to_end=False)

    if player_level is not None:
        _draw_info_blocks(draw, w, h, player_level, xp_current, xp_needed,
                          premium_flag, invites_count, double_tokens, raffle_points)

    img.save(out_path)

# -------------------- ИНФОБЛОКИ --------------------

def _draw_info_blocks(draw: ImageDraw.Draw, w: int, h: int,
                      player_level: int, xp_current: int, xp_needed: int,
                      premium_flag: int, invites: int, double_tokens: int, raffle_points: int):

    # Текст
    try:
        xp_left = int(max(0, (xp_needed or 0) - (xp_current or 0)))
    except Exception:
        xp_left = 0
    status_text = 'Премиум' if premium_flag else 'Фри'

    blue_lines_raw = [
        f'Уровень: {player_level}',
        f'До след.: {xp_left}',
        f'Статус: {status_text}',
    ]
    red_lines_raw = [
        f'Приглашения: {invites}',
        f'Двойные ставки: {double_tokens}',
        f'Очки розыгрыша: {raffle_points}',
    ]

    # Позиции блоков (под ваш макет)
    blue_x_pct = 84.8; blue_w_pct = 13.9; blue_y_pct = 6.0;  blue_h_pct = 42.0
    red_x_pct  = 84.8; red_w_pct  = 13.9; red_y_pct  = 52.0; red_h_pct  = 42.0

    bx0 = int(w * blue_x_pct / 100.0); bw = int(w * blue_w_pct / 100.0)
    by0 = int(h * blue_y_pct / 100.0); bh = int(h * blue_h_pct / 100.0)
    rx0 = int(w * red_x_pct  / 100.0); rw = int(w * red_w_pct  / 100.0)
    ry0 = int(h * red_y_pct  / 100.0); rh = int(h * red_h_pct  / 100.0)

    # Внутренние отступы
    pad_x = max(6, int(bw * 0.06))
    pad_y = max(6, int(bh * 0.06))

    # Функция отрисовки блока с подбором максимального шрифта
    def draw_block(lines_raw, x0, y0, w_box, h_box):
        # стартуем с достаточно большого размера — около 24% высоты блока
        start_size = max(18, int(h_box * 0.24))

        # Подготовим функцию оценки высоты всего текста при данном размере
        def evaluate(font):
            wrapped = []
            for ln in lines_raw:
                wrapped.extend(wrap_line_by_width(draw, ln, font, w_box - 2 * pad_x))
            line_hs = [text_wh(draw, ln, font)[1] for ln in wrapped]
            spacing = int(getattr(font, 'size', 16) * 0.32)
            total_h = sum(line_hs) + (len(line_hs) - 1) * spacing
            return wrapped, line_hs, spacing, total_h

        # Найти реальный TTF (с кириллицей) под данный размер
        def mkfont(sz):
            f = load_font(sz)
            # проставим .path, если знаем, чтобы далее можно было переинициализировать
            if not hasattr(f, "path"):
                # Попробуем восстановить путь через кандидатов
                for p in _candidate_font_paths():
                    try:
                        if p and os.path.isfile(p):
                            f2 = ImageFont.truetype(p, sz)
                            f2.path = p
                            return f2
                    except Exception:
                        continue
            return f

        font = mkfont(start_size)
        wrapped, line_hs, spacing, total_h = evaluate(font)

        # Если не помещается по высоте — уменьшаем до тех пор, пока не влезет
        attempts = 0
        while total_h > h_box - 2 * pad_y and attempts < 10:
            new_sz = max(10, int(getattr(font, 'size', 16) * 0.9))
            if hasattr(font, "path"):
                try:
                    font = ImageFont.truetype(font.path, new_sz)
                except Exception:
                    font = load_font(new_sz)
            else:
                font = load_font(new_sz)
            wrapped, line_hs, spacing, total_h = evaluate(font)
            attempts += 1

        # Рисуем сверху блока (чтобы текст был крупнее и читаемее), по центру по горизонтали
        y = y0 + pad_y
        for ln, lh in zip(wrapped, line_hs):
            lw, _ = text_wh(draw, ln, font)
            lx = x0 + max(pad_x, (w_box - lw) // 2)
            draw.text((lx, y), ln, fill=TEXTCOL, font=font)
            y += lh + spacing

    draw_block(blue_lines_raw, bx0, by0, bw, bh)
    draw_block(red_lines_raw,  rx0, ry0, rw, rh)

# -------------------- ТОЧКА ВХОДА --------------------

if __name__ == "__main__":
    main()
