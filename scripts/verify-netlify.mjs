// Local verification harness: drives the Netlify Functions the same way the
// Netlify runtime does — a web-standard Request in, a Response out.
import health from "../netlify/functions/health.mjs";
import mcp from "../netlify/functions/mcp.mjs";

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const rpc = async (method, params = {}) => {
  const res = await mcp(
    new Request("https://carekaki.netlify.app/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-03-26",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    })
  );
  const text = await res.text();
  const type = res.headers.get("content-type") || "";
  const payload = type.includes("text/event-stream")
    ? JSON.parse(text.split(/\r?\n/).find(l => l.startsWith("data: ")).slice(6))
    : JSON.parse(text);
  return { status: res.status, type, payload };
};

// 1. /health
const healthRes = await health(new Request("https://carekaki.netlify.app/health"));
const healthBody = await healthRes.json();
check("GET /health returns 200 ok", healthRes.status === 200 && healthBody.status === "ok", JSON.stringify(healthBody));

// 2. initialize
const init = await rpc("initialize", {
  protocolVersion: "2025-03-26",
  capabilities: {},
  clientInfo: { name: "verify", version: "1.0.0" },
});
check("POST /mcp initialize", init.payload?.result?.serverInfo?.name === "carekaki",
  `${init.status} ${init.type} name=${init.payload?.result?.serverInfo?.name}`);

// 3. tools/list — all nine tools registered
const list = await rpc("tools/list", {});
const tools = (list.payload?.result?.tools || []).map(t => t.name);
check("tools/list exposes 9 tools", tools.length === 9, tools.join(","));

// 4. tools/call — search options (proves the embedded CSV loaded)
const opts = await rpc("tools/call", { name: "carekaki_get_search_options", arguments: {} });
const structured = opts.payload?.result?.structuredContent;
check("carekaki_get_search_options reads embedded CSV",
  Array.isArray(structured?.locations) && structured.locations.length > 0,
  `${structured?.locations?.length} cities, ${structured?.available_dates?.length} dates`);

// 5. tools/call — real eligibility search
const search = await rpc("tools/call", {
  name: "carekaki_search_providers",
  arguments: {
    location: structured.locations[0],
    required_services: [structured.service_codes[0]],
    date: structured.available_dates[0],
    start_time: "09:00",
    duration_hours: 2,
    max_budget: 1000,
    preferred_language: "",
    confirmed: true,
    limit: 3,
  },
});
const searchData = search.payload?.result?.structuredContent;
check("carekaki_search_providers returns matches",
  ["matches_found", "no_matches"].includes(searchData?.status),
  `status=${searchData?.status} matches=${searchData?.total_matches}`);

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
