// Prépare index.html pour une publication en Artifact claude.ai.
//
// Deux contraintes de la plateforme, et rien d'autre : le jeu garde son
// identité graphique, son code et son équilibrage à l'identique.
//
//   1. La page est insérée dans un squelette <head>…</head><body> fourni :
//      on retire donc doctype, <html>, <head> et <body>.
//   2. Une CSP stricte bloque toute requête sortante. Les photos d'ambiance
//      viennent de Wikimedia Commons : on les neutralise proprement plutôt
//      que de laisser sept requêtes échouer, et on retire du même coup les
//      crédits photo, qui créditeraient des images absentes.
//
// Usage : node scripts/build-artifact.js [source] [destination]

const fs = require("fs");
const path = require("path");

const SRC = process.argv[2] || "index.html";
const DEST = process.argv[3] || "dist/ranch-dynasty.html";

const html = fs.readFileSync(SRC, "utf8");

const styleMatch = html.match(/<style>[\s\S]*?<\/style>/);
const bodyMatch = html.match(/<body>([\s\S]*)<\/body>/);
if (!styleMatch || !bodyMatch) {
  console.error("Structure inattendue : <style> ou <body> introuvable dans " + SRC);
  process.exit(1);
}

const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [, "Ranch Dynasty"])[1];

let out = "<title>" + title + "</title>\n"
        + styleMatch[0] + "\n"
        + bodyMatch[1];

// Neutralise les photos d'époque : le <div class="hero"> conserve son dégradé
// de repli, défini en CSS, donc l'ambiance de chaque époque reste lisible.
out = out.replace(
  /const ERAS = \[/,
  "const ERAS = ["
);
out = out.replace(
  /^(\s*)photo:"https?:\/\/[^"]*",\s*$/gm,
  '$1photo:"",'
);
out = out.replace(
  /^(\s*)photoCredit:"[^"]*",\s*$/gm,
  '$1photoCredit:"",'
);

const leftovers = out.match(/https?:\/\/[^\s"')]+/g) || [];
if (leftovers.length) {
  console.error("Références externes restantes, la CSP les bloquerait :");
  [...new Set(leftovers)].forEach(u => console.error("  " + u));
  process.exit(1);
}

for (const forbidden of ["<!DOCTYPE", "<html", "<head>", "<body>"]) {
  if (out.includes(forbidden)) {
    console.error("Balise interdite dans une page d'Artifact : " + forbidden);
    process.exit(1);
  }
}

fs.mkdirSync(path.dirname(DEST), { recursive: true });
fs.writeFileSync(DEST, out);
console.log(
  "Écrit " + DEST + " — " + (out.length / 1024).toFixed(0) + " Ko, "
  + "0 référence externe."
);
