#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createServer } from "./server.js";
import { loadProviders } from "./providers.js";

try {
  const providers = loadProviders();
  const handle = serveStdio(() => createServer());
  console.error(`CareKaki MCP: stdio ready (${providers.length} fictional providers)`);
  const stop = async () => { await handle.close(); process.exit(0); };
  process.once("SIGINT", () => void stop());
  process.once("SIGTERM", () => void stop());
} catch (error) {
  console.error("CareKaki MCP failed to start:", error);
  process.exitCode = 1;
}
