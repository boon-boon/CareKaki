// Copy the built Angular SPA into ./public so it ships with the repository and
// survives hosting pipelines that exclude conventional build output (dist/).
// Runs after `npm run ux:build`; used by build:all and the deploy flow.
import { cp, rm, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "carekaki-ux", "dist", "carekaki-ux", "browser");
const target = path.join(root, "public");

try {
  await access(path.join(source, "index.html"));
} catch {
  console.error(`sync-frontend: no Angular build at ${source}. Run "npm run ux:build" first.`);
  process.exit(1);
}

await rm(target, { recursive: true, force: true });
await cp(source, target, { recursive: true });
console.error(`sync-frontend: copied SPA -> ${target}`);
