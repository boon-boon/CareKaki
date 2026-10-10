import { createMcpHandler } from "@modelcontextprotocol/server";
import { createServer } from "../../dist/server.js";
import { loadProviders } from "../../dist/providers.js";

// Runtime-safe, stateless MCP endpoint. Netlify invokes this handler per request;
// it must never start an HTTP listener or maintain cross-user booking sessions.
const mcp = createMcpHandler(() => createServer());

export default async function handler(request) {
  try {
    loadProviders();
    return await mcp.fetch(request);
  } catch (error) {
    console.error("CareKaki MCP function failed:", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "MCP request failed" }, { status: 500 });
  }
}

export const config = {
  path: "/mcp",
  rateLimit: { action: "rate_limit", aggregateBy: "ip", windowSize: 60, windowLimit: 40 },
};
