#!/usr/bin/env python3
# Оверлей прогресса на странице: две полосы (1–5 и 6–10).
# Рисуем:
#  • зелёной полупрозрачной заливкой (≈70%) все уже полученные уровни;
#  • частично — текущий уровень;
#  • чёрные деления только до текущего уровня;
#  • без фоновой подложки.

from PIL import Image, ImageDraw
import sys

def clamp(v,a,b): return max(a, min(b, v))

GREEN = (0, 200, 100, 178)  # ~70% прозрачность
DIVIDER = (0, 0, 0, 190)    # разделители

def draw_band(draw, bar_x, bar_w, y, hbar, band_start, cur_lvl, lvl_frac, show_dividers_to_end=False):
    """
    Рисует одну полосу из 5 уровней, начиная с band_start (band_start..band_start+4).
    Показывает:
      - зелёный full-fill для прошлых уровней этой полосы,
      - зелёный partial-fill для текущего уровня (если он в полосе),
      - разделители только до текущего уровня (или до конца, если show_dividers_to_end=True).
    """
    seg_w = bar_w / 5.0

    if cur_lvl < band_start:
        # пользователю ещё рано — ничего не закрашиваем, разделителей нет
        fill_full = 0
        partial = 0.0
        last_divider_idx = 0
    elif cur_lvl > band_start + 4:
        # вся полоса позади — 5 полных ячеек, разделители все 4
        fill_full = 5
        partial = 0.0
        last_divider_idx = 5 if show_dividers_to_end else 4  # 4 линии между 5 ячейками
    else:
        # текущий в этой полосе
        fill_full = cur_lvl - band_start           # 0..4
        partial = clamp(lvl_frac, 0.0, 1.0)        # 0..1
        last_divider_idx = fill_full               # линии только до текущей ячейки

    # 1) Полные зелёные ячейки
    for i in range(fill_full):
        x0 = int(bar_x + seg_w * i)
        x1 = int(x0 + seg_w)
        draw.rectangle([x0, y, x1, y + hbar], fill=GREEN)

    # 2) Частичная заливка текущей ячейки (если текущий в этой полосе)
    if 0 <= fill_full < 5 and partial > 0:
        x0 = int(bar_x + seg_w * fill_full)
        pw = int(seg_w * partial)
        if pw > 0:
            draw.rectangle([x0, y, x0 + pw, y + hbar], fill=GREEN)

    # 3) Разделители (только до текущего уровня)
    # Между 5 ячейками — 4 линии: после 1-й, 2-й, 3-й, 4-й.
    # last_divider_idx = сколько границ показать (макс 4).
    max_lines = min(4, last_divider_idx)
    for i in range(1, max_lines + 1):
        xi = int(bar_x + seg_w * i)
        draw.line([(xi, y), (xi, y + hbar)], fill=DIVIDER, width=2)

def main():
    # args:
    #  1 in_path, 2 out_path,
    #  3 page_start_level (1, 11, 21, ...),
    #  4 current_level (1..100),
    #  5 level_fraction (0..1, доля внутри текущего уровня),
    #  6 xPct, 7 widthPct,
    #  8 top_yPct, 9 top_hPct,
    # 10 bottom_yPct, 11 bottom_hPct
    if len(sys.argv) < 12:
        print("usage: in out pageStart curLvl lvlFrac xPct widthPct topY topH botY botH")
        sys.exit(1)

    in_path, out_path = sys.argv[1], sys.argv[2]
    page_start = int(sys.argv[3])       # 1, 11, 21, ...
    cur_lvl    = int(sys.argv[4])       # 1..100
    lvl_frac   = float(sys.argv[5])     # 0..1

    xPct       = float(sys.argv[6])
    widthPct   = float(sys.argv[7])
    top_yPct   = float(sys.argv[8])
    top_hPct   = float(sys.argv[9])
    bot_yPct   = float(sys.argv[10])
    bot_hPct   = float(sys.argv[11])

    img = Image.open(in_path).convert('RGBA')
    w, h = img.size
    draw = ImageDraw.Draw(img, 'RGBA')

    # Геометрия полос в пикселях
    bar_x  = int(w * xPct / 100.0)
    bar_w  = int(w * widthPct / 100.0)
    top_y  = int(h * top_yPct / 100.0)
    top_h  = max(2, int(h * top_hPct / 100.0))
    bot_y  = int(h * bot_yPct / 100.0)
    bot_h  = max(2, int(h * bot_hPct / 100.0))

    # Если текущий уровень не на этой странице — просто сохранить исходник
    page_end = page_start + 9
    if cur_lvl < page_start or cur_lvl > page_end:
        img.save(out_path)
        return

    # Диапазоны полос
    top_start = page_start
    top_end   = page_start + 4
    bot_start = page_start + 5
    bot_end   = page_start + 9

    # ВЕРХНЯЯ ПОЛОСА (1–5):
    # Если текущий уровень в нижней полосе, верхняя должна быть полностью зелёной (все 5),
    # и разделители все видны.
    top_show_all = cur_lvl > top_end
    draw_band(
        draw,
        bar_x, bar_w,
        top_y, top_h,
        top_start,
        cur_lvl, lvl_frac,
        show_dividers_to_end=top_show_all
    )

    # НИЖНЯЯ ПОЛОСА (6–10):
    # Если текущий в нижней — рисуем пройденные и частичный текущий;
    # если текущий в верхней — нижняя не закрашивается.
    draw_band(
        draw,
        bar_x, bar_w,
        bot_y, bot_h,
        bot_start,
        cur_lvl, lvl_frac,
        show_dividers_to_end=False  # в нижней показываем деления только до текущего
    )

    img.save(out_path)

if __name__ == "__main__":
    main()
