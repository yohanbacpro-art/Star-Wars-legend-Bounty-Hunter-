# Holotable — batailles de la galaxie

Un jeu de bataille tactique sur plateau hexagonal, dans l'univers Star Wars, qui sert
à deux choses :

- **accompagner une partie de jeu de rôle** : la *Table du MJ* est un plateau libre
  où l'on pose n'importe quel pion (y compris des personnages), où l'on peint le
  terrain, déplace tout à la main, suit les PV et lance les dés ;
- **jouer un jeu de stratégie à part entière** : escarmouches en tour par tour,
  contre l'IA ou à deux, sur des scénarios prêts à jouer ou composées dans le
  *bac à sable* (armées unité par unité, factions mélangées, déploiement
  automatique ou à la main), enregistrées dans *Mes batailles*.

La **note de bataille** fait le lien avec la partie de JDR : on y colle le passage
où le combat éclate, et le jeu en tire les deux camps, les effectifs, les noms et les
caractéristiques des personnages (PV restants compris), puis lance la bataille après
un aperçu. Deux lectures :

- **par Claude**, pour un récit libre, dans la version publiée sur claude.ai (capacité
  `sample` : la page demande à Claude, avec l'accord du joueur, de traduire le texte
  en ordre de bataille JSON) ;
- **locale**, partout et hors ligne, pour un ordre de bataille au format donné au MJ
  (`parseOrder` dans `engine.js`) :

```
BATAILLE : Embuscade au spatioport de Mos Pelgo
CARTE : désert
TOURS : 10
CAMP BLEU : L'équipage du Razor (joueur)
- Varek Sol | chasseur de primes | PV 4/7 | Tir 5 | Portée 6
- 2 x Trandoshans
CAMP ROUGE : Garnison impériale (IA)
- 6 x stormtroopers
- Inquisitrice Varla | Sith | PV 9
```

Dans les deux cas, `planFromSpec` vérifie et corrige l'ordre de bataille (types
inconnus, unités spatiales au sol, effectifs excessifs) et explique ce qu'il a changé.

Un **rapport de bataille** en texte brut, à coller dans la conversation avec le MJ,
résume l'issue, les PV restants des personnages, les pertes de chaque camp et les faits
d'armes (bouton *Rapport*, ou à la fin de la bataille).

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
| Alliance rebelle | X-wing, croiseur Mon Calamari (2 modèles), frégate Nebulon-B | Soldats rebelles |
| Empire galactique | TIE/ln, Destroyer stellaire, super destroyer stellaire | Stormtroopers, AT-ST / AT-DP, Sith |
| République galactique | Venator, destroyer Victory, croiseur Arquitens | Clones (6 légions), Jedi, AT-TE (2 modèles), AT-RT, AT-AP, TX-130 |
| Confédération séparatiste | Vaisseau de contrôle droïde, destroyer Recusant, frégate Munificent | Droïdes B1 et B2, droïdekas, char AAT |
| Clans mandaloriens | Cuirassé, destroyer, porte-chasseurs, chasseur Fang | Guerriers mandaloriens (4 clans), super commandos |
| Pègre et chasseurs de primes | Croiseur hutt, croiseur pirate, canonnière | Chasseurs de primes, Trandoshans, gardes gamorréens |
| Indépendants | Yacht royal | Personnage : pion libre qui peut prendre l'apparence de n'importe quelle figurine |

Onze escarmouches prêtes à jouer, et autant de batailles que vous voulez dans le bac
à sable. Théâtres : espace profond (astéroïdes, nébuleuses), désert, lune forestière,
monde glacé.

## Règles en bref

- Chaque camp joue son tour ; chaque unité **se déplace puis attaque** (tir ou corps
  à corps), une fois.
- Tir : autant de d6 que l'Attaque, touche sur **4+** (+1 si la cible est à couvert,
  +1 si une arme lourde vise une cible agile). Les **6 sont critiques** : impossibles
  à esquiver. Une cible **blindée** n'est touchée que sur 6, sauf arme perforante.
- Défense : la cible lance ses dés de Défense, chaque 5+ annule une touche normale.
- Corps à corps, contre une case voisine : autant de d6 que la valeur de Mêlée,
  +1 dé de charge si l'unité a bougé, touche sur 4+. Pas de couvert au contact ; le
  blindage tient, sauf face à un sabre laser. Si la cible survit, elle **riposte**
  aussitôt avec ses propres dés de Mêlée, sur 5+.
- Les Jedi et les Sith n'ont pas de blaster : ils se battent au sabre (6 et 7 dés),
  parent et renvoient les tirs sur 4+, et frappent de loin par la Force deux fois par
  bataille. Les Mandaloriens esquivent et parent sur 4+ grâce au beskar, et volent au
  réacteur dorsal ; les droïdekas ont un bouclier contre les tirs.
- Victoire par anéantissement, ou aux points à la fin du dernier tour : chaque PV
  retiré rapporte une part du coût de l'unité touchée.

Le détail complet, avec le tableau de toutes les unités, est dans le jeu (bouton *Règles*).

## Organisation

| Fichier | Rôle |
|---|---|
| `index.html` | Interface : accueil, plateau SVG, console, table du MJ |
| `engine.js` | Moteur de règles pur (aucun DOM) : données, hexagones, tir, IA |
| `assets/source/` | Planches d'origine (autocollants sur fond blanc) |
| `assets/sprites/` | Pions détourés, générés par `tools/extract_sprites.py` |
| `tools/extract_sprites.py` | Découpe les planches en sprites WebP transparents |
| `tools/draw_lucrehulk.py` | Dessine le vaisseau de contrôle droïde, dont la planche manque |
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
