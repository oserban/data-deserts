import { build, transform } from "esbuild";
import { ZipArchive } from "archiver";
import { createWriteStream } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const app = resolve(root, "app");
const doApp = resolve(root, "do-app");
const output = resolve(root, "dist-do-app");
const archivePath = resolve(root, "data-deserts-do-app-linux.zip");

async function requiredFile(path, hint) {
  try { return await readFile(path, "utf8"); }
  catch (error) {
    if (error.code === "ENOENT") throw new Error(`${hint}: ${path}`);
    throw error;
  }
}

await rm(output, { recursive: true, force: true });
await mkdir(resolve(output, "app/assets"), { recursive: true });
await mkdir(resolve(output, "app/vendor"), { recursive: true });
await mkdir(resolve(output, "do-app/assets"), { recursive: true });

const [world, datasets, appLogic, appCss] = await Promise.all([
  requiredFile(resolve(app, "data/world.js"), "Missing generated world data"),
  requiredFile(resolve(app, "data/datasets.js"), "Missing generated dataset data; run npm run build:data"),
  requiredFile(resolve(app, "app.js"), "Missing renderer logic"),
  requiredFile(resolve(app, "styles/app.css"), "Missing renderer styles")
]);

const rendererBundle = await transform([world, datasets, appLogic].join("\n;\n"), {
  legalComments: "none", minify: true, sourcefile: "renderer.bundle.js",
  sourcemap: false, target: ["es2018"]
});
await writeFile(resolve(output, "app/assets/app.min.js"), rendererBundle.code);
const rendererStyles = await transform(appCss, {
  legalComments: "none", loader: "css", minify: true, sourcemap: false,
  sourcefile: "app.css", target: ["es2018"]
});
await writeFile(resolve(output, "app/assets/app.min.css"), rendererStyles.code);

let appHtml = await readFile(resolve(app, "index.html"), "utf8");
appHtml = appHtml
  .replace('href="styles/app.css"', 'href="assets/app.min.css"')
  .replace(/\n  <script src="data\/world\.js"><\/script>\n  <script src="data\/datasets\.js"><\/script>\n  <script src="app\.js"><\/script>/,
    '\n  <script src="assets/app.min.js"></script>');
await writeFile(resolve(output, "app/index.html"), appHtml);
await cp(resolve(app, "vendor"), resolve(output, "app/vendor"), { recursive: true });

const [controllerLogic, controllerCss] = await Promise.all([
  readFile(resolve(doApp, "controller.js"), "utf8"),
  readFile(resolve(doApp, "controller.css"), "utf8")
]);
const controllerBundle = await transform([datasets, world, controllerLogic].join("\n;\n"), {
  legalComments: "none", minify: true, sourcefile: "controller.bundle.js",
  sourcemap: false, target: ["es2018"]
});
await writeFile(resolve(output, "do-app/assets/controller.min.js"), controllerBundle.code);
const controllerStyles = await transform(controllerCss, {
  legalComments: "none", loader: "css", minify: true, sourcemap: false,
  sourcefile: "controller.css", target: ["es2018"]
});
await writeFile(resolve(output, "do-app/assets/controller.min.css"), controllerStyles.code);

let controllerHtml = await readFile(resolve(doApp, "controller.html"), "utf8");
controllerHtml = controllerHtml
  .replace('href="/do-app/controller.css"', 'href="/do-app/assets/controller.min.css"')
  .replace(/\n  <script src="\/app\/data\/datasets\.js"><\/script>\n  <script src="\/app\/data\/world\.js"><\/script>\n  <script src="\/do-app\/controller\.js"><\/script>/,
    '\n  <script src="/do-app/assets/controller.min.js"></script>');
await writeFile(resolve(output, "do-app/controller.html"), controllerHtml);
await cp(resolve(doApp, "renderer.html"), resolve(output, "do-app/renderer.html"));
await cp(resolve(doApp, "details.html"), resolve(output, "do-app/details.html"));

