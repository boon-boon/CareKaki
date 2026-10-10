import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { loadProviders, listLocations, listServiceCodes } from "./providers.js";
import { validateRequest, BUDGET_PRESETS, DURATION_PRESETS, START_TIME_PRESETS } from "./validate.js";
import { explainMatching, filterAndRank } from "./match.js";
import { aiMode, interpretCareMessage, rankCareCandidates } from "./ai/gemini.js";
import { malaysiaNow } from "./validate.js";

const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const requestShape = {
  location: z.string().nullable().optional().describe("Exact city name, e.g. Petaling Jaya. Discover names with carekaki_get_search_options."),
  required_services: z.array(z.string()).nullable().optional().describe("All needed service codes, e.g. elderly_care and mobility_assistance."),
  date: z.string().nullable().optional().describe("Malaysia calendar date YYYY-MM-DD. Confirm ambiguous dates with the user."),
  start_time: z.string().nullable().optional().describe("24-hour HH:mm, Malaysia local time, e.g. 09:00."),
  duration_hours: z.union([z.number(), z.string()]).nullable().optional().describe("Positive number of hours; strings are not coerced and need clarification."),
  max_budget: z.union([z.number(), z.string()]).nullable().optional().describe("Maximum TOTAL cost in MYR, not hourly rate. Must be a positive number."),
  preferred_language: z.string().nullable().optional().describe("Optional ranking preference, e.g. Mandarin; empty string means no preference. Not a hard filter."),
  schedule_days: z.union([z.array(z.string()), z.string()]).nullable().optional().describe("Optional recurrence. 'weekday' means Mon-Fri; 'weekend' means Sat-Sun. Without explicit schedule_dates, expand to next 12 occurrences."),
  schedule_dates: z.array(z.string()).nullable().optional().describe("Optional explicit occurrence dates (1-12). Multiple dates require availability on EVERY date; [date] inspects one day."),
  confirmed: z.boolean().nullable().optional().describe("True ONLY after the user explicitly confirms the entire current set of requirements. Reset after edits."),
};
const requestSchema = z.object({
  location: z.string(), required_services: z.array(z.string()), date: z.string(), start_time: z.string(),
  duration_hours: z.number(), max_budget: z.number(), preferred_language: z.string(),
  schedule_days: z.array(z.string()).optional(), schedule_dates: z.array(z.string()).optional(),
});
const slotSchema = z.object({ date: z.string(), start: z.string(), end: z.string() });
const providerSchema = z.object({
  provider_id: z.string(), name: z.string(), location: z.string(), hourly_rate: z.number(), rating: z.number(),
  verified: z.boolean(), services: z.array(z.string()), languages: z.array(z.string()), availability: z.array(slotSchema),
});
const choiceSchema = z.object({ label: z.string(), value: z.union([z.string(), z.number(), z.boolean()]) });
const validationShape = {
  status: z.enum(["valid", "invalid_request", "needs_clarification", "needs_confirmation"]),
  message: z.string().optional(), request: requestSchema.optional(), draft_request: requestSchema.partial().optional(),
  question: z.object({ field: z.string(), text: z.string(), type: z.enum(["single_select", "multi_select", "date", "time"]), options: z.array(choiceSchema) }).optional(),
  missing_fields: z.array(z.string()).optional(), options: z.array(choiceSchema).optional(),
};
const matchSchema = z.object({
  provider_id: z.string(), name: z.string(), location: z.string(), hourly_rate: z.number(), estimated_cost: z.number(),
  currency: z.literal("MYR"), rating: z.number(), verified: z.boolean(), languages: z.array(z.string()),
  preferred_language_match: z.boolean(), available: z.literal(true), match_score: z.number(),
  covered_dates: z.number().int().optional(), requested_dates: z.number().int().optional(),
});
const alternativeSchema = matchSchema.omit({ available: true }).extend({
  available: z.boolean(), eligible: z.literal(false), passed_checks: z.number().int(),
  checks: z.object({ location: z.boolean(), services: z.boolean(), verified: z.boolean(), availability: z.boolean(), budget: z.boolean() }),
  failed_checks: z.array(z.string()), unavailable_dates: z.array(z.string()).optional(),
});
const searchOutput = z.object({
  ...validationShape,
  status: z.enum(["valid", "invalid_request", "needs_clarification", "needs_confirmation", "matches_found", "no_matches"]),
  total_matches: z.number().int().optional(), matches: z.array(matchSchema).optional(),
  alternatives: z.array(alternativeSchema).optional(),
  data_source: z.literal("fictional_demo").optional(), booking_status: z.literal("not_booked").optional(),
});
const diagnosticSchema = z.object({
  provider_id: z.string(), name: z.string(), eligible: z.boolean(),
  checks: z.object({ location: z.boolean(), services: z.boolean(), verified: z.boolean(), availability: z.boolean(), budget: z.boolean() }),
  failed_checks: z.array(z.string()),
  actual_values: z.object({ location: z.string(), services: z.array(z.string()), verified: z.boolean(), availability: z.array(slotSchema), estimated_cost: z.number(), covered_dates: z.number().int().optional(), requested_dates: z.number().int().optional(), unavailable_dates: z.array(z.string()).optional() }),
});
function result(value: object) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }], structuredContent: value as Record<string, unknown> };
}

