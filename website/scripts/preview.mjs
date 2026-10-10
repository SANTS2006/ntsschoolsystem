// A tiny static server for the built site (dist/), for checking it locally. Not used in production, where Django serves it.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { createGzip } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const port = Number(process.env.PORT ?? 4181);
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".woff2": "font/woff2", ".woff": "font/woff", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".xml": "application/xml", ".txt": "text/plain", ".json": "application/json" };

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname === "/api/v1/public/enquiries/" && req.method === "POST") {
    // Stand-in for the real endpoint so the form can be tried without the backend.
    res.writeHead(201, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ success: true, message: "Received", code: "OK", errors: [], reference: "PREVIEW1" }));
  }
  let file = path.join(dist, decodeURIComponent(url.pathname));
  if (!file.startsWith(dist)) return res.writeHead(403).end();
  if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!existsSync(file)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    return res.end("Not found");
  }
  // Behave like production for the things that affect measurements: compression and long-lived hashed assets.
  const ext = path.extname(file);
  const headers = { "Content-Type": types[ext] ?? "application/octet-stream", "Cache-Control": url.pathname.startsWith("/site-assets/") ? "public, max-age=31536000, immutable" : "public, max-age=300" };
  const compressible = [".html", ".css", ".js", ".svg", ".xml", ".txt", ".json"].includes(ext) && /gzip/.test(String(req.headers["accept-encoding"]));
  if (compressible) {
    res.writeHead(200, { ...headers, "Content-Encoding": "gzip", Vary: "Accept-Encoding" });
    return createReadStream(file).pipe(createGzip()).pipe(res);
  }
  res.writeHead(200, headers);
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`Previewing dist/ at http://localhost:${port}`));
