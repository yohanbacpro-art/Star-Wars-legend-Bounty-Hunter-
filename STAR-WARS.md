# L'Effondrement — 75 ap. BY (prototype v0.2)

Jeu de grande stratégie galactique au tour par tour, dans l'esprit de Total War.
Tout tient dans `star-wars.html` : l'ouvrir dans un navigateur, sans dépendance ni build.
Jouable sur ordinateur et sur téléphone. Ranch Dynasty (`index.html`) reste inchangé.

Le game design complet vit dans le doc « Game design — Jeu de stratégie Star Wars (75 ap. BY) ».
Ce prototype couvre les deux premières étapes de sa feuille de route.

## v0.1 — la carte galactique

- 34 systèmes répartis en 5 régions (Noyau, Colonies, Bordure Médiane, Bordure Extérieure, Régions Inconnues), reliés par des routes hyperspatiales.
- 4 factions jouables avec leur force et leur faiblesse : Vestiges impériaux, République restaurée, Mandalore, Ligue de la Bordure. Les autres mondes sont indépendants.
- 3 ressources : crédits (impôts et routes commerciales), matériaux (construction), influence (apaiser un monde).
- Planètes : production, défense, loyauté, impôts (bas / normal / élevé). Sous 35 de loyauté, sabotages ; sous 20, révolte et sécession possibles.
- Routes commerciales : une route dont on tient les deux bouts rapporte ; une flotte ennemie en orbite la bloque.
- Chantiers : destroyers (6 tours), frégates (3), escadrons de chasseurs (1).
- Flottes : 2 sauts par tour, sièges, fusion et division, vétérance, entretien.
- Tout est lié : chaque défaite et chaque capitale perdue ébranlent le régime et font baisser la loyauté partout.
- Aléatoire au lancement : chantiers et carrefours commerciaux placés au hasard, production tirée pour chaque monde.
- IA simple pour les factions rivales. Victoire par domination : la moitié des systèmes et toutes les capitales rivales.

## v0.2 — les batailles spatiales

- Grille hexagonale 11 × 8, au tour par tour. L'attaquant se déploie à gauche.
- Destroyers, frégates et escadrons, avec un triangle de forces : les frégates chassent les chasseurs, les chasseurs harcèlent les destroyers, les destroyers écrasent les frégates.
- Boucliers orientés avant / flancs / arrière. Frapper de dos fait 25 % de dégâts en plus et brise le moral.
- Visée des sous-systèmes : moteurs (mouvement divisé par deux) ou armes (dégâts divisés par deux).
- Moral : les dégâts, les tirs de flanc, l'encerclement et la perte du vaisseau amiral le font baisser. Sous 25, l'unité fuit ; celles rattrapées sont massacrées dans la poursuite.
- Terrain : une nébuleuse coupe les senseurs (portée 1), un champ d'astéroïdes sert de couverture (−30 % de dégâts, 2 points de mouvement).
- Renforts : la flotte adjacente la plus forte de chaque camp arrive au 3e round.
- Résolution automatique possible, avec un résultat moins bon que si l'on commande soi-même.

## Architecture

Deux blocs `<script>` dans `star-wars.html` :

| Bloc | Contenu |
|---|---|
| Moteur | Données (`SYSTEMS`, `LINKS`, `FACTIONS`, `SHIPS`, `UNITS`), `newGame`, économie, loyauté, `runAI`, `finishTurn`, batailles (`autoBattle`, `createBattle`, `bAttack`, `bRunAI`, `bResult`, `applyBattle`). Aucune dépendance au DOM. |
| Interface | Écran titre, carte SVG, panneau, bataille sur grille SVG, modales, sauvegarde `localStorage` (`sw75-save`). |

L'aléatoire est un mulberry32 dont l'état vit dans la partie (`st.rng`) : une graine rejoue la même partie.

## Tests

```
node tests/sw-sim.js [parties] [tours max]
```

Joue des parties complètes où l'IA contrôle toutes les factions, vérifie les invariants à chaque tour, joue 60 batailles tactiques IA contre IA et contrôle les boucliers orientés.
