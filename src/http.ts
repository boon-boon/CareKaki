import { createServer as createHttpServer } from "node:http";
import { pathToFileURL } from "node:url";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createServer } from "./server.js";
import { loadProviders } from "./providers.js";

/** Local, stateless HTTP service. Remote deployment needs a separate authenticated HTTPS gateway. */
export function startHttpServer(port = Number(process.env.PORT ?? 3000)) {
  const host = process.env.HOST ?? "127.0.0.1";
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    throw new Error("HOST must be a loopback address. Add authenticated HTTPS and explicit host/origin policy before remote deployment.");
  }
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Invalid PORT");
  loadProviders();
  const handler = createMcpHandler(() => createServer());
  const app = createMcpExpressApp({
    host,
    allowedOrigins: ["localhost", "127.0.0.1", "[::1]"],
  });
  const nodeHandler = toNodeHandler(handler);
  app.get("/health", (_req, res) => res.json({ status: "ok", service: "carekaki-mcp", data_source: "fictional_demo" }));
  app.all("/mcp", (req, res, next) => { void nodeHandler(req, res, req.body).catch(next); });
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
      console.error(`CareKaki MCP: HTTP ready at http://${process.env.HOST ?? "127.0.0.1"}:${typeof address === "object" && address ? address.port : 3000}/mcp (local demo only)`);
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
