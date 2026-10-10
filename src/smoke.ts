import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { parseCsv } from "./csv.js";
import { loadProviders, normalizeDate, normalizeTime } from "./providers.js";
import { validateRequest, malaysiaNow } from "./validate.js";
import { filterAndRank, explainMatching, matchingChecks } from "./match.js";
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
  assert.ok(providers.length >= 20);
  assert.equal(new Set(providers.map(p => p.provider_id)).size, providers.length);
  assert.equal(normalizeTime('9:00'), '09:00');
  assert.equal(normalizeTime('18:00'), '18:00');
  const ck001 = providers.find(p => p.provider_id === 'CK001')!;
  assert.ok(ck001.availability.length >= 2);
  assert.ok(ck001.availability.some(s => s.date === '2026-10-17' && s.start === '09:00' && s.end === '18:00'));
  assert.deepEqual(parseCsv('\uFEFFid,name\r\n1,"Care, ""One""\r\nDemo"\r\n'), [{ id: "1", name: 'Care, "One"\r\nDemo' }]);
  assert.equal(normalizeDate("2026-10-16T18:00:00Z"), "2026-10-17");
  record("CSV load, multiple availability rows, quoting, BOM and Malaysia timezone");
  const request = validateRequest(sample).request!;
  const a = filterAndRank(request, providers);
  assert.ok(a.total_matches >= 1);
  assert.ok(a.matches.every(m => Object.values(matchingChecks(request, providers.find(p => p.provider_id === m.provider_id)!)).every(Boolean)));
  record("Default ranking and costs (case A)");
  const b = filterAndRank({ ...request, preferred_language: "Mandarin" }, providers);
  assert.equal(b.total_matches, a.total_matches);
  assert.ok(b.matches.every(m => m.verified && m.available));
  record("Language preference changes ranking, not hard eligibility (case B)");
  const c = filterAndRank({ ...request, duration_hours: 4, required_services: ["elderly_care", "mobility_assistance"] }, providers);
  assert.ok(c.total_matches >= 1);
  assert.ok(c.matches.every(m => m.estimated_cost <= request.max_budget));
  assert.ok(c.matches.some(m => m.provider_id === 'CK001' && m.estimated_cost === 140));
  assert.ok(c.matches.every(m => m.match_score >= 0));
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
  const fallback = filterAndRank({ ...request, location: "PJ" }, providers);
  assert.equal(fallback.total_matches, 0);
  assert.equal(fallback.alternatives?.length, 5);
  assert.ok(fallback.alternatives?.every(p => p.eligible === false && p.failed_checks.includes("location")));
  assert.ok(fallback.alternatives!.every((p, i, list) => i === 0 || list[i - 1]!.passed_checks >= p.passed_checks));
  assert.equal(filterAndRank(request, providers).alternatives, undefined);
  record("Top five review-only alternatives without pretending eligibility");
  const cyberRequest = { ...request, location: 'Cyberjaya', date: '2026-10-22', start_time: '10:00', duration_hours: 8, max_budget: 280, required_services: ['mobility_assistance'] };
  const cyber = filterAndRank(cyberRequest, providers);
  assert.equal(cyber.status, 'no_matches');
  assert.equal(cyber.alternatives?.[0]?.provider_id, 'CK028');
  assert.equal(cyber.alternatives?.[0]?.checks.location, true);
  assert.equal(cyber.alternatives?.[0]?.checks.verified, false);
  assert.ok(cyber.alternatives?.every(candidate => candidate.eligible === false));
  record("Location-first recommendations preserve unverified review-only safeguards");
  const fixedNow = new Date("2026-10-10T10:30:00Z");
  assert.deepEqual(malaysiaNow(fixedNow), { date: "2026-10-10", time: "18:30" });
  assert.equal(validateRequest({ ...sample, date: "2026-10-09" }, fixedNow).question?.field, "date");
  assert.equal(validateRequest({ ...sample, date: "2026-10-10", start_time: "18:00" }, fixedNow).question?.field, "start_time");
  assert.equal(validateRequest({ ...sample, date: "2026-10-10", start_time: "19:00" }, fixedNow).status, "valid");
  assert.deepEqual(validateRequest({ ...sample, date: "2026-10-19", schedule_days: "weekday" }, fixedNow).request?.schedule_days, ["Mon", "Tue", "Wed", "Thu", "Fri"]);
  assert.equal(validateRequest({ ...sample, date: "2026-10-19", schedule_days: "weekends" }, fixedNow).question?.field, "date");
  assert.deepEqual(validateRequest({ ...sample, schedule_days: "weekend", date: "2026-10-18" }, fixedNow).request?.schedule_days, ["Sat", "Sun"]);
  record("Malaysia current-time validation and weekday/weekend recurrence");
  const weekdays = validateRequest({
    ...sample, date: "2026-10-12", schedule_days: "weekday", max_budget: 1000,
  }, new Date("2026-10-10T10:30:00Z")).request!;
  assert.equal(weekdays.schedule_dates?.length, 12);
  assert.deepEqual(weekdays.schedule_dates?.slice(0, 5),
    ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"]);
  assert.ok(weekdays.schedule_dates?.every(d =>
    [1, 2, 3, 4, 5].includes(new Date(d + "T00:00:00Z").getUTCDay())));
  const synthetic = {
    ...providers[0]!, verified: true, location: weekdays.location,
    services: [...weekdays.required_services], hourly_rate: 20,
    availability: weekdays.schedule_dates!.map(date => ({ date, start: "09:00", end: "17:00" })),
  };
  assert.equal(matchingChecks(weekdays, synthetic).availability, true);
  assert.equal(matchingChecks(weekdays, { ...synthetic, availability: synthetic.availability.slice(0, -1) }).availability, false);
  assert.equal(filterAndRank(weekdays, [synthetic]).matches[0]?.estimated_cost, 20 * 2 * 12);
  assert.equal(filterAndRank({ ...weekdays, max_budget: 100 }, [synthetic]).total_matches, 0);
  assert.equal(filterAndRank(weekdays, [{ ...synthetic, availability: synthetic.availability.slice(0, -1) }]).alternatives?.[0]?.covered_dates, 11);
  assert.equal(validateRequest({ ...sample, date: "2026-10-12", schedule_days: "weekday",
    schedule_dates: ["2026-10-12"] }, new Date("2026-10-10T10:30:00Z")).request?.schedule_dates?.length, 1);
  record("Whole weekday schedule: 12 dates, availability, total cost, explicit single-day inspection");
  assert.equal(explainMatching(request, providers).find(p => p.provider_id === "CK006")!.checks.verified, false);
  record("Clarification, strict consent, overnight and malformed-input handling (cases D-F)");

  // Original source is optional in a portable package. When present, compare exact envelopes.
  const workflowPath = fileURLToPath(new URL("../CareKaki - Care Providers (1).json", import.meta.url));
  if (existsSync(workflowPath) && providers.length === 20) {
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
  assert.equal(names.length, 9);
  for (const name of ["carekaki_ai_interpret_request", "carekaki_ai_recommend_providers", "carekaki_ai_explain_recommendation"]) assert.ok(names.includes(name));
  for (const name of ["carekaki_get_search_options", "carekaki_validate_request", "carekaki_search_providers", "carekaki_list_providers", "carekaki_get_provider", "carekaki_explain_matching"]) assert.ok(names.includes(name));
  async function tool(name: string, args: Json = {}) {
    const output = await rpc("tools/call", { name, arguments: args });
    assert.notEqual(output.isError, true, JSON.stringify(output));
    return output.structuredContent ?? JSON.parse(output.content[0].text);
  }
  assert.equal((await tool("carekaki_get_search_options")).locations.includes("Cheras"), true);
  const aiOff = await tool("carekaki_ai_interpret_request", { user_message: "Weekday elderly care in PJ" });
  assert.equal(aiOff.status, "unavailable");
  const aiFallback = await tool("carekaki_ai_recommend_providers", sample);
  assert.equal(aiFallback.mode, "deterministic_fallback");
  assert.ok(aiFallback.matches.length > 0);
  assert.equal((await tool("carekaki_ai_recommend_providers", { ...sample, confirmed: false })).status, "needs_confirmation");
  assert.equal((await tool("carekaki_ai_explain_recommendation", { ...sample, provider_id: "CK999" })).status, "not_found");
  assert.equal((await tool("carekaki_validate_request")).question.field, "location");
  assert.equal((await tool("carekaki_validate_request", { location: null })).question.field, "location");
  assert.equal((await tool("carekaki_search_providers", { ...sample, confirmed: false })).status, "needs_confirmation");
  const found = await tool("carekaki_search_providers", sample);
  assert.ok(found.total_matches >= 1);
  assert.ok(found.matches[0].provider_id);
  const noExact = await tool("carekaki_search_providers", { ...sample, location: "PJ" });
  assert.equal(noExact.status, "no_matches");
  assert.equal(noExact.matches.length, 0);
  assert.equal(noExact.alternatives.length, 5);
  assert.ok(noExact.alternatives.every((p: Json) => p.eligible === false));
  assert.equal((await tool("carekaki_search_providers", { ...sample, date: "2026-10-09" })).question.field, "date");
  assert.equal((await tool("carekaki_search_providers", { ...sample, limit: 1 })).matches.length, 1);
  assert.ok((await tool("carekaki_list_providers", { location: "Cheras" })).total_providers >= 1);
  assert.equal((await tool("carekaki_get_provider", { provider_id: "CK001" })).provider.provider_id, "CK001");
  assert.equal((await tool("carekaki_get_provider", { provider_id: "missing" })).status, "not_found");
  assert.equal((await tool("carekaki_explain_matching", sample)).provider_count, providers.length);
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
    record("stdio initialize, tools/list and all nine tools over JSON-RPC");
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
    record("Streamable HTTP initialize, tools/list and all nine tools");
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
