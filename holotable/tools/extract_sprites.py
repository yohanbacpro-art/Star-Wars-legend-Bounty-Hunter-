"""Découpe les planches d'autocollants en sprites WebP transparents.

Chaque planche est un fond blanc portant des autocollants détourés : un liseré
blanc cerclé d'un trait gris. On isole chaque autocollant (composante connexe
de tout ce qui n'est pas le fond), puis on rogne le liseré pour ne garder
qu'un fin bord clair, lisible sur une carte sombre.

Usage : python3 holotable/tools/extract_sprites.py
(depuis la racine du dépôt ; nécessite numpy, scipy et Pillow)
"""
import os

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.normpath(os.path.join(HERE, "..", "assets"))
SOURCE = os.path.join(ASSETS, "source")
OUT = os.path.join(ASSETS, "sprites")

# Ordre de lecture : ligne par ligne, de gauche à droite.
SHEETS = {
    "chasseurs.webp": ["xwing-1", "xwing-2", "xwing-3", "tie-1", "tie-2", "tie-3"],
    "vaisseaux-capitaux.webp": ["destroyer", "moncal"],
    "vehicules.webp": ["atte", "atrt", "tx130", "aat"],
    # Venator, vaisseau de contrôle droïde, second destroyer, croiseur MC80 de profil.
    "flotte-capitale.webp": ["venator", "lucrehulk", "destroyer-2", "moncal-2"],
    "infanterie.webp": (
        [f"storm-{i}" for i in range(1, 7)]
        + [f"rebel-{i}" for i in range(1, 7)]
        + ["clone-501", "clone-212", "clone-coruscant", "clone-327", "clone-41", "clone-187"]
        + [f"b1-{i}" for i in range(1, 7)]
    ),
}

RIM = 5.0       # pixels de liseré retirés depuis le bord extérieur
FEATHER = 1.5   # largeur du fondu de l'alpha
MAX_SIDE = 300  # côté maximal du sprite exporté


def extract(sheet, names):
    img = Image.open(os.path.join(SOURCE, sheet)).convert("RGB")
    rgb = np.asarray(img).astype(np.int16)
    near_white = (rgb.min(axis=2) >= 247)

    # Fond = blanc pur relié au bord de l'image.
    labels, _ = ndimage.label(near_white)
    border = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    background = np.isin(labels, border[border > 0])
    # Le trait gris extérieur n'est pas toujours fermé : le liseré blanc peut
    # alors fuir vers le fond. Une fermeture morphologique recolle le trait à
    # l'illustration, et le remplissage des trous récupère le liseré.
    fg = ndimage.binary_closing(~background, iterations=6)
    fg = ndimage.binary_fill_holes(fg)

    comp, n = ndimage.label(fg)
    sizes = ndimage.sum(np.ones_like(comp), comp, index=np.arange(1, n + 1))
    keep = [i + 1 for i, s in enumerate(sizes) if s > 4000]
    boxes = ndimage.find_objects(comp)
    items = []
    for lab in keep:
        sl = boxes[lab - 1]
        cy = (sl[0].start + sl[0].stop) / 2
        cx = (sl[1].start + sl[1].stop) / 2
        items.append((cy, cx, lab, sl))

    # Regroupe par ligne (centres verticaux proches), puis trie par x.
    items.sort(key=lambda t: t[0])
    rows, cur = [], []
    for it in items:
        if cur and abs(it[0] - cur[-1][0]) > 120:
            rows.append(cur)
            cur = []
        cur.append(it)
    if cur:
        rows.append(cur)
    ordered = [it for row in rows for it in sorted(row, key=lambda t: t[1])]

    if len(ordered) != len(names):
        raise SystemExit(f"{sheet}: {len(ordered)} autocollants trouvés, {len(names)} attendus")

    os.makedirs(OUT, exist_ok=True)
    for (_, _, lab, sl), name in zip(ordered, names):
        pad = 4
        y0, y1 = max(sl[0].start - pad, 0), min(sl[0].stop + pad, rgb.shape[0])
        x0, x1 = max(sl[1].start - pad, 0), min(sl[1].stop + pad, rgb.shape[1])
        mask = ndimage.binary_fill_holes(comp[y0:y1, x0:x1] == lab)
        dist = ndimage.distance_transform_edt(mask)
        alpha = np.clip((dist - RIM) / FEATHER, 0, 1)
        # Recadre sur la partie visible.
        ys, xs = np.nonzero(alpha > 0)
        cy0, cy1, cx0, cx1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        crop = np.asarray(img)[y0:y1, x0:x1][cy0:cy1, cx0:cx1]
        a = (alpha[cy0:cy1, cx0:cx1] * 255).astype(np.uint8)
        rgba = np.dstack([crop, a])
        sprite = Image.fromarray(rgba, "RGBA")
        scale = MAX_SIDE / max(sprite.size)
        if scale < 1:
            sprite = sprite.resize(
                (round(sprite.width * scale), round(sprite.height * scale)), Image.LANCZOS
            )
        sprite.save(os.path.join(OUT, name + ".webp"), quality=86, method=6)
        print(f"{name:18s} {sprite.size}")


if __name__ == "__main__":
    for sheet, names in SHEETS.items():
        if not os.path.exists(os.path.join(SOURCE, sheet)):
            print(f"{sheet} absente de assets/source : planche ignorée")
            continue
        extract(sheet, names)
    # Carte spatiale : simple copie compressée.
    Image.open(os.path.join(SOURCE, "carte-espace.webp")).convert("RGB").save(
        os.path.join(ASSETS, "carte-espace.jpg"), quality=82, optimize=True
    )
