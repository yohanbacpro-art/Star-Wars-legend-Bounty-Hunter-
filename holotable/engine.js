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
    deflect:  { name: "Sabre laser", desc: "Renvoie les tirs : esquive sur 4+ contre les tirs à distance." },
    shield:   { name: "Bouclier",    desc: "Esquive sur 4+ contre tous les tirs." },
    hunter:   { name: "Traqueur",    desc: "+1 dé contre une cible déjà blessée." },
    jetpack:  { name: "Réacteur dorsal", desc: "Le terrain ne coûte qu'1 mouvement, l'eau se franchit." },
    melee:    { name: "Corps à corps", desc: "Ne frappe qu'au contact (portée 1)." },
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
      hp: 24, mv: 2, rng: 5, att: 7, def: 2, cost: 120, tags: ["capital", "heavy", "armored", "ap", "large"],
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
      hp: 6, mv: 5, rng: 1, att: 6, def: 2, cost: 45, tags: ["hero", "melee", "ap", "deflect"],
      ability: { id: "lightning", type: "shot", name: "Éclair de Force", uses: 2, dice: 4, rng: 3, ap: true,
        desc: "Deux fois par bataille : tir à portée 3, 4 dés perforants." },
      desc: "Frappe au sabre laser et renvoie les tirs de blaster.",
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
      hp: 6, mv: 5, rng: 1, att: 5, def: 3, cost: 45, tags: ["hero", "melee", "ap", "deflect"],
      ability: { id: "push", type: "shot", name: "Poussée de Force", uses: 2, dice: 4, rng: 3, ap: true,
        desc: "Deux fois par bataille : tir à portée 3, 4 dés perforants." },
      desc: "Gardien de la paix. Son sabre laser renvoie les tirs de blaster.",
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
      hp: 5, mv: 5, rng: 4, att: 4, def: 3, cost: 30, tags: ["infantry", "jetpack"],
      desc: "Armure de beskar, réacteur dorsal : ils frappent là où on ne les attend pas.",
      naming: (n) => ["Ordo", "Vizsla", "Kryze", "Fett", "Wren", "Skirata"][(n - 1) % 6] + (n > 6 ? " " + Math.ceil(n / 6) : ""),
    },
    commando: {
      name: "Super commandos", faction: "mandalorians", theater: "ground", kind: "Infanterie",
      sprites: ["commando-1", "commando-2"], rotate: false, size: 1.05,
      hp: 4, mv: 4, rng: 4, att: 4, def: 3, cost: 18, tags: ["infantry"],
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
      hp: 5, mv: 3, rng: 1, att: 4, def: 2, cost: 9, tags: ["infantry", "melee"],
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
      blurb: "Pas de vaisseau capital : cinq X-wing contre huit TIE, dans une nébuleuse qui coupe les lignes de tir. Une partie courte.",
      sides: [
        { faction: "rebels", units: ["xwing", "xwing", "xwing", "xwing", "xwing"] },
        { faction: "empire", units: ["tie", "tie", "tie", "tie", "tie", "tie", "tie", "tie"] },
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
      blurb: "Les rebelles connaissent les bois mieux que la garnison impériale. Huit sections rebelles contre neuf escouades de stormtroopers : le couvert décide de tout.",
      sides: [
        { faction: "rebels", units: ["rebel", "rebel", "rebel", "rebel", "rebel", "rebel", "rebel", "rebel"] },
        { faction: "empire", units: ["storm", "storm", "storm", "storm", "storm", "storm", "storm", "storm", "storm"] },
      ],
    },
    {
      id: "contrat", name: "Le contrat", biome: "desert", turnLimit: 12,
      blurb: "Une prime, deux prétendants. Les chasseurs de primes et leurs hommes de main affrontent une escouade mandalorienne équipée de réacteurs dorsaux.",
      sides: [
        { faction: "underworld", units: ["chasseur", "chasseur", "trando", "trando", "gamorreen", "gamorreen"] },
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
        { faction: "republic", units: ["venator", "venator", "arquitens"] },
        { faction: "separatists", units: ["recusant", "munificent", "munificent"] },
      ],
    },
    {
      id: "amiral", name: "Le vaisseau amiral", biome: "espace", turnLimit: 14,
      blurb: "La flotte rebelle tente d'abattre un super destroyer stellaire avant que ses escadrilles de TIE ne la submergent.",
      sides: [
        { faction: "rebels", units: ["moncal", "nebulon", "xwing", "xwing", "xwing", "xwing"] },
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
    return u;
  }

  // Place une liste de types dans la zone de déploiement d'un camp.
  function deploy(state, side, types) {
    const map = state.map, mid = (map.rows - 1) / 2;
    const order = types.slice().sort((a, b) => TYPES[b].size - TYPES[a].size);
    const cols = [];
    for (let i = 0; i < map.cols; i++) cols.push(side === 0 ? i : map.cols - 1 - i);
    const placed = [];
    for (const type of order) {
      const T = TYPES[type];
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
      if (best) placed.push(addUnit(state, type, side, best.c, best.r));
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

  function attack(state, a, t, opts) {
    opts = opts || {};
    const p = profile(state, a, t, opts);
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
    if (TYPES[a.type].rotate) a.facing = facingTo(a, t);
    a.moved = true; a.acted = true; a.plan = null;
    const ab = TYPES[a.type].ability;
    if (opts.special && ab) a.uses[ab.id] = Math.max(0, (a.uses[ab.id] || 0) - 1);
    const killed = t.hp <= 0;
    const res = { attacker: a.uid, target: t.uid, rolls, defRolls, need: p.need, defNeed: p.defNeed, crits, norm, saves, dmg, killed, notes: p.notes, dmgPerHit: p.dmg };
    let text = a.name + " tire sur " + t.name + " : ";
    text += dmg ? dmg + " dégât" + (dmg > 1 ? "s" : "") : (crits + norm ? "tout est esquivé" : "manqué");
    if (killed) text += ". " + t.name + " est détruit.";
    log(state, { k: "attack", side: a.side, text, dice: { rolls, need: p.need, defRolls, defNeed: p.defNeed }, notes: p.notes });
    if (killed) {
      state.units.splice(state.units.indexOf(t), 1);
      checkVictory(state);
    }
    return res;
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
    }
    return best;
  }

  function threatAt(state, u, pos, foes) {
    let th = 0;
    for (const e of foes) {
      if (dist(e, pos) > stat(e, "mv") + stat(e, "rng")) continue;
      th += profile(state, e, u, { tpos: pos }).expected;
    }
    return Math.min(th, u.hp) * value(u);
  }

  function aiNext(state, side) {
    const foes = state.units.filter(o => o.side === 1 - side);
    const mine = state.units.filter(o => o.side === side && !o.acted);
    if (!mine.length || !foes.length || state.over) return { type: "end" };

    // Une unité déjà déplacée tire si elle peut, sinon elle s'arrête là.
    const moved = mine.find(o => o.moved);
    if (moved) {
      const s = bestShot(state, moved, moved);
      return s ? { type: "attack", uid: moved.uid, target: s.t.uid, special: s.special } : { type: "wait", uid: moved.uid };
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
      const gap = Math.max(0, nearest(foes, pos) - stat(u, "rng"));
      s -= gap * (shot ? 0.1 : 0.6);
      s -= v.cost * 0.01; // à valeur égale, on bouge le moins possible
      if (!best || s > best.s) best = { s, pos };
    }
    if (best.pos.c === u.c && best.pos.r === u.r) {
      return here ? { type: "attack", uid: u.uid, target: here.t.uid, special: here.special } : { type: "wait", uid: u.uid };
    }
    return { type: "move", uid: u.uid, c: best.pos.c, r: best.pos.r };
  }

  // Applique une action de l'IA d'un coup (sans animation) : utile aux tests.
  function apply(state, act) {
    const u = act.uid != null ? byUid(state, act.uid) : null;
    if (act.type === "end") return endTurn(state);
    if (act.type === "move") return moveUnit(state, u, act.c, act.r, pathTo(reachable(state, u), act.c, act.r));
    if (act.type === "attack") return attack(state, u, byUid(state, act.target), { special: act.special });
    if (act.type === "ability") return useAbility(state, u);
    if (act.type === "wait") return endActivation(state, u);
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
    isAction, canUseAbility, useAbility, aiNext, apply, rollFormula, d, sideOf,
  };
})();

if (typeof module !== "undefined") module.exports = Engine;
