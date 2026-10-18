// Holotable — moteur de règles, sans aucune dépendance au DOM.
//
// Ce fichier est inliné tel quel dans index.html par tools/build.js, et chargé
// directement par les tests Node. Tout passe par l'objet global `Engine`.
//
// Grille : hexagones « pointe en haut », coordonnées décalées odd-r (c, r).
// L'état de partie est un objet JSON pur : il se sauvegarde tel quel.

var Engine = (function () {
  "use strict";

  const SQ3 = Math.sqrt(3);

  // ---------------------------------------------------------------- Données

  const FACTIONS = {
    rebels:      { name: "Alliance rebelle",          short: "Alliance",     era: "Guerre civile galactique", bolt: "#ff5a3c" },
    empire:      { name: "Empire galactique",         short: "Empire",       era: "Guerre civile galactique", bolt: "#72ff7e" },
    republic:    { name: "République galactique",     short: "République",   era: "Guerre des clones",        bolt: "#5ab8ff" },
    separatists: { name: "Confédération séparatiste", short: "Séparatistes", era: "Guerre des clones",        bolt: "#ff3d3d" },
    mandalorians:{ name: "Clans mandaloriens",        short: "Mandaloriens", era: "Toutes époques",           bolt: "#ff8a3c" },
    underworld:  { name: "Pègre et chasseurs de primes", short: "Pègre",     era: "Toutes époques",           bolt: "#ffd23f" },
    free:        { name: "Indépendants",              short: "Indépendants", era: "Toutes époques",           bolt: "#e8e1c8" },
  };

  // Lettres aurebesh, pour baptiser les escouades.
  const AUREBESH = ["Aurek", "Besh", "Cresh", "Dorn", "Esk", "Forn", "Grek", "Herf", "Isk", "Jenth",
    "Krill", "Leth", "Mern", "Nern", "Osk", "Peth", "Qek", "Resh", "Senth", "Trill", "Usk", "Vev", "Wesk", "Xesh", "Yirt", "Zerek"];

  const TAGS = {
    agile:    { name: "Agile",       desc: "Les armes lourdes ne la touchent que sur 5+." },
    heavy:    { name: "Armes lourdes", desc: "–1 pour toucher les cibles agiles." },
    armored:  { name: "Blindé",      desc: "Seuls les 6 touchent, sauf arme perforante." },
    ap:       { name: "Perforant",   desc: "Ignore le blindage." },
    capital:  { name: "Capital",     desc: "Interdit dans les champs d'astéroïdes." },
    large:    { name: "Massif",      desc: "Ne profite jamais du couvert." },
    hover:    { name: "Répulseurs",  desc: "Franchit l'eau." },
    scout:    { name: "Éclaireur",   desc: "La végétation ne coûte qu'1 mouvement." },
    swarm:    { name: "Essaim",      desc: "+1 dé si un autre allié de même type est au contact de la cible." },
    coord:    { name: "Tir coordonné", desc: "+1 dé si un allié de même type est au contact du tireur." },
    ambush:   { name: "Embuscade",   desc: "+1 dé quand le tireur est à couvert." },
    regen:    { name: "Boucliers",   desc: "Récupère 1 PV au début de chacun de ses tours." },
    infantry: { name: "Infanterie",  desc: "" },
    vehicle:  { name: "Véhicule",    desc: "Les ruines lui coûtent 2 mouvements." },
    hero:     { name: "Personnage",  desc: "" },
    deflect:  { name: "Sabre laser", desc: "Esquive sur 4+ contre les tirs, pare sur 4+ au corps à corps, et tranche le blindage." },
    beskar:   { name: "Beskar",      desc: "Armure mandalorienne : esquive sur 4+ contre les tirs comme au corps à corps." },
    shield:   { name: "Bouclier",    desc: "Esquive sur 4+ contre les tirs (pas au corps à corps)." },
    hunter:   { name: "Traqueur",    desc: "+1 dé contre une cible déjà blessée." },
    jetpack:  { name: "Réacteur dorsal", desc: "Le terrain ne coûte qu'1 mouvement, l'eau se franchit." },
    melee:    { name: "Combattant", desc: "Pas d'arme à distance : il doit aller au contact." },
  };

  // size : plus grand côté du sprite, en largeurs d'hexagone.
  // base : angle (degrés, 0 = haut) vers lequel pointe le sprite d'origine.
  const TYPES = {
    xwing: {
      name: "X-wing T-65", faction: "rebels", theater: "space", kind: "Chasseur",
      sprites: ["xwing-1", "xwing-2", "xwing-3"], rotate: true, base: 0, size: 1.0,
      hp: 5, mv: 5, rng: 3, att: 3, def: 2, cost: 22, tags: ["agile", "ap"],
      ability: { id: "torpedo", type: "shot", name: "Torpilles à protons", uses: 1, bonus: 2,
        desc: "Une fois par bataille : tir avec 2 dés de plus." },
      desc: "Chasseur polyvalent de l'Alliance. Ses canons laser percent le blindage des vaisseaux capitaux.",
      naming: (n) => "Rouge " + n,
    },
    tie: {
      name: "Chasseur TIE/ln", faction: "empire", theater: "space", kind: "Chasseur",
      sprites: ["tie-1", "tie-2", "tie-3"], rotate: false, size: 1.0,
      hp: 3, mv: 6, rng: 2, att: 3, def: 3, cost: 12, tags: ["agile", "swarm"],
      desc: "Rapide, fragile et toujours en nombre. Redoutable en meute.",
      naming: (n) => "Noir " + n,
    },
    destroyer: {
      name: "Destroyer stellaire", faction: "empire", theater: "space", kind: "Vaisseau capital",
      sprites: ["destroyer"], rotate: true, base: 90, size: 2.7,
      hp: 22, mv: 2, rng: 5, att: 7, def: 2, cost: 120, tags: ["capital", "heavy", "armored", "ap", "large"],
      ability: { id: "launch", type: "spawn", name: "Lancer une escadrille", uses: 2, spawn: "tie",
        desc: "Action : déploie un TIE sur une case adjacente libre. Deux fois par bataille." },
      desc: "Classe Impérial. Une forteresse volante de 1 600 mètres.",
      naming: (n) => ["Dévastateur", "Chimaera", "Vengeance", "Tyran", "Relentless", "Judicator"][(n - 1) % 6],
    },
    moncal: {
      name: "Croiseur Mon Calamari", faction: "rebels", theater: "space", kind: "Vaisseau capital",
      sprites: ["moncal", "moncal-2"], variants: ["Croiseur en croissant", "Croiseur MC80B"], rotate: true, base: -90, size: 2.5,
      spriteBase: { "moncal-2": 90 },
      hp: 20, mv: 2, rng: 5, att: 7, def: 3, cost: 115, tags: ["capital", "heavy", "armored", "ap", "large", "regen"],
      desc: "Croiseur MC80. Ses boucliers redondants se régénèrent en plein combat.",
      naming: (n) => ["Home One", "Liberté", "Défiance", "Indépendance", "Salut", "Prosperité"][(n - 1) % 6],
    },
    venator: {
      name: "Destroyer Venator", faction: "republic", theater: "space", kind: "Vaisseau capital",
      sprites: ["venator"], rotate: true, base: 90, size: 2.7,
      hp: 25, mv: 2, rng: 5, att: 7, def: 2, cost: 115, tags: ["capital", "heavy", "armored", "ap", "large"],
      ability: { id: "broadside", type: "shot", name: "Bordée de turbolasers", uses: 2, bonus: 3,
        desc: "Deux fois par bataille : tir avec 3 dés de plus." },
      desc: "Porte-chasseurs et navire de ligne de la République.",
      naming: (n) => ["Résolu", "Négociateur", "Vigilance", "Tranquillité", "Intégrité", "Guarlara"][(n - 1) % 6],
    },
    storm: {
      name: "Stormtroopers", faction: "empire", theater: "ground", kind: "Infanterie",
      sprites: ["storm-1", "storm-2", "storm-3", "storm-4", "storm-5", "storm-6"], rotate: false, size: 1.0,
      hp: 3, mv: 3, rng: 4, att: 3, def: 3, cost: 11, tags: ["infantry"],
      desc: "Infanterie de ligne impériale. Armure solide, mouvement lent.",
      naming: (n) => "Escouade " + AUREBESH[(n - 1) % 26],
    },
    rebel: {
      name: "Soldats rebelles", faction: "rebels", theater: "ground", kind: "Infanterie",
      sprites: ["rebel-1", "rebel-2", "rebel-3", "rebel-4", "rebel-5", "rebel-6"], rotate: false, size: 1.0,
      hp: 3, mv: 4, rng: 4, att: 3, def: 2, cost: 10, tags: ["infantry", "ambush"],
      desc: "Mobiles, au mieux de leur forme sous le couvert.",
      naming: (n) => "Section " + AUREBESH[(n - 1) % 26],
    },
    clone: {
      name: "Clones", faction: "republic", theater: "ground", kind: "Infanterie",
      sprites: ["clone-501", "clone-212", "clone-coruscant", "clone-327", "clone-41", "clone-187"],
      variants: ["501e Légion", "212e Bataillon", "Garde de Coruscant", "327e Corps stellaire", "41e Corps d'élite", "187e Légion"],
      rotate: false, size: 1.0,
      hp: 3, mv: 4, rng: 4, att: 3, def: 3, cost: 13, tags: ["infantry", "coord"],
      desc: "Soldats d'élite de la République, entraînés à combattre ensemble.",
      naming: (n) => "Escouade " + AUREBESH[(n - 1) % 26],
    },
    b1: {
      name: "Droïdes B1", faction: "separatists", theater: "ground", kind: "Infanterie",
      sprites: ["b1-1", "b1-2", "b1-3", "b1-4", "b1-5", "b1-6"], rotate: false, size: 1.0,
      hp: 2, mv: 3, rng: 3, att: 3, def: 1, cost: 6, tags: ["infantry"],
      desc: "Bon marché, peu fiables, innombrables. Roger, roger.",
      naming: (n) => "Unité OOM-" + (n * 7 + 3),
    },
    atte: {
      name: "AT-TE", faction: "republic", theater: "ground", kind: "Marcheur lourd",
      sprites: ["atte", "atte-2"], rotate: true, base: 90, size: 1.9,
      hp: 14, mv: 2, rng: 6, att: 6, def: 3, cost: 80, tags: ["vehicle", "armored", "ap", "large"],
      ability: { id: "mass", type: "shot", name: "Canon à projection de masse", uses: 2, dice: 4, dmg: 2, rng: 8,
        desc: "Deux fois par bataille : tir à portée 8, 4 dés, 2 dégâts par touche." },
      desc: "Marcheur tout-terrain à six pattes, lent et presque indestructible.",
      naming: (n) => "AT-TE " + n,
    },
    atrt: {
      name: "AT-RT", faction: "republic", theater: "ground", kind: "Marcheur léger",
      sprites: ["atrt"], rotate: false, size: 1.05,
      hp: 6, mv: 5, rng: 3, att: 4, def: 2, cost: 28, tags: ["vehicle", "scout"],
      desc: "Marcheur de reconnaissance monoplace. Se faufile partout.",
      naming: (n) => "Éclaireur " + n,
    },
    tx130: {
      name: "Char TX-130 Saber", faction: "republic", theater: "ground", kind: "Char à répulseurs",
      sprites: ["tx130"], rotate: true, base: 0, size: 1.2,
      hp: 9, mv: 5, rng: 5, att: 5, def: 3, cost: 55, tags: ["vehicle", "armored", "ap", "hover"],
      desc: "Char rapide à répulseurs, armé de canons laser jumelés.",
      naming: (n) => "Saber " + n,
    },
    aat: {
      name: "Char AAT", faction: "separatists", theater: "ground", kind: "Char à répulseurs",
      sprites: ["aat"], rotate: true, base: 0, size: 1.2,
      hp: 10, mv: 4, rng: 5, att: 5, def: 3, cost: 50, tags: ["vehicle", "armored", "ap", "hover"],
      desc: "Char d'assaut blindé de la Fédération du Commerce.",
      naming: (n) => "AAT-" + (n * 11 + 1),
    },
    // ---------------- Empire
    executor: {
      name: "Super destroyer stellaire", faction: "empire", theater: "space", kind: "Vaisseau amiral",
      sprites: ["executor"], rotate: true, base: 90, size: 4.2,
      hp: 36, mv: 1, rng: 6, att: 11, def: 3, cost: 230, tags: ["capital", "heavy", "armored", "ap", "large"],
      ability: { id: "launch", type: "spawn", name: "Lancer une escadrille", uses: 3, spawn: "tie",
        desc: "Action : déploie un TIE sur une case adjacente libre. Trois fois par bataille." },
      desc: "Classe Exécuteur. Dix-neuf kilomètres de coque et l'arsenal d'une flotte entière.",
      naming: (n) => ["Exécuteur", "Ravageur", "Arrogant", "Annihilateur"][(n - 1) % 4],
    },
    atst: {
      name: "Marcheur éclaireur", faction: "empire", theater: "ground", kind: "Marcheur bipède",
      sprites: ["atst", "atdp"], variants: ["AT-ST", "AT-DP"], rotate: false, size: 1.1,
      hp: 8, mv: 4, rng: 4, att: 4, def: 2, cost: 40, tags: ["vehicle", "armored", "ap"],
      desc: "Marcheur bipède de patrouille. Blindé contre les blasters, vulnérable aux armes lourdes.",
      naming: (n) => "Marcheur " + AUREBESH[(n - 1) % 26],
    },
    sith: {
      name: "Seigneur sith", faction: "empire", theater: "ground", kind: "Utilisateur de la Force",
      sprites: ["sith-1", "sith-2"], variants: ["Inquisitrice", "Seigneur noir"], rotate: false, size: 1.05,
      hp: 6, mv: 5, rng: 0, att: 0, cac: 7, def: 2, cost: 45, tags: ["hero", "melee", "deflect"],
      ability: { id: "lightning", type: "shot", name: "Éclair de Force", uses: 2, dice: 4, rng: 3, ap: true,
        desc: "Deux fois par bataille : tir à portée 3, 4 dés perforants." },
      desc: "Duelliste redoutable au sabre laser. Renvoie les tirs de blaster et frappe à distance par la Force.",
      naming: (n) => ["Dark Nihara", "Dark Vesh", "Dark Kaal", "Dark Soryn"][(n - 1) % 4],
    },
    // ---------------- Alliance
    nebulon: {
      name: "Frégate Nebulon-B", faction: "rebels", theater: "space", kind: "Frégate",
      sprites: ["nebulon"], rotate: true, base: 90, size: 2.0,
      hp: 12, mv: 3, rng: 4, att: 5, def: 2, cost: 60, tags: ["capital", "heavy", "armored", "ap", "large"],
      ability: { id: "medic", type: "heal", name: "Frégate médicale", uses: 2, heal: 2,
        desc: "Action : rend 2 PV à chaque allié adjacent. Deux fois par bataille." },
      desc: "Escorteur polyvalent, souvent reconverti en navire-hôpital.",
      naming: (n) => ["Rédemption", "Espérance", "Vigilant", "Salut"][(n - 1) % 4],
    },
    // ---------------- République
    victory: {
      name: "Destroyer Victory", faction: "republic", theater: "space", kind: "Vaisseau capital",
      sprites: ["victory"], rotate: true, base: 90, size: 2.4,
      hp: 18, mv: 2, rng: 5, att: 7, def: 2, cost: 100, tags: ["capital", "heavy", "armored", "ap", "large"],
      desc: "Destroyer stellaire de première génération, taillé pour les combats en orbite.",
      naming: (n) => ["Persévérance", "Fidélité", "Constance", "Ténacité"][(n - 1) % 4],
    },
    arquitens: {
      name: "Croiseur léger Arquitens", faction: "republic", theater: "space", kind: "Croiseur léger",
      sprites: ["arquitens"], rotate: true, base: 90, size: 1.8,
      hp: 11, mv: 3, rng: 4, att: 5, def: 2, cost: 55, tags: ["capital", "heavy", "armored", "ap", "large"],
      desc: "Croiseur rapide d'escorte, hérissé de turbolasers.",
      naming: (n) => ["Fulgurant", "Sentinelle", "Éclair", "Rempart"][(n - 1) % 4],
    },
    jedi: {
      name: "Jedi", faction: "republic", theater: "ground", kind: "Utilisateur de la Force",
      sprites: ["jedi-1", "jedi-2"], variants: ["Chevalière jedi", "Maître jedi"], rotate: false, size: 1.05,
      hp: 6, mv: 5, rng: 0, att: 0, cac: 6, def: 3, cost: 45, tags: ["hero", "melee", "deflect"],
      ability: { id: "push", type: "shot", name: "Poussée de Force", uses: 2, dice: 4, rng: 3, ap: true,
        desc: "Deux fois par bataille : tir à portée 3, 4 dés perforants." },
      desc: "Gardien de la paix, maître du sabre laser. Renvoie les tirs de blaster et pare les coups.",
      naming: (n) => ["Aelis Varo", "Tarn Okeda", "Ilena Sorr", "Kaeden Vos"][(n - 1) % 4],
    },
    atap: {
      name: "Marcheur AT-AP", faction: "republic", theater: "ground", kind: "Marcheur d'artillerie",
      sprites: ["atap"], rotate: true, base: 180, size: 1.6,
      hp: 12, mv: 2, rng: 6, att: 5, def: 3, cost: 75, tags: ["vehicle", "armored", "ap", "large"],
      ability: { id: "artillery", type: "shot", name: "Tir d'artillerie", uses: 2, dice: 4, dmg: 2, rng: 9, indirect: true,
        desc: "Deux fois par bataille : tir à portée 9, sans ligne de vue, 4 dés, 2 dégâts par touche." },
      desc: "Pièce d'artillerie sur pattes. Frappe par-dessus les obstacles.",
      naming: (n) => "AT-AP " + n,
    },
    // ---------------- Séparatistes
    recusant: {
      name: "Destroyer Recusant", faction: "separatists", theater: "space", kind: "Vaisseau capital",
      sprites: ["recusant"], rotate: true, base: 90, size: 2.8,
      hp: 18, mv: 2, rng: 5, att: 7, def: 2, cost: 100, tags: ["capital", "heavy", "armored", "ap", "large"],
      desc: "Destroyer léger de la Confédération, tout en canons.",
      naming: (n) => ["Malveillance", "Rapace", "Implacable", "Scalpel"][(n - 1) % 4],
    },
    munificent: {
      name: "Frégate Munificent", faction: "separatists", theater: "space", kind: "Frégate",
      sprites: ["munificent"], rotate: true, base: -90, size: 2.4,
      hp: 12, mv: 2, rng: 5, att: 5, def: 2, cost: 65, tags: ["capital", "heavy", "armored", "ap", "large"],
      desc: "Frégate du Clan bancaire, robuste et bien protégée.",
      naming: (n) => ["Usure", "Créance", "Intérêt", "Hypothèque"][(n - 1) % 4],
    },
    lucrehulk: {
      name: "Vaisseau de contrôle droïde", faction: "separatists", theater: "space", kind: "Vaisseau capital",
      sprites: ["lucrehulk"], rotate: false, size: 2.9,
      hp: 34, mv: 1, rng: 5, att: 7, def: 3, cost: 125, tags: ["capital", "heavy", "armored", "ap", "large"],
      desc: "Cargo Lucrehulk converti en base de commandement. Lent, énorme, presque impossible à abattre.",
      naming: (n) => ["Saak'ak", "Profit", "Revenu", "Dividende"][(n - 1) % 4],
    },
    b2: {
      name: "Super droïdes B2", faction: "separatists", theater: "ground", kind: "Infanterie lourde",
      sprites: ["b2-1", "b2-2", "b2-3", "b2-4"], rotate: false, size: 1.05,
      hp: 4, mv: 3, rng: 3, att: 4, def: 2, cost: 14, tags: ["infantry"],
      desc: "Blindés, lents, et un canon blaster dans chaque poignet.",
      naming: (n) => "Unité SBD-" + (n * 13 + 5),
    },
    droideka: {
      name: "Droïdekas", faction: "separatists", theater: "ground", kind: "Droïde destroyer",
      sprites: ["droideka-1", "droideka-2", "droideka-3", "droideka-4"], rotate: false, size: 1.0,
      hp: 4, mv: 4, rng: 3, att: 4, def: 2, cost: 24, tags: ["shield"],
      desc: "Arrive en roulant, se déploie derrière son bouclier et ouvre le feu.",
      naming: (n) => "Droïdeka " + AUREBESH[(n - 1) % 26],
    },
    // ---------------- Mandaloriens
    mando: {
      name: "Guerriers mandaloriens", faction: "mandalorians", theater: "ground", kind: "Infanterie d'élite",
      sprites: ["mando-rouge", "mando-vert", "mando-bleu", "mando-acier"],
      variants: ["Clan rouge", "Clan vert", "Clan bleu", "Beskar nu"], rotate: false, size: 0.95,
      hp: 6, mv: 5, rng: 4, att: 4, cac: 3, def: 3, cost: 34, tags: ["infantry", "jetpack", "beskar"],
      desc: "Armure de beskar presque impénétrable, réacteur dorsal : ils frappent là où on ne les attend pas.",
      naming: (n) => ["Ordo", "Vizsla", "Kryze", "Fett", "Wren", "Skirata"][(n - 1) % 6] + (n > 6 ? " " + Math.ceil(n / 6) : ""),
    },
    commando: {
      name: "Super commandos", faction: "mandalorians", theater: "ground", kind: "Infanterie",
      sprites: ["commando-1", "commando-2"], rotate: false, size: 1.05,
      hp: 5, mv: 4, rng: 4, att: 4, cac: 2, def: 3, cost: 20, tags: ["infantry"],
      desc: "Troupes de choc en armure noire, disciplinées et bien armées.",
      naming: (n) => "Escouade " + AUREBESH[(n - 1) % 26],
    },
    mandocuirasse: {
      name: "Cuirassé mandalorien", faction: "mandalorians", theater: "space", kind: "Vaisseau capital",
      sprites: ["mando-cuirasse"], rotate: true, base: 90, size: 3.2,
      hp: 26, mv: 2, rng: 5, att: 8, def: 2, cost: 125, tags: ["capital", "heavy", "armored", "ap", "large"],
      desc: "Vaisseau amiral des clans, effilé comme une lame.",
      naming: (n) => ["Kote", "Aliit", "Beskar'gam", "Verd'goten"][(n - 1) % 4],
    },
    mandodestroyer: {
      name: "Destroyer mandalorien", faction: "mandalorians", theater: "space", kind: "Destroyer",
      sprites: ["mando-destroyer"], rotate: true, base: 90, size: 2.3,
      hp: 15, mv: 3, rng: 5, att: 6, def: 2, cost: 80, tags: ["capital", "heavy", "armored", "ap", "large"],
      desc: "Destroyer rapide, taillé pour les raids.",
      naming: (n) => ["Ka'ra", "Haar'chak", "Oya", "Vod"][(n - 1) % 4],
    },
    mandoporteur: {
      name: "Porte-chasseurs mandalorien", faction: "mandalorians", theater: "space", kind: "Porte-chasseurs",
      sprites: ["mando-porteur"], rotate: true, base: 0, size: 2.2,
      hp: 18, mv: 2, rng: 4, att: 5, def: 3, cost: 95, tags: ["capital", "heavy", "armored", "ap", "large"],
      ability: { id: "launch", type: "spawn", name: "Lancer un Fang", uses: 3, spawn: "fang",
        desc: "Action : déploie un chasseur Fang sur une case adjacente libre. Trois fois par bataille." },
      desc: "Base volante des escadrilles de Fang.",
      naming: (n) => ["Gaan", "Ruus", "Kar'ta"][(n - 1) % 3],
    },
    fang: {
      name: "Chasseur Fang", faction: "mandalorians", theater: "space", kind: "Chasseur",
      sprites: ["fang"], rotate: true, base: 0, size: 1.15,
      hp: 4, mv: 6, rng: 3, att: 3, def: 2, cost: 18, tags: ["agile", "ap"],
      desc: "Chasseur d'interception rapide aux ailes repliées.",
      naming: (n) => "Fang " + n,
    },
    // ---------------- Pègre
    gamorreen: {
      name: "Gardes gamorréens", faction: "underworld", theater: "ground", kind: "Brutes",
      sprites: ["gamorreen-1", "gamorreen-2"], rotate: false, size: 1.05,
      hp: 5, mv: 3, rng: 0, att: 0, cac: 5, def: 2, cost: 9, tags: ["infantry", "melee"],
      desc: "Gardes du corps à la hache vibrante. Costauds, pas très vifs.",
      naming: (n) => ["Gorg", "Brug", "Ortugg", "Gakk", "Rogua", "Thok"][(n - 1) % 6],
    },
    trando: {
      name: "Chasseurs trandoshans", faction: "underworld", theater: "ground", kind: "Infanterie",
      sprites: ["trando-1", "trando-2"], rotate: false, size: 1.05,
      hp: 4, mv: 4, rng: 4, att: 3, def: 2, cost: 12, tags: ["infantry", "hunter"],
      desc: "Chasseurs reptiliens qui ne lâchent jamais une proie blessée.",
      naming: (n) => ["Ssorak", "Garsk", "Krassk", "Bossh", "Vhesk", "Tssar"][(n - 1) % 6],
    },
    chasseur: {
      name: "Chasseur de primes", faction: "underworld", theater: "ground", kind: "Mercenaire",
      sprites: ["chasseur-1", "chasseur-2"], variants: ["Chasseur", "Chasseuse"], rotate: false, size: 1.05,
      hp: 5, mv: 4, rng: 5, att: 4, def: 3, cost: 28, tags: ["hero", "hunter"],
      ability: { id: "aim", type: "shot", name: "Tir de précision", uses: 2, bonus: 2, ap: true,
        desc: "Deux fois par bataille : tir avec 2 dés de plus, perforant." },
      desc: "Professionnel du contrat. Vise juste et achève les blessés.",
      naming: (n) => ["Varek Sol", "Mira Dax", "Tobin Krell", "Sela Vonn"][(n - 1) % 4],
    },
    hutt: {
      name: "Croiseur hutt", faction: "underworld", theater: "space", kind: "Vaisseau capital",
      sprites: ["hutt"], rotate: true, base: 90, size: 3.0,
      hp: 22, mv: 2, rng: 5, att: 6, def: 3, cost: 105, tags: ["capital", "heavy", "armored", "ap", "large"],
      ability: { id: "launch", type: "spawn", name: "Lâcher une canonnière", uses: 1, spawn: "canonniere",
        desc: "Action, une fois par bataille : déploie une canonnière pirate sur une case adjacente libre." },
      desc: "Palais flottant d'un seigneur du crime, cuirassé d'or.",
      naming: (n) => ["Faveur de Desilijic", "Splendeur", "Opulence"][(n - 1) % 3],
    },
    pirate: {
      name: "Croiseur pirate", faction: "underworld", theater: "space", kind: "Croiseur",
      sprites: ["pirate"], rotate: true, base: 90, size: 2.4,
      hp: 15, mv: 3, rng: 4, att: 6, def: 2, cost: 70, tags: ["capital", "heavy", "armored", "ap", "large"],
      desc: "Coque rapiécée, canons surchargés. Frappe fort, encaisse mal.",
      naming: (n) => ["Rouille", "Charognard", "Dernière Chance"][(n - 1) % 3],
    },
    canonniere: {
      name: "Canonnière pirate", faction: "underworld", theater: "space", kind: "Canonnière",
      sprites: ["canonniere"], rotate: true, base: 90, size: 1.35,
      hp: 7, mv: 5, rng: 3, att: 4, def: 2, cost: 32, tags: ["ap"],
      desc: "Cargo armé jusqu'aux dents, rapide et solide.",
      naming: (n) => ["Vautour", "Poisse", "Contrebande", "Dette"][(n - 1) % 4],
    },
    // ---------------- Indépendants
    yacht: {
      name: "Yacht royal", faction: "free", theater: "space", kind: "Vaisseau diplomatique",
      sprites: ["yacht"], rotate: true, base: 90, size: 2.6,
      hp: 14, mv: 4, rng: 3, att: 3, def: 4, cost: 60, tags: ["capital", "armored", "large", "regen"],
      desc: "Vaisseau d'apparat aux boucliers puissants. Une cible à escorter.",
      naming: (n) => ["Étoile d'argent", "Couronne", "Ambassadrice"][(n - 1) % 3],
    },
    hero: {
      name: "Personnage", faction: "free", theater: "any", kind: "Pion libre",
      sprites: [], token: true, anySprite: true, rotate: false, size: 0.9,
      hp: 6, mv: 4, rng: 4, att: 3, def: 3, cost: 25, tags: ["hero"],
      desc: "Pion pour vos personnages de jeu de rôle : renommez-le, ajustez ses caractéristiques et donnez-lui l'apparence de n'importe quel personnage.",
      naming: (n) => "Personnage " + n,
    },
  };

  // Dés de corps à corps (cac) des unités qui ne les déclarent pas : crosse,
  // poings, coups de patte. Les véhicules lourds et les vaisseaux n'en ont pas.
  const MELEE = { storm: 1, rebel: 1, clone: 2, b1: 1, b2: 2, trando: 2, chasseur: 2, hero: 2, atst: 2, atrt: 2 };
  for (const id in TYPES) if (TYPES[id].cac == null) TYPES[id].cac = MELEE[id] || 0;

  const TERRAIN = {
    vide:       { name: "Espace",              theater: "space",  cost: 1 },
    asteroides: { name: "Champ d'astéroïdes", theater: "space",  cost: 2, cover: true, noCapital: true },
    nebuleuse:  { name: "Nébuleuse",           theater: "space",  cost: 1, blocksLOS: true },
    plaine:     { name: "Terrain dégagé",      theater: "ground", cost: 1 },
    foret:      { name: "Végétation",          theater: "ground", cost: 2, cover: true },
    roche:      { name: "Rochers",             theater: "ground", impassable: true, blocksLOS: true },
    ruines:     { name: "Ruines",              theater: "ground", cost: 1, vehCost: 2, cover: true },
    eau:        { name: "Eau",                 theater: "ground", water: true },
  };

  const BIOMES = {
    espace: { name: "Espace profond", theater: "space",
      blobs: [["asteroides", 6, 6], ["nebuleuse", 2, 5]], labels: {} },
    desert: { name: "Désert", theater: "ground",
      blobs: [["roche", 5, 5], ["foret", 4, 4], ["ruines", 2, 4], ["eau", 1, 3]],
      labels: { plaine: "Sable", foret: "Broussailles", roche: "Mesas", eau: "Oasis" } },
    foret: { name: "Lune forestière", theater: "ground",
      blobs: [["foret", 9, 6], ["roche", 3, 3], ["ruines", 2, 3], ["eau", 2, 4]],
      labels: { plaine: "Clairière", foret: "Forêt", eau: "Rivière" } },
    neige: { name: "Monde glacé", theater: "ground",
      blobs: [["roche", 4, 5], ["foret", 3, 4], ["ruines", 3, 4], ["eau", 1, 4]],
      labels: { plaine: "Neige", foret: "Pins gelés", roche: "Glacier", ruines: "Tranchées", eau: "Lac gelé" } },
  };

  const SCENARIOS = [
    {
      id: "ceinture", name: "Embuscade dans la ceinture", biome: "espace", turnLimit: 12,
      blurb: "Un croiseur Mon Calamari et son escorte tombent sur un Destroyer stellaire en patrouille. Les astéroïdes protègent les chasseurs, pas les gros vaisseaux.",
      sides: [
        { faction: "rebels", units: ["moncal", "xwing", "xwing", "xwing", "xwing", "xwing"] },
        { faction: "empire", units: ["destroyer", "tie", "tie", "tie", "tie", "tie", "tie"] },
      ],
    },
    {
      id: "duel", name: "Duel d'escadrilles", biome: "espace", turnLimit: 10,
      blurb: "Pas de vaisseau capital : quatre X-wing contre six TIE, dans une nébuleuse qui coupe les lignes de tir. Une partie courte.",
      sides: [
        { faction: "rebels", units: ["xwing", "xwing", "xwing", "xwing"] },
        { faction: "empire", units: ["tie", "tie", "tie", "tie", "tie", "tie"] },
      ],
      map: { blobs: [["nebuleuse", 4, 6], ["asteroides", 3, 5]] },
    },
    {
      id: "mesas", name: "Assaut sur les mesas", biome: "desert", turnLimit: 12,
      blurb: "Un AT-TE mène l'assaut des clones contre une marée de droïdes appuyée par deux chars AAT, entre les mesas d'un monde désertique.",
      sides: [
        { faction: "republic", units: ["atte", "tx130", "atrt", "clone", "clone", "clone", "clone", "clone"] },
        { faction: "separatists", units: ["aat", "aat", "b1", "b1", "b1", "b1", "b1", "b1", "b1", "b1", "b1", "b1", "b1", "b1", "b1", "b1"] },
      ],
    },
    {
      id: "lune", name: "Raid sur la lune forestière", biome: "foret", turnLimit: 12,
      blurb: "Les rebelles connaissent les bois mieux que la garnison impériale. Huit sections rebelles contre huit escouades de stormtroopers : le couvert décide de tout.",
      sides: [
        { faction: "rebels", units: ["rebel", "rebel", "rebel", "rebel", "rebel", "rebel", "rebel", "rebel"] },
        { faction: "empire", units: ["storm", "storm", "storm", "storm", "storm", "storm", "storm", "storm"] },
      ],
    },
    {
      id: "contrat", name: "Le contrat", biome: "desert", turnLimit: 12,
      blurb: "Une prime, deux prétendants. Les chasseurs de primes et leurs hommes de main affrontent une escouade mandalorienne équipée de réacteurs dorsaux.",
      sides: [
        { faction: "underworld", units: ["chasseur", "chasseur", "trando", "trando", "gamorreen", "gamorreen", "gamorreen"] },
        { faction: "mandalorians", units: ["mando", "mando", "mando", "commando", "commando", "commando"] },
      ],
    },
    {
      id: "sabres", name: "Lames de lumière", biome: "foret", turnLimit: 12,
      blurb: "Deux Jedi et leurs clones croisent la route de deux Sith escortés de stormtroopers. Les sabres renvoient les tirs : il faudra aller au contact.",
      sides: [
        { faction: "republic", units: ["jedi", "jedi", "clone", "clone", "clone", "clone"] },
        { faction: "empire", units: ["sith", "sith", "storm", "storm", "storm", "storm", "storm"] },
      ],
    },
    {
      id: "droides", name: "Le mur de droïdes", biome: "neige", turnLimit: 12,
      blurb: "Les droïdekas tiennent la ligne derrière leurs boucliers, épaulées par les super droïdes. L'artillerie de l'AT-AP peut tirer par-dessus les glaciers.",
      sides: [
        { faction: "republic", units: ["atap", "atrt", "clone", "clone", "clone", "clone", "clone", "clone"] },
        { faction: "separatists", units: ["droideka", "droideka", "droideka", "droideka", "droideka", "b2", "b2", "b2", "b2", "b2", "b2", "b1", "b1", "b1", "b1", "b1", "b1"] },
      ],
    },
    {
      id: "flottes", name: "Choc des flottes", biome: "espace", turnLimit: 12,
      blurb: "Guerre des clones : un Venator et son escorte contre une escadre séparatiste. Pas de chasseurs, rien que des bordées de turbolasers.",
      sides: [
        { faction: "republic", units: ["venator", "arquitens", "arquitens"] },
        { faction: "separatists", units: ["recusant", "munificent", "munificent"] },
      ],
    },
    {
      id: "blocus", name: "Le blocus", biome: "espace", turnLimit: 12,
      blurb: "Un vaisseau de contrôle droïde tient l'orbite d'une planète. Une escadre de la République doit percer le blocus avant que l'escorte séparatiste ne l'use.",
      sides: [
        { faction: "republic", units: ["venator", "victory", "arquitens"] },
        { faction: "separatists", units: ["lucrehulk", "recusant", "munificent", "munificent"] },
      ],
    },
    {
      id: "amiral", name: "Le vaisseau amiral", biome: "espace", turnLimit: 14,
      blurb: "La flotte rebelle tente d'abattre un super destroyer stellaire avant que ses escadrilles de TIE ne la submergent.",
      sides: [
        { faction: "rebels", units: ["moncal", "nebulon", "xwing", "xwing", "xwing", "xwing", "xwing"] },
        { faction: "empire", units: ["executor", "tie", "tie", "tie", "tie", "tie", "tie"] },
      ],
    },
    {
      id: "clans", name: "Guerre des clans", biome: "espace", turnLimit: 12,
      blurb: "Un clan mandalorien attaque le croiseur d'un seigneur hutt et ses pirates. Les Fang décollent du porte-chasseurs pendant la bataille.",
      sides: [
        { faction: "mandalorians", units: ["mandodestroyer", "mandoporteur", "fang", "fang", "fang"] },
        { faction: "underworld", units: ["hutt", "pirate", "canonniere"] },
      ],
    },
  ];

  const COLS = 20, ROWS = 13;

  // ------------------------------------------------------------ Utilitaires

  function has(T, tag) { return T.tags.indexOf(tag) >= 0; }

  function hash(seed) {
    let a = seed | 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Tirage aléatoire porté par l'état : une partie rejouée tire les mêmes dés.
  function rand(state) {
    const a = (state.rng + 0x6d2b79f5) | 0;
    state.rng = a;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function d(state, faces) { return 1 + Math.floor(rand(state) * faces); }

  // ------------------------------------------------------------ Hexagones

  const key = (c, r) => c + "," + r;
  const NB_EVEN = [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]];
  const NB_ODD = [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]];

  function inBounds(map, c, r) { return c >= 0 && r >= 0 && c < map.cols && r < map.rows; }
  function terrainId(map, c, r) { return map.hexes[r * map.cols + c]; }
  function terrainAt(map, c, r) { return TERRAIN[terrainId(map, c, r)]; }
  function toCube(c, r) { const x = c - ((r - (r & 1)) / 2); return [x, -x - r, r]; }
  function fromCube(x, z) { return { c: x + (z - (z & 1)) / 2 + 0, r: z + 0 }; }
  function dist(a, b) {
    const A = toCube(a.c, a.r), B = toCube(b.c, b.r);
    return Math.max(Math.abs(A[0] - B[0]), Math.abs(A[1] - B[1]), Math.abs(A[2] - B[2]));
  }
  function cubeRound(x, y, z) {
    let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
    const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
    if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
    return [rx, ry, rz];
  }
  function neighbors(map, c, r) {
    const out = [];
    for (const [dc, dr] of (r & 1) ? NB_ODD : NB_EVEN) {
      if (inBounds(map, c + dc, r + dr)) out.push({ c: c + dc, r: r + dr });
    }
    return out;
  }
  function hexLine(a, b) {
    const n = dist(a, b), A = toCube(a.c, a.r), B = toCube(b.c, b.r), out = [];
    for (let i = 0; i <= n; i++) {
      const t = n === 0 ? 0 : i / n;
      const p = cubeRound(A[0] + (B[0] - A[0]) * t + 1e-6, A[1] + (B[1] - A[1]) * t + 1e-6, A[2] + (B[2] - A[2]) * t - 2e-6);
      out.push(fromCube(p[0], p[2]));
    }
    return out;
  }
  function lineOfSight(map, a, b) {
    const L = hexLine(a, b);
    for (let i = 1; i < L.length - 1; i++) {
      if (inBounds(map, L[i].c, L[i].r) && terrainAt(map, L[i].c, L[i].r).blocksLOS) return false;
    }
    return true;
  }
  // Centre d'un hexagone de rayon s ; l'origine est le coin haut-gauche du plateau.
  function center(c, r, s) { return { x: s * SQ3 * (c + 0.5 * (r & 1)) + s * SQ3 / 2, y: s * 1.5 * r + s }; }
  function pixelToHex(x, y, s) {
    const px = x - s * SQ3 / 2, py = y - s;
    const q = (SQ3 / 3 * px - py / 3) / s, r = (2 / 3 * py) / s;
    const cr = cubeRound(q, -q - r, r);
    return fromCube(cr[0], cr[2]);
  }
  function facingTo(a, b) {
    const p = center(a.c, a.r, 1), q = center(b.c, b.r, 1);
    return Math.round(Math.atan2(q.x - p.x, -(q.y - p.y)) * 180 / Math.PI);
  }

  // ------------------------------------------------------------ Carte

  function generateMap(biomeId, seed, opts) {
    const biome = BIOMES[biomeId] || BIOMES.desert;
    const R = hash(seed);
    const cols = (opts && opts.cols) || COLS, rows = (opts && opts.rows) || ROWS;
    const base = biome.theater === "space" ? "vide" : "plaine";
    const map = { cols, rows, biome: biomeId, theater: biome.theater, seed, hexes: new Array(cols * rows).fill(base) };
    const blobs = (opts && opts.blobs) || biome.blobs;
    for (const [ter, count, size] of blobs) {
      for (let i = 0; i < count; i++) {
        let c = 3 + Math.floor(R() * (cols - 6)), r = Math.floor(R() * rows);
        const n = Math.max(1, Math.round(size * (0.6 + R() * 0.8)));
        for (let k = 0; k < n; k++) {
          map.hexes[r * cols + c] = ter;
          const nb = neighbors(map, c, r);
          const pick = nb[Math.floor(R() * nb.length)];
          c = pick.c; r = pick.r;
        }
      }
    }
    // Zones de déploiement : deux colonnes dégagées de chaque côté.
    for (let r = 0; r < rows; r++) {
      for (const c of [0, 1, cols - 2, cols - 1]) map.hexes[r * cols + c] = base;
    }
    return map;
  }

  // ------------------------------------------------------------ Unités

  function stat(u, k) {
    if (u.ov && u.ov[k] != null && u.ov[k] !== "") return +u.ov[k];
    return TYPES[u.type][k];
  }
  function maxHp(u) { return stat(u, "hp"); }
  function sideOf(state, i) { return state.sides[i]; }
  function unitAt(state, c, r) {
    for (const u of state.units) if (u.c === c && u.r === r) return u;
    return null;
  }
  function byUid(state, uid) {
    for (const u of state.units) if (u.uid === uid) return u;
    return null;
  }
  function occupancy(state) {
    const m = new Map();
    for (const u of state.units) m.set(key(u.c, u.r), u);
    return m;
  }

  function moveCost(T, ter) {
    if (ter.impassable) return Infinity;
    if (has(T, "jetpack")) return 1;
    if (ter.water) return has(T, "hover") ? 1 : Infinity;
    if (ter.noCapital && has(T, "capital")) return Infinity;
    if (ter === TERRAIN.foret && has(T, "scout")) return 1;
    if (ter.vehCost && has(T, "vehicle")) return ter.vehCost;
    return ter.cost || 1;
  }
  function canStand(state, type, c, r) {
    return inBounds(state.map, c, r) && isFinite(moveCost(TYPES[type], terrainAt(state.map, c, r))) && !unitAt(state, c, r);
  }

  function addUnit(state, type, side, c, r, opts) {
    const T = TYPES[type];
    opts = opts || {};
    state.counters = state.counters || {};
    const ck = side + ":" + type;
    const n = (state.counters[ck] = (state.counters[ck] || 0) + 1);
    let sprite = opts.sprite;
    if (!sprite && T.sprites.length) sprite = T.sprites[(n - 1) % T.sprites.length];
    const u = {
      uid: state.nextUid++, type, side, c, r,
      name: opts.name || T.naming(n),
      sprite: sprite || null,
      hp: T.hp, facing: side === 1 ? 270 : 90,
      moved: !!opts.spent, acted: !!opts.spent,
      uses: T.ability && T.ability.uses ? { [T.ability.id]: T.ability.uses } : {},
      ov: null,
    };
    state.units.push(u);
    record(state, u);
    return u;
  }

  // Fiche de suivi d'une unité, qui survit à sa destruction : le rapport de
  // bataille s'en sert. Créée à la volée pour les parties sauvegardées avant.
  function record(state, u) {
    state.record = state.record || {};
    let r = state.record[u.uid];
    if (!r) r = state.record[u.uid] = { uid: u.uid, type: u.type, side: u.side, name: u.name, dealt: 0, taken: 0, kills: 0, attacks: 0, fate: null };
    return r;
  }

  // Place une liste d'unités dans la zone de déploiement d'un camp. Chaque
  // entrée est un type (« storm ») ou une unité sur mesure :
  // { type, name?, sprite?, ov?, now? } — ov remplace des caractéristiques,
  // now donne les PV restants d'une unité déjà blessée.
  function deploy(state, side, types) {
    const map = state.map, mid = (map.rows - 1) / 2;
    const order = types.map(x => typeof x === "string" ? { type: x } : x).filter(x => TYPES[x.type])
      .sort((a, b) => TYPES[b.type].size - TYPES[a.type].size);
    const cols = [];
    for (let i = 0; i < map.cols; i++) cols.push(side === 0 ? i : map.cols - 1 - i);
    const placed = [];
    for (const spec of order) {
      const type = spec.type, T = TYPES[type];
      const prefer = has(T, "capital") || has(T, "large") ? 1 : 0;
      let best = null;
      for (let ci = 0; ci < cols.length && !best; ci++) {
        const cands = [];
        for (let r = 0; r < map.rows; r++) {
          const c = cols[ci];
          if (!canStand(state, type, c, r)) continue;
          // Les gros sprites débordent de leur case : on garde de l'espace autour.
          const gap = prefer ? 3 : 2;
          if (placed.some(p => TYPES[p.type].size > 1.5 && dist(p, { c, r }) < gap)) continue;
          cands.push({ c, r, s: Math.abs(r - mid) + Math.abs(ci - prefer) * 0.6 });
        }
        if (ci < prefer) continue;
        cands.sort((a, b) => a.s - b.s);
        if (cands.length) best = cands[0];
      }
      if (!best) continue;
      const u = addUnit(state, type, side, best.c, best.r, { name: spec.name, sprite: spec.sprite });
      if (spec.ov && Object.keys(spec.ov).length) { u.ov = Object.assign({}, spec.ov); u.hp = maxHp(u); }
      if (spec.now != null) u.hp = Math.max(1, Math.min(maxHp(u), Math.round(+spec.now) || 1));
      placed.push(u);
    }
    return placed;
  }

  function rosters(faction, theater) {
    return Object.keys(TYPES).filter(id => TYPES[id].faction === faction && TYPES[id].theater === theater);
  }

  // Armée tirée au hasard dans un budget : au plus un vaisseau capital par
  // tranche de 150 points, pour garder des chasseurs en jeu.
  function randomArmy(faction, theater, budget, seed) {
    const R = hash(seed);
    const pool = rosters(faction, theater);
    if (!pool.length) return [];
    const out = [];
    let left = budget, heavy = 0;
    const cheapest = Math.min.apply(null, pool.map(t => TYPES[t].cost));
    let guard = 0;
    while (left >= cheapest && guard++ < 200) {
      const ok = pool.filter(t => TYPES[t].cost <= left && !(TYPES[t].cost >= 50 && heavy >= Math.max(1, Math.floor(budget / 150))));
      if (!ok.length) break;
      const w = ok.map(t => TYPES[t].cost >= 50 ? 1.2 : 2);
      let x = R() * w.reduce((a, b) => a + b, 0), pick = ok[ok.length - 1];
      for (let i = 0; i < ok.length; i++) { x -= w[i]; if (x <= 0) { pick = ok[i]; break; } }
      if (TYPES[pick].cost >= 50) heavy++;
      out.push(pick);
      left -= TYPES[pick].cost;
    }
    return out;
  }

  // ------------------------------------------------------------ Partie

  function blankState(cfg) {
    const seed = cfg.seed != null ? cfg.seed : Math.floor(Math.random() * 2147483647);
    return {
      v: 1, name: cfg.name || "Bataille", scenario: cfg.scenario || null,
      map: cfg.map || generateMap(cfg.biome || "desert", seed, cfg.mapOpts),
      units: [], counters: {}, nextUid: 1, rng: seed ^ 0x5bd1e995,
      sides: cfg.sides.map((s, i) => ({
        name: s.name || FACTIONS[s.faction].name, faction: s.faction,
        control: s.control || (i === 1 ? "ai" : "human"),
      })),
      turn: 1, active: 0, mode: cfg.mode || "regles", turnLimit: cfg.turnLimit || 0,
      score: [0, 0], log: [], over: null,
    };
  }

  function createGame(cfg) {
    const state = blankState(cfg);
    cfg.sides.forEach((s, i) => deploy(state, i, s.units || []));
    log(state, { k: "info", text: "Déploiement terminé. " + state.sides[0].name + " ouvre le feu." });
    startTurn(state);
    return state;
  }

  function createScenario(id, control) {
    const sc = SCENARIOS.find(s => s.id === id);
    return createGame({
      name: sc.name, scenario: id, biome: sc.biome, turnLimit: sc.turnLimit,
      mapOpts: sc.map,
      sides: sc.sides.map((s, i) => ({ faction: s.faction, units: s.units, control: control[i] })),
    });
  }

  function log(state, entry) {
    entry.turn = state.turn;
    state.log.push(entry);
    if (state.log.length > 250) state.log.splice(0, state.log.length - 250);
  }

  function startTurn(state) {
    for (const u of state.units) {
      if (u.side !== state.active) continue;
      u.moved = false; u.acted = false; u.plan = null;
      if (has(TYPES[u.type], "regen") && u.hp < maxHp(u) && state.mode === "regles") {
        u.hp += 1;
        log(state, { k: "info", side: u.side, text: u.name + " : boucliers rechargés, +1 PV." });
      }
    }
    log(state, { k: "turn", side: state.active, text: "Tour " + state.turn + " — " + state.sides[state.active].name });
  }

  function endTurn(state) {
    if (state.over) return;
    state.active = 1 - state.active;
    if (state.active === 0) {
      state.turn++;
      if (state.turnLimit && state.turn > state.turnLimit) {
        state.turn = state.turnLimit;
        return finishByPoints(state);
      }
    }
    startTurn(state);
    checkVictory(state);
  }

  // Mode libre : une manche passe, toutes les unités retrouvent leur activation.
  function nextRound(state) {
    state.turn++;
    for (const u of state.units) { u.moved = false; u.acted = false; }
    log(state, { k: "turn", text: "Manche " + state.turn });
  }

  function alive(state, side) { return state.units.filter(u => u.side === side).length; }

  function checkVictory(state) {
    if (state.mode !== "regles" || state.over) return state.over;
    const a = alive(state, 0), b = alive(state, 1);
    if (a && b) return null;
    state.over = { winner: !a && !b ? -1 : (a ? 0 : 1), reason: "annihilation" };
    log(state, { k: "info", text: state.over.winner < 0 ? "Les deux camps sont anéantis." : state.sides[state.over.winner].name + " tient le champ de bataille." });
    return state.over;
  }

  function finishByPoints(state) {
    const [a, b] = state.score.map(Math.round);
    state.over = { winner: a > b ? 0 : b > a ? 1 : -1, reason: "points" };
    log(state, { k: "info", text: "Fin de la bataille aux points : " + a + " contre " + b + "." });
    return state.over;
  }

  // ------------------------------------------------------------ Mouvement

  function reachable(state, u) {
    const map = state.map, T = TYPES[u.type], mv = stat(u, "mv");
    const occ = occupancy(state);
    const all = new Map([[key(u.c, u.r), { cost: 0, prev: null, c: u.c, r: u.r }]]);
    const open = [{ c: u.c, r: u.r, cost: 0 }];
    while (open.length) {
      open.sort((a, b) => a.cost - b.cost);
      const cur = open.shift();
      if (cur.cost > all.get(key(cur.c, cur.r)).cost) continue;
      for (const n of neighbors(map, cur.c, cur.r)) {
        const mc = moveCost(T, terrainAt(map, n.c, n.r));
        const nc = cur.cost + mc;
        if (!isFinite(mc) || nc > mv) continue;
        const k = key(n.c, n.r), o = occ.get(k);
        if (o && o.side !== u.side) continue; // on traverse ses alliés, jamais l'ennemi
        const b = all.get(k);
        if (b && b.cost <= nc) continue;
        all.set(k, { cost: nc, prev: key(cur.c, cur.r), c: n.c, r: n.r });
        open.push({ c: n.c, r: n.r, cost: nc });
      }
    }
    const dest = new Map();
    for (const [k, v] of all) { const o = occ.get(k); if (!o || o === u) dest.set(k, v); }
    return { all, dest };
  }

  function pathTo(reach, c, r) {
    const p = [];
    let k = key(c, r);
    while (k) { const n = reach.all.get(k); if (!n) return []; p.unshift({ c: n.c, r: n.r }); k = n.prev; }
    return p;
  }

  function moveUnit(state, u, c, r, path) {
    const from = { c: u.c, r: u.r };
    if (path && path.length > 1) u.facing = facingTo(path[path.length - 2], path[path.length - 1]);
    else if (from.c !== c || from.r !== r) u.facing = facingTo(from, { c, r });
    u.c = c; u.r = r;
    if (state.mode === "regles") u.moved = true;
  }

  function endActivation(state, u) { u.moved = true; u.acted = true; u.plan = null; }

  // ------------------------------------------------------------ Tir

  function isEnemy(a, t) { return t && a !== t && t.side !== a.side && t.side !== 2 && a.side !== 2; }

  // Profil d'un tir : dés, seuil, défense, et la liste des modificateurs.
  // `from` / `tpos` permettent à l'IA d'évaluer des positions hypothétiques.
  function profile(state, a, t, opts) {
    opts = opts || {};
    const A = TYPES[a.type], T = TYPES[t.type], map = state.map;
    const from = opts.from || a, tpos = opts.tpos || t;
    const ab = opts.special ? A.ability : null;
    let dice = stat(a, "att"), rng = stat(a, "rng"), ap = has(A, "ap"), dmg = 1;
    const notes = [];
    if (ab) {
      if (ab.dice) dice = ab.dice;
      if (ab.bonus) dice += ab.bonus;
      if (ab.rng) rng = ab.rng;
      if (ab.dmg) dmg = ab.dmg;
      if (ab.ap) ap = true;
      notes.push(ab.name);
    }
    if (has(A, "swarm") && state.units.some(o => o !== a && o.side === a.side && o.type === a.type && dist(o, tpos) === 1)) {
      dice++; notes.push("Essaim +1 dé");
    }
    if (has(A, "coord") && state.units.some(o => o !== a && o.side === a.side && o.type === a.type && dist(o, from) === 1)) {
      dice++; notes.push("Tir coordonné +1 dé");
    }
    if (has(A, "ambush") && terrainAt(map, from.c, from.r).cover) { dice++; notes.push("Embuscade +1 dé"); }
    if (has(A, "hunter") && t.hp < maxHp(t)) { dice++; notes.push("Traqueur +1 dé"); }
    let need = 4;
    if (terrainAt(map, tpos.c, tpos.r).cover && !has(T, "large")) { need++; notes.push("Cible à couvert"); }
    if (has(A, "heavy") && has(T, "agile")) { need++; notes.push("Cible agile"); }
    if (has(T, "armored") && !ap) { need = 6; notes.push("Blindage : seuls les 6 touchent"); }
    need = Math.min(6, need);
    let defNeed = 5;
    if (has(T, "shield")) { defNeed = 4; notes.push("Bouclier : esquive sur 4+"); }
    else if (has(T, "beskar")) { defNeed = 4; notes.push("Beskar : esquive sur 4+"); }
    else if (has(T, "deflect") && dist(from, tpos) > 1) { defNeed = 4; notes.push("Tir renvoyé au sabre : esquive sur 4+"); }
    const p = { dice, need, defDice: stat(t, "def"), defNeed, dmg, rng, notes };
    p.expected = expected(p);
    return p;
  }

  // Espérance de dégâts : les 6 sont des critiques, impossibles à esquiver.
  function expected(p) {
    const crit = p.dice / 6, norm = p.dice * Math.max(0, 6 - p.need) / 6;
    const saves = p.defDice * (7 - p.defNeed) / 6;
    return (crit + Math.max(0, norm - saves)) * p.dmg;
  }

  function canShoot(state, a, t, opts) {
    opts = opts || {};
    if (!isEnemy(a, t)) return false;
    if (!opts.special && stat(a, "att") <= 0) return false;
    const A = TYPES[a.type];
    if (opts.special && !(A.ability && A.ability.type === "shot" && (a.uses[A.ability.id] || 0) > 0)) return false;
    const from = opts.from || a;
    const rng = opts.special && A.ability.rng ? A.ability.rng : stat(a, "rng");
    const indirect = opts.special && A.ability.indirect;
    return dist(from, t) <= rng && (indirect || lineOfSight(state.map, from, t));
  }

  function targets(state, a, opts) {
    return state.units.filter(t => canShoot(state, a, t, opts));
  }

  // Jette les dés d'un profil et applique les dégâts, sans retirer la cible
  // détruite : l'appelant s'en charge, une fois tous les coups résolus.
  function resolve(state, a, t, p, how) {
    const rolls = [], defRolls = [];
    for (let i = 0; i < p.dice; i++) rolls.push(d(state, 6));
    const crits = rolls.filter(x => x === 6).length;
    const norm = rolls.filter(x => x >= p.need && x < 6).length;
    for (let i = 0; i < p.defDice; i++) defRolls.push(d(state, 6));
    const saves = Math.min(norm, defRolls.filter(x => x >= p.defNeed).length);
    const dmg = (crits + norm - saves) * p.dmg;
    // Points : chaque PV retiré vaut une part du coût de la cible. Une unité
    // détruite rapporte donc tout son coût, une unité entamée une fraction.
    const lost = Math.min(dmg, t.hp);
    if (a.side < 2 && t.side < 2) state.score[a.side] += TYPES[t.type].cost * lost / maxHp(t);
    t.hp = Math.max(0, t.hp - dmg);
    const killed = t.hp <= 0;
    const ra = record(state, a), rt = record(state, t);
    ra.name = a.name; rt.name = t.name;
    ra.attacks++; ra.dealt += lost; rt.taken += lost;
    if (killed) {
      ra.kills++;
      rt.fate = { turn: state.turn, by: a.name, how };
      state.feats = state.feats || [];
      state.feats.push({ turn: state.turn, side: a.side, text: a.name + " élimine " + t.name + (how === "melee" ? " au corps à corps" : "") + "." });
    }
    return { rolls, defRolls, need: p.need, defNeed: p.defNeed, crits, norm, saves, dmg, killed, notes: p.notes, dmgPerHit: p.dmg };
  }

  function outcome(r) {
    return r.dmg ? r.dmg + " dégât" + (r.dmg > 1 ? "s" : "") : (r.crits + r.norm ? "tout est paré" : "manqué");
  }

  function removeDead(state, list) {
    let any = false;
    for (const u of list) {
      if (u.hp > 0 || state.units.indexOf(u) < 0) continue;
      state.units.splice(state.units.indexOf(u), 1);
      any = true;
    }
    if (any) checkVictory(state);
  }

  function attack(state, a, t, opts) {
    opts = opts || {};
    const p = profile(state, a, t, opts);
    const res = resolve(state, a, t, p, "tir");
    res.attacker = a.uid; res.target = t.uid;
    if (TYPES[a.type].rotate) a.facing = facingTo(a, t);
    a.moved = true; a.acted = true; a.plan = null;
    const ab = TYPES[a.type].ability;
    if (opts.special && ab) a.uses[ab.id] = Math.max(0, (a.uses[ab.id] || 0) - 1);
    let text = a.name + " tire sur " + t.name + " : " + outcome(res).replace("paré", "esquivé");
    if (res.killed) text += ". " + t.name + " est détruit.";
    log(state, { k: "attack", side: a.side, text, dice: { rolls: res.rolls, need: p.need, defRolls: res.defRolls, defNeed: p.defNeed }, notes: p.notes });
    removeDead(state, [t]);
    return res;
  }

  // ------------------------------------------------------------ Corps à corps

  // Au contact : l'attaquant frappe avec ses dés de corps à corps (+1 s'il
  // charge, c'est-à-dire s'il a bougé ce tour), touche sur 4+. Si la cible
  // survit et sait se battre, elle riposte aussitôt, touche sur 5+.
  // Le couvert ne compte pas ; le blindage, si : seuls les sabres laser le tranchent.
  function meleeProfile(state, a, t, opts) {
    opts = opts || {};
    const A = TYPES[a.type], T = TYPES[t.type];
    let dice = stat(a, "cac");
    const notes = [];
    const charge = opts.charge != null ? opts.charge : a.moved;
    if (opts.riposte) notes.push("Riposte : touche sur 5+");
    else if (charge) { dice++; notes.push("Charge +1 dé"); }
    let need = opts.riposte ? 5 : 4;
    if (has(T, "armored") && !has(A, "deflect")) { need = 6; notes.push("Blindage : seuls les 6 touchent"); }
    let defNeed = 5;
    if (has(T, "beskar")) { defNeed = 4; notes.push("Beskar : pare sur 4+"); }
    else if (has(T, "deflect")) { defNeed = 4; notes.push("Parade au sabre : pare sur 4+"); }
    const p = { dice, need, defDice: stat(t, "def"), defNeed, dmg: 1, rng: 1, notes, melee: true };
    p.expected = expected(p);
    return p;
  }

  function canMelee(state, a, t, opts) {
    opts = opts || {};
    if (!isEnemy(a, t) || stat(a, "cac") <= 0) return false;
    return dist(opts.from || a, t) === 1;
  }

  function meleeTargets(state, a) {
    return state.units.filter(t => canMelee(state, a, t));
  }

  function melee(state, a, t) {
    const p = meleeProfile(state, a, t);
    const strike = resolve(state, a, t, p, "melee");
    let riposte = null, rp = null;
    if (!strike.killed && stat(t, "cac") > 0) {
      rp = meleeProfile(state, t, a, { riposte: true });
      riposte = resolve(state, t, a, rp, "melee");
    }
    if (TYPES[a.type].rotate) a.facing = facingTo(a, t);
    a.moved = true; a.acted = true; a.plan = null;
    let text = a.name + " attaque " + t.name + " au corps à corps : " + outcome(strike);
    if (strike.killed) text += ". " + t.name + " est terrassé.";
    log(state, { k: "attack", side: a.side, text, dice: { rolls: strike.rolls, need: p.need, defRolls: strike.defRolls, defNeed: p.defNeed }, notes: p.notes });
    if (riposte) {
      let rt = t.name + " riposte : " + outcome(riposte);
      if (riposte.killed) rt += ". " + a.name + " est terrassé.";
      log(state, { k: "attack", side: t.side, text: rt, dice: { rolls: riposte.rolls, need: rp.need, defRolls: riposte.defRolls, defNeed: rp.defNeed }, notes: rp.notes });
    }
    removeDead(state, [t, a]);
    return { melee: true, attacker: a.uid, target: t.uid, strike, riposte, dmg: strike.dmg, killed: strike.killed, rolls: strike.rolls, crits: strike.crits, norm: strike.norm };
  }

  function spawnHexes(state, u) {
    const ab = TYPES[u.type].ability;
    if (!ab || ab.type !== "spawn") return [];
    return neighbors(state.map, u.c, u.r).filter(h => canStand(state, ab.spawn, h.c, h.r));
  }

  function isAction(ab) { return !!ab && (ab.type === "spawn" || ab.type === "heal"); }

  function healTargets(state, u) {
    return state.units.filter(o => o !== u && o.side === u.side && o.hp < maxHp(o) && dist(o, u) === 1);
  }

  function canUseAbility(state, u) {
    const ab = TYPES[u.type].ability;
    if (!isAction(ab) || u.acted || (u.uses[ab.id] || 0) <= 0) return false;
    return ab.type === "spawn" ? spawnHexes(state, u).length > 0 : healTargets(state, u).length > 0;
  }

  function useAbility(state, u) {
    if (!canUseAbility(state, u)) return null;
    const ab = TYPES[u.type].ability;
    if (ab.type === "heal") {
      const healed = healTargets(state, u);
      for (const o of healed) o.hp = Math.min(maxHp(o), o.hp + ab.heal);
      u.uses[ab.id]--;
      endActivation(state, u);
      log(state, { k: "info", side: u.side, text: u.name + " soigne " + healed.map(o => o.name).join(", ") + " (+" + ab.heal + " PV)." });
      return healed;
    }
    const foes = state.units.filter(o => isEnemy(u, o));
    const hexes = spawnHexes(state, u).sort((a, b) => nearest(foes, a) - nearest(foes, b));
    const h = hexes[0];
    const n = addUnit(state, ab.spawn, u.side, h.c, h.r, { spent: state.mode === "regles" });
    n.facing = u.facing;
    u.uses[ab.id]--;
    endActivation(state, u);
    log(state, { k: "info", side: u.side, text: u.name + " lance " + n.name + "." });
    return n;
  }

  function nearest(list, pos) {
    let m = 99;
    for (const o of list) m = Math.min(m, dist(o, pos));
    return m;
  }

  // ------------------------------------------------------------ IA

  function value(u) { return TYPES[u.type].cost / maxHp(u); }

  function bestShot(state, u, pos) {
    let best = null;
    const A = TYPES[u.type];
    for (const t of state.units) {
      if (!isEnemy(u, t)) continue;
      for (const special of [false, true]) {
        if (!canShoot(state, u, t, { from: pos, special })) continue;
        const p = profile(state, u, t, { from: pos, special });
        const e = Math.min(p.expected, t.hp);
        let v = e * value(t) + (p.expected >= t.hp ? TYPES[t.type].cost * 0.5 : 0);
        // On garde les munitions spéciales pour les cibles qui en valent la peine.
        if (special) v = v / 1.35 - (A.ability.uses > 1 ? 0 : 2);
        if (!best || v > best.value) best = { t, special, value: v };
      }
      if (canMelee(state, u, t, { from: pos })) {
        const charge = u.moved || pos.c !== u.c || pos.r !== u.r;
        const p = meleeProfile(state, u, t, { charge });
        const e = Math.min(p.expected, t.hp);
        let v = e * value(t) + (p.expected >= t.hp ? TYPES[t.type].cost * 0.5 : 0);
        // La riposte coûte : on la retranche si la cible a des chances de survivre.
        if (stat(t, "cac") > 0 && p.expected < t.hp) v -= Math.min(meleeProfile(state, t, u, { riposte: true }).expected, u.hp) * value(u) * 0.8;
        if (!best || v > best.value) best = { t, special: false, melee: true, value: v };
      }
    }
    return best;
  }

  function threatAt(state, u, pos, foes) {
    let th = 0;
    for (const e of foes) {
      const d = dist(e, pos);
      let worst = 0;
      if (stat(e, "att") > 0 && d <= stat(e, "mv") + stat(e, "rng")) worst = profile(state, e, u, { tpos: pos }).expected;
      if (stat(e, "cac") > 0 && d <= stat(e, "mv") + 1) worst = Math.max(worst, meleeProfile(state, e, u, { charge: true }).expected);
      th += worst;
    }
    return Math.min(th, u.hp) * value(u);
  }

  // Distance de chaque case à l'ennemi le plus proche, en contournant le
  // terrain infranchissable pour ce type d'unité : sans elle, un vaisseau
  // capital reste collé derrière un champ d'astéroïdes, à vol d'oiseau tout près.
  function approachField(state, T, foes) {
    const map = state.map, field = new Map(), open = [];
    for (const f of foes) { field.set(key(f.c, f.r), 0); open.push({ c: f.c, r: f.r, d: 0 }); }
    while (open.length) {
      open.sort((a, b) => a.d - b.d);
      const cur = open.shift();
      if (cur.d > field.get(key(cur.c, cur.r))) continue;
      for (const n of neighbors(map, cur.c, cur.r)) {
        const mc = moveCost(T, terrainAt(map, n.c, n.r));
        if (!isFinite(mc)) continue;
        const k = key(n.c, n.r), nd = cur.d + mc;
        if (field.has(k) && field.get(k) <= nd) continue;
        field.set(k, nd);
        open.push({ c: n.c, r: n.r, d: nd });
      }
    }
    return field;
  }

  function aiNext(state, side) {
    const foes = state.units.filter(o => o.side === 1 - side);
    const mine = state.units.filter(o => o.side === side && !o.acted);
    if (!mine.length || !foes.length || state.over) return { type: "end" };

    // Une unité déjà déplacée tire si elle peut, sinon elle s'arrête là.
    const moved = mine.find(o => o.moved);
    if (moved) {
      const s = bestShot(state, moved, moved);
      return s ? { type: "attack", uid: moved.uid, target: s.t.uid, special: s.special, melee: !!s.melee } : { type: "wait", uid: moved.uid };
    }

    mine.sort((a, b) => (bestShot(state, b, b) ? 1 : 0) - (bestShot(state, a, a) ? 1 : 0) || stat(b, "mv") - stat(a, "mv"));
    const u = mine[0];
    const here = bestShot(state, u, u);
    if (canUseAbility(state, u)) {
      const ab = TYPES[u.type].ability;
      const worth = ab.type === "heal"
        ? healTargets(state, u).reduce((m, o) => m + Math.min(ab.heal, maxHp(o) - o.hp), 0) >= 3 || !here
        : !here || state.turn <= 2;
      if (worth) return { type: "ability", uid: u.uid };
    }

    const reach = reachable(state, u);
    const T = TYPES[u.type];
    const field = approachField(state, T, foes);
    let best = null;
    for (const v of reach.dest.values()) {
      const pos = { c: v.c, r: v.r };
      const shot = bestShot(state, u, pos);
      let s = shot ? shot.value : 0;
      if (terrainAt(state.map, pos.c, pos.r).cover && !has(T, "large")) s += 0.8;
      // La prudence s'émousse au fil des tours, sinon deux flottes
      // s'observent hors de portée jusqu'à la fin de la bataille.
      const caution = state.turn <= 4 ? 1 : Math.max(0.25, 1 - (state.turn - 4) / 6);
      s -= threatAt(state, u, pos, foes) * 0.3 * caution;
      const far = field.has(key(pos.c, pos.r)) ? field.get(key(pos.c, pos.r)) : nearest(foes, pos);
      const gap = Math.max(0, far - Math.max(stat(u, "rng"), stat(u, "cac") > 0 ? 1 : 0));
      s -= gap * (shot ? 0.1 : 0.6 * (1 + Math.max(0, state.turn - 4) * 0.25));
      s -= v.cost * 0.01; // à valeur égale, on bouge le moins possible
      if (!best || s > best.s) best = { s, pos };
    }
    if (best.pos.c === u.c && best.pos.r === u.r) {
      return here ? { type: "attack", uid: u.uid, target: here.t.uid, special: here.special, melee: !!here.melee } : { type: "wait", uid: u.uid };
    }
    return { type: "move", uid: u.uid, c: best.pos.c, r: best.pos.r };
  }

  // Applique une action de l'IA d'un coup (sans animation) : utile aux tests.
  function apply(state, act) {
    const u = act.uid != null ? byUid(state, act.uid) : null;
    if (act.type === "end") return endTurn(state);
    if (act.type === "move") return moveUnit(state, u, act.c, act.r, pathTo(reachable(state, u), act.c, act.r));
    if (act.type === "attack") return act.melee ? melee(state, u, byUid(state, act.target)) : attack(state, u, byUid(state, act.target), { special: act.special });
    if (act.type === "ability") return useAbility(state, u);
    if (act.type === "wait") return endActivation(state, u);
  }

  // Retrait d'un pion à la main (table du MJ) : il n'est pas compté comme perte.
  function removeUnit(state, u) {
    const i = state.units.indexOf(u);
    if (i < 0) return;
    state.units.splice(i, 1);
    const r = record(state, u);
    r.name = u.name;
    r.fate = { removed: true, turn: state.turn };
  }

  // ------------------------------------------------------------ Rapport

  // Compte rendu en texte brut, à coller dans les notes du MJ : issue, pertes,
  // état des survivants (PV restants des personnages en tête), faits d'armes.
  function report(state) {
    const L = [], B = BIOMES[state.map.biome];
    const n = (k, word) => k + " " + word + (k > 1 ? "s" : "");
    const live = new Map(state.units.map(u => [u.uid, u]));
    const rec = state.record || {};
    for (const u of state.units) record(state, u).name = u.name;
    L.push("RAPPORT DE BATAILLE — " + state.name);
    L.push("(Bataille jouée sur Holotable. À intégrer au récit : issue, blessures et PV restants des personnages, pertes.)");
    L.push((B ? B.name : "") + " · " + (state.mode === "libre" ? "manche " : "tour ") + state.turn + (state.turnLimit ? "/" + state.turnLimit : ""));
    if (state.over) {
      const w = state.over.winner;
      L.push("Issue : " + (w < 0 ? "match nul" : state.sides[w].name + " l'emporte") + (state.over.reason === "points" ? " aux points." : w < 0 ? "." : ", l'armée adverse est anéantie."));
    } else {
      L.push("Issue : bataille en cours.");
    }
    L.push("Score : " + state.sides[0].name + " " + Math.round(state.score[0]) + " pts · " + state.sides[1].name + " " + Math.round(state.score[1]) + " pts");

    const all = Object.keys(rec).map(k => rec[k]).filter(r => !(r.fate && r.fate.removed));
    const heroes = all.filter(r => TYPES[r.type] && has(TYPES[r.type], "hero"));
    if (heroes.length) {
      L.push("");
      L.push("PERSONNAGES — à reporter sur les fiches");
      for (const r of heroes) {
        const u = live.get(r.uid);
        L.push("  " + r.name + " (" + (r.side < 2 ? state.sides[r.side].name : "neutre") + ") : " +
          (u ? u.hp + "/" + maxHp(u) + " PV" : "hors de combat au tour " + r.fate.turn + ", par " + r.fate.by) +
          " · " + n(r.dealt, "dégât") + " infligé" + (r.dealt > 1 ? "s" : "") + ", " + n(r.kills, "élimination"));
      }
    }

    for (const side of [0, 1, 2]) {
      const mine = all.filter(r => r.side === side);
      if (!mine.length) continue;
      const alive = mine.filter(r => live.has(r.uid));
      L.push("");
      L.push((side < 2 ? state.sides[side].name : "Neutres").toUpperCase() + " — " + alive.length + " sur " + mine.length + " encore debout");
      for (const r of mine) {
        const u = live.get(r.uid), T = TYPES[r.type];
        const what = T ? T.name : r.type;
        const state_ = u ? "✓ " + u.hp + "/" + maxHp(u) + " PV" : "✗ détruit au tour " + r.fate.turn + " par " + r.fate.by + (r.fate.how === "melee" ? " (corps à corps)" : "");
        const deeds = r.dealt || r.kills ? " · " + n(r.dealt, "dégât") + ", " + n(r.kills, "élimination") : "";
        L.push("  " + r.name + ", " + what + " : " + state_ + deeds);
      }
    }

    const feats = (state.feats || []).slice(-15);
    if (feats.length) {
      L.push("");
      L.push("FAITS D'ARMES");
      for (const f of feats) L.push("  Tour " + f.turn + " : " + f.text);
    }
    // Mention : les dégâts comptent, une élimination vaut deux points de plus.
    const merit = (r) => r.dealt + 2 * r.kills;
    const best = all.slice().sort((a, b) => merit(b) - merit(a))[0];
    if (best && best.dealt) {
      L.push("");
      L.push("Mention : " + best.name + " (" + (best.side < 2 ? state.sides[best.side].name : "neutre") + "), " + n(best.dealt, "dégât") + " et " + n(best.kills, "élimination") + ".");
    }
    return L.join("\n");
  }

  // ------------------------------------------------------------ Ordre de bataille

  // Mots qui désignent chaque type d'unité dans un texte libre, sans accents
  // ni majuscules. Les plus longs sont essayés d'abord : « super destroyer »
  // avant « destroyer », « chasseur de primes » avant « chasseur ».
  const KEYWORDS = {
    storm: ["stormtroopers", "stormtrooper", "storm", "soldats imperiaux", "soldat imperial", "troupiers"],
    rebel: ["soldats rebelles", "soldat rebelle", "rebelles", "rebelle"],
    clone: ["clone troopers", "clone trooper", "clones", "clone", "soldats clones"],
    b1: ["droides de combat", "droide de combat", "droides b1", "droide b1", "b1"],
    b2: ["super droides", "super droide", "droides b2", "droide b2", "b2"],
    droideka: ["droidekas", "droideka", "droides destroyers", "droide destroyer"],
    mando: ["guerriers mandaloriens", "guerrier mandalorien", "mandaloriens", "mandalorien", "mandalorienne", "mandos", "mando"],
    commando: ["super commandos", "super commando", "commandos", "commando", "gardes noirs"],
    gamorreen: ["gamorreens", "gamorreen", "gamorreans", "gamorrean"],
    trando: ["trandoshans", "trandoshan", "trandos", "trando"],
    chasseur: ["chasseurs de primes", "chasseur de primes", "chasseuse de primes", "chasseuses de primes", "bounty hunters", "bounty hunter", "mercenaires", "mercenaire"],
    jedi: ["chevaliers jedi", "chevalier jedi", "maitre jedi", "padawans", "padawan", "jedis", "jedi"],
    sith: ["seigneurs sith", "seigneur sith", "inquisiteurs", "inquisiteur", "inquisitrice", "siths", "sith"],
    atst: ["at-st", "at st", "atst", "at-dp", "at dp", "marcheurs eclaireurs", "marcheur eclaireur"],
    atrt: ["at-rt", "at rt", "atrt"],
    atte: ["at-te", "at te", "atte"],
    atap: ["at-ap", "at ap", "atap"],
    tx130: ["tx-130", "tx130", "tx 130", "saber"],
    aat: ["aat", "chars droides", "char droide"],
    xwing: ["x-wings", "x-wing", "xwings", "xwing", "x wing", "ailes x", "aile x"],
    tie: ["chasseurs tie", "chasseur tie", "ties", "tie"],
    executor: ["super destroyers", "super destroyer", "executor"],
    mandocuirasse: ["cuirasse mandalorien", "cuirasses mandaloriens"],
    mandodestroyer: ["destroyer mandalorien", "destroyers mandaloriens"],
    mandoporteur: ["porte-chasseurs mandalorien", "porte chasseurs mandalorien", "porte-chasseurs", "porte chasseurs"],
    destroyer: ["destroyers stellaires", "destroyer stellaire", "star destroyer", "destroyer imperial", "destroyers imperiaux", "destroyer"],
    moncal: ["croiseurs mon calamari", "croiseur mon calamari", "mon calamari", "mon cal", "mc80"],
    nebulon: ["nebulon-b", "nebulon b", "nebulon"],
    venator: ["venators", "venator"],
    victory: ["victory"],
    arquitens: ["arquitens"],
    recusant: ["recusant"],
    munificent: ["munificent"],
    lucrehulk: ["vaisseau de controle droide", "vaisseau de controle", "lucrehulk"],
    fang: ["chasseurs fang", "chasseur fang", "fang"],
    hutt: ["croiseur hutt", "vaisseau hutt", "hutt"],
    pirate: ["croiseurs pirates", "croiseur pirate", "vaisseau pirate", "pirates", "pirate"],
    canonniere: ["canonnieres", "canonniere", "cargo arme", "cargos armes"],
    yacht: ["yacht royal", "yacht"],
    hero: ["personnages", "personnage", "heros", "pnj", "pj"],
  };
  const KEYWORD_LIST = [];
  for (const t in KEYWORDS) for (const k of KEYWORDS[t]) KEYWORD_LIST.push([k, t]);
  KEYWORD_LIST.sort((a, b) => b[0].length - a[0].length);

  const NUMBERS = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10,
    onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20, trente: 30, quarante: 40 };

  function plain(text) {
    return String(text).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }

  // Premier type d'unité nommé dans un bout de texte (null sinon), avec la
  // position du mot trouvé.
  function findType(text) {
    const t = " " + plain(text).replace(/[^a-z0-9-]+/g, " ") + " ";
    let best = null;
    for (const [k, type] of KEYWORD_LIST) {
      const i = t.indexOf(" " + k + " ");
      if (i >= 0 && (!best || i < best.at || (i === best.at && k.length > best.k.length))) best = { type, at: i, k };
    }
    return best;
  }

  function guessBiome(text) {
    const t = plain(text);
    if (/espace|spatial|orbite|flotte|hyperespace|ceinture|asteroide|nebuleuse/.test(t)) return "espace";
    if (/neige|glace|glaciaire|hoth|gele|toundra/.test(t)) return "neige";
    if (/foret|endor|jungle|kashyyyk|yavin|marais|dagobah|lune forestiere/.test(t)) return "foret";
    if (/desert|tatooine|geonosis|jakku|sable|dune|canyon/.test(t)) return "desert";
    return null;
  }

  function guessFaction(text) {
    const t = plain(text);
    const table = [["mandalorians", /mandalor|clan /], ["underworld", /pegre|hutt|pirate|chasseurs? de primes|mercenaire|cartel|syndicat|aube ecarlate/],
      ["separatists", /separatiste|confederation|droide|federation du commerce/], ["republic", /republique|clone|jedi/],
      ["empire", /empire|imperial|imperiaux/], ["rebels", /rebelle|alliance|resistance/], ["free", /independant|neutre/]];
    for (const [f, re] of table) if (re.test(t)) return f;
    return null;
  }

  function readStats(text) {
    const t = plain(text), ov = {};
    const grab = (re, k) => { const m = t.match(re); if (m) ov[k] = +m[1]; };
    // « PV 4/7 » : 4 PV restants sur 7 ; « PV 7 » : 7 PV, en pleine forme.
    const hp = t.match(/\b(?:pv|hp|points? de vie|vie)\s*[:=]?\s*(\d+)(?:\s*\/\s*(\d+))?/);
    if (hp && hp[2]) { ov.hp = +hp[2]; ov.now = +hp[1]; } else if (hp) ov.hp = +hp[1];
    grab(/\b(?:mv|mouv(?:ement)?\.?|deplacement)\s*[:=]?\s*(\d+)/, "mv");
    grab(/\b(?:tir|att(?:aque)?)\s*[:=]?\s*(\d+)/, "att");
    grab(/\b(?:portee|port\.?|rng)\s*[:=]?\s*(\d+)/, "rng");
    grab(/\b(?:melee|mel\.?|cac|corps a corps)\s*[:=]?\s*(\d+)/, "cac");
    grab(/\b(?:def(?:ense)?\.?)\s*[:=]?\s*(\d+)/, "def");
    return ov;
  }

  // Lit un ordre de bataille écrit à la main, au format proposé au MJ :
  //   BATAILLE : …   CARTE : …   TOURS : …
  //   CAMP BLEU : <nom> (joueur)       CAMP ROUGE : <nom> (IA)
  //   - <Nom> | <type> | PV 8 | Tir 5 …     - 6 x stormtroopers
  // Il se montre tolérant (accents, nombres en toutes lettres, puces) et
  // rend la même forme que la lecture par Claude : voir planFromSpec.
  function parseOrder(text) {
    const spec = { name: "", biome: null, turnLimit: null, sides: [], notes: [] };
    let side = null;
    const sideAt = (i) => (spec.sides[i] = spec.sides[i] || { name: "", faction: null, control: i === 0 ? "human" : "ai", units: [] });
    const lines = String(text).split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      const p = plain(line);
      const head = p.match(/^#*\s*([a-z0-9 ]+?)\s*[:=]\s*(.*)$/);
      if (head) {
        const key = head[1], v = line.replace(/^[^:=]*[:=]\s*/, "");
        if (/^(bataille|titre|scene|nom)$/.test(key)) { spec.name = v; continue; }
        if (/^(carte|theatre|terrain|lieu|decor)$/.test(key)) { spec.biome = guessBiome(v) || spec.biome; continue; }
        if (/^(tours?|limite)$/.test(key)) { const n = parseInt(v, 10); if (!isNaN(n)) spec.turnLimit = n; continue; }
        const which = /^(camp bleu|camp 1|camp a|joueurs?|allies|pj|equipe)$/.test(key) ? 0 : /^(camp rouge|camp 2|camp b|ennemis?|adversaires?|opposants?)$/.test(key) ? 1 : -1;
        if (which >= 0) {
          side = sideAt(which);
          const ctl = v.match(/\(([^)]*)\)/);
          side.name = v.replace(/\([^)]*\)/g, "").trim();
          if (ctl && /\bia\b|ordinateur|auto/.test(plain(ctl[1]))) side.control = "ai";
          if (ctl && /joueur|humain|moi|nous/.test(plain(ctl[1]))) side.control = "human";
          side.faction = guessFaction(v);
          continue;
        }
      }
      // Ligne d'unité : un type reconnu, éventuellement un nombre, un nom, des
      // caractéristiques. Avec des séparateurs (« | » ou « : »), le segment qui
      // n'est qu'un type donne le type, et le premier segment en majuscule sans
      // chiffre donne le nom, même s'il contient un mot-clé (« Inquisitrice Varla »).
      const body = line.replace(/^[-*•·–]+\s*/, "");
      const segs = body.split(/\s*[|:]\s*/).map(x => x.trim()).filter(Boolean);
      let found = null, name = "";
      if (segs.length > 1) {
        const pure = segs.find(x => {
          const f = findType(x);
          return f && plain(x).replace(/[^a-z0-9 -]+/g, " ").trim().replace(/^\d+\s*x?\s*/, "").length <= f.k.length + 2;
        });
        if (pure) {
          found = findType(pure);
          name = segs.find(x => x !== pure && !/\d/.test(x) && /^[A-ZÀ-Ý«"“]/.test(x)) || "";
        }
      }
      if (!found) found = findType(body);
      if (!found) {
        if (/^[-*•·–]/.test(line)) spec.notes.push("Ligne ignorée, aucun type d'unité reconnu : « " + line.slice(0, 80) + " »");
        continue;
      }
      if (!name && segs.length > 1) name = segs.find(x => !findType(x) && !/\d/.test(x) && /^[A-ZÀ-Ý«"“]/.test(x)) || "";
      if (!name) name = (body.match(/[«"“]([^»"”]+)[»"”]/) || [])[1] || "";
      // Effectif : le dernier nombre (en chiffres ou en lettres) écrit avant
      // le type, « 6 x stormtroopers », « une escouade de 4 droïdekas ».
      let count = 1;
      const norm = " " + plain(body).replace(/[^a-z0-9-]+/g, " ") + " ";
      const at = norm.indexOf(" " + found.k + " ");
      const words = (at >= 0 ? norm.slice(0, at) : "").trim().split(" ").filter(Boolean);
      for (let w = words.length - 1; w >= 0; w--) {
        const x = words[w].replace(/x$/, "");
        if (/^\d+$/.test(x)) { count = +x; break; }
        if (NUMBERS[words[w]]) { count = NUMBERS[words[w]]; break; }
      }
      name = name.trim();
      const ov = readStats(body);
      if (!side) side = sideAt(spec.sides.length ? spec.sides.length - 1 : 0);
      const u = { type: found.type, count };
      if (name) u.name = name.slice(0, 40);
      if (Object.keys(ov).length) u.stats = ov;
      side.units.push(u);
    }
    return spec;
  }

  // Transforme un ordre de bataille (lu par parseOrder ou écrit par Claude)
  // en brouillon de bac à sable : types vérifiés, nombres et caractéristiques
  // bornés, théâtre cohérent avec les unités. Tout ce qui a dû être corrigé
  // ou écarté est expliqué dans notes.
  function planFromSpec(spec, looks) {
    spec = spec && typeof spec === "object" ? spec : {};
    const notes = (Array.isArray(spec.notes) ? spec.notes : []).map(String).slice(0, 12);
    const sidesIn = Array.isArray(spec.sides) ? spec.sides.filter(x => x && typeof x === "object") : [];
    while (sidesIn.length < 2) sidesIn.push({ units: [] });
    if (sidesIn.length > 2) {
      notes.push("Plus de deux camps décrits : les camps suivants rejoignent le camp rouge.");
      for (const extra of sidesIn.splice(2)) sidesIn[1].units = (sidesIn[1].units || []).concat(extra.units || []);
    }
    const lookOk = (type, s) => !!s && (TYPES[type].sprites.indexOf(s) >= 0 || (TYPES[type].anySprite && (looks || []).indexOf(s) >= 0));
    // Théâtre : celui demandé, sinon celui de la majorité des unités.
    let space = 0, ground = 0;
    for (const sd of sidesIn) for (const u of sd.units || []) {
      const T = TYPES[u && u.type] || TYPES[(findType(String(u && u.type || "")) || {}).type];
      if (!T) continue;
      if (T.theater === "space") space += +u.count || 1; else if (T.theater === "ground") ground += +u.count || 1;
    }
    let biome = BIOMES[spec.biome] ? spec.biome : guessBiome(String(spec.biome || "")) || null;
    const want = space > ground ? "space" : "ground";
    if (!biome || BIOMES[biome].theater !== want) {
      if (biome) notes.push("Carte « " + BIOMES[biome].name + " » remplacée : la plupart des unités se battent " + (want === "space" ? "dans l'espace." : "au sol."));
      biome = want === "space" ? "espace" : (biome && BIOMES[biome].theater === "ground" ? biome : "desert");
    }
    const theater = BIOMES[biome].theater;
    const sides = sidesIn.slice(0, 2).map((sd, i) => {
      const out = { name: String(sd.name || "").slice(0, 32), faction: FACTIONS[sd.faction] ? sd.faction : null,
        control: sd.control === "ai" || sd.control === "human" ? sd.control : (i === 0 ? "human" : "ai"),
        all: true, units: {}, custom: [] };
      let total = 0;
      const tally = {};
      for (const u of sd.units || []) {
        if (!u || typeof u !== "object") continue;
        let type = TYPES[u.type] ? u.type : (findType(String(u.type || "")) || {}).type;
        if (!type) { notes.push("Unité inconnue écartée : « " + String(u.type || "?").slice(0, 40) + " »."); continue; }
        const T = TYPES[type];
        if (T.theater !== theater && T.theater !== "any") { notes.push(T.name + " écarté : unité " + (T.theater === "space" ? "spatiale" : "terrestre") + " dans une bataille " + (theater === "space" ? "spatiale." : "au sol.")); continue; }
        let count = Math.round(+u.count || 1);
        count = Math.max(1, Math.min(40 - total, count));
        if (count <= 0) { notes.push("Plus de 40 unités dans un camp : le surplus est écarté."); break; }
        if (+u.count > count) notes.push("Effectif de " + T.name + " ramené à " + count + " (40 unités au plus par camp).");
        total += count;
        tally[T.faction] = (tally[T.faction] || 0) + count;
        const ov = {};
        if (u.stats && typeof u.stats === "object") {
          for (const k of ["hp", "mv", "rng", "att", "cac", "def"]) {
            const v = Math.round(+u.stats[k]);
            if (!isNaN(v) && v !== T[k]) ov[k] = Math.max(k === "hp" ? 1 : 0, Math.min(99, v));
          }
        }
        // PV restants d'un blessé (stats.now), bornés par son maximum.
        const maxHpU = ov.hp != null ? ov.hp : T.hp;
        const nowRaw = u.stats && typeof u.stats === "object" ? Math.round(+u.stats.now) : NaN;
        const now = !isNaN(nowRaw) && nowRaw < maxHpU ? Math.max(1, nowRaw) : null;
        const name = String(u.name || "").trim().slice(0, 40);
        const sprite = lookOk(type, u.look) ? u.look : null;
        if (!name && !sprite && !Object.keys(ov).length && now == null) { out.units[type] = (out.units[type] || 0) + count; continue; }
        for (let k = 1; k <= count; k++) {
          const c = { type };
          if (name) c.name = count > 1 ? name + " " + k : name;
          if (sprite) c.sprite = sprite;
          if (Object.keys(ov).length) c.ov = Object.assign({}, ov);
          if (now != null) c.now = now;
          out.custom.push(c);
        }
      }
      if (!out.faction) {
        const top = Object.keys(tally).filter(f => f !== "free").sort((a, b) => tally[b] - tally[a])[0];
        out.faction = top || (i === 0 ? "rebels" : "empire");
      }
      return out;
    });
    const turns = Math.round(+spec.turnLimit);
    return {
      id: null, name: String(spec.name || "").trim().slice(0, 48) || "Bataille de la séance",
      biome, turnLimit: isNaN(turns) ? 12 : Math.max(0, Math.min(30, turns)), deploy: "auto", budget: 200,
      summary: String(spec.summary || "").slice(0, 400), notes, sides,
    };
  }

  // ------------------------------------------------------------ Dés libres

  // « 3d6+2 », « d20 », « 2d10-1 »…
  function rollFormula(state, text) {
    const m = String(text).replace(/\s+/g, "").toLowerCase().match(/^(\d*)d(\d+)([+-]\d+)?$/);
    if (!m) return null;
    const n = Math.min(40, Math.max(1, +(m[1] || 1))), f = Math.min(1000, Math.max(2, +m[2])), mod = +(m[3] || 0);
    const rolls = [];
    for (let i = 0; i < n; i++) rolls.push(d(state, f));
    return { n, f, mod, rolls, total: rolls.reduce((a, b) => a + b, 0) + mod };
  }

  return {
    FACTIONS, TYPES, TERRAIN, BIOMES, SCENARIOS, TAGS, COLS, ROWS,
    has, hash, key, dist, neighbors, hexLine, lineOfSight, center, pixelToHex, facingTo,
    inBounds, terrainAt, terrainId, generateMap, moveCost, canStand,
    stat, maxHp, unitAt, byUid, addUnit, deploy, rosters, randomArmy,
    blankState, createGame, createScenario, log, startTurn, endTurn, nextRound, checkVictory, alive,
    reachable, pathTo, moveUnit, endActivation, isEnemy, profile, expected, canShoot, targets, attack,
    meleeProfile, canMelee, meleeTargets, melee, removeUnit, record, report,
    KEYWORDS, findType, parseOrder, planFromSpec,
    isAction, canUseAbility, useAbility, aiNext, apply, rollFormula, d, sideOf,
  };
})();

if (typeof module !== "undefined") module.exports = Engine;
