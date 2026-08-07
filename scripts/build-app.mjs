import { build, transform } from "esbuild";
import { ZipArchive } from "archiver";
import { createWriteStream } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const app = resolve(root, "app");
const output = resolve(root, "dist");
const archivePath = resolve(root, "data-deserts-vercel.zip");
const required = [
  "data/world.js",
  "data/datasets.js",
  "app.js"
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

const bundle = await transform(sources.join("\n;\n"), {
  legalComments: "none",
  minify: true,
  minifyIdentifiers: true,
  minifySyntax: true,
  minifyWhitespace: true,
  sourcefile: "data-deserts.bundle.js",
  sourcemap: false,
  target: ["es2018"]
});
await writeFile(resolve(output, "assets/app.min.js"), bundle.code);

await build({
  entryPoints: [resolve(app, "styles/app.css")],
  legalComments: "none",
  minify: true,
  outfile: resolve(output, "assets/app.min.css"),
  sourcemap: false
});

let html = await readFile(resolve(app, "index.html"), "utf8");
html = html
  .replace('<link rel="stylesheet" href="styles/app.css" />', '<link rel="stylesheet" href="assets/app.min.css" />')
  .replace(/\n  <script src="data\/world\.js"><\/script>\n  <script src="data\/datasets\.js"><\/script>\n  <script src="app\.js"><\/script>/,
    '\n  <script src="assets/app.min.js"></script>');
await writeFile(resolve(output, "index.html"), html);
await cp(resolve(app, "vendor"), resolve(output, "vendor"), { recursive: true });

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
