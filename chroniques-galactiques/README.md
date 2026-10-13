# Chroniques galactiques — sources

Jeu de rôle Star Wars avec MJ intégré, en HTML/CSS/JS sans dépendance.

## Principe directeur

**C’est un jeu de rôle : le récit est le cœur du jeu, tout le reste est à son service.**

- Les combats n’ont lieu que si l’histoire y mène ; leur résultat revient dans l’histoire et ses conséquences se racontent.
- Une mécanique n’a sa place que si elle donne de la matière au MJ (une blessure, une dette, une réputation, un lien qui change).
- Le jeu ne propose rien que l’histoire n’ait amené : un système (contrats, jauge de la Force…) n’apparaît que si la partie y conduit.
- Interrogatoires, négociations, séductions et menaces se jouent à l’écrit avec le MJ, avec un jet de dés si l’issue est incertaine. Pas de mini-jeu à la place d’une scène.
- Dialogues, romances, loyautés et trahisons méritent autant de soin que les batailles.

Toute évolution du jeu doit respecter ce principe.

## Ce que le jeu gère

- **Récit** : MJ intégré, jets 3d6 sous la compétence, points de Destin (relance d’un jet raté), régénérer la réponse du MJ, annuler son action, questions hors-jeu.
- **Conséquences** : PV du héros et des compagnons, coque de la flotte et du vaisseau personnel, effectifs des troupes ; repos entre chapitres, soins, réparations, renforts et achats dans l’onglet Intendance.
- **Progression** : l’XP donnée par le MJ s’achète en compétences, endurance, formes de sabre et techniques.
- **Mémoire** : carnet de campagne (PNJ, quêtes, lieux, factions), résumé de chaque chapitre, livre de campagne exportable.
- **Relations** : affinité, nature du lien, voix et historique de chaque PNJ ; romances par étapes selon le réglage de la session zéro ; scènes de respiration ; longueur et style de narration réglables en cours de partie.
- **Combats** : duel (7 décors qui comptent : glace, lave, sable, forêt… ; au-delà de 4 adversaires, les autres arrivent en **vagues de renforts** au fil des échanges), combat du vaisseau personnel avec fuite en hyperespace, bataille spatiale (4 décors ; missions bataille, escorte, blocus, station ; tempête ionique), bataille terrestre (6 terrains, 5 cartes dont ville, canyon, base fortifiée et rivière ; 6 météos dont nuit et brouillard ; 7 objectifs). La force des ennemis est ajustée à la difficulté choisie en session zéro.
- **Équilibrage des combats rapprochés** : une petite simulation des pertes (renforts, tir visé, un coup au moins par adversaire) ajuste PV et précision des adversaires ordinaires pour un **héros de référence** (13 dans sa compétence de combat, sans équipement spécial) : l'XP et l'équipement gagnés se ressentent vraiment. Dans le Carnet, un PNJ peut **rejoindre le groupe** (bouton « Rejoint ton groupe ») et le quitter. Un Sith ou un Jedi ennemi n'est jamais affaibli face à un camp sans la Force : la carte de combat annonce honnêtement les chances (favorable, équilibré, risqué, désespéré). Les **sbires** tombent en un ou deux coups ; quand leur **chef** tombe ou que la moitié du groupe est à terre, ils peuvent **fuir**. Un héros blessé entre au combat avec la moitié de ses PV au moins, mais subit −1 (blessé) ou −2 (gravement blessé) à tous ses jets jusqu'à ses soins. Les Mandaloriens (beskar, jetpack, lance-flammes, roquettes) sont les rares à pouvoir tenir tête à un utilisateur de la Force.
- **Factions** : 9 styles (Empire, Rébellion, République, Séparatistes, Mandaloriens, pirates, Vong, Chiss, Empire Sith) pour les vaisseaux et les troupes ; 47 modèles de personnages pour toutes les époques ; le MJ peut composer un PNJ inédit (tête, tenue, couleurs, arme, capacités).
- **Systèmes débloqués par l’histoire** : tableau des contrats (si le personnage se lance dans la chasse aux primes), réputation par faction, jauge de la Force pour les personnages sensibles à la Force.
- **Son** : effets synthétisés dans le navigateur, bouton pour couper le son.
- **Campagnes** : plusieurs campagnes en parallèle, import et export de sauvegarde.

## Structure

- `chroniques.html` — **le jeu complet assemblé** (c'est ce fichier qui est publié en artifact). Ne pas le modifier à la main : il est généré.
- `build/shell.html` — la coquille du jeu : écran titre, création de personnage, session zéro, récit, appels au MJ, sauvegarde, lancement des combats.
- `build/build.py` — assemble `shell.html` + les trois moteurs en un seul fichier (`python3 build/build.py`).
- `kessaria.html` — moteur de bataille spatiale (jouable seul).
- `assaut-kessaria.html` — moteur de bataille terrestre (jouable seul).
- `arene.html` — moteur de combat rapproché (sabres + blasters, éditeur de combattants, jouable seul).
- `t/e2e.js` — test de bout en bout avec un faux MJ (`cd t && npm i jsdom@24 && node e2e.js`) : création, jets et Destin, les trois combats, blessures, carnet, progression, intendance, régénérer/annuler, hors-jeu, export, multi-campagnes, reprise d’une ancienne sauvegarde.
- `t/sim.js` — simulateur d'équilibrage : joue des centaines de combats rapprochés avec le vrai moteur, sans animation (`node sim.js 30`, filtres `DIFFS`, `TEAMS`, `FOES`), et compare victoires réelles et chances annoncées.

## Comment ça s'assemble

`build.py` préfixe les identifiants de chaque moteur (`sp-`, `gr-`, `ar-`), isole leur CSS (`#eng-space`, `#eng-ground`, `#eng-duel`), et leur ajoute :
- `window.ENGINES.<space|ground|duel>.start()` qui lit la configuration dans `window.__CFG`,
- un rappel `window.__engineEnd(moteur, {win, text, report, lost})` en fin de combat,
- un bouton « Retour au récit ».

Après toute modification d'un moteur ou de la coquille : relancer `python3 build/build.py`, puis le test.

## À savoir

- Le MJ intégré utilise la capacité `sample` des artifacts claude.ai (`window.claude.use("sample")`), la sauvegarde utilise `db` et `user`, et l’export (livre de campagne, fichier de sauvegarde) utilise `downloads`. **Ouvert en local dans un navigateur, le MJ ne répond pas** : le jeu doit être republié en artifact avec les capacités `{"sample": {}, "db": {}, "user": {}, "downloads": true}` pour fonctionner.
- Sauvegarde : un index (`data/users/<id>/index`), une fiche par campagne (`camp_<id>`) et le livre découpé en parties de 200 Ko (`book_<id>_<n>`). L’ancienne sauvegarde unique (`campaign`) est reprise automatiquement dans la liste.
- Pour mettre à jour l'artifact existant (et garder le même lien), republier `chroniques.html` en donnant l'URL de l'artifact.
