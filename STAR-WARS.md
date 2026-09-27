# L'Effondrement — 75 ap. BY (prototype v0.6)

Jeu de grande stratégie galactique au tour par tour, dans l'esprit de Total War.
Tout tient dans `star-wars.html` : l'ouvrir dans un navigateur, sans dépendance ni build.
Jouable sur ordinateur et sur téléphone. Ranch Dynasty (`index.html`) reste inchangé.

Le game design complet vit dans le doc « Game design — Jeu de stratégie Star Wars (75 ap. BY) ».
Ce prototype couvre les six premières étapes de sa feuille de route.

## v0.1 — la carte galactique

- 34 systèmes répartis en 5 régions (Noyau, Colonies, Bordure Médiane, Bordure Extérieure, Régions Inconnues), reliés par des routes hyperspatiales.
- 4 factions jouables sur la carte, avec leur force et leur faiblesse : Vestiges impériaux, République restaurée, Mandalore, Ligue de la Bordure. Les autres mondes sont indépendants. Le Sith est la cinquième faction jouable (v0.6).
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

## v0.3 — les batailles terrestres et les invasions

- Prendre un monde se fait en deux temps : gagner l'orbite, puis débarquer. Le siège n'use plus que les défenses planétaires.
- 4 types de troupes : infanterie, blindés, marcheurs, artillerie. On les recrute dans la caserne de chaque monde (blindés et marcheurs demandent un chantier).
- Chaque monde a une garnison, les mondes indépendants une milice qui se reforme. Une garnison solide empêche les révoltes et soutient la loyauté.
- Les troupes voyagent dans les soutes : 6 places par destroyer, 2 par frégate. Un vaisseau perdu emporte les troupes qu'on ne peut plus loger.
- Bataille au sol sur la même grille : blindage orienté (qui ne se régénère pas), couvert en forêt, hauteurs (+1 portée), météo (tempête, boue).
- 3 points de contrôle : l'assaillant qui en tient 2 à la fin du 10e round prend la planète.
- Défenses planétaires : tant qu'elles tiennent, les défenseurs sont retranchés (jusqu'à −30 % de dégâts). Sous 50 %, le bouclier tombe et la flotte peut appuyer l'assaut par des frappes orbitales, qui touchent aussi ses propres troupes.
- Mandalore a les meilleures troupes au sol (+30 %).

## v0.4 — la politique

Bouton « Gouvernement » en haut de l'écran.

- Chaque faction a son régime et trois groupes internes, chacun avec une satisfaction et un chef :
  - Vestiges impériaux, Conseil des Moffs (Militaristes, Technocrates, Loyalistes). Un Moff mécontent détourne 10 % des crédits ; quatre tours sous 20, il fait sécession avec un monde et la flotte qui s'y trouve.
  - République restaurée, Sénat (Faucons, Mondes du Noyau, Humanistes). Les décrets importants passent au vote (50 sièges sur 100) ; l'influence achète les voix qui manquent. Après une défaite, un Sénat mécontent dépose une motion de défiance.
  - Mandalore, Clans (guerriers, mercenaires, Anciens). L'autorité du Mand'alor monte avec les victoires ; sous 30, un chef de clan le défie en duel.
  - Ligue de la Bordure, Assemblée (Bloc frontalier, Guildes marchandes, Mondes libres). Chaque bloc représente des mondes ; trois tours sous 20, il quitte la Ligue avec eux.
