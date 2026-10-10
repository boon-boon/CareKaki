import { loadProviders } from "../../dist/providers.js";

export default async function handler() {
  try {
    const count = loadProviders().length;
    return Response.json({ status: "ok", service: "carekaki-mcp", providers: count });
  } catch (error) {
    console.error("Provider catalogue validation failed:", error instanceof Error ? error.message : "unknown");
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}

export const config = { path: "/health" };
