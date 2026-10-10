// Cross-platform production launcher: no cross-env dependency needed.
// Sets NODE_ENV=production (so http.ts binds 0.0.0.0) and loads .env if present,
// then starts the compiled single-port HTTP + SPA server.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

process.env.NODE_ENV = "production";

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
const frontendEntry = path.join(root, "carekaki-ux", "dist", "carekaki-ux", "browser", "index.html");
if (!existsSync(frontendEntry)) {
  console.error('CareKaki: Angular build not found. Run "npm run ux:build" (needs Node >= 22.22.3 / 24.15.0) to serve the UI.');
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
