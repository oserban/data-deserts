import { transform } from "esbuild";
import { ZipArchive } from "archiver";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const app = resolve(root, "app");
const output = resolve(root, "dist");
const archivePath = resolve(root, "data-deserts-vercel.zip");
const sourcePath = (...parts) => parts.join("/");
const leafletCssPath = sourcePath("vendor", "leaflet.css");
const leafletJsPath = sourcePath("vendor", "leaflet.js");
const appCssPath = sourcePath("styles", "app.css");
const tourJsPath = sourcePath("tour.js");
const required = [
  "data/world.js",
  "data/datasets.js",
  "app.js",
  "score-model.js",
  tourJsPath
];

const sources = await Promise.all(required.map(async (name) => {
  try {
    return await readFile(resolve(app, name), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`Missing app/${name}. Run \"npm run build:data\" first.`);
    }
    throw error;
  }
}));

await rm(output, { recursive: true, force: true });
await mkdir(resolve(output, "assets"), { recursive: true });
await mkdir(resolve(output, "vendor"), { recursive: true });

function fingerprint(content) {
  return createHash("sha256").update(content).digest("hex").slice(0, 12);
}

async function writeHashed(directory, name, extension, content) {
  const filename = `${name}.${fingerprint(content)}.${extension}`;
  await writeFile(resolve(output, directory, filename), content);
  return `${directory}/${filename}`;
}

const [worldSource, datasetsSource, appSource, agricultureSource, tourSource] = sources;
const minifyJavaScript = async (source, sourcefile) => (await transform(source, {
  legalComments: "none", minify: true, sourcefile, sourcemap: false, target: ["es2018"]
})).code;

const worldAsset = await writeHashed("assets", "world", "js",
  await minifyJavaScript(worldSource, "world.js"));
const datasetsAsset = await writeHashed("assets", "datasets", "js",
  await minifyJavaScript(datasetsSource, "datasets.js"));
const appAsset = await writeHashed("assets", "app", "js",
  await minifyJavaScript(agricultureSource + "\n" + appSource + "\n" + tourSource, "app.js"));
const cssAsset = await writeHashed("assets", "app", "css", (await transform(
  await readFile(resolve(app, appCssPath), "utf8"),
  { loader: "css", legalComments: "none", minify: true, sourcefile: "app.css" }
)).code);
const leafletCssAsset = await writeHashed("vendor", "leaflet", "css",
  await readFile(resolve(app, leafletCssPath)));
const leafletJsAsset = await writeHashed("vendor", "leaflet", "js",
  await readFile(resolve(app, leafletJsPath)));

let html = await readFile(resolve(app, "index.html"), "utf8");
html = html
  .replace(`\n  <script src="${tourJsPath}"></script>`, "")
  .replace('\n  <script src="score-model.js"></script>', '')
  .replace(`<link rel="stylesheet" href="${leafletCssPath}" />`, `<link rel="stylesheet" href="${leafletCssAsset}" />`)
  .replace(`<link rel="stylesheet" href="${appCssPath}" />`, `<link rel="stylesheet" href="${cssAsset}" />`)
  .replace(`<script src="${leafletJsPath}"></script>`, `<script src="${leafletJsAsset}"></script>`)
  .replace(/\n[ ]{2}<script src="data\/world\.js"><\/script>\n[ ]{2}<script src="data\/datasets\.js"><\/script>\n[ ]{2}<script src="app\.js"><\/script>/,
    `\n  <script src="${worldAsset}"></script>` +
    `\n  <script src="${datasetsAsset}"></script>` +
    `\n  <script src="${appAsset}"></script>`);
await writeFile(resolve(output, "index.html"), html);
await writeFile(resolve(output, "_headers"), [
  "/assets/*",
  "  Cache-Control: public, max-age=31536000, immutable",
  "/vendor/*",
  "  Cache-Control: public, max-age=31536000, immutable",
  "/index.html",
  "  Cache-Control: no-cache",
  ""
].join("\n"));
await writeFile(resolve(output, "vercel.json"), JSON.stringify({
  headers: [
    { source: "/assets/(.*)", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    { source: "/vendor/(.*)", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    { source: "/index.html", headers: [{ key: "Cache-Control", value: "no-cache" }] }
  ]
}, null, 2) + "\n");

await rm(archivePath, { force: true });
await new Promise((resolveArchive, rejectArchive) => {
  const destination = createWriteStream(archivePath);
  const archive = new ZipArchive({ zlib: { level: 9 } });

  destination.on("close", resolveArchive);
  destination.on("error", rejectArchive);
  archive.on("error", rejectArchive);
  archive.pipe(destination);
  archive.directory(output, false);
  archive.finalize();
});

console.log("Built production app in dist/ (minified, mangled, without source maps).");
console.log("Created data-deserts-vercel.zip with deployable files at the archive root.");
