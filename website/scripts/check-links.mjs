// Fails if any built page links to an internal path that is neither a page of the site, one of its files, nor one of the
// app's own entry points. Run after `npm run build`.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const routes = new Set(JSON.parse(readFileSync(path.join(dist, "routes.json"), "utf8")));
const appPaths = new Set(["/find-school", "/login"]);

const pages = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (name === "index.html") pages.push(full);
  }
};
walk(dist);

let bad = 0;
for (const file of pages) {
  const html = readFileSync(file, "utf8");
  for (const [, href] of html.matchAll(/(?:href|src)="(\/[^"#?]*)/g)) {
    const clean = href.length > 1 ? href.replace(/\/$/, "") : href;
    if (routes.has(clean) || appPaths.has(clean) || existsSync(path.join(dist, clean))) continue;
    console.error(`${path.relative(dist, file) || "index.html"}: broken link ${href}`);
    bad++;
  }
}
console.log(`Checked ${pages.length} pages, ${bad} broken link(s).`);
process.exit(bad ? 1 : 0);
