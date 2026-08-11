# Ranch Dynasty — V3.8

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
- **`state.secret` / `state.secret2`** — deux fils narratifs souterrains, révélés en
  3 chapitres chacun (fenêtres dans `SECRET_WINDOWS` : 1890 / 1950 / 2015 pour le
  premier, 1912 / 1968 / 2019 pour le second). Le second est tiré parmi les types
  **non joués** par le premier, donc deux parties ne racontent jamais la même
  histoire cachée. `activeSecrets()` les parcourt tous les deux.
- **`state.ventures`** — les affaires d'époque montées, `{id:{level, since, eraId}}`.
- **`state.claimPressure`** — le poids de la revendication foncière ashkani, alimenté
  par chaque hectare pris de force. Voir `claimStrength()`.
- **`state.mobTies`** — les liens noués avec la pègre sous la Prohibition.
- **`state.developer`** — l'investisseur immobilier entré en scène après 2010,
  avec sa `pressure` et le nombre de refus essuyés.
- **`state.autoQuarters` / `state.chaining`** — le déroulé d'une année en quatre
  trimestres (voir « Le tour annuel »). Ne jamais les manipuler à la main.
- **`state.debt` / `state.missedPayments`** — dette d'exploitation et échéances
  manquées. Six échéances manquées emportent le domaine.
- **`state.arrears` / `state.arrearYears`** — impôt impayé et années de retard.
- **`state.quarantine` / `state.receivership`** — les deux états qui coupent les
  revenus à la source, en tours restants.
- **`state.obsolescence`** — mises aux normes repoussées. Ronge les revenus, et
  se cumule.
- **`state.nextCall`** — l'année de la prochaine mise aux normes.
- **`state.protectedLand`** — hectares classés : hors assiette fiscale, et insaisissables.
- **`state.taxRelief`** — allègement fiscal arraché au comté, qui s'érode chaque année.
- **`state.startMode`** — variante de départ : `founder` | `established` | `legacy`.
- **`state.plus`** — nombre de dynasties tombées avant celle-ci (mode `legacy`).
- **`state.achievements`** — objectifs accomplis, `[{id, year, season}]`. Voir `ACHIEVEMENTS`
  et `checkAchievements()`, appelé après chaque action et à la fin de chaque trimestre.
- **`state.stats`** — compteurs cumulés que certains objectifs consultent
  (`competitionWins`, `illegalWins`, `plannedSuccessions`, `contestedSuccessions`).
- **`state.heirId`** — `cid` de l'héritier désigné, ou `null`. Tout enfant reçoit un `cid`
  stable via `addChild()` : c'est le seul identifiant fiable, les prénoms pouvant être
  dupliqués ou modifiés par le joueur.
- **`state.arc` / `state.arcsDone` / `state.arcOutcomes`** — l'arc en cours, ceux joués, et leur issue.
- **`state.doctrines`** — la voie choisie à chaque tournant d'époque.
- **`state.parcels`** — le découpage du domaine ; leur somme doit toujours valoir `state.land`.
- **`state.rival` / `state.rival2`** — les deux maisons rivales, chacune avec son chef.
- **`state.rivalFeud`** — ce que les deux maisons se portent l'une à l'autre, hors de vous.
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

**Douze arcs.** Cinq intemporels — un procès de bornage, un enfant parti en
ville, une grande sécheresse, une rancune de sang, le dernier chapitre d'un
vieux compagnon — et **sept propres à chaque époque** (`ERA_ARCS`) : la grande
piste de convoyage, l'entrepôt du syndicat, la saisie bancaire, le conflit
social, le rachat par un groupe, le label, le classement en réserve. Un arc
d'époque ne se déclenche que dans la sienne ; un seul arc courant à la fois,
une partie n'en voit jamais la totalité.

Un `goto` hors bornes referme l'arc : c'est ainsi qu'on écrit une sortie
anticipée. Un arc dont le sujet disparaît en cours de route (le vétéran meurt)
se referme proprement plutôt que d'interrompre la partie.

## Tournants d'époque

Chaque époque propose des voies structurantes
(`DOCTRINES`) dont l'effet court sur toute l'époque : mécaniser ou rester à
cheval, nourrir le comté ou racheter les ruinés, ouvrir au tourisme ou classer
les terres en réserve. Le choix est mémorisé dans `state.doctrines`.

