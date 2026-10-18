# Holotable — batailles de la galaxie

Un jeu de bataille tactique sur plateau hexagonal, dans l'univers Star Wars, qui sert
à deux choses :

- **accompagner une partie de jeu de rôle** : la *Table du MJ* est un plateau libre
  où l'on pose n'importe quel pion (y compris des personnages), où l'on peint le
  terrain, déplace tout à la main, suit les PV et lance les dés ;
- **jouer un jeu de stratégie à part entière** : escarmouches en tour par tour,
  contre l'IA ou à deux, sur des scénarios prêts à jouer ou des batailles générées.

## Lancer le jeu

Le jeu charge ses images depuis `assets/`, il faut donc le servir plutôt que
l'ouvrir en `file://` :

```sh
npx http-server holotable -p 8080   # puis http://localhost:8080
# ou : python3 -m http.server -d holotable 8080
```

Aucune dépendance, aucun build pour jouer en local.

## Contenu

| Faction | Espace | Sol |
|---|---|---|
| Alliance rebelle | X-wing, croiseur Mon Calamari | Soldats rebelles |
| Empire galactique | TIE/ln, Destroyer stellaire | Stormtroopers |
| République galactique | Destroyer Venator* | Clones (6 légions), AT-TE, AT-RT, TX-130 |
| Confédération séparatiste | Vaisseau de contrôle droïde* | Droïdes B1, char AAT |
| Indépendants | Personnage (pion libre) | Personnage (pion libre) |

\* Ces deux vaisseaux viennent de la planche `flotte-capitale.webp`. Tant qu'elle
n'est pas dans `assets/source/`, le jeu les affiche sous forme de jeton (voir plus bas).

Théâtres : espace profond (astéroïdes, nébuleuses), désert, lune forestière, monde glacé.

## Règles en bref

- Chaque camp joue son tour ; chaque unité **se déplace puis tire**, une fois.
- Tir : autant de d6 que l'Attaque, touche sur **4+** (+1 si la cible est à couvert,
  +1 si une arme lourde vise une cible agile). Les **6 sont critiques** : impossibles
  à esquiver. Une cible **blindée** n'est touchée que sur 6, sauf arme perforante.
- Défense : la cible lance ses dés de Défense, chaque 5+ annule une touche normale.
- Victoire par anéantissement, ou aux points à la fin du dernier tour.

Le détail complet, avec le tableau de toutes les unités, est dans le jeu (bouton *Règles*).

## Organisation

| Fichier | Rôle |
|---|---|
| `index.html` | Interface : accueil, plateau SVG, console, table du MJ |
| `engine.js` | Moteur de règles pur (aucun DOM) : données, hexagones, tir, IA |
| `assets/source/` | Planches d'origine (autocollants sur fond blanc) |
| `assets/sprites/` | Pions détourés, générés par `tools/extract_sprites.py` |
| `tools/extract_sprites.py` | Découpe les planches en sprites WebP transparents |
| `tools/build.js` | Produit `dist/holotable/index.html` pour une publication en Artifact |
| `tests/engine.test.js` | Batailles IA contre IA et invariants du moteur |

### Ajouter une planche de pions

1. Déposer l'image dans `assets/source/` (fond blanc, autocollants détourés).
2. Déclarer ses noms de sprites, dans l'ordre de lecture, dans `SHEETS` de
   `tools/extract_sprites.py`, puis lancer `python3 holotable/tools/extract_sprites.py`
   (nécessite numpy, scipy et Pillow).
3. Référencer les sprites dans `TYPES` de `engine.js`.

### Tests

```sh
node holotable/tests/engine.test.js        # 30 parties par scénario
node holotable/tests/engine.test.js 100    # plus de parties, taux de victoire plus fiables
```

Le test affiche le taux de victoire de chaque camp par scénario : un écart
au-delà de 65/35 signale un scénario à rééquilibrer.

La sauvegarde automatique utilise `localStorage` (clé `holotable.v1`). Une table
s'exporte et s'importe en JSON depuis l'onglet *Terrain* de la table du MJ.
