# Ranch Dynasty — V3.1

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
| Bloc 3 | Équipe, Domaine, Chroniques (généalogie incluse), Diplomatie, Objectifs, Coups en douce, sauvegardes |
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
- **`state.arc` / `state.arcsDone`** — l'arc narratif en cours et ceux déjà joués.
- **`state.doctrines`** — la voie choisie à chaque tournant d'époque.
- **`state.parcels`** — le découpage du domaine ; leur somme doit toujours valoir `state.land`.
- **`state.rival.leader`** — le chef d'en face, son âge et son tempérament.
- **`state.factions`** — quatre pouvoirs locaux typés `law` / `trade` / `media` / `community`
  (voir `FACTION_TYPES`). Le type détermine l'effet concret appliqué chaque trimestre.

## Succession

Chaque enfant majeur a une `ambition` (fixée à 16 ans) et une `resentment` qui monte
tant qu'aucun successeur n'est désigné. `heirTensionPhase()` fait évoluer tout cela une
fois l'an ; `resolveSuccession()` gère la reprise à la mort du chef de famille — l'héritier
désigné prime sur l'aîné, et un frère ou une sœur rongé par la rancune peut contester,
en emportant terres et argent.

Désigner un successeur se fait depuis le panneau **Famille**.

## Arcs narratifs

Un arc est une histoire en plusieurs chapitres, étalée sur des trimestres
(`ARCS`). Un seul court à la fois : `state.arc = {id, step, due, data}`. Chaque
chapitre attend son échéance puis s'ouvre comme un événement ; un choix peut
brancher (`goto`) et écrire dans `data`, que les chapitres suivants relisent.
Un arc terminé entre dans `state.arcsDone`, et **son issue** dans
`state.arcOutcomes` : les arcs se relisent entre eux. Un procès perdu abaisse le
seuil de la rancune de sang et sa première scène cite la limite que le tribunal
vous a retirée ; un enfant chassé reparaît des décennies plus tard aux côtés du
chef rival. Utiliser `arcOutcome(id)` dans une condition ou un texte.

Cinq arcs : un procès de bornage, un enfant parti en ville, une grande
sécheresse, une rancune de sang avec le rival, et le dernier chapitre d'un vieux
compagnon. Un arc dont le sujet disparaît en cours de route (le vétéran meurt)
se referme proprement plutôt que d'interrompre la partie.

## Tournants d'époque

Chaque bascule d'époque, sauf la première, propose deux voies structurantes
(`DOCTRINES`) dont l'effet court sur toute l'époque : mécaniser ou rester à
cheval, nourrir le comté ou racheter les ruinés, ouvrir au tourisme ou classer
les terres en réserve. Le choix est mémorisé dans `state.doctrines`.

## La lignée rivale

En face aussi quelqu'un vieillit. `state.rival.leader` a un nom, un âge et un
**tempérament** (`RIVAL_TRAITS`) qui oriente la dérive de la relation et de la
force pendant toute sa vie. À sa mort, un successeur prend la suite : la
relation est en partie remise à zéro — le nouveau n'a ni les rancunes ni les
accords de son prédécesseur. `state.rival.lineage` garde la trace de tous.

## La carte du domaine

`state.land` reste la somme de référence ; `state.parcels` en est la lecture :
des parcelles nommées, avec un type (`PARCEL_KINDS`) et une **exposition**.
Canyons et bois se font razzier trois fois plus qu'une crête, et un raid nomme
la parcelle qu'il a frappée. `ensureParcels()` recale les parcelles sur
`state.land` au chargement.

Un cow-boy peut être **posté** sur une parcelle (`cowboy.post`) : elle devient
bien plus difficile à razzier, et il peut repousser l'incursion. En contrepartie
il ne compte plus dans les bras du ranch. La carte pèse donc sur la défense
autant que sur le décor.

## Personnes

Chaque personne — fondateur, conjoint, enfants — porte un `sex` (`"m"` / `"f"`).
Il commande le prénom, l'accord des textes (`married()`, `heirWord()`), le
conjoint choisi au mariage (toujours du sexe opposé) et surtout la fertilité.

Les naissances dépendent de l'âge de la **mère du foyer** (`motherOfHousehold`,
`coupleCanConceive`) : la fertilité décline dès 30 ans et s'arrête à 40 ans
révolus. Même règle pour les petits-enfants côté fille.

Le conjoint du chef de famille peut prendre une **affectation** au ranch, comme
les enfants majeurs (`roleCount` compte les deux).

## Les chevaux

Le ranch a un **cheval de tête** nommé (`state.champion`), qui apparaît dès
qu'il y a un cheval à l'écurie. Il a une vitesse propre, un dressage et un
compteur de victoires. `championForm()` combine les trois, l'âge finissant par
peser. L'action « Entraîner les chevaux » élève le dressage ; les cow-boys au
trait *Dresseur* y aident.

Il peut être volé au rival (opération `horseTheft`) — on récupère alors une bête
déjà dressée — et volé au ranch si l'on néglige la garde.

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

Le catalogue compte **144 événements**, dont plus de cent en tronc commun et au
moins quatre propres à chaque époque. Un test mesure le recouvrement lexical de
toutes les paires (indice de Jaccard sur les mots signifiants) et **échoue
au-delà de 0,45** : deux événements ne peuvent pas raconter la même chose. Il
vérifie aussi qu'aucune illustration n'écrase les autres.

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
| `random` | clique au hasard | 2 % | 445 |
| `passive` | ne fait rien | 12 % | 498 |
| `outlaw` | contrebande à chaque trimestre | 37 % | 572 |
| `honest` | concours et élevage | 97 % | 1 054 091 |
| `mixed` | troupeau + crime d'appoint | 93 % | 1 611 012 |
| `policy` | conduite du troupeau | 98 % | 1 704 188 |

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
rognés en permanence — et un rival qu'il ne négocie jamais, dont les chefs
successifs finissent par le saigner à coups de raids.

### Règles structurantes à ne pas casser

- **Les bras servent à proportion du troupeau** : un homme pour vingt-cinq bêtes
  utiles. En deçà, chaque cow-boy majore le rendement de 9 % (plafond +55 %) ;
  au-delà, il touche son salaire sans contrepartie. C'est ce qui rend l'embauche
  décisive sur un grand ranch et ruineuse sur un petit — auparavant un cow-boy
  rapportait 6 $ forfaitaires pour 8 à 16 $ de salaire, donc jamais rentable.
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
# montants et inflation, sexes et fertilité, chevaux, apport des cow-boys.
# arcs, rival incarné, tournants d'époque, carte du domaine.
# variété du catalogue. 262 vérifications, sortie non nulle en cas d'échec.
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

- Quelques objectifs restent des jalons plus que des défis (`united`, `oldHand`
  sont atteints par ~98 % des parties bien menées)

- Des arcs propres à chaque époque, en plus des cinq arcs intemporels
- Une deuxième famille rivale, pour que la diplomatie ait un triangle