La **Fondation** n'ayant pas de transition qui l'ouvre, son tournant se joue au
premier tour (`showFoundingChoice`) et décide de la nature même du ranch :
bâtir sur le bétail, sur les chevaux, ou prendre la terre d'abord. Cette voie-là
se relit encore un siècle plus tard.

**Les arcs relisent la doctrine** via `doctrine(eraId)`. La même affaire ne se
joue pas de la même façon selon la ligne tenue : refuser la délégation ouvrière
coûte 32 points de loyauté à une maison mécanisée contre 10 à une maison restée
à cheval, et la mécanisation ouvre une branche propre — garantir qu'aucune
machine ne remplacera un homme. Une exploitation restée familiale ne peut pas
vendre de parts au conglomérat mais peut lui opposer l'indivision. Le comté
secourt volontiers celui qui l'a nourri pendant la crise, et reste sourd à celui
qui a racheté les fermes ruinées.

La voie fondatrice porte sur les arcs intemporels : qui a **pris la terre
d'abord** défend beaucoup moins bien ses titres au procès et n'a pas d'acte
original à produire, tandis que qui a **bâti sur les chevaux** passe le gué de
la grande piste bien plus souvent, et qui a **bâti sur le bétail** peut tout
emmener au convoyage. **Les huit arcs à doctrine sont couplés.**

## La chronique de la saga

Les grands moments sont consignés au fil de la partie dans `state.saga` —
fondation, tournants d'époque, successions, affaires closes, chapitres du
secret, changements de chef rival, objectifs accomplis — chacun avec sa date,
son époque et sa scène. `recordSaga(kind, title, art, detail)` pour en ajouter.

`renderSaga()` les relit dans l'ordre, illustration à l'appui. La chronique est
accessible depuis le panneau **Chroniques**, et surtout proposée sur l'écran de
fin de partie : c'est la vraie conclusion de 141 ans de jeu. Une partie complète
en produit une cinquantaine.

### Exporter la chronique

Deux boutons en tête du panneau **Chroniques** :

- **`sagaText()` / `exportSaga()`** — un `.txt` lisible tel quel : en-tête de la
  famille, moments découpés par époque avec le tournant pris à chacune, puis un
  bilan (domaine, trésorerie en dollars courants *et* de 1885, héritage moral,
  lignée, objectifs accomplis).
- **`sagaPosterSVG()` / `exportSagaImage()`** — une affiche `.svg` autonome : au
  plus 22 moments, priorité à ceux qui font l'ossature du récit
  (`POSTER_KINDS`), et un pied de page chiffré. Aucune police ni image
  extérieure, donc elle s'ouvre partout.

Les deux passent par `downloadText()` (`Blob` + `URL.createObjectURL`), qui
fonctionne y compris dans un Artifact. ⚠️ Tout texte inséré dans l'affiche doit
passer par `xmlEsc()` : le joueur nomme sa famille et son ranch librement, et un
`&` non échappé casse le fichier SVG.

## Les deux maisons rivales

En face aussi quelqu'un vieillit. Chaque maison a un chef (`leader`) avec un nom,
un âge et un **tempérament** (`RIVAL_TRAITS`) qui oriente la dérive de la
relation et de la force pendant toute sa vie. À sa mort, un successeur prend la
suite : la relation est en partie remise à zéro — le nouveau n'a ni les rancunes
ni les accords de son prédécesseur. `lineage` garde la trace de tous.

Il y a **deux maisons** : `state.rival` et `state.rival2`, plus `state.rivalFeud`,
ce qu'elles se portent l'une à l'autre indépendamment de vous. C'est le cœur du
triangle : `feudShield()` module la fréquence des raids selon leur querelle —
deux maisons qui se détestent se surveillent et vous laissent souffler (×0,55),
deux maisons réconciliées contre vous frappent bien plus (×1,45).

Se rapprocher d'une maison refroidit l'autre. `sowDiscord()` permet de les
monter l'une contre l'autre : réussi, cela les détourne durablement de vous ;
éventé, les deux vous en veulent à la fois.

Deux issues extrêmes se comptent. Quand les deux maisons sont hostiles **et**
alliées entre elles, chaque trimestre tenu incrémente `state.stats.siegeQuarters`.
À l'opposé, un événement permet de **marier un enfant dans une maison rivale** :
la relation bondit durablement, mais l'autre maison le prend très mal.

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

