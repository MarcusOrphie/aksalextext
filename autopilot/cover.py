# -*- coding: utf-8 -*-
"""Генерация обложки статьи в стиле Залихват на PIL (без Chrome). 1280x720 -> jpg."""
import os, math
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OSWALD = os.path.join(HERE, "assets", "Oswald.ttf")

PAPER = (250, 245, 236)
INK = (21, 18, 16)
CORAL = (255, 127, 80)
CORAL_DEEP = (232, 95, 44)
MUTED = (123, 113, 104)
DOT = (251, 229, 214)
W, H = 1280, 720

def _font(size, weight=700):
    f = ImageFont.truetype(OSWALD, size)
    try:
        f.set_variation_by_axes([weight])
    except Exception:
        pass
    return f

def _tracked(draw, xy, text, font, fill, tracking):
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        x += draw.textlength(ch, font=font) + tracking
    return x

def _tracked_width(draw, text, font, tracking):
    return sum(draw.textlength(ch, font=font) + tracking for ch in text) - tracking

def _sparkle(d, cx, cy, r, fill):
    ir = r * 0.30
    d.polygon([(cx, cy - r), (cx + ir, cy - ir), (cx + r, cy), (cx + ir, cy + ir),
               (cx, cy + r), (cx - ir, cy + ir), (cx - r, cy), (cx - ir, cy - ir)], fill=fill)

def _star(d, cx, cy, r, fill):
    pts = []
    for i in range(10):
        ang = -math.pi / 2 + i * math.pi / 5
        rr = r if i % 2 == 0 else r * 0.42
        pts.append((cx + rr * math.cos(ang), cy + rr * math.sin(ang)))
    d.polygon(pts, fill=fill)

def _plus(d, cx, cy, r, fill):
    t = max(3, r // 3)
    d.rounded_rectangle([cx - t / 2, cy - r, cx + t / 2, cy + r], radius=t / 2, fill=fill)
    d.rounded_rectangle([cx - r, cy - t / 2, cx + r, cy + t / 2], radius=t / 2, fill=fill)

def _wrap(draw, text, font, maxw):
    words = text.split()
    lines, cur = [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=font) <= maxw or not cur:
            cur = t
        else:
            lines.append(cur); cur = w
    if cur:
        lines.append(cur)
    return lines

def make_cover(title, tag, out_jpg, lang="ru"):
    title = (title or "").upper().strip()
    tag = (tag or ("AI · BLOG" if lang == "en" else "Нейросети · блог")).upper().strip()
    brand = "ZALIHVAT" if lang == "en" else "ЗАЛИХВАТ"
    glyph = "Z" if lang == "en" else "З"
    img = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(img)

    # халфтон
    for yy in range(20, H, 22):
        for xx in range(20, W, 22):
            d.ellipse([xx - 1.4, yy - 1.4, xx + 1.4, yy + 1.4], fill=DOT)

    # рамка
    d.rounded_rectangle([30, 30, W - 30, H - 30], radius=30, outline=INK, width=5)

    # дудлы (векторные)
    _sparkle(d, W - 120, 98, 27, CORAL)
    _plus(d, W - 196, 172, 16, INK)
    _star(d, W - 128, H - 152, 27, INK)

    x = 100
    maxw = 1010
    # размер заголовка по длине + ужатие под ширину
    n = len(title)
    size = 104 if n <= 13 else (78 if n <= 22 else 58)
    while size >= 40:
        tf = _font(size, 700)
        lines = _wrap(d, title, tf, maxw)
        if len(lines) <= 3 and all(d.textlength(l, font=tf) <= maxw for l in lines):
            break
        size -= 6
    tf = _font(size, 700)
    lines = _wrap(d, title, tf, maxw)
    lh = int(size * 1.0)
    stroke = 4 if size >= 70 else 3
    shadow = 7 if size >= 70 else 6

    ef = _font(24, 600)
    eh = 30
    block_h = eh + 28 + lh * len(lines)
    top = max(90, (H - block_h) // 2 - 26)

    # eyebrow
    _tracked(d, (x, top), tag, ef, CORAL_DEEP, 5)

    # заголовок: тень (ink) + заливка (coral) с обводкой ink
    ty = top + eh + 28
    for i, line in enumerate(lines):
        yy = ty + i * lh
        d.text((x + shadow, yy + shadow), line, font=tf, fill=INK,
               stroke_width=stroke, stroke_fill=INK)
        d.text((x, yy), line, font=tf, fill=CORAL, stroke_width=stroke, stroke_fill=INK)

    # брендмарк снизу
    bx, by = 100, H - 100
    d.ellipse([bx + 3, by + 3, bx + 49, by + 49], fill=INK)         # тень
    d.ellipse([bx, by, bx + 46, by + 46], fill=CORAL, outline=INK, width=3)
    zf = _font(26, 700)
    zb = d.textbbox((0, 0), glyph, font=zf)
    d.text((bx + 23 - (zb[2] - zb[0]) / 2, by + 23 - (zb[3] - zb[1]) / 2 - zb[1]),
           glyph, font=zf, fill=PAPER)
    nf = _font(27, 700)
    nx = bx + 60
    d.text((nx, by + 8), brand, font=nf, fill=INK)
    nw = d.textlength(brand, font=nf)
    d.text((nx + nw + 10, by + 11), "· AKSALEX.COM", font=_font(21, 600), fill=MUTED)

    img.save(out_jpg, "JPEG", quality=88, optimize=True)
    return out_jpg

if __name__ == "__main__":
    import sys
    make_cover(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "Нейросети · гайд",
               sys.argv[3] if len(sys.argv) > 3 else "cover_test.jpg")
    print("ok")
