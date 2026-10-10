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

/** Validate against Malaysia civil time, regardless of server location. */
export function malaysiaNow(now = new Date()): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const get = (part: string) => parts.find(p => p.type === part)?.value ?? "";
  return { date: get("year") + "-" + get("month") + "-" + get("day"), time: get("hour") + ":" + get("minute") };
}

export function normalizeScheduleDays(value: unknown): string[] | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") {
    if (/^weekdays?$/i.test(value.trim())) return ["Mon", "Tue", "Wed", "Thu", "Fri"];
    if (/^weekends?$/i.test(value.trim())) return ["Sat", "Sun"];
    return undefined;
  }
  if (!Array.isArray(value) || !value.every(x => typeof x === "string")) return undefined;
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return days.filter(d => value.some(x => x.toLowerCase() === d.toLowerCase()));
}

/** Expand a recurring pattern to its next 12 occurrences; this is a preview horizon, not an endless booking. */
export function recurringDates(anchor: string, days: string[], max = 12): string[] {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const selected = new Set(days);
  const result: string[] = [];
  const day = new Date(anchor + "T00:00:00Z");
  for (let offset = 0; offset < 90 && result.length < max; offset++) {
    const d = new Date(day.getTime() + offset * 86400000);
    if (selected.has(names[d.getUTCDay()]!)) result.push(d.toISOString().slice(0, 10));
  }
  return result;
}

/** Faithful port of Validate Input. This function holds no conversation state. */
export function validateRequest(body: unknown, now = new Date()): ValidationResult {
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
  const scheduleDays = normalizeScheduleDays(input.schedule_days);
  if (scheduleDays?.length) request.schedule_days = scheduleDays;
  if (questions.length > 0) {
    return { status: "needs_clarification", draft_request: request, question: questions[0]!, missing_fields: questions.map(q => q.field) };
  }
  // All six required fields have passed their checks above.
  const complete = request as CareRequest;
  const [hours, minutes] = complete.start_time.split(":").map(Number);
  const current = malaysiaNow(now);
  if (complete.date < current.date) {
    delete request.date;
    return {
      status: "needs_clarification", draft_request: request, missing_fields: ["date"],
      question: { field: "date", text: "Care date is in the past (Malaysia time). Choose today or a future date.", type: "date", options: [] },
    };
  }
  if (complete.date === current.date && complete.start_time < current.time) {
    const recurring = !!complete.schedule_days?.length;
    if (recurring) delete request.date;
    else delete request.start_time;
    return {
      status: "needs_clarification", draft_request: request,
      missing_fields: [recurring ? "date" : "start_time"],
      question: recurring
        ? { field: "date", text: "Today's recurring visit would start in the past. Choose a future start date for this schedule.", type: "date", options: [] }
        : { field: "start_time", text: "Start time has already passed in Malaysia. Choose a later time.", type: "time", options: [] },
    };
  }
  if (complete.schedule_days?.length) {
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const weekday = dayNames[new Date(complete.date + "T00:00:00Z").getUTCDay()];
    if (!complete.schedule_days.includes(weekday!)) {
      delete request.date;
      return {
        status: "needs_clarification", draft_request: request, missing_fields: ["date"],
        question: { field: "date", text: "This date does not fall on your selected recurring weekdays. Pick a scheduled day.", type: "date", options: [] },
      };
    }
  }
  // An explicit dates array has priority (including [date] for one-off inspection).
  // Otherwise the weekday/weekend pattern expands into a bounded whole-schedule search.
  if (input.schedule_dates !== undefined && input.schedule_dates !== null) {
    if (!Array.isArray(input.schedule_dates) || input.schedule_dates.length < 1 ||
        input.schedule_dates.length > 12 || !input.schedule_dates.every(isValidDate) ||
        new Set(input.schedule_dates).size !== input.schedule_dates.length ||
        !input.schedule_dates.includes(complete.date) ||
        input.schedule_dates.some(d => d < current.date ||
          (d === current.date && complete.start_time < current.time))) {
      return {
        status: "needs_clarification", draft_request: request, missing_fields: ["date"],
        question: { field: "date", text: "Choose valid future schedule dates (up to 12, including the selected date).", type: "date", options: [] },
      };
    }
    const supplied = [...input.schedule_dates].sort();
    if (complete.schedule_days?.length && supplied.some(d =>
      !complete.schedule_days!.includes(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(d + "T00:00:00Z").getUTCDay()]!))) {
      return {
        status: "needs_clarification", draft_request: request, missing_fields: ["date"],
        question: { field: "date", text: "One or more selected dates are outside the requested weekdays or weekend.", type: "date", options: [] },
      };
    }
    complete.schedule_dates = supplied;
  } else if (complete.schedule_days?.length) {
    complete.schedule_dates = recurringDates(complete.date, complete.schedule_days);
    if (complete.schedule_dates.some(d => d === current.date && complete.start_time < current.time)) {
      return {
        status: "needs_clarification", draft_request: request, missing_fields: ["start_time"],
        question: { field: "start_time", text: "Today's recurring visit would start in the past. Choose a later start time or date.", type: "time", options: [] },
      };
    }
  }
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
