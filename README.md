# Ranch Dynasty — V1.5

Jeu de gestion de ranch multigénérationnel inspiré de *Yellowstone*.
La partie démarre au printemps **1885** et se poursuit jusqu'en **2026**,
en traversant sept époques historiques.

## Lancer le jeu

Ouvrir `index.html` dans un navigateur récent. Aucune dépendance, aucun build.

## Architecture

Tout tient dans `index.html` (~2000 lignes), organisé en quatre blocs `<script>` :

| Zone | Contenu |
|---|---|
| Bloc 1 | Cœur du jeu : `ERAS`, `events`, `baseState()`, `render()`, `doAction()`, `endTurn()`, `ageFamily()`, `ageCowboys()` |
| Bloc 2 | Panneau Famille (`renderFamily`, affectation des enfants) |
| Bloc 3 | Cow-boys, Chroniques, Généalogie, Diplomatie, Objectifs, sauvegardes |
| Bloc 4 | Liaison des boutons d'action |

Le CSS est dans un unique `<style>` en tête de fichier.

## Concepts clés

- **`state`** — objet global contenant toute la partie. Sérialisé tel quel dans les sauvegardes.
- **`ERAS`** — les 7 époques. Chacune définit son inflation, ses libellés d'action,
  sa photo d'ambiance, son type de rival et ses factions.
- **`sc(n)`** — met un montant à l'échelle de l'inflation de l'époque courante.
  **Toujours** l'utiliser pour un montant en dollars.
- **`state.legacy`** — héritage moral (`honor`, `greed`, `grudges`) transmis entre générations.
- **`state.secret`** — fil narratif principal, révélé en 3 chapitres (1890 / 1950 / 2015).
- **`state.achievements`** — objectifs accomplis, `[{id, year, season}]`. Voir `ACHIEVEMENTS`
  et `checkAchievements()`, appelé après chaque action et à la fin de chaque trimestre.
- **`state.stats`** — compteurs cumulés que certains objectifs consultent
  (`competitionWins`, `illegalWins`, `plannedSuccessions`, `contestedSuccessions`).
- **`state.heirId`** — `cid` de l'héritier désigné, ou `null`. Tout enfant reçoit un `cid`
  stable via `addChild()` : c'est le seul identifiant fiable, les prénoms pouvant être
  dupliqués ou modifiés par le joueur.
- **`state.factions`** — quatre pouvoirs locaux typés `law` / `trade` / `media` / `community`
  (voir `FACTION_TYPES`). Le type détermine l'effet concret appliqué chaque trimestre.

## Succession

Chaque enfant majeur a une `ambition` (fixée à 16 ans) et une `resentment` qui monte
tant qu'aucun successeur n'est désigné. `heirTensionPhase()` fait évoluer tout cela une
fois l'an ; `resolveSuccession()` gère la reprise à la mort du chef de famille — l'héritier
désigné prime sur l'aîné, et un frère ou une sœur rongé par la rancune peut contester,
en emportant terres et argent.

Désigner un successeur se fait depuis le panneau **Famille**.

## Factions

Les visages changent d'une époque à l'autre, mais `generateFactions(era, previous)`
transmet 60 % de la relation précédente au pouvoir de même type : ce qu'une génération
a bâti profite à la suivante. Au-delà de 40 une faction est **alliée**, en dessous de -30
**hostile**, et son effet s'applique alors à chaque fin de trimestre.

## Compatibilité des sauvegardes

`ensureProgress()` complète tout `state` chargé avec les champs ajoutés après coup
(objectifs, compteurs, `cid`, factions typées). Elle est appelée au démarrage, au
chargement et à l'import. **Toute nouvelle propriété de `state` doit y être prévue.**

## Pièges connus

- ⚠️ **Ne jamais appeler `sc()` ni lire `state` en dehors d'une fonction ou d'un
  callback.** Les définitions d'événements sont évaluées au chargement, avant que
  `state` n'existe → `ReferenceError: Cannot access 'state' before initialization`.
  Mettre les montants dans `condition:` et `apply:`, jamais dans `label:`.