/** No chat memory or LLM credentials. One fresh instance per connection/request. */
export function createServer(): McpServer {
  const providers = loadProviders();
  const server = new McpServer({ name: "carekaki", version: "1.0.0" }, {
    maxToolInputElements: 1000,
    instructions: "CareKaki uses fictional Malaysian care providers. Collect requirements one question at a time, summarize, obtain explicit confirmation, then search. Hold draft state in the application and resend the accumulated fields. Never claim a booking or infer consent from a model-generated boolean.",
  });

  server.registerTool("carekaki_get_search_options", {
    title: "Discover CareKaki search options", annotations,
    description: "Discover exact cities, service codes, available demo dates and suggested start times, durations and budgets. Location matches use case-insensitive exact equality, NOT abbreviations. All data is fictional demo data.",
    inputSchema: z.object({}),
    outputSchema: z.object({ locations: z.array(z.string()), service_codes: z.array(z.string()), languages: z.array(z.string()), available_dates: z.array(z.string()), start_times: z.array(choiceSchema), duration_hours: z.array(z.number()), total_budgets: z.array(z.number()), currency: z.literal("MYR"), data_source: z.literal("fictional_demo"), booking_status: z.literal("not_booked") }),
  }, async () => result({
    locations: listLocations(providers), service_codes: listServiceCodes(providers),
    languages: [...new Set(providers.flatMap(provider => provider.languages))].sort(),
    available_dates: [...new Set(providers.flatMap(p => p.availability.map(s => s.date)))].sort(),
    start_times: START_TIME_PRESETS, duration_hours: DURATION_PRESETS, total_budgets: BUDGET_PRESETS,
    currency: "MYR", data_source: "fictional_demo", booking_status: "not_booked",
  }));

  server.registerTool("carekaki_validate_request", {
    title: "Validate and clarify care requirements", annotations,
    description: "Validate a partial care request. Returns the FIRST missing-field question plus all missing_fields, or needs_confirmation with a normalized draft. Ask one question at a time. Accumulate answers in your application; this server stores no conversation state. A valid request requires confirmed=true; the application must obtain real user confirmation.",
    inputSchema: z.object(requestShape), outputSchema: z.object(validationShape),
  }, async args => result(validateRequest(args)));

  server.registerTool("carekaki_search_providers", {
    title: "Search and rank care providers", annotations,
    description: "Search ONLY after explicit confirmation. Weekdays means Mon-Fri, weekends means Sat-Sun. Recurring searches check all next 12 schedule dates for full availability and apply MYR budget to the TOTAL cost of all visits. Exact matches pass all five criteria; otherwise return five verified review-only alternatives with covered-date counts. Fictional demo records; never books care.",
    inputSchema: z.object({ ...requestShape, limit: z.number().int().min(1).max(20).nullable().optional().describe("Maximum results; defaults to the original workflow's five. total_matches counts all eligible providers.") }),
    outputSchema: searchOutput,
  }, async args => {
    const validation = validateRequest(args);
    if (validation.status !== "valid" || !validation.request) return result(validation);
    return result(filterAndRank(validation.request, providers, args.limit ?? 5));
  });

  server.registerTool("carekaki_list_providers", {
    title: "Browse the demo provider catalogue", annotations,
    description: "Browse fictional catalogue records, optionally filtering exact city, one service, maximum hourly MYR rate, verified status and date. This is NOT a care-request eligibility search; it does not check full time-window coverage or total budget. Use carekaki_search_providers for recommendations.",
    inputSchema: z.object({
      location: z.string().optional(), service: z.string().optional(), max_hourly_rate: z.number().min(0).optional(),
      verified_only: z.boolean().nullable().optional().describe("Defaults false, so catalogue browsing includes unverified records."),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), limit: z.number().int().min(1).max(100).optional(),
    }),
    outputSchema: z.object({ total_providers: z.number().int(), providers: z.array(providerSchema), currency: z.literal("MYR"), data_source: z.literal("fictional_demo"), booking_status: z.literal("not_booked") }),
  }, async args => {
    const hits = providers.filter(p =>
      (!args.location || p.location.toLowerCase() === args.location.trim().toLowerCase()) &&
      (!args.service || p.services.includes(args.service.trim().toLowerCase())) &&
      (args.max_hourly_rate === undefined || p.hourly_rate <= args.max_hourly_rate) &&
      (!args.verified_only || p.verified) && (!args.date || p.availability.some(s => s.date === args.date)));
    return result({ total_providers: hits.length, providers: hits.slice(0, args.limit ?? 20), currency: "MYR", data_source: "fictional_demo", booking_status: "not_booked" });
  });

  server.registerTool("carekaki_get_provider", {
    title: "Get a demo provider record", annotations,
    description: "Retrieve a fictional provider by exact provider_id, e.g. CK001. Returns full service, language and availability details. A record lookup is NOT a booking or proof of eligibility for a particular request.",
    inputSchema: z.object({ provider_id: z.string().min(1) }),
    outputSchema: z.object({ status: z.enum(["found", "not_found"]), provider: providerSchema.optional(), message: z.string().optional(), currency: z.literal("MYR"), data_source: z.literal("fictional_demo"), booking_status: z.literal("not_booked") }),
  }, async args => {
    const provider = providers.find(p => p.provider_id === args.provider_id);
    return result({ ...(provider ? { status: "found", provider } : { status: "not_found", message: "No provider with this provider_id" }), currency: "MYR", data_source: "fictional_demo", booking_status: "not_booked" });
  });

  server.registerTool("carekaki_explain_matching", {
    title: "Explain provider eligibility", annotations,
    description: "Explain why each fictional provider passes or fails the same five eligibility checks used by search: location, services, verification, availability, budget. Requires a complete confirmed request; otherwise returns the clarification/confirmation payload. Language only affects ranking, not eligibility. Intended for demo diagnostics; protect this tool before using private production data.",
    inputSchema: z.object(requestShape),
    outputSchema: z.object({ ...validationShape, status: z.enum(["valid", "invalid_request", "needs_clarification", "needs_confirmation", "diagnostics"]), provider_count: z.number().int().optional(), diagnostics: z.array(diagnosticSchema).optional(), data_source: z.literal("fictional_demo").optional(), booking_status: z.literal("not_booked").optional() }),
  }, async args => {
    const validation = validateRequest(args);
    if (validation.status !== "valid" || !validation.request) return result(validation);
    return result({ status: "diagnostics", request: validation.request, provider_count: providers.length, diagnostics: explainMatching(validation.request, providers), data_source: "fictional_demo", booking_status: "not_booked" });
  });

  server.registerTool("carekaki_ai_interpret_request", {
    title: "Gemini care-intake interpretation", annotations,
    description: "Extracts a natural language care request. Never confirms or books care.",
    inputSchema: z.object({ user_message: z.string().min(1).max(5000), current_draft: z.object(requestShape).optional() }),
  }, async args => {
    if (aiMode() === "off") return result({ status: "unavailable", mode: "off" });
    try {
      const now = malaysiaNow();
      const extraction = await interpretCareMessage({
        user_message: args.user_message, current_draft: args.current_draft as any,
        today: now.date, now_time: now.time,
        locations: listLocations(providers), service_codes: listServiceCodes(providers),
      });
      if (aiMode() === "shadow") {
        console.error("Gemini shadow intake evaluated:", Object.keys(extraction.patch).join(","));
        return result({ status: "unavailable", mode: "deterministic_fallback" });
      }
      return result({ status: "extracted", mode: "ai", ...extraction });
    } catch (error) {
      console.error("AI intake unavailable:", error instanceof Error ? error.message : "unknown");
      return result({ status: "unavailable", mode: "deterministic_fallback" });
    }
  });

  server.registerTool("carekaki_ai_recommend_providers", {
    title: "Gemini ranking with deterministic eligibility", annotations,
    description: "Validates confirmed requirements and checks all eligibility rules before AI ranking. Ineligible alternatives remain review-only.",
    inputSchema: z.object({ ...requestShape, confirmed: z.boolean(), limit: z.number().int().min(1).max(20).optional() }),
  }, async args => {
    const validation = validateRequest(args);
    if (validation.status !== "valid" || !validation.request) return result(validation);
    const limit = args.limit ?? 5;
    const baseline = filterAndRank(validation.request, providers, limit);
    // Rank the full eligible pool, not just the rule-based top five.
    const fullPool = filterAndRank(validation.request, providers, providers.length);
    const candidates = fullPool.matches.length ? fullPool.matches : fullPool.alternatives ?? [];
    if (!candidates.length || aiMode() === "off") return result({ ...baseline, mode: "deterministic_fallback" });
    try {
      const ranked = await rankCareCandidates(validation.request, candidates, providers);
      if (aiMode() === "shadow") {
        console.error("Gemini shadow ranking:", ranked.map(x => x.provider_id).join(","));
        return result({ ...baseline, mode: "deterministic_fallback" });
      }
      const byId = new Map(candidates.map(x => [x.provider_id, x]));
      const orderedRanks = ranked.map((ai, index) => ({
        ...byId.get(ai.provider_id)!,
        ai: { rank: index + 1, suitability: ai.suitability,
          strengths: ai.strengths, tradeoffs: ai.tradeoffs, explanation: ai.explanation },
      }));
      // Location-first is mandatory even when Gemini supplies the rank order.
      const ordered = baseline.matches.length ? orderedRanks : orderedRanks.sort((a, b) =>
        Number('checks' in b && b.checks.location) - Number('checks' in a && a.checks.location) ||
        ('passed_checks' in b ? b.passed_checks : 0) - ('passed_checks' in a ? a.passed_checks : 0) || a.ai.rank - b.ai.rank);
      return result({ ...baseline, mode: "ai",
        matches: baseline.matches.length ? ordered.slice(0, limit) : [],
        ...(baseline.matches.length ? {} : { alternatives: ordered.slice(0, limit) }),
      });
    } catch (error) {
      console.error("Gemini ranking unavailable:", error instanceof Error ? error.message : "unknown");
      return result({ ...baseline, mode: "deterministic_fallback" });
    }
  });

  server.registerTool("carekaki_ai_explain_recommendation", {
    title: "Explain AI recommendations", annotations,
    description: "Compare evaluated providers using known attributes and eligibility; no booking actions.",
    inputSchema: z.object({ ...requestShape, confirmed: z.boolean(), provider_id: z.string(), compare_with_id: z.string().optional(), question: z.string().max(1000).optional() }),
  }, async args => {
    const validation = validateRequest(args);
    if (validation.status !== "valid" || !validation.request) return result(validation);
    const baseline = filterAndRank(validation.request, providers, 20);
    const pool = baseline.matches.length ? baseline.matches : baseline.alternatives ?? [];
    const selected = pool.filter(x => x.provider_id === args.provider_id || (args.compare_with_id && x.provider_id === args.compare_with_id));
    if (!selected.some(x => x.provider_id === args.provider_id)) return result({ status: "not_found" });
    try {
      const ranked = await rankCareCandidates(validation.request, selected, providers, args.question);
      return result({ status: "explained", mode: "ai", explanations: ranked });
    } catch {
      return result({ status: "explained", mode: "deterministic_fallback",
        explanations: selected.map(x => ({ provider_id: x.provider_id, estimated_cost: x.estimated_cost,
          ...("failed_checks" in x ? { failed_checks: x.failed_checks } : {}) })) });
    }
  });
  return server;
}
