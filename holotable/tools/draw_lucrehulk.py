"""Dessine le sprite du vaisseau de contrôle droïde (cargo Lucrehulk).

Pion de remplacement : la planche d'origine n'a pas pu être récupérée. Vu de
dessus, comme les autres vaisseaux : un anneau segmenté hérissé de tourelles,
une sphère centrale reliée par des rayons, et l'axe des baies d'amarrage qui
traverse l'anneau. Si la planche arrive un jour, il suffit de l'ajouter à
SHEETS dans extract_sprites.py : son sprite remplacera celui-ci.

Usage : python3 holotable/tools/draw_lucrehulk.py
"""
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "sprites", "lucrehulk.webp"))

S = 1600            # dessin en grand, réduit à la fin pour l'anticrénelage
C = S / 2
R_OUT, R_IN = 640, 430
HULL = (150, 152, 156)
HULL_DARK = (92, 94, 99)
LINE = (60, 62, 66)
PANEL = (104, 116, 142)


def ring_mask(r_out, r_in):
    m = Image.new("L", (S, S), 0)
    d = ImageDraw.Draw(m)
    d.ellipse([C - r_out, C - r_out, C + r_out, C + r_out], fill=255)
    d.ellipse([C - r_in, C - r_in, C + r_in, C + r_in], fill=0)
    return m


def polar(r, deg):
    a = math.radians(deg - 90)
    return C + r * math.cos(a), C + r * math.sin(a)


