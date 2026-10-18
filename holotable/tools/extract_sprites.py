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
    "infanterie.webp": (
        [f"storm-{i}" for i in range(1, 7)]
        + [f"rebel-{i}" for i in range(1, 7)]
        + ["clone-501", "clone-212", "clone-coruscant", "clone-327", "clone-41", "clone-187"]
        + [f"b1-{i}" for i in range(1, 7)]
    ),
    "casques-mandaloriens.webp": ["mando-rouge", "mando-vert", "mando-bleu", "mando-acier"],
    "mercenaires.webp": ["gamorreen-1", "gamorreen-2", "trando-1", "trando-2",
                         "commando-1", "commando-2", "chasseur-1", "chasseur-2"],
    "droides.webp": [f"b2-{i}" for i in range(1, 5)] + [f"droideka-{i}" for i in range(1, 5)],
    "force.webp": ["jedi-1", "jedi-2", "sith-1", "sith-2"],
    "flotte-pegre.webp": ["hutt", "yacht", "pirate", "canonniere"],
    "marcheurs.webp": ["atte-2", "atst", "atdp", "atap"],
    "flotte-mandalorienne.webp": ["mando-cuirasse", "mando-destroyer", "mando-porteur", "fang"],
    "flotte-clones.webp": ["venator", "arquitens", "recusant", "munificent"],
    "grands-vaisseaux.webp": ["victory", "executor", "moncal-2", "nebulon"],
}

RIM = 5.0       # pixels de liseré retirés depuis le bord extérieur
# Planches au liseré plus large que la moyenne.
SHEET_RIM = {"droides.webp": 11.0}
FEATHER = 1.5   # largeur du fondu de l'alpha
MAX_SIDE = 400  # côté maximal du sprite exporté


def find_stickers(fg):
    """Composantes assez grandes pour être des autocollants, en ordre de lecture."""
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
    return comp, [it for row in rows for it in sorted(row, key=lambda t: t[1])]


def extract(sheet, names):
    img = Image.open(os.path.join(SOURCE, sheet)).convert("RGB")
    rgb = np.asarray(img).astype(np.int16)
    # Fond = blanc relié au bord de l'image. Le trait gris extérieur n'est pas
    # toujours fermé : le liseré blanc peut alors fuir vers le fond. Une
    # fermeture morphologique recolle le trait à l'illustration, et le
    # remplissage des trous récupère le liseré. Sur une planche serrée, une
    # fermeture trop forte soude deux autocollants voisins : on la réduit
    # jusqu'à retrouver le bon nombre d'autocollants. En dernier recours, on
    # traite aussi le liseré comme du fond (seuil plus bas) : les autocollants
    # qui se touchent par leur liseré se séparent, et il n'y a plus rien à rogner.
    found = None
    base_rim = SHEET_RIM.get(sheet, RIM)
    for threshold, rim in ((247, base_rim), (230, 1.0)):
        labels, _ = ndimage.label(rgb.min(axis=2) >= threshold)
        border = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
        background = np.isin(labels, border[border > 0])
        for closing in (6, 3, 1, 0):
            fg = ~background
            if closing:
                fg = ndimage.binary_closing(fg, iterations=closing)
            fg = ndimage.binary_fill_holes(fg)
            comp, ordered = find_stickers(fg)
            if len(ordered) == len(names):
                found = (comp, ordered, rim)
                break
        if found:
            break
    if not found:
        # Deux autocollants soudés par un détail qui dépasse (la lueur d'un
        # sabre laser…) : on coupe le plus large là où il est le plus mince.
        labels, _ = ndimage.label(rgb.min(axis=2) >= 247)
        border = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
        fg = ndimage.binary_fill_holes(ndimage.binary_closing(~np.isin(labels, border[border > 0]), iterations=6))
        comp, ordered = find_stickers(fg)
        while len(ordered) < len(names):
            _, _, lab, sl = max(ordered, key=lambda t: t[3][1].stop - t[3][1].start)
            cols = (comp[sl] == lab).sum(axis=0)
            w = len(cols)
            cut = sl[1].start + w // 4 + int(np.argmin(cols[w // 4: 3 * w // 4]))
            fg[sl[0], cut - 1:cut + 2] = False
            comp, ordered = find_stickers(fg)
        if len(ordered) != len(names):
            raise SystemExit(f"{sheet}: {len(ordered)} autocollants trouvés, {len(names)} attendus")
        found = (comp, ordered, base_rim)
    comp, ordered, rim = found

    os.makedirs(OUT, exist_ok=True)
    for (_, _, lab, sl), name in zip(ordered, names):
        pad = 4
        y0, y1 = max(sl[0].start - pad, 0), min(sl[0].stop + pad, rgb.shape[0])
        x0, x1 = max(sl[1].start - pad, 0), min(sl[1].stop + pad, rgb.shape[1])
        mask = ndimage.binary_fill_holes(comp[y0:y1, x0:x1] == lab)
        dist = ndimage.distance_transform_edt(mask)
        alpha = np.clip((dist - rim) / FEATHER, 0, 1)
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
