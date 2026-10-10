// Cross-platform production launcher: no cross-env dependency needed.
// Sets NODE_ENV=production (so http.ts binds 0.0.0.0) and loads .env if present,
// then starts the compiled single-port HTTP + SPA server.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.NODE_ENV = "production";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, ".env");
if (existsSync(envFile)) {
  try { process.loadEnvFile(envFile); } catch { /* Node <20.12 or malformed .env: ignore */ }
}

await import(path.join(root, "dist", "http.js"));