def main():
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Tourelles et antennes autour de l'anneau.
    for k in range(16):
        deg = k * 22.5 + 11.25
        x0, y0 = polar(R_OUT - 20, deg)
        x1, y1 = polar(R_OUT + 85, deg)
        d.line([x0, y0, x1, y1], fill=HULL_DARK, width=34)
        d.line([x0, y0, x1, y1], fill=(120, 122, 128), width=16)
        bx, by = polar(R_OUT + 40, deg)
        d.ellipse([bx - 26, by - 26, bx + 26, by + 26], fill=HULL_DARK, outline=LINE, width=4)

    # Anneau : coque, reliefs concentriques et panneaux bleutés.
    ring = Image.new("RGBA", (S, S), HULL + (255,))
    rd = ImageDraw.Draw(ring)
    for r, col in ((R_OUT, (132, 134, 139)), (R_OUT - 40, (158, 160, 165)), (R_OUT - 150, (146, 148, 153)), (R_IN + 40, (125, 127, 132))):
        rd.ellipse([C - r, C - r, C + r, C + r], fill=col)
    for k in range(4):
        start = k * 90 + 18
        rd.pieslice([C - R_OUT + 55, C - R_OUT + 55, C + R_OUT - 55, C + R_OUT - 55], start - 90, start - 90 + 28, fill=PANEL)
        rd.pieslice([C - R_OUT + 55, C - R_OUT + 55, C + R_OUT - 55, C + R_OUT - 55], start + 26, start + 54, fill=PANEL)
    rd.ellipse([C - R_IN - 70, C - R_IN - 70, C + R_IN + 70, C + R_IN + 70], fill=(140, 142, 147))
    for k in range(48):
        deg = k * 7.5
        rd.line([*polar(R_IN, deg), *polar(R_OUT, deg)], fill=LINE, width=3 if k % 2 else 6)
    for r in (R_IN + 70, R_OUT - 55, R_OUT - 150):
        rd.ellipse([C - r, C - r, C + r, C + r], outline=LINE, width=4)
    img.paste(ring, (0, 0), ring_mask(R_OUT, R_IN))
    d.ellipse([C - R_OUT, C - R_OUT, C + R_OUT, C + R_OUT], outline=(40, 42, 46), width=10)
    d.ellipse([C - R_IN, C - R_IN, C + R_IN, C + R_IN], outline=(40, 42, 46), width=10)

    # Superstructures : petits blocs semés sur l'anneau.
    rnd = np.random.default_rng(3)
    for _ in range(140):
        deg = rnd.uniform(0, 360)
        r = rnd.uniform(R_IN + 25, R_OUT - 25)
        x, y = polar(r, deg)
        w, h = rnd.uniform(8, 26), rnd.uniform(6, 18)
        col = (78, 80, 85) if rnd.random() < 0.6 else (176, 178, 182)
        d.rectangle([x - w, y - h, x + w, y + h], fill=col, outline=(48, 50, 54), width=2)

    # Rayons entre l'anneau et la sphère.
    for k in range(8):
        deg = k * 45 + 22.5
        d.line([*polar(150, deg), *polar(R_IN + 5, deg)], fill=(40, 42, 46), width=46)
        d.line([*polar(150, deg), *polar(R_IN + 5, deg)], fill=(118, 120, 126), width=28)

    # Axe des baies d'amarrage, du haut au bas de l'anneau.
    for x0, x1, col in ((C - 78, C + 78, (40, 42, 46)), (C - 66, C + 66, (128, 130, 135)), (C - 30, C + 30, (150, 152, 157))):
        d.rectangle([x0, C - R_OUT - 110, x1, C + R_OUT + 110], fill=col)
    for y in range(int(C - R_OUT - 90), int(C + R_OUT + 100), 60):
        d.line([C - 66, y, C + 66, y], fill=LINE, width=4)
        d.rectangle([C - 52, y + 14, C - 30, y + 36], fill=HULL_DARK)
        d.rectangle([C + 30, y + 14, C + 52, y + 36], fill=HULL_DARK)
    d.rectangle([C - 40, C - R_OUT - 170, C + 40, C - R_OUT - 100], fill=HULL_DARK, outline=(40, 42, 46), width=6)
    d.rectangle([C - 40, C + R_OUT + 100, C + 40, C + R_OUT + 170], fill=HULL_DARK, outline=(40, 42, 46), width=6)
    # Bras horizontaux de la sphère.
    d.rectangle([C - R_IN - 20, C - 48, C + R_IN + 20, C + 48], fill=(40, 42, 46))
    d.rectangle([C - R_IN - 10, C - 36, C + R_IN + 10, C + 36], fill=(126, 128, 133))

    # Sphère centrale, éclairée en haut à gauche.
    for i in range(60):
        r = 190 - i * 2.6
        off = i * 1.1
        shade = int(96 + i * 1.6)
        d.ellipse([C - r - off, C - r - off, C + r - off, C + r - off], fill=(shade, shade + 2, shade + 6))
    d.ellipse([C - 190, C - 190, C + 190, C + 190], outline=(40, 42, 46), width=8)
    d.line([C - 190, C, C + 190, C], fill=LINE, width=5)
    d.line([C, C - 190, C, C + 190], fill=LINE, width=5)
    d.rectangle([C - 34, C - 34, C + 34, C + 34], fill=HULL_DARK, outline=(40, 42, 46), width=5)

    # Grain d'usure, comme sur les illustrations peintes, et lumière venue
    # du haut à gauche.
    arr = np.asarray(img).astype(np.int16)
    yy, xx = np.mgrid[0:S, 0:S]
    light = 1.18 - 0.36 * (xx + yy) / (2 * S)
    arr[..., :3] = np.clip(arr[..., :3] * light[..., None], 0, 255).astype(np.int16)
    rng = np.random.default_rng(7)
    noise = rng.normal(0, 9, arr.shape[:2])
    noise = ndimage.gaussian_filter(noise, 1.2)[..., None]
    arr[..., :3] = np.clip(arr[..., :3] + noise, 0, 255)
    img = Image.fromarray(arr.astype(np.uint8), "RGBA")

    # Fin liseré clair, comme les autocollants découpés.
    alpha = np.asarray(img)[..., 3] > 0
    halo = ndimage.binary_dilation(alpha, iterations=14)
    rim = Image.new("RGBA", (S, S), (236, 238, 240, 0))
    rim.putalpha(Image.fromarray((halo * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2)))
    out = Image.alpha_composite(rim, img)

    bbox = out.getbbox()
    out = out.crop(bbox).resize((400, round(400 * (bbox[3] - bbox[1]) / (bbox[2] - bbox[0]))), Image.LANCZOS)
    out.save(OUT, quality=88, method=6)
    print("écrit", OUT, out.size)


if __name__ == "__main__":
    main()