## Variantes de départ

`applyStartMode()` s'exécute juste après `baseState()`, avant le dernier
`ensureParcels()` — car elle peut ajouter des centaines d'hectares d'un coup.

- **`founder`** — le départ classique. 1885, 160 ha, 38 têtes, rien d'acquis.
- **`established`** — 1905 (`turn` recalé sur `(1905-1885)*4+1`, époque
  inchangée : la Fondation court jusqu'en 1919, donc **l'inflation ne bouge
  pas** et l'équilibrage reste comparable). Le prédécesseur laisse ~500 ha,
  un troupeau constitué, deux enfants, une réputation faite et des voisins qui
  ont déjà un avis. `state.parcels` est vidé pour se redécouper proprement.
  C'est le départ le plus clément : en simulation, même un jeu au hasard tient
  jusqu'en 1986 en médiane, contre 1885–1890 depuis 1885.
- **`legacy`** — relever le nom d'une dynastie tombée. `showGameOver()` écrit un
  `LEGACY_KEY` dans `safeStorage` (nom, honneur, cupidité, rancunes, année,
  générations, objectifs, compteur `plus`). La partie suivante repart en 1885
  avec **la moitié** du poids moral et **toutes** les rancunes, et un départ
  qui dépend du verdict (`legacyVerdict()`) : un nom honorable ouvre les portes,
  un nom craint donne de l'argent et des soupçons, un nom terne donne peu.

`refreshStartMode()` tient l'écran de création à jour : elle verrouille l'option
`legacy` tant qu'aucune dynastie n'est tombée, réécrit la note explicative et le
libellé du bouton de départ.

## Une dynastie établie peut tomber

Le défaut mesuré jusqu'en V3.7 : les ennuis coûtaient cher, mais une trésorerie
de plusieurs millions absorbait tout, et **toutes les chutes restaient
antérieures à 1950**. Pour qu'une chute soit possible sans être injuste, il faut
des menaces qui (1) s'attaquent à la capacité d'exploiter et non au tas
d'argent, (2) s'aggravent d'elles-mêmes si on ne fait rien, (3) se voient venir
des années à l'avance.

### Ce qui pousse un grand domaine à s'endetter

`presentCapitalCall()` — **la mise aux normes**, tous les sept ans à partir de
1958 (`CALL_FROM`, `CALL_PERIOD`). Ce n'est pas un événement aléatoire : c'est
un rendez-vous, qui prime sur tout le reste du tour. Le devis vaut
`sc(400) + land×sc(3) + cattle×sc(4)`, **donc il grandit avec le domaine** — un
petit ranch paie une misère, un empire paie près de deux années de bénéfice, en
liquide. Trois issues :

- **payer comptant** — il faut avoir gardé la trésorerie ;
- **emprunter** (+15 %) — et la traite commence ;
- **repousser** — `state.obsolescence` monte d'un cran et les revenus tombent à
  84 %, puis 68 %, puis 52 %… C'est la spirale : chaque report rend le suivant
  plus difficile à payer.

### Les trois chutes

| | Le compte à rebours | Ce qui l'arrête |
|---|---|---|
| **La banque** | La dette réclame une traite fixe (`requiredPayment()`). Trois échéances manquées et elle exécute sa garantie ; **six et le domaine est vendu aux enchères** | Vendre du bétail ou des terres, rééchelonner |
| **Le comté** | L'impôt impayé devient un arriéré qui court avec pénalités. À deux ans il est cédé à la banque ; **à quatre, le comté exproprie** | Payer, obtenir un échéancier, vendre des terres |
| **La famille** | Une succession sans héritier désigné dans une maison à moins de 30 d'unité déclenche `partitionEstate()` : le domaine est **divisé entre tous les prétendants** et toutes les parts sauf une quittent la famille | Désigner un héritier, remonter l'unité |

S'y ajoutent deux états contre lesquels aucune trésorerie ne protège, parce
qu'ils coupent les revenus à la source : la **quarantaine** (aucune vente
possible, revenus du troupeau au quart) et l'**administration judiciaire**
(revenus à 45 %, aucune acquisition). Et un plancher : sous 40 hectares, il n'y
a plus de ranch.

### Rien n'arrive par surprise

