import { spawnSync } from "node:child_process";

const required = ["VERCEL_TOKEN", "VERCEL_ORG_ID", "VERCEL_PROJECT_ID"];
const missing = required.filter((name) => !process.env[name] || process.env[name].startsWith("replace_with_"));

if (missing.length) {
  console.error(`Missing Vercel configuration in .env: ${missing.join(", ")}`);
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("npm", ["run", "build"]);
run("npx", ["--yes", "vercel@latest", "deploy", "dist", "--prod", "--yes",
  `--token=${process.env.VERCEL_TOKEN}`]);
