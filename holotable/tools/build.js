// Prépare holotable/index.html pour une publication en Artifact claude.ai.
//
// La plateforme fournit elle-même le squelette <html><head><body> : on retire
// donc ces balises et les métas qu'il porte déjà. Le moteur, chargé par un
// <script src> en local, est inliné pour que la page tienne en un fichier
// (les sprites et la carte restent des fichiers publiés à côté).
//
// Usage : node holotable/tools/build.js [destination]

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DEST = process.argv[2] || path.join(ROOT, "..", "dist", "holotable", "index.html");

let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const engine = fs.readFileSync(path.join(ROOT, "engine.js"), "utf8");

const strip = [
  /<!DOCTYPE html>\s*/i, /<html[^>]*>\s*/i, /<\/html>\s*/i, /<head>\s*/i, /<\/head>\s*/i,
  /<body>\s*/i, /<\/body>\s*/i, /<meta charset="[^"]*">\s*/i, /<meta name="viewport"[^>]*>\s*/i,
];
for (const re of strip) {
  if (!re.test(html)) { console.error("Balise attendue introuvable : " + re); process.exit(1); }
  html = html.replace(re, "");
}
const tag = '<script src="engine.js"></script>';
if (!html.includes(tag)) { console.error("Balise du moteur introuvable"); process.exit(1); }
html = html.replace(tag, () => "<script>\n" + engine + "</script>");

fs.mkdirSync(path.dirname(DEST), { recursive: true });
fs.writeFileSync(DEST, html);
console.log("Écrit " + path.relative(process.cwd(), DEST) + " (" + Math.round(html.length / 1024) + " Ko)");