- Les identifiants HTML doivent rester uniques (plusieurs panneaux les réutilisent).
- Le jeu tourne volontairement en léger déficit passif : c'est ce qui pousse à agir.
- ⚠️ `endTurn` est **enveloppée** par le bloc 3 (`const oldEnd=endTurn; endTurn=function(){…}`).
  Ne jamais passer la référence directement à `addEventListener` : cela figerait la version
  initiale et le code du bloc 3 ne s'exécuterait jamais. Toujours `()=>endTurn()`.
- Ne jamais identifier un enfant par son prénom : le joueur peut le renommer et deux
  enfants peuvent être homonymes. Utiliser `cid`.

## Équilibrage

La V1.5 rend la saga jouable jusqu'en 2026. Courbe visée, mesurée sur 80 parties
par profil (`node tests/sim.js index.html 80 <profil>`) :

| Profil | Description | 2026 atteint | Année médiane |
|---|---|---|---|
| `random` | clique au hasard | 0 % | 1895 |
| `passive` | ne fait rien | 9 % | 1905 |
| `policy` | joueur compétent | 73 % | 2026+ |
| `outlaw` | compétent + contrebande | 95 % | 2026+ |

L'inaction reste sanctionnée, comme le veut le principe du déficit passif ; c'est
la conduite du ranch qui fait la différence.

### Règles structurantes à ne pas casser

- **La reproduction est bornée par la capacité** (`land / 3`). Les revenus sont
  plafonnés à `min(bétail, capacité)` alors que l'entretien porte sur *toutes* les
  bêtes : un troupeau qui s'emballe ruine mécaniquement le ranch. Pour agrandir le
  cheptel, il faut d'abord acheter des terres.
- **Le fourrage** est produit par les terres (`land / 4` à l'automne) et consommé
  par le troupeau. Il est excédentaire à cheptel adapté, déficitaire en surcharge.
  L'action « Acheter du fourrage » est le levier d'appoint.
- **Les salaires des cow-boys sont stockés à l'échelle de l'époque** (réévalués à
  chaque transition). Ne jamais les remultiplier par `costModifier` : ils
  croîtraient au carré (3 184 $/trimestre au lieu de 192 à l'ère moderne).
- **Les enfants vieillissent et meurent comme leurs parents.** Sans mortalité liée
  à l'âge, ils atteignaient 120 ans et héritaient centenaires.
- **`familyCapFactor` ne compte que les enfants à charge** (moins de 18 ans).
  Compter aussi les adultes figeait la maisonnée en une cohorte unique qui
  s'éteignait d'un bloc au bout de trois ou quatre générations.
- **Le mariage se retente chaque année** entre 18 et 38 ans. Le tirage unique à
  18 ans laissait la moitié des enfants sans descendance.

## Vérifier une modification

```bash
# Syntaxe de chaque bloc <script>
node -e "
const html=require('fs').readFileSync('index.html','utf8');
[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1])
  .forEach((s,i)=>{try{new Function(s);console.log('Bloc',i,'OK')}
  catch(e){console.log('Bloc',i,'ERREUR:',e.message)}});
"
```

Deux harnais simulent le jeu hors navigateur (`node:vm` + stub minimal du DOM),
sans aucune dépendance :

```bash
# Tests ciblés : objectifs, succession, factions, équilibrage, migration
# des sauvegardes. 104 vérifications, sortie non nulle en cas d'échec.
node tests/scenarios.js index.html

# Simulation de masse.
# Profils : random | passive | policy | outlaw | cheat
node tests/sim.js index.html 80 policy

# Bilan trimestriel détaillé d'une partie, pour diagnostiquer l'économie
TRACE=1 node tests/sim.js index.html 1 policy

# État de la famille à chaque extinction de lignée
DIAG=1 node tests/sim.js index.html 80 policy
```

Toujours mesurer un changement d'équilibrage avec `tests/sim.js` sur les quatre
profils : il compare facilement deux versions du fichier
(`git show HEAD:index.html > baseline.html`).

## Pistes ouvertes

- Rendre le rival principal plus présent hors des raids
- Donner un poids narratif aux traits des cow-boys vétérans
- Quelques objectifs restent des jalons plus que des défis (`united`, `oldHand`
  sont atteints par ~98 % des parties bien menées)
