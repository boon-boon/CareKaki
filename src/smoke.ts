import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { parseCsv } from "./csv.js";
import { loadProviders, normalizeDate } from "./providers.js";
import { validateRequest } from "./validate.js";
import { filterAndRank, explainMatching } from "./match.js";
import { startHttpServer } from "./http.js";
import type { CareRequest } from "./types.js";

type Json = Record<string, any>;
const sample = {
  location: "Petaling Jaya", date: "2026-10-17", start_time: "09:00", duration_hours: 2,
  required_services: ["elderly_care"], max_budget: 200, preferred_language: "", confirmed: true,
};
const providers = loadProviders();
const passed: string[] = [];
function record(name: string) { passed.push(name); console.log(`PASS ${name}`); }

function domainSmoke() {
  assert.equal(providers.length, 20);
  assert.deepEqual(parseCsv('\uFEFFid,name\r\n1,"Care, ""One""\r\nDemo"\r\n'), [{ id: "1", name: 'Care, "One"\r\nDemo' }]);
  assert.equal(normalizeDate("2026-10-16T18:00:00Z"), "2026-10-17");
  record("CSV load (20 providers), quoting, BOM and Malaysia timezone");
  const request = validateRequest(sample).request!;
  const a = filterAndRank(request, providers);
  assert.equal(a.total_matches, 5);
  assert.deepEqual(a.matches.map(m => [m.provider_id, m.match_score]), [["CK002", 82.75], ["CK003", 80], ["CK001", 77.25], ["CK008", 75.8], ["CK007", 72.25]]);
  record("Default ranking and costs (case A)");
  const b = filterAndRank({ ...request, preferred_language: "Mandarin" }, providers);
  assert.deepEqual(b.matches.map(m => [m.provider_id, m.match_score]), [["CK003", 87.5], ["CK008", 83.3], ["CK002", 75.25], ["CK001", 69.75], ["CK007", 64.75]]);
  record("Language preference changes ranking, not hard eligibility (case B)");
  const c = filterAndRank({ ...request, duration_hours: 4, required_services: ["elderly_care", "mobility_assistance"] }, providers);
  assert.equal(c.total_matches, 1);
  assert.equal(c.matches[0]!.provider_id, "CK001");
  assert.equal(c.matches[0]!.estimated_cost, 140);
  assert.equal(c.matches[0]!.match_score, 65);
  record("All services and full time coverage (case C)");
  const d = validateRequest({});
  assert.equal(d.status, "needs_clarification");
  assert.equal(d.question!.field, "location");
  assert.equal(d.missing_fields!.length, 6);
  assert.equal(validateRequest({ ...sample, confirmed: false }).status, "needs_confirmation");
  assert.equal(validateRequest(sample).status, "valid");
  const f = validateRequest({ ...sample, start_time: "18:00", duration_hours: 8 });
  assert.equal(f.question!.field, "start_time");
  assert.equal(Object.hasOwn(f.draft_request!, "start_time"), false);
  assert.equal(validateRequest({ ...sample, duration_hours: "2" }).question!.field, "duration_hours");
  assert.equal(validateRequest({ ...sample, date: "2026-02-30" }).question!.field, "date");
  assert.equal(validateRequest(null).status, "invalid_request");
  assert.equal(filterAndRank({ ...request, location: "PJ" }, providers).total_matches, 0);
  assert.equal(explainMatching(request, providers).find(p => p.provider_id === "CK006")!.checks.verified, false);
  record("Clarification, strict consent, overnight and malformed-input handling (cases D-F)");

  // Original source is optional in a portable package. When present, compare exact envelopes.
  const workflowPath = fileURLToPath(new URL("../CareKaki - Care Providers (1).json", import.meta.url));
  if (existsSync(workflowPath)) {
    const workflow = JSON.parse(readFileSync(workflowPath, "utf8"));
    const validateCode = workflow.nodes.find((n: Json) => n.name === "Validate Input").parameters.jsCode;
    const rankCode = workflow.nodes.find((n: Json) => n.name === "Filter & Rank Providers").parameters.jsCode;
    const inputs = [{}, null, sample, { ...sample, confirmed: false }, { ...sample, duration_hours: "2" }, { ...sample, preferred_language: "Mandarin" }, { ...sample, start_time: "18:00", duration_hours: 8 }, { ...sample, date: "2026-02-30" }];
    for (const input of inputs) {
      const original = vm.runInNewContext(`(function(){${validateCode}})()`, { $input: { first: () => ({ json: { body: input } }) } })[0].json;
      const ported = validateRequest(input);
      assert.deepEqual(JSON.parse(JSON.stringify(original)), ported);
      if (ported.status === "valid") {
        const data = { status: "valid", request: ported.request, providers };
        const ranked = vm.runInNewContext(`(function(){${rankCode}})()`, { $input: { first: () => ({ json: data }) } })[0].json;
        assert.deepEqual(JSON.parse(JSON.stringify(ranked)), filterAndRank(ported.request as CareRequest, providers));
      }
    }
    record("Exact JSON parity against original n8n validation and ranking code");
  }
}