`alarms()` alimente un bandeau au-dessus des actions. Chaque menace mortelle y
figure avec **le nombre de coups qui restent** et **ce qu'il faut faire pour
l'éviter** : « Banque — 4 échéances manquées sur 6 », « Comté — 2 années
d'impôt impayé sur 4 », « Succession — aucun héritier désigné, maison divisée ».

### Mesuré

Sur 20 parties d'un même empire de 1960 (3 000 ha, 1 100 têtes, 400 000 $) :

- **le joueur qui repousse systématiquement tout : 20 chutes sur 20**, toutes
  par faillite ;
- **le même empire tenu — fourrage, surplus vendu, factures payées : 8 à 10
  survies sur 10.**

La chute est donc la conséquence de la négligence, pas de la malchance. En
simulation ordinaire, les chutes postérieures à 1950 représentent 3 à 4 parties
sur 40 en jeu compétent — possible, pas probable.

## Le tour annuel

141 ans × 4 saisons = 564 tours, alors que la seconde moitié du siècle n'a plus
grand-chose de saisonnier à décider. **À partir de 1950 (`ANNUAL_FROM`), un tour
couvre une année entière.** Mesuré : une partie complète passe de **564 à 337
fins de tour**, sans perdre un seul événement.

L'implémentation ne touche pas à la simulation. `endTurn()` continue de simuler
**exactement un trimestre** ; une année se joue en enchaînant quatre trimestres :

- `endTurn()` pose `state.autoQuarters = 3` quand le joueur ouvre une année ;
- `finishTurn()` — seul point de convergence après une modale, quel que soit le
  chemin (événement, arc, brève, doctrine, transition d'époque) — décrémente le
  compteur et rappelle `endTurn()` ;
- `state.chaining` distingue « le joueur ouvre une année » de « la chaîne se
  poursuit ». ⚠️ **Sans ce drapeau, le dernier maillon rouvrait une année et
  bouclait à l'infini** — c'est le premier bug qu'a produit cette mécanique.

Conséquences voulues :

- les saisons continuent de produire veaux, récoltes et impôts **aux mêmes
  dates** : l'équilibrage reste comparable (3 322 ha et 1 160 têtes en fin de
  partie, contre 3 862 et 1 299 en V3.6) ;
- `actionsPerTurn()` passe de 3 à **6**, et `lot()` de 1 à **4** : une action
  annuelle porte sur 20 bovins, 80 hectares ou 160 balles. Sans cela, passer à
  l'année divisait par deux ce qu'un ranch peut faire — le joueur se sentait
  affaibli plutôt que soulagé ;
- les trimestres intercalaires tirent moins d'événements (52 % contre 82 %) et
  ne produisent pas de brève, pour environ **deux événements et demi par
  année** au lieu de quatre d'affilée ;
- toute l'interface bascule : « Terminer l'année », « Décisions de l'année »,
  en-tête et journal datés à l'année. Un test vérifie qu'aucun libellé ne parle
  encore de trimestre.

## L'économie tardive

Le défaut mesuré jusqu'en V3.5 : passé 1950, l'argent s'accumulait sans emploi
(743 $ en 1885 → 22,8 M$ en 2013, troupeau plafonné à ~1 200 têtes). Le jeu
devenait une lecture. Trois systèmes se répondent.

### Où placer l'argent : les affaires d'époque

`ERA_VENTURES` définit **une affaire par époque**, et une seule : la piste de
convoyage en 1885, les abattoirs sous la Prohibition, les programmes fédéraux
dans les années 30, le forage pétrolier d'après-guerre, le ranch touristique des
années 80, la certification export, puis le parc solaire. Le choix n'est pas
laquelle monter, mais **jusqu'où la pousser** (5 paliers, coût ×2,6 par palier)
et **quand lâcher l'ancienne pour la nouvelle**.

Car une affaire se démode : `ventureDecay()` divise son rendement par ~1,8 à
chaque époque franchie. Une rente montée en 1925 ne pèse plus rien en 1975.
C'est ce qui empêche d'empiler des rentes et oblige à remettre au pot — le
contraire d'un revenu passif acquis.

Le bouton **Monter une affaire** change d'icône, de titre et de coût à chaque
époque ; `render()` s'en charge.

### Ce qui reprend : impôts et droits de succession

