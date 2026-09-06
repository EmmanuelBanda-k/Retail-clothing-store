import { mkdir, readFile, writeFile } from "node:fs/promises";

const sourcePath = new URL("../urban-clothing-pos.html", import.meta.url);
const source = await readFile(sourcePath, "utf8");

const styleMatch = source.match(/<style>\s*([\s\S]*?)\s*<\/style>/);
const scriptMatch = source.match(/<script>\s*([\s\S]*?)\s*<\/script>/);

if (!styleMatch || !scriptMatch) {
  throw new Error("Expected one inline <style> block and one inline <script> block.");
}

const root = new URL("../", import.meta.url);
await mkdir(new URL("css/", root), { recursive: true });
await mkdir(new URL("js/", root), { recursive: true });

const html = source
  .replace(styleMatch[0], '<link rel="stylesheet" href="css/styles.css">')
  .replace(scriptMatch[0], '<script src="js/app.js" defer></script>');

await writeFile(new URL("index.html", root), html, "utf8");
await writeFile(new URL("css/styles.css", root), `${styleMatch[1].trim()}\n`, "utf8");
await writeFile(new URL("js/app.js", root), `${scriptMatch[1].trim()}\n`, "utf8");

console.log("Created index.html, css/styles.css, and js/app.js");