- Chaque groupe a un rôle : l'armée veut des victoires, l'économie des revenus, l'ordre de la loyauté, le peuple la paix et des impôts modérés. Tous les 5 à 7 tours, le groupe le plus mécontent formule une exigence (prendre un monde, atteindre un revenu, tenir l'ordre, faire baisser la lassitude).
- Les 7 décrets du doc : Conscription, Économie de guerre, Loi martiale, Propagande, Amnistie des contrebandiers, Guerre au crime, Doctrine de terreur (Vestiges impériaux seulement, irréversible). Chacun coûte de l'influence, dure plusieurs tours, a une contrepartie et fait réagir les groupes. Trois décrets au plus à la fois.
- Personnages générés : dirigeant, chefs de groupe, un amiral par flotte, un gouverneur par monde. Traits (brillant, incompétent, corrompu, ambitieux, cruel, prudent, populaire, loyal), loyauté, ambition, expérience. On peut les récompenser ou les démettre.
- Un amiral qui gagne prend de l'expérience et de l'ambition ; trop ambitieux et peu loyal, il devient un rival puis fait défection avec sa flotte. Un gouverneur corrompu et déloyal peut vendre son monde. Les personnages meurent au combat ou partent à la retraite, et leurs traits partent avec eux.
- Dilemmes à trancher en début de tour : duel pour le titre de Mand'alor, motion de défiance, amiral rival.
- Lassitude de guerre : elle monte à chaque tour de combat, même victorieux, et fait baisser la loyauté (jusqu'à −10).
- La réputation auprès des Jedi est suivie dès maintenant ; elle servira en v0.6.

## v0.5 — les événements aléatoires et le Syndicat

Bouton « Syndicat » en haut de l'écran.

- **Emprise, monde par monde** (0 à 100 %) : plus forte en Bordure et sur les carrefours commerciaux. Elle grimpe avec chaque contrat, les gouverneurs corrompus, la loyauté basse et l'Amnistie ; elle recule avec la Guerre au crime et la purge.
- **Seuils** : l'emprise ronge les crédits du monde ; à 50 %, le Syndicat en détourne la moitié ; à 80 %, le gouverneur passe à sa solde et le monde peut basculer sous son contrôle. Il faut alors une invasion pour le reprendre.
- **Services** : prêt (200 crédits, 260 à rendre en 8 tours), flotte ou compagnie de mercenaires, contrebande pour lever un blocus 5 tours, renseignements sur les rivaux, assassinat d'un dirigeant, chef de groupe ou amiral. Le Syndicat refuse de traiter pendant la Guerre au crime.
- **Dette impayée** : elle grossit de 10 % par tour et déclenche des représailles (piraterie, sabotage, assassinat d'un gouverneur ou d'un amiral).
- **Il sert tout le monde** : ce qu'on lui paie remplit son trésor, qui finance ensuite la faction la plus faible.
- **La reprise** : purger un monde coûte 10 d'influence et 15 de loyauté ; un monde du Syndicat se reprend par la force ; la Guerre au crime fait reculer l'emprise partout.
- **16 événements**, un ou deux par tour, en six familles : personnage (massacre, autonomie, jeune officier, espion), économie (grève, boom, pénurie), Syndicat (contrat d'assassinat, contrebandiers, pots-de-vin), Force (enfant sensible à la Force), catastrophe (épidémie, séisme, famine), opportunité (chantier abandonné, relique). Ils dépendent de l'état de l'empire : mondes peu loyaux, forte emprise, impôts élevés.
- **Effets différés** : un massacre couvert qui éclate au grand jour, un officier négligé qui passe à l'ennemi, un espion retourné qui était un agent double, un contrat refusé que ton rival accepte, une épidémie abandonnée qui se propage.

## v0.6 — la Force

**L'Ordre Jedi**, joué par l'IA, ne peut pas être conquis :
- **Jugement** : chaque faction a une réputation auprès de l'Ordre. Honorable (75 et plus), elle reçoit un Chevalier Jedi qui combat dans sa flotte. Cruelle (20 ou moins), les Jedi soutiennent la résistance sur ses mondes.
- **Protection** : quand une faction cruelle (ou le Sith) envahit un monde, un Chevalier Jedi peut se joindre aux défenseurs.
- **Médiation** : tous les 12 tours, l'Ordre propose une trêve aux deux factions les plus épuisées. Pendant une trêve, ni bataille ni invasion entre elles ; la rompre coûte 15 de réputation.
- **Chasse aux Sith** : ses enquêtes font monter l'Exposition du Sith. Une faction bien vue des Jedi voit parfois un agent Sith démasqué chez elle ; toute faction peut aussi faire enquêter sur un personnage (10 d'influence).

**Le Sith jouable, mode Ombre** (cinquième carte de l'écran titre, bouton « Ombre ») :
- Sans planète ni flotte au départ. Ressources : Puissance obscure, acolytes (qui donnent des actions), et dossiers de chantage sur les personnages.
- **Phase 1, l'Ombre** : recruter des acolytes, fouiller les systèmes pour trouver les 3 sites Sith et leurs holocrons (placés au hasard), monter des dossiers, corrompre des personnages, semer le chaos. Les batailles de toute la galaxie nourrissent la Puissance obscure.
- **Phase 2, l'Emprise** (Puissance 80, deux personnages corrompus) : assassinats par les acolytes, votes truqués qui renversent un dirigeant, chasse aux Jedi. Un amiral corrompu peut trahir en pleine bataille.
- **Phase 3, la Revendication** (Puissance 200) : coup d'État sur les Vestiges impériaux avec deux Moffs corrompus (la faction entière passe au Sith), ou Empire Sith fondé sur quatre mondes aux gouverneurs corrompus.
- **L'Exposition** : chaque action visible la fait monter, les enquêtes Jedi aussi ; faire le mort la fait redescendre. À 50, des rumeurs courent et les Jedi tuent des acolytes ; à 80, toutes les factions démasquent ses agents ; à 100, le culte est anéanti.
- **Victoire Sith** : dominer la galaxie et éradiquer l'Ordre Jedi.
- **Au combat** : le Seigneur Sith, ses acolytes et les Chevaliers Jedi sont des unités héroïques. Au sol, ils combattent en première ligne et ne fuient jamais ; dans l'espace, ils boostent la flotte par la méditation de combat. Leur mort est définitive ; si le Seigneur Sith tombe, un acolyte prend sa place, et sans acolyte la lignée s'éteint.
- Quand il n'est pas joué, l'IA le contrôle avec les mêmes règles.

Les choix de v0.4 et v0.5 servent ici : la réputation Jedi accumulée, et l'enfant sensible à la Force des événements (confié aux Jedi, il renforce l'Ordre ; abandonné, il devient un acolyte).

## Architecture

Deux blocs `<script>` dans `star-wars.html` :

| Bloc | Contenu |
|---|---|
| Moteur | Données (`SYSTEMS`, `LINKS`, `FACTIONS`, `SHIPS`, `TROOPS`, `UNITS`), `newGame`, économie, loyauté, troupes et invasions (`embark`, `makeInvasion`, `autoGround`, `applyGround`), politique (`REGIMES`, `DECREES`, `TRAITS`, `genChar`, `enactDecree`, `voteSupport`, `politicsTurn`, `resolveDilemma`), Syndicat et événements (`syndCut`, `takeLoan`, `hireMercs`, `assassinate`, `purge`, `syndicateTurn`, `EVENTS`, `DELAYED`, `eventsTurn`, `resolveEvent`), la Force (`hostile`, `jediTurn`, `sithTurn`, `sithCorrupt`, `sithCoup`, `sithClaim`, `probeChar`, `aiSith`, `HEROES`), `runAI`, `finishTurn`, batailles (`autoBattle`, `createBattle`, `createGroundBattle`, `bAttack`, `bOrbital`, `bRunAI`, `bResult`, `applyBattle`). Aucune dépendance au DOM. |
| Interface | Écran titre, carte SVG, panneau, écrans Gouvernement, Syndicat et Ombre, dilemmes et événements, bataille sur grille SVG, modales, sauvegarde `localStorage` (`sw75-save`). |

L'aléatoire est un mulberry32 dont l'état vit dans la partie (`st.rng`) : une graine rejoue la même partie.

## Tests

```
node tests/sw-sim.js [parties] [tours max]
```

Joue des parties complètes où l'IA contrôle toutes les factions et vérifie les invariants à chaque tour (soutes jamais surchargées, garnisons positives…). Vérifie aussi que chaque monde a son gouverneur et chaque flotte son amiral. Joue 60 batailles spatiales et 60 batailles terrestres IA contre IA, contrôle les boucliers orientés, les frappes orbitales, le vote du Sénat, chaque option de chaque dilemme et de chaque événement (suivie de 12 tours pour déclencher les effets différés), les services du Syndicat (prêt, dette impayée, mercenaires, assassinat, purge), et la Force (coup d'État, Empire Sith, découverte fatale, succession du Seigneur Sith, trêve, invasion avec héros et Chevalier Jedi, enquête, condition de victoire Sith). Le Sith fait partie de la rotation des factions jouées.
