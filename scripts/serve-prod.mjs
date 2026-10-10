// Cross-platform production launcher: no cross-env dependency needed.
// Sets NODE_ENV=production (so http.ts binds 0.0.0.0) and loads .env if present,
// then starts the compiled single-port HTTP + SPA server.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

process.env.NODE_ENV = "production";

// Behind a public reverse proxy the DNS-rebinding host guard would reject every
// request unless the exact public hostname is allow-listed. Platforms rarely
// inject a usable URL var, so default to disabling the guard for public hosting
// (hosts/origins = "*" in http.ts). Lock it down by setting ALLOWED_HOSTS to the
// explicit hostname, or CAREKAKI_STRICT_HOSTS=1 to keep the guard strict.
if (!process.env.ALLOWED_HOSTS && !process.env.PUBLIC_URL && process.env.CAREKAKI_STRICT_HOSTS !== "1") {
  process.env.ALLOWED_HOSTS = "*";
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, ".env");
if (existsSync(envFile)) {
  try { process.loadEnvFile(envFile); } catch { /* Node <20.12 or malformed .env: ignore */ }
}

// Invoke the server explicitly instead of importing dist/http.js for its side
// effect: that file only self-starts when it is process.argv[1], so importing it
// from here would boot nothing. Node's ESM loader also requires a file: URL —
// a bare Windows path (C:\...) throws ERR_UNSUPPORTED_ESM_URL_SCHEME.
const serverEntry = path.join(root, "dist", "http.js");
if (!existsSync(serverEntry)) {
  console.error('CareKaki: dist/http.js not found. Run "npm run build" first.');
  process.exit(1);
}
const frontendEntry = [path.join(root, "public", "index.html"), path.join(root, "carekaki-ux", "dist", "carekaki-ux", "browser", "index.html")]
  .find(candidate => existsSync(candidate));
if (!frontendEntry) {
  console.error('CareKaki: Angular build not found in public/ or carekaki-ux/dist. Run "npm run ux:build && npm run sync:frontend".');
}

const { startHttpServer } = await import(pathToFileURL(serverEntry).href);

const running = startHttpServer();
running.listener.once("listening", () => {
  const address = running.listener.address();
  const port = typeof address === "object" && address ? address.port : process.env.PORT ?? 3000;
  console.error(`CareKaki: HTTP + SPA ready at http://${process.env.HOST ?? "0.0.0.0"}:${port}/ (MCP at /mcp)`);
});
running.listener.once("error", error => {
  console.error("CareKaki HTTP failed:", error);
  process.exitCode = 1;
});

const stop = async code => {
  try { await running.close(); process.exit(code); }
  catch (error) { console.error("CareKaki shutdown failed:", error); process.exit(1); }
};
process.once("SIGINT", () => void stop(0));
process.once("SIGTERM", () => void stop(0));