const [datasetsCss, datasetsPageLogic] = await Promise.all([
  readFile(resolve(doApp, "datasets.css"), "utf8"),
  readFile(resolve(doApp, "datasets-page.js"), "utf8")
]);
const datasetsStyles = await transform(datasetsCss, {
  legalComments: "none", loader: "css", minify: true, sourcemap: false,
  sourcefile: "datasets.css", target: ["es2018"]
});
await writeFile(resolve(output, "do-app/assets/datasets.min.css"), datasetsStyles.code);
const datasetsPageBundle = await transform([datasets, datasetsPageLogic].join("\n;\n"), {
  legalComments: "none", minify: true, sourcefile: "datasets-page.bundle.js",
  sourcemap: false, target: ["es2018"]
});
await writeFile(resolve(output, "do-app/assets/datasets-page.min.js"), datasetsPageBundle.code);
let datasetsHtml = await readFile(resolve(doApp, "datasets.html"), "utf8");
datasetsHtml = datasetsHtml
  .replace('href="/do-app/datasets.css"', 'href="/do-app/assets/datasets.min.css"')
  .replace(/\n  <script src="\/app\/data\/datasets\.js"><\/script>\n  <script src="\/do-app\/datasets-page\.js"><\/script>/,
    '\n  <script src="/do-app/assets/datasets-page.min.js"></script>');
await writeFile(resolve(output, "do-app/datasets.html"), datasetsHtml);

const [projectCss, projectLogic] = await Promise.all([
  readFile(resolve(doApp, "project.css"), "utf8"),
  readFile(resolve(doApp, "project.js"), "utf8")
]);
const projectStyles = await transform(projectCss, {
  legalComments: "none", loader: "css", minify: true, sourcemap: false,
  sourcefile: "project.css", target: ["es2018"]
});
const projectBundle = await transform(projectLogic, {
  legalComments: "none", minify: true, sourcefile: "project.js",
  sourcemap: false, target: ["es2018"]
});
await writeFile(resolve(output, "do-app/assets/project.min.css"), projectStyles.code);
await writeFile(resolve(output, "do-app/assets/project.min.js"), projectBundle.code);
let projectHtml = await readFile(resolve(doApp, "project.html"), "utf8");
projectHtml = projectHtml
  .replace('href="/do-app/project.css"', 'href="/do-app/assets/project.min.css"')
  .replace('src="/do-app/project.js"', 'src="/do-app/assets/project.min.js"');
await writeFile(resolve(output, "do-app/project.html"), projectHtml);
await cp(resolve(doApp, "assets/project"), resolve(output, "do-app/assets/project"), { recursive: true });

await build({
  entryPoints: [resolve(doApp, "server.mjs")],
  outfile: resolve(output, "do-app/server.mjs"),
  bundle: true, platform: "node", format: "esm", target: "node20",
  minify: true, legalComments: "none", sourcemap: false,
  define: { "process.env.NODE_ENV": '"production"' },
  banner: {
    js: 'import { createRequire as __createRequire } from "node:module";const require=__createRequire(import.meta.url);'
  }
});

await writeFile(resolve(output, "package.json"), JSON.stringify({
  name: "data-deserts-do-app", private: true, type: "module",
  scripts: { start: "node do-app/server.mjs" }
}, null, 2) + "\n");
await writeFile(resolve(output, "README.md"), `# Data Deserts DO App — production package

Requires Node.js 20 or newer. No package installation is required.

\`\`\`sh
PORT=8080 node do-app/server.mjs
\`\`\`

Alternatively run \`npm start\`. Open \`/controller\` for the controller, \`/renderer\` for the map,
and \`/details\` for the detached country-information panel. The static dataset reference is
available at \`/datasets\`, and the project overview is available at \`/project\`.

Place a TLS reverse proxy in front of the server for a public deployment so WebSocket connections
use WSS. The relay is unauthenticated; restrict network access or add authentication before exposing
control of a public display.
`);

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

console.log("Built standalone production DO App in dist-do-app/.");
console.log("Created data-deserts-do-app-linux.zip (Node.js 20+, no npm install required).");
