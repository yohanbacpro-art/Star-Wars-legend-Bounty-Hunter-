# Chroniques galactiques — sources

Jeu de rôle Star Wars avec MJ intégré, en HTML/CSS/JS sans dépendance.

## Structure

- `chroniques.html` — **le jeu complet assemblé** (c'est ce fichier qui est publié en artifact). Ne pas le modifier à la main : il est généré.
- `build/shell.html` — la coquille du jeu : écran titre, création de personnage, session zéro, récit, appels au MJ, sauvegarde, lancement des combats.
- `build/build.py` — assemble `shell.html` + les trois moteurs en un seul fichier (`python3 build/build.py`).
- `kessaria.html` — moteur de bataille spatiale (jouable seul).
- `assaut-kessaria.html` — moteur de bataille terrestre (jouable seul).
- `arene.html` — moteur de combat rapproché (sabres + blasters, éditeur de combattants, jouable seul).
- `t/e2e.js` — test de bout en bout avec un faux MJ (`cd t && npm i jsdom@24 && node e2e.js`).

## Comment ça s'assemble

`build.py` préfixe les identifiants de chaque moteur (`sp-`, `gr-`, `ar-`), isole leur CSS (`#eng-space`, `#eng-ground`, `#eng-duel`), et leur ajoute :
- `window.ENGINES.<space|ground|duel>.start()` qui lit la configuration dans `window.__CFG`,
- un rappel `window.__engineEnd(moteur, {win, text, report, lost})` en fin de combat,
- un bouton « Retour au récit ».

Après toute modification d'un moteur ou de la coquille : relancer `python3 build/build.py`, puis le test.

## À savoir

- Le MJ intégré utilise la capacité `sample` des artifacts claude.ai (`window.claude.use("sample")`), et la sauvegarde utilise `db` et `user`. **Ouvert en local dans un navigateur, le MJ ne répond pas** : le jeu doit être republié en artifact avec les capacités `{"sample": {}, "db": {}, "user": {}}` pour fonctionner.
- Pour mettre à jour l'artifact existant (et garder le même lien), republier `chroniques.html` en donnant l'URL de l'artifact.
