# Ranch Dynasty — V2.0

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
| Bloc 3 | Cow-boys, Chroniques (généalogie incluse), Diplomatie, Objectifs, Coups en douce, sauvegardes |
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

## Coups en douce

`ILLEGAL_OPS` définit trois opérations par époque, chacune nommée et chiffrée.
Le bouton « Coup en douce » n'engage rien : il ouvre un panneau où chaque
opération affiche ce qu'elle fait, ses chances calculées (`illegalOdds`), son
gain, les soupçons encourus et ce qui arrive si elle rate. L'action n'est
consommée qu'au clic sur une opération.

Les chances tiennent compte des armes, des hommes, de l'argent, des appuis dans
l'administration et des soupçons déjà accumulés — toutes composantes annoncées
dans l'en-tête du panneau, pour qu'aucune décision ne repose sur un chiffre
caché.

## Illustrations

Les scènes sont dessinées en SVG dans la page (`ART_MOTIFS`, `eventArtSVG`) :
aucune requête réseau, et les couleurs sont prises aux variables CSS de
l'époque, donc l'image change d'ambiance de 1885 à 2026. `pickMotif` choisit la
scène d'après le titre et la légende de l'événement ; `art:"…"` permet de la
fixer. Les photos d'archive Wikimedia restent un calque optionnel par-dessus :
si elles ne chargent pas, la scène dessinée reste visible.

## Factions

Les visages changent d'une époque à l'autre, mais `generateFactions(era, previous)`
transmet 60 % de la relation précédente au pouvoir de même type : ce qu'une génération
a bâti profite à la suivante. Au-delà de 40 une faction est **alliée**, en dessous de -30
**hostile**, et son effet s'applique alors à chaque fin de trimestre.

Une alliance ouvre en plus une **faveur** (`FACTION_FAVOURS`) : forte, coûteuse
en action, et suivie d'un délai de six trimestres qui entame la relation. C'est
ce qui fait de la diplomatie un levier et non un bonus passif. L'état des quatre
pouvoirs est visible en permanence dans le panneau latéral, avec une étoile
quand une faveur est mûre.

## Rythme

Une **brève** (`BRIEFS`) tombe à chaque fin de trimestre : une ligne de vie du
ranch, avec un effet réel mais léger, choisie selon la saison et l'état de la
famille. Le journal n'est donc jamais vide. La probabilité d'un grand événement
est de 0,82 par trimestre, sur une cinquantaine d'événements dont beaucoup sont
conditionnés par l'état du ranch (`condition:`) pour tomber au bon moment.

`title`, `text` et `image` acceptent une fonction, ce qui permet de citer les
noms de la partie en cours — une chaîne littérale serait évaluée au chargement,
avant que `state` n'existe.

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

Courbe mesurée sur 100 parties par profil (`node tests/sim.js index.html 100 <profil>`) :

| Profil | Description | 2026 atteint | Patrimoine final médian* |
|---|---|---|---|
| `random` | clique au hasard | 0 % | 191 |
| `passive` | ne fait rien | 12 % | 452 |
| `outlaw` | contrebande à chaque trimestre | 13 % | 368 |
| `honest` | concours et négociation | 97 % | 460 143 |
| `mixed` | troupeau + crime d'appoint | 93 % | 640 408 |
| `policy` | conduite du troupeau | 95 % | 648 183 |

\* patrimoine converti en dollars de 1885, seule façon de comparer d'une époque
à l'autre.

L'inaction reste sanctionnée, comme le veut le principe du déficit passif ; c'est
la conduite du ranch qui fait la différence.

### Honnêteté contre contrebande

Le crime **paie davantage à l'action** : une opération clandestine rapporte plus
qu'un concours équestre, sans mise de fonds ni cheval. Mais il ronge la
réputation et gonfle les soupçons, deux jauges qui pèsent directement sur le
prix de vente, et il alourdit l'héritage moral jusqu'au verdict final.

D'où l'arbitrage voulu, que les profils simulés confirment : le crime est un
**levier d'appoint**, pas un mode de vie. Le profil `mixed`, qui n'y recourt que
la caisse basse et les soupçons retombés, fait jeu égal avec le jeu purement
honnête (640 k contre 648 k). Le profil `outlaw`, qui trafique chaque trimestre
pendant 141 ans, s'effondre : réputation à terre, soupçons au plafond, revenus
rognés en permanence.

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
- **`sc()` sur tout montant en dollars de 1885, `pay()` sur tout montant déjà à
  l'échelle de l'époque.** `spend()` multiplie par `costModifier` : le faire sur
  un montant dérivé de `state.cattlePrice` (déjà réévalué à chaque transition)
  l'inflate deux fois — acheter 5 bovins coûtait 35 760 $ en 2020 pour 2 205 $ à
  la revente. Symétriquement, une prime oubliée sans `sc()` reste figée aux prix
  de 1885 et devient dérisoire : le concours équestre coûtait 720 $ pour un gain
  plafonné à 360 $, soit une perte garantie.
- **La prime de marché** (`repPremium × susPenalty`) est **asymétrique** : un nom
  respecté vaut jusqu'à +20 % de revenus, un nom sali plafonne à -8 %. La
  réputation s'émousse au-dessus de 60 — donc elle s'entretient — mais remonte
  aussi sous 32, sans quoi une famille au ban restait à 0 pour toujours et
  perdait mécaniquement la partie.
- **Les surfaces passent par des jetons CSS** (`--surface`, `--card-bg`,
  `--log-bg`…), jamais par une couleur codée en dur. L'ère moderne inverse
  l'encre : tout fond clair écrit en dur y devient illisible.

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
# des sauvegardes, coups en douce, faveurs, rythme, illustrations,
# montants et inflation. 169 vérifications, sortie non nulle en cas d'échec.
node tests/scenarios.js index.html

# Simulation de masse.
# Profils : random | passive | outlaw | honest | mixed | policy | cheat
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

- **Les cow-boys sont économiquement irrationnels** : chacun apporte 6 $ de
  rendement par trimestre pour 8 à 16 $ de salaire. Ils ne se justifient que par
  leur tir (coups en douce) et leur équitation (concours). À revoir : soit leur
  apport, soit leur rôle.
- Rendre le rival principal plus présent hors des raids
- Donner un poids narratif aux traits des cow-boys vétérans
- Quelques objectifs restent des jalons plus que des défis (`united`, `oldHand`
  sont atteints par ~98 % des parties bien menées)
- Des arcs narratifs sur plusieurs trimestres (enchaînements d'événements)
