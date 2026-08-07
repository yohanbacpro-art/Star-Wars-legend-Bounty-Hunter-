# Ranch Dynasty — V1.4

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

## Équilibrage connu

Mesuré sur 100 parties simulées, avec et sans les nouveautés :

- Sans intervention du joueur, le déficit passif tue la partie vers **1892** (médiane).
- Même en neutralisant l'argent, **~72 % des parties finissent en « Fin de la lignée »**
  avant 2026, chiffre identique à la V1.3. La cause est démographique : la moitié des
  enfants ne se marient jamais (`marriageChecked`, 50 %), et l'héritier qui reprend le
  ranch a le plus souvent passé l'âge d'avoir des enfants. La reprise transmet désormais
  le conjoint de l'héritier au foyer, ce qui était le maillon manquant, mais ne suffit pas
  à inverser la tendance.

Ces deux points sont antérieurs aux ajouts de la V1.4 et n'ont pas été retouchés.

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
# Tests ciblés : objectifs, succession, factions, migration des sauvegardes.
# 87 vérifications, sortie non nulle en cas d'échec.
node tests/scenarios.js index.html

# Simulation de masse. Politiques : random | policy | cheat
# `cheat` renfloue le ranch pour exercer les 141 années et les 7 époques.
node tests/sim.js index.html 100 cheat
```

Utiliser `tests/sim.js` avant/après un changement d'équilibrage : il compare
facilement deux versions du fichier (`git show HEAD:index.html > baseline.html`).

## Pistes ouvertes

- Équilibrage : déficit passif et extinction de la lignée (voir ci-dessus)
- Rendre le rival principal plus présent hors des raids
- Donner un poids narratif aux traits des cow-boys vétérans
