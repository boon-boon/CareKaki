// Netlify Function (v2): the CareKaki MCP Streamable HTTP endpoint.
//
// Reuses the exact same stateless MCP server as the single-port Node deployment
// (src/server.ts -> dist/server.js). The MCP SDK exposes a web-standard
// `{ fetch }` handler, which is the shape Netlify Functions v2 expect, so no
// Express/node adapter is required here.
//
// Routed to /mcp by the [[redirects]] block in netlify.toml.
import { existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createServer } from "../../dist/server.js";
import { PROVIDERS_CSV } from "../providers-data.mjs";

// The server loads the provider catalogue with readFileSync(). A serverless
// bundle has no repo checkout, so write the build-embedded CSV into the
// function's writable temp directory and point the loader at it. This runs once
// per warm container, before the first createServer() call.
const csvPath = join(tmpdir(), "carekaki_providers_demo.csv");
if (!existsSync(csvPath)) {
  writeFileSync(csvPath, PROVIDERS_CSV, "utf8");
}
process.env.CAREKAKI_PROVIDERS_CSV = csvPath;

const handler = createMcpHandler(() => createServer());

export default async function carekakiMcp(request) {
  try {
    return await handler.fetch(request);
  } catch (error) {
    console.error("CareKaki MCP function failed:", error);
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32603, message: "Internal error" } },
      { status: 500 }
    );
  }
}
