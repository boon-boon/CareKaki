import type { CareRequest, Choice, DraftRequest, Question, ValidationResult } from "./types.js";

export const LOCATION_PRESETS = ["Petaling Jaya", "Subang Jaya", "Kuala Lumpur", "Shah Alam"];
export const SERVICE_PRESETS = [
  { label: "Elderly care", value: "elderly_care" },
  { label: "Mobility assistance", value: "mobility_assistance" },
  { label: "Companionship", value: "companionship" },
  { label: "Dementia care", value: "dementia_care" },
];
export const START_TIME_PRESETS = [
  { label: "Morning (09:00)", value: "09:00" },
  { label: "Afternoon (13:00)", value: "13:00" },
  { label: "Evening (18:00)", value: "18:00" },
];
export const DURATION_PRESETS = [2, 4, 6, 8];
export const BUDGET_PRESETS = [100, 150, 200, 300];

export function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Faithful port of Validate Input. This function holds no conversation state. */
export function validateRequest(body: unknown): ValidationResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { status: "invalid_request", message: "Expected a JSON object" };
  }
  const input = body as Record<string, unknown>;
  const request: DraftRequest = {};
  const questions: Question[] = [];
  function ask(field: string, text: string, type: Question["type"], options: Choice[] = []) {
    questions.push({ field, text, type, options });
  }
  function choice(label: string, value: Choice["value"]): Choice { return { label, value }; }

  if (typeof input.location === "string" && input.location.trim()) {
    request.location = input.location.trim();
  } else {
    ask("location", "Where is care needed?", "single_select", LOCATION_PRESETS.map(v => choice(v, v)));
  }
  if (Array.isArray(input.required_services) && input.required_services.length > 0 &&
      input.required_services.every((s: unknown) => typeof s === "string" && s.trim())) {
    request.required_services = input.required_services.map((s: string) => s.trim().toLowerCase());
  } else {
    ask("required_services", "What kind of assistance is needed?", "multi_select", SERVICE_PRESETS);
  }
  if (isValidDate(input.date)) {
    request.date = input.date;
  } else {
    ask("date", "Which date do you need care?", "date");
  }
  if (typeof input.start_time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(input.start_time)) {
    request.start_time = input.start_time;
  } else {
    ask("start_time", "When should care begin?", "single_select", START_TIME_PRESETS);
  }
  if (typeof input.duration_hours === "number" && Number.isFinite(input.duration_hours) && input.duration_hours > 0) {
    request.duration_hours = input.duration_hours;
  } else {
    ask("duration_hours", "How long is care needed?", "single_select", DURATION_PRESETS.map(v => choice(`${v} hours`, v)));
  }
  if (typeof input.max_budget === "number" && Number.isFinite(input.max_budget) && input.max_budget > 0) {
    request.max_budget = input.max_budget;
  } else {
    ask("max_budget", "What is your total budget?", "single_select", BUDGET_PRESETS.map(v => choice(`RM${v}`, v)));
  }
  request.preferred_language = typeof input.preferred_language === "string" ? input.preferred_language.trim() : "";
  if (questions.length > 0) {
    return { status: "needs_clarification", draft_request: request, question: questions[0]!, missing_fields: questions.map(q => q.field) };
  }
  // All six required fields have passed their checks above.
  const complete = request as CareRequest;
  const [hours, minutes] = complete.start_time.split(":").map(Number);
  if (hours! * 60 + minutes! + complete.duration_hours * 60 > 1440) {
    delete request.start_time;
    return {
      status: "needs_clarification", draft_request: request,
      question: { field: "start_time", text: "This demo supports same-day care. Please choose an earlier start time or adjust the duration.", type: "time", options: [] },
      missing_fields: ["start_time"],
    };
  }
  if (input.confirmed !== true) {
    return {
      status: "needs_confirmation", message: "Are these care requirements correct?", draft_request: request,
      options: [choice("Confirm & Search", true), choice("Change Details", false)],
    };
  }
  return { status: "valid", request: complete };
}
