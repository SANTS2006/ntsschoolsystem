// Renders every page in src/routes.ts to static HTML (dist/<route>/index.html) and writes routes.json, sitemap.xml and
// robots.txt. Run by `npm run build` after the client and server bundles are built.
import { mkdir, readdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const ssrDir = path.join(root, "dist-ssr");

const siteUrl = (process.env.VITE_SITE_URL || "https://nts-school-system.onrender.com").replace(/\/$/, "");
const template = await readFile(path.join(dist, "index.html"), "utf8");
const { render, ROUTE_PATHS: routes } = await import(pathToFileURL(path.join(ssrDir, "entry-server.js")).href);
if (!template.includes("<!--app-html-->") || !template.includes("<!--app-head-->")) throw new Error("index.html template is missing its markers");

// Preload the weights the first screen uses so text does not flash in a fallback font.
const fontFiles = (await readdir(path.join(dist, "site-assets"))).filter((f) => /poppins-latin-(400|500|600|700)-normal-.*\.woff2$/.test(f));
const preloads = fontFiles.map((f) => `<link rel="preload" as="font" type="font/woff2" href="/site-assets/${f}" crossorigin />`).join("\n    ");

const written = [];
for (const route of routes) {
  const { html, head } = render(route);
  if (!head) throw new Error(`Page ${route} declared no metadata`);
  const page = template.replace("<!--app-head-->", () => `${preloads}\n    ${head}`).replace("<!--app-html-->", () => html);
  const dir = route === "/" ? dist : path.join(dist, route.replace(/^\//, ""));
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "index.html"), page);
  written.push(route);
}

await writeFile(path.join(dist, "routes.json"), JSON.stringify(written));
const today = new Date().toISOString().slice(0, 10);
const urls = written.map((r) => `  <url><loc>${siteUrl}${r === "/" ? "/" : r}</loc><lastmod>${today}</lastmod></url>`).join("\n");
await writeFile(path.join(dist, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
await writeFile(path.join(dist, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /dashboard\nDisallow: /login\n\nSitemap: ${siteUrl}/sitemap.xml\n`);
await rm(ssrDir, { recursive: true, force: true });
console.log(`Prerendered ${written.length} pages to ${path.relative(root, dist)}`);