async function toolChecks(rpc: (method: string, params?: Json) => Promise<Json>) {
  const listed = await rpc("tools/list");
  const names: string[] = listed.tools.map((t: Json) => t.name);
  assert.equal(names.length, 6);
  for (const name of ["carekaki_get_search_options", "carekaki_validate_request", "carekaki_search_providers", "carekaki_list_providers", "carekaki_get_provider", "carekaki_explain_matching"]) assert.ok(names.includes(name));
  async function tool(name: string, args: Json = {}) {
    const output = await rpc("tools/call", { name, arguments: args });
    assert.notEqual(output.isError, true, JSON.stringify(output));
    return output.structuredContent ?? JSON.parse(output.content[0].text);
  }
  assert.equal((await tool("carekaki_get_search_options")).locations.includes("Cheras"), true);
  assert.equal((await tool("carekaki_validate_request")).question.field, "location");
  assert.equal((await tool("carekaki_validate_request", { location: null })).question.field, "location");
  assert.equal((await tool("carekaki_search_providers", { ...sample, confirmed: false })).status, "needs_confirmation");
  const found = await tool("carekaki_search_providers", sample);
  assert.equal(found.total_matches, 5);
  assert.equal(found.matches[0].provider_id, "CK002");
  assert.equal((await tool("carekaki_search_providers", { ...sample, limit: 1 })).matches.length, 1);
  assert.equal((await tool("carekaki_list_providers", { location: "Cheras" })).total_providers, 1);
  assert.equal((await tool("carekaki_get_provider", { provider_id: "CK001" })).provider.provider_id, "CK001");
  assert.equal((await tool("carekaki_get_provider", { provider_id: "missing" })).status, "not_found");
  assert.equal((await tool("carekaki_explain_matching", sample)).provider_count, 20);
}

async function stdioSmoke() {
  const child = spawn(process.execPath, [fileURLToPath(new URL("./index.js", import.meta.url))], { stdio: ["pipe", "pipe", "pipe"], cwd: fileURLToPath(new URL("../", import.meta.url)) });
  const pending = new Map<number, { resolve: (value: Json) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
  let nextId = 1;
  let buffer = "";
  let stderr = "";
  child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
  child.stdout.setEncoding("utf8").on("data", chunk => {
    buffer += chunk;
    for (;;) {
      const end = buffer.indexOf("\n");
      if (end < 0) break;
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      if (!line.trim()) continue;
      try {
        const response = JSON.parse(line);
        const waiting = pending.get(response.id);
        if (!waiting) continue;
        clearTimeout(waiting.timer); pending.delete(response.id);
        if (response.error) waiting.reject(new Error(JSON.stringify(response.error)));
        else waiting.resolve(response.result);
      } catch (error) {
        for (const waiting of pending.values()) waiting.reject(new Error(`Invalid stdio JSON: ${String(error)}`));
      }
    }
  });
  child.on("error", error => { for (const waiting of pending.values()) waiting.reject(error); });
  const rpc = (method: string, params: Json = {}) => new Promise<Json>((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`stdio ${method} timed out: ${stderr}`)); }, 10000);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
  try {
    await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "carekaki-smoke", version: "1.0.0" } });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
    await toolChecks(rpc);
    record("stdio initialize, tools/list and all six tools over JSON-RPC");
  } finally {
    for (const waiting of pending.values()) clearTimeout(waiting.timer);
    child.stdin.end();
    if (child.exitCode === null) { const exited = once(child, "exit"); child.kill(); await exited; }
  }
}

async function httpSmoke() {
  const running = startHttpServer(0);
  try {
    await once(running.listener, "listening");
    const address = running.listener.address();
    assert.ok(address && typeof address === "object");
    const url = `http://127.0.0.1:${address.port}/mcp`;
    let nextId = 1;
    const rpc = async (method: string, params: Json = {}): Promise<Json> => {
      const response = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream", "MCP-Protocol-Version": "2025-03-26" },
        body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }), signal: AbortSignal.timeout(10000),
      });
      assert.equal(response.status, 200, await response.clone().text());
      const text = await response.text();
      const json = (response.headers.get("content-type")?.includes("text/event-stream")
        ? JSON.parse(text.split(/\r?\n/).find(line => line.startsWith("data: "))!.slice(6))
        : JSON.parse(text)) as Json;
      assert.equal(json.error, undefined, JSON.stringify(json));
      return json.result;
    };
    await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "carekaki-http-smoke", version: "1.0.0" } });
    await toolChecks(rpc);
    record("Streamable HTTP initialize, tools/list and all six tools");
    const denied = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://untrusted.example" }, body: "{}" });
    assert.equal(denied.status, 403);
    record("HTTP rejects untrusted browser Origin");
  } finally { await running.close(); }
}

try {
  domainSmoke();
  await stdioSmoke();
  await httpSmoke();
  console.log(`\nAll ${passed.length} smoke checks passed. Both transports shut down cleanly.`);
} catch (error) {
  console.error("SMOKE FAILED", error);
  process.exitCode = 1;
}