`FISCAL` donne, par époque, un taux d'impôt foncier et un taux de droits de
succession, tous deux croissants avec le siècle (0 % / 0 % sous la Fondation,
3,4 % / 45 % à l'époque moderne).

- `annualLevy()` tombe chaque hiver sur `estateValue()` (terres hors classement,
  troupeau, chevaux, affaires). `propertyRate()` est **progressif** : au-delà de
  600 ha, chaque tranche de 700 ha alourdit le taux de 45 %. Faute de
  trésorerie, le comté se sert sur le troupeau puis sur les terres.
- `inheritanceDuty(planned)` frappe à **chaque succession**, sur tout le
  patrimoine, trésorerie comprise. C'est le seul prélèvement à l'échelle des
  fortunes de fin de partie. Un héritier désigné de longue main (`×0,78`), un
  enfant aux comptes, une autorité acquise l'allègent ; une maison divisée
  l'aggrave. Mesuré : **3,5 à 4,6 M$ prélevés par partie** en jeu compétent.
- `serviceDebt()` fait courir les dettes contractées en événement, à 2,8 %
  par trimestre (4,5 % dans les années 80), et rembourse dès que la caisse suit.

### Ce que la terre n'a pas oublié

Le ranch est bâti sur des terres cédées sous contrainte, et le droit finit par
le rappeler. La **nation ashkani** est un cinquième type de faction
(`FACTION_TYPES.nation`), présent aux sept époques — et le seul dont la nature
change avec le siècle :

- **avant 1946** (`nationHasCourt()`), aucun recours judiciaire : le litige se
  règle sur le terrain, clôtures couchées et bêtes rabattues ;
- **après 1946**, il se règle au prétoire, et coûte infiniment plus cher.

`state.claimPressure` monte à chaque hectare pris de force — l'opération
« occuper une concession », la doctrine « prendre la terre d'abord », le forage
pétrolier — et `claimStrength()` y ajoute l'hostilité de la nation et la
cupidité cumulée de la lignée. Passé un seuil, la revendication est déposée :
`settleClaim()` prend d'abord l'argent, puis les hectares. La faveur
diplomatique `nation` permet de solder à l'amiable, bien moins cher, à condition
de s'y être pris tôt.

> Le nom « ashkani » est inventé. Mettre des mots dans la bouche d'une nation
> réelle serait déplacé ; la situation, elle, ne l'est pas.

## Les années calmes n'existent plus

Deuxième défaut mesuré : passé la Fondation, plus rien ne pouvait vraiment tuer
une partie bien menée. Chaque époque a désormais ses ennuis à sa mesure — 171
événements contre 144 en V3.5 :

| Époque | Ce qui peut mettre la panade |
|---|---|
| Prohibition | L'homme de Chicago, fusillade au portail nord, camion disparu, raid fédéral, adjoint retrouvé mort, alambic clandestin |
| — | *(183 événements au total, contre 144 en V3.5)* |
| Après-guerre | Autoroute expropriante, quarantaine pour brucellose, traites du tracteur, retombées d'essai nucléaire, grève aux abattoirs |
| Années 80 | Taux à vingt pour cent, rachat hostile, scandale des hormones, incendie de la grange |
| Mondialisation | Embargo vache folle, retour des loups, partage des droits d'eau, promoteur immobilier |
| Aujourd'hui | Mégafeu, caméra cachée, rançongiciel, sécheresse structurelle, la dernière source de la vallée, le train de nuit vers l'abattoir, le partage impossible |

`state.mobTies` mesure les liens noués avec la pègre : ils ouvrent des
événements, et les referment quand on les rompt.

## Les investisseurs, à partir de 2010

La dernière époque n'a plus de rival à cheval : elle a des gens qui achètent des
vallées entières depuis un bureau. `ensureDeveloper()` en fait entrer un en
scène dès 2010 (`DEVELOPER_FROM`), et sa `pressure` monte toute seule — d'autant
plus vite que le domaine est vaste, la maison respectée, et les refus nombreux.
Elle est calibrée pour que l'escalade complète tienne dans les seize ans qui
restent.

Chaque palier ouvre son événement :

| Pression | Ce qui arrive |
|---|---|
| 12 | La première offre, par courrier recommandé : quatre fois le prix agricole |
| 25 | L'hélicoptère au-dessus des pâtures, trois matins de suite |
| 30 | Ils ont racheté toute la vallée sauf vous |
| 45 | Le reclassement en zone constructible — la note foncière triple |
| 55 | Un héritier a signé dans votre dos |
| 70 | **L'offre qui ferme tout** |

`sellTheRanch()` est un vrai bouton de sortie : la partie s'arrête, riche et
sans nom, avec sa propre fin (« Le ranch vendu ») et son propre verdict selon
que la lignée était honorable ou avide. Ce n'est pas un échec — c'est un choix,
et il ferme la dynastie pour de bon. L'héritage moral est enregistré comme pour
n'importe quelle fin, donc la partie suivante peut relever le nom.

La contre-mesure existe : la **servitude agricole perpétuelle** met le domaine
hors du marché pour toujours, fait retomber la pression de 25 points et allège
l'impôt — au prix que ces terres ne se vendront plus jamais, ni par vous ni par
vos enfants.

## Les choix qui n'ont pas de retour

Quelques événements engagent la maison au-delà du tour, dans l'esprit d'une
saga plutôt que d'un jeu de gestion : laisser le contremaître « régler » le cas
d'un inspecteur véreux, déshériter et chasser l'enfant qui a signé derrière
votre dos, tenir un blocus onze jours face aux fédéraux, livrer les meneurs pour
sauver le ranch, ouvrir la dernière source de la vallée ou la vendre au prix de
l'eau, léguer tout à un seul héritier devant ses frères et sœurs.

Ils laissent tous une trace durable — une rancune dans `legacy.grudges`, un
enfant retiré de `state.children`, une entrée dans la chronique — et aucun n'a
d'annulation.

## Les cow-boys comptent enfin

Deux mécaniques leur donnent un poids réel hors du rendement du troupeau.

**L'escouade.** Tout coup en douce dont l'avantage est le tir (`edge:"shoot"`,
voir `needsSquad()`) passe désormais par `openSquadPanel()` : on choisit
nommément qui part, avec les chances recalculées à chaque clic.
`squadOdds()` pèse la **moyenne** de tir et d'équitation des hommes choisis,
plus un bonus de nombre — mais au-delà de cinq, la troupe se fait repérer.
Adjoindre un manœuvre à un tireur d'élite **dégrade** les chances : la qualité
prime sur le nombre.

En cas d'échec, `squadCasualties()` expose chaque homme séparément — blessé
(tir en baisse), arrêté (il parle, les soupçons montent) ou tué, avec son nom
dans la chronique. En cas de réussite, `squadReward()` renforce leur loyauté et
prélève leur part. On finit par tenir à eux.

**Les fusillades.** `ranchGunStrength()` agrège le tir des hommes, le nombre de
bons tireurs, les armes et les enfants affectés à la sécurité. C'est elle qui
décide de l'issue des fusillades de la Prohibition. `hurtCowboys()` paie
l'addition en visages, pas en points de jauge.

Le catalogue compte **36 opérations, quatre à six par époque**. Les quatorze
ajoutées en V3.8 répondent aux nouveaux systèmes : *faire disparaître un
certificat vétérinaire* lève une quarantaine, *faire racheter sa propre dette*
par un prête-nom en efface une part et remet le compteur d'échéances à zéro,
*faire passer de l'argent par le ranch* met le domaine sous administration
judiciaire quand ça rate. S'y ajoutent le déplacement de clôture, le
détournement de ruisseau, le détournement de convoi (l'opération la plus
dangereuse du jeu), le débit clandestin, la revente de l'aide alimentaire, le
retrait avant fermeture de la banque, l'achat du syndicat des routiers,
l'incendie assuré, la fraude aux quotas d'export, le surprélèvement d'eau et la
fausse certification bio.

⚠️ `runIllegalOp(id)` sans escouade reste valable et joue sur la moyenne du
ranch : c'est la voie qu'empruntent les tests et les simulations.
`chooseIllegalOp(id)` est le point d'entrée de l'interface.

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
- `scripts/build-artifact.js` échoue sur **toute** URL restante, sauf
  `http://www.w3.org/2000/svg` (espace de noms XML, pas une requête réseau).
- Le jeu tourne volontairement en léger déficit passif : c'est ce qui pousse à agir.
- ⚠️ `endTurn` est **enveloppée** par le bloc 3 (`const oldEnd=endTurn; endTurn=function(){…}`).
  Ne jamais passer la référence directement à `addEventListener` : cela figerait la version
  initiale et le code du bloc 3 ne s'exécuterait jamais. Toujours `()=>endTurn()`.
- Ne jamais identifier un enfant par son prénom : le joueur peut le renommer et deux
  enfants peuvent être homonymes. Utiliser `cid`.
- ⚠️ **Un libellé de choix peut être une fonction** (pour citer un montant à
  l'échelle de l'époque). `presentEvent` doit le passer par `evalField` : sans
  cela le bouton affiche le code source de la fonction. Un test balaie tous les
  événements pour s'en assurer.
- ⚠️ **Un événement dont toutes les branches sont conditionnelles peut s'afficher
  sans aucun bouton** et bloquer la partie. `presentEvent` ajoute désormais une
  sortie « Laisser passer » en dernier recours, et un test éprouve chaque
  événement et chaque chapitre d'arc sur un état démuni. Mieux vaut quand même
  poser une `condition:` sur l'événement lui-même.

## Équilibrage

Courbe mesurée sur 40 parties par profil (`node tests/sim.js index.html 40 <profil>`) :

| Profil | Description | Fin médiane | Tours | Trésorerie finale* | Terres | Troupeau |
|---|---|---|---|---|---|---|
| `passive` | ne fait rien | 1893 | 35 | −246 | 185 | 25 |
| `outlaw` | contrebande à chaque tour | 1905 | 83 | 10 553 | 320 | 28 |
| `honest` | concours et élevage | 2026 | 337 | 301 959 | 1 733 | 595 |
| `mixed` | troupeau + crime d'appoint | 2026 | 337 | 269 430 | 3 110 | 1 087 |
| `policy` | conduite complète du ranch | 2026 | 337 | 289 163 | 3 125 | 1 086 |

\* en dollars de 1885, seule façon de comparer d'une époque à l'autre.

**Où en est la trésorerie de fin de partie**, en dollars constants, à conduite
égale : 1,43 M$ en V3.5, 0,56 M$ en V3.6 (impôts et affaires d'époque), 0,46 M$
en V3.7 (tour annuel), **0,29 M$ en V3.8** (mises aux normes). Le domaine, lui,
n'a pas reculé : 3 125 ha et 1 086 têtes. L'argent a un emploi et des
échéances ; il ne s'entasse plus.

**Chutes postérieures à 1950**, jusque-là inexistantes : 3 parties sur 40 en jeu
compétent, 11 sur 40 en jeu hors-la-loi — faillites, expropriations fiscales et
ventes volontaires.

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
# variété du catalogue, arcs d'époque, triangle, absence d'impasse.
# doctrines couplées aux arcs, siège et mariage rival.
# chronique de la saga, tournant fondateur.
# export de la chronique, variantes de départ.
# affaires d'époque, fiscalité, escouade, revendication foncière, pègre.
# tour annuel, investisseurs immobiliers.
# chute d'une dynastie établie, quarantaine, partage, alertes, libellés.
# 618 vérifications, sortie non nulle en cas d'échec.
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

- **La chute d'une dynastie établie reste rare en jeu compétent** (3 parties sur
  40 après 1950). C'est voulu — mais elle vient presque toujours de la banque ;
  le partage successoral et l'expropriation fiscale se déclenchent moins souvent
  qu'ils ne le devraient
- **La première moitié reste au trimestre** : 260 tours de 1885 à 1949. Passer
  au tour annuel dès 1920, ou au semestre, la raccourcirait encore
- Le départ `established` est nettement plus clément que les deux autres : il
  mériterait sa propre difficulté, ou un handicap compensatoire (dettes du
  prédécesseur, rancune héritée)
- Les maisons rivales **réagissent** mais ne planifient jamais : un rival qui
  poursuivrait un projet sur vingt ans changerait beaucoup
- L'affiche exportée est un SVG ; un export PNG demanderait un passage par
  `<canvas>`, faisable sans dépendance
- Une galerie des dynasties tombées plutôt qu'une seule entrée `LEGACY_KEY`,
  pour choisir quel nom relever
- Faire peser `state.plus` sur la partie elle-même (le comté se souvient des
  familles qui ont déjà échoué deux fois)
