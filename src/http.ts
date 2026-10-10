import { createServer as createHttpServer } from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import express from "express";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createServer } from "./server.js";
import { loadProviders } from "./providers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Built Angular app (SPA) served on the same port as the MCP API.
 * Prefer the committed `public/` bundle (survives uploads that strip build
 * output such as dist/), falling back to the raw Angular output for local dev.
 */
const FRONTEND_DIR = [path.resolve(__dirname, "../public"), path.resolve(__dirname, "../carekaki-ux/dist/carekaki-ux/browser")]
  .find(dir => existsSync(path.join(dir, "index.html"))) ?? path.resolve(__dirname, "../public");

/**
 * Host/Origin policy. Local dev binds to loopback only; a hosted single-port
 * deployment sets NODE_ENV=production to bind 0.0.0.0. Browser requests then
 * arrive from the public host, so ALLOWED_ORIGINS (and, when binding off the
 * loopback, ALLOWED_HOSTS) must list that hostname explicitly. No wildcard is
 * ever honoured.
 */
function parseList(value: string | undefined): string[] {
  return value ? value.split(",").map(item => item.trim()).filter(Boolean) : [];
}

/** Extract the hostname from a full URL, tolerating a bare host or host:port. */
function hostnameOf(value: string): string {
  try { return new URL(value).hostname; }
  catch { return value.replace(/^[a-z]+:\/\//i, "").split("/")[0]?.split(":")[0] ?? value; }
}

/** Local, stateless HTTP service. In production this single port also serves the SPA. */
export function startHttpServer(port = Number(process.env.PORT ?? 3000)) {
  const host = process.env.HOST ?? (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Invalid PORT");
  loadProviders();

  const loopback = ["127.0.0.1", "localhost", "::1"];
  const extraOrigins = parseList(process.env.ALLOWED_ORIGINS);
  // A literal "*" disables the guard entirely (see CAREKAKI_TRUST_ANY_HOST below).
  const trustAnyHost = extraOrigins.includes("*") || parseList(process.env.ALLOWED_HOSTS).includes("*");
  const allowedOrigins = trustAnyHost ? undefined : [...loopback, ...extraOrigins];
  // When binding off the loopback, still restrict accepted Host headers (DNS-rebinding
  // protection) to the loopback names plus any explicitly configured public hostnames.
  // Hosted platforms usually pass no such config, so also derive it from PUBLIC_URL
  // (or the common platform URL vars) to avoid rejecting every public request.
  const publicHosts: string[] = [];
  const urlVars = [process.env.PUBLIC_URL, process.env.APP_URL, process.env.RENDER_EXTERNAL_URL];
  for (const candidate of urlVars) {
    if (typeof candidate !== "string" || candidate.length === 0) continue;
    publicHosts.push(hostnameOf(candidate));
  }
  const allowedHosts = loopback.includes(host) || trustAnyHost
    ? undefined
    : [...loopback, ...parseList(process.env.ALLOWED_HOSTS), ...publicHosts].filter(Boolean);

  const handler = createMcpHandler(() => createServer());
  const app = createMcpExpressApp({ host, allowedHosts, allowedOrigins });
  const nodeHandler = toNodeHandler(handler);
  app.get("/health", (_req, res) => res.json({ status: "ok", service: "carekaki-mcp", data_source: "fictional_demo" }));
  app.all("/mcp", (req, res, next) => { void nodeHandler(req, res, req.body).catch(next); });

  // Serve the built Angular app on the same origin. Registered after /health and
  // /mcp so those handlers are never shadowed.
  if (existsSync(FRONTEND_DIR)) {
    app.use(express.static(FRONTEND_DIR, { index: "index.html" }));
    // SPA fallback: deep links (e.g. /matching, /quotations) reload to index.html,
    // while /mcp and /health keep their own handlers above.
    app.get(/^\/(?!mcp(?:\/|$)|health(?:\/|$)).*/, (_req, res) => res.sendFile(path.join(FRONTEND_DIR, "index.html")));
  } else {
    console.warn(`CareKaki: frontend build not found at ${FRONTEND_DIR}. Serving API only — run "npm run ux:build".`);
  }

  const listener = createHttpServer(app);
  listener.listen(port, host);
  let closing: Promise<void> | undefined;
  return {
    listener,
    close(): Promise<void> {
      return closing ??= (async () => {
        const closed = new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
        const forceClose = setTimeout(() => listener.closeAllConnections(), 2000);
        forceClose.unref();
        try {
          await handler.close();
          listener.closeIdleConnections();
          await closed;
        } finally { clearTimeout(forceClose); }
      })();
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const running = startHttpServer();
    running.listener.once("listening", () => {
      const address = running.listener.address();
      console.error(`CareKaki: HTTP + SPA ready at http://${process.env.HOST ?? "127.0.0.1"}:${typeof address === "object" && address ? address.port : 3000}/ (MCP at /mcp)`);
    });
    running.listener.once("error", error => { console.error("CareKaki HTTP failed:", error); process.exitCode = 1; });
    const stop = async () => {
      try { await running.close(); process.exit(0); }
      catch (error) { console.error("CareKaki shutdown failed:", error); process.exit(1); }
    };
    process.once("SIGINT", () => void stop());
    process.once("SIGTERM", () => void stop());
  } catch (error) {
    console.error("CareKaki HTTP failed to start:", error);
    process.exitCode = 1;
  }
}
