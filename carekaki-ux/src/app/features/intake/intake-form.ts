import { Component, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IconComponent } from '../../shared/icon/icon';
import { MockDataService } from '../../core/services/mock-data.service';
import { CareKakiMcpService } from '../../core/services/carekaki-mcp.service';
import { IntakeEntities, ServiceType, McpValidationResult } from '../../core/models';

interface ExamplePrompt {
  label: string;
  text: string;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

function calendarDate(year: number, month: number, day: number): string {
  const iso = `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : '';
}

function clockMinutes(hour: string, minute = '0', meridiem?: string): number | null {
  let h = Number(hour);
  const m = Number(minute);
  if (!Number.isInteger(h) || !Number.isInteger(m) || m < 0 || m > 59) return null;
  if (meridiem) {
    if (h < 1 || h > 12) return null;
    h = h % 12 + (meridiem.toLowerCase() === 'pm' ? 12 : 0);
  } else if (h < 0 || h > 23) return null;
  return h * 60 + m;
}

function clockText(minutes: number): string {
  return `${Math.floor(minutes / 60).toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}`;
}

export function shiftEnd(start: string, duration: number): string {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !Number.isFinite(duration) || duration <= 0) return '';
  const [hours, minutes] = start.split(':').map(Number);
  const end = hours * 60 + minutes + duration * 60;
  return Number.isInteger(end) && end <= 1440 ? clockText(end) : '';
}

/** Pure extraction: dates are removed BEFORE clock matching, never interpreted as time ranges. */
export function extractCareTiming(text: string, defaultYear = 2026) {
  let date = '';
  // Mask dates so date numbers (e.g. 2026-10-17) can never be parsed as time ranges (e.g. 26-10)
  let masked = text;

  // 1. YYYY-MM-DD or YYYY-[MonthName]-DD
  masked = masked.replace(/\b(\d{4})[-/](\d{1,2}|[a-z]+)[-/](\d{1,2})\b/gi, (span, y, m, d) => {
    const monthNum = /^\d+$/.test(m) ? Number(m) : MONTHS.findIndex(mon => mon === m.toLowerCase() || mon.slice(0, 3) === m.toLowerCase()) + 1;
    if (monthNum >= 1 && monthNum <= 12) {
      date = calendarDate(Number(y), monthNum, Number(d));
      return ' '.repeat(span.length);
    }
    return span;
  });

  // 2. DD/MM/YYYY or DD-MM-YYYY
  if (!date) {
    masked = masked.replace(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b/g, (span, d, m, y) => {
      date = calendarDate(Number(y), Number(m), Number(d));
      return ' '.repeat(span.length);
    });
  }

  // 3. DD Month YYYY (e.g. 17 November 2026, 17th Nov 2026)
  if (!date) {
    masked = masked.replace(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\s+(\d{4})\b/gi, (span, d, m, y) => {
      const monthNum = MONTHS.findIndex(mon => mon === m.toLowerCase() || mon.slice(0, 3) === m.toLowerCase()) + 1;
      if (monthNum) {
        date = calendarDate(Number(y), monthNum, Number(d));
        return ' '.repeat(span.length);
      }
      return span;
    });
  }

  // 4. Month DD, YYYY (e.g. November 17, 2026)
  if (!date) {
    masked = masked.replace(/\b([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/gi, (span, m, d, y) => {
      const monthNum = MONTHS.findIndex(mon => mon === m.toLowerCase() || mon.slice(0, 3) === m.toLowerCase()) + 1;
      if (monthNum) {
        date = calendarDate(Number(y), monthNum, Number(d));
        return ' '.repeat(span.length);
      }
      return span;
    });
  }

  // 5. DD Month (e.g. 15 October, 1 November without year -> use defaultYear)
  if (!date) {
    masked = masked.replace(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\b/gi, (span, d, m) => {
      const monthNum = MONTHS.findIndex(mon => mon === m.toLowerCase() || mon.slice(0, 3) === m.toLowerCase()) + 1;
      if (monthNum) {
        date = calendarDate(defaultYear, monthNum, Number(d));
        return ' '.repeat(span.length);
      }
      return span;
    });
  }

  // 6. Month DD (e.g. October 15, November 1 without year -> use defaultYear)
  if (!date) {
    masked = masked.replace(/\b([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi, (span, m, d) => {
      const monthNum = MONTHS.findIndex(mon => mon === m.toLowerCase() || mon.slice(0, 3) === m.toLowerCase()) + 1;
      if (monthNum) {
        date = calendarDate(defaultYear, monthNum, Number(d));
        return ' '.repeat(span.length);
      }
      return span;
    });
  }

  // 7. Relative colloquial dates
  if (!date && /next\s+monday/i.test(masked)) {
    date = '2026-10-12';
    masked = masked.replace(/next\s+monday/gi, '           ');
  }

  let start = '';
  let end = '';
  let duration = 0;
  const missing: string[] = [];

  const explicitDuration = masked.match(/\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/i);
  if (explicitDuration) duration = Number(explicitDuration[1]);

  // A range is ONLY a clock time range if it has colons (:00) or am/pm, or is preceded by time keywords
  const range = masked.match(/\b(?:(?:from|shift\s+is|shift\s*:?|hours?\s*(?:are|:)?)\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|[-–—]|until)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  const isTimeRange = range && (range[2] || range[3] || range[5] || range[6] || /from|shift|hour/i.test(range[0]));

  if (isTimeRange && range) {
    const startMinute = clockMinutes(range[1], range[2], range[3]);
    const endMinute = clockMinutes(range[4], range[5], range[6]);
    if (startMinute !== null && endMinute !== null && startMinute >= 0 && endMinute <= 1440) {
      start = clockText(startMinute);
      end = clockText(endMinute);
      const rangeDuration = (endMinute - startMinute) / 60;
      if (rangeDuration > 0 && (!explicitDuration || duration === rangeDuration)) {
        duration = rangeDuration;
      } else if (rangeDuration <= 0) {
        duration = 0;
        missing.push('duration_hours');
      }
    }
  }

  // Single start time expression (e.g. "starting at 12:00", "starting at 09:00", "at 2pm")
  if (!start) {
    const single = masked.match(/\b(?:starting\s+at|start\s+time\s*:?|at|from|starting)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
    if (single) {
      const minutes = clockMinutes(single[1], single[2], single[3]);
      if (minutes !== null) start = clockText(minutes);
    }
  }

  if (start && duration > 0 && !end) {
    end = shiftEnd(start, duration);
  }

  if (!date) missing.push('date');
  if (!start) missing.push('start_time');
  if (!Number.isFinite(duration) || duration <= 0) {
    duration = 0;
    missing.push('duration_hours');
  }

  return { date, start, end, duration, missing: [...new Set(missing)] };
}

/* ============================================================
   Recurring weekly schedule parsing
   Supports inputs like:
   "Saturdays and Sundays, 9am to 5pm, starting 1 November"
   "Monday to Friday, 8am to 4pm, starting next Monday"
   "every Wednesday at 10:00 for 2 hours"
   ============================================================ */

const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_WORDS: { name: string; full: string; abbr: string; js: number }[] = [
  { name: 'Mon', full: 'monday', abbr: 'mon', js: 1 },
  { name: 'Tue', full: 'tuesday', abbr: 'tue', js: 2 },
  { name: 'Wed', full: 'wednesday', abbr: 'wed', js: 3 },
  { name: 'Thu', full: 'thursday', abbr: 'thu', js: 4 },
  { name: 'Fri', full: 'friday', abbr: 'fri', js: 5 },
  { name: 'Sat', full: 'saturday', abbr: 'sat', js: 6 },
  { name: 'Sun', full: 'sunday', abbr: 'sun', js: 0 },
];

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear().toString().padStart(4, '0')}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}

function isoAddDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function jsDayOf(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

function wdNameOf(iso: string): string {
  const js = jsDayOf(iso);
  return WD[(js + 6) % 7];
}

/** Detect which weekly days a phrase refers to (canonical Mon..Sun order). */
function detectScheduleDays(text: string): string[] {
  const t = text.toLowerCase();
  if (/weekday|monday\s*(?:to|-|–|through)\s*friday|mon\s*-?\s*fri/.test(t)) {
    return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  }
  if (/\bweekend\b/.test(t)) {
    return ['Sat', 'Sun'];
  }
  if (/\bdaily\b|every\s*day|all\s*days|7\s*days|seven\s*days/.test(t)) {
    return [...WD];
  }
  const found = new Set<string>();
  for (const d of DAY_WORDS) {
    if (new RegExp(`\\b${d.full}s?\\b|\\b${d.abbr}\\b`).test(t)) found.add(d.name);
  }
  return WD.filter(w => found.has(w));
}

/** Decide whether the phrase means a repeating weekly pattern vs a single occurrence. */
function isRecurringSchedule(text: string, days: string[]): boolean {
  const t = text.toLowerCase();
  if (days.length >= 2) return true;
  if (/\bweekend\b|weekday|\bdaily\b|every\s*day/.test(t)) return true;
  if (/\b(mondays|tuesdays|wednesdays|thursdays|fridays|saturdays|sundays)\b/.test(t)) return true;
  if (/\bevery\s+(mon|tue|wed|thu|fri|sat|sun)/.test(t)) return true;
  return false;
}

/** Expand a recurring set of weekdays into concrete dates starting at/after `anchor`. */
function expandScheduleDates(anchor: string, days: string[], max = 12, horizonDays = 90): string[] {
  const wanted = new Set(days.map(n => DAY_WORDS.find(d => d.name === n)!.js));
  const out: string[] = [];
  for (let i = 0; i <= horizonDays && out.length < max; i++) {
    const iso = isoAddDays(anchor, i);
    if (wanted.has(jsDayOf(iso))) out.push(iso);
  }
  return out;
}

/** First occurrence of a weekday strictly after `from` (for "next <day>") or on/after (for "this <day>"). */
function nextOccurrence(js: number, from: string, inclusive: boolean): string {
  for (let i = inclusive ? 0 : 1; i <= 7; i++) {
    const iso = isoAddDays(from, i);
    if (jsDayOf(iso) === js) return iso;
  }
  return from;
}

export interface ParsedCareSchedule {
  days: string[];
  recurring: boolean;
  anchor: string;
  concreteDates: string[];
  startDate: string;
  start: string;
  end: string;
  duration: number;
  hasTime: boolean;
}

/** Parse a free-text care schedule (recurring days + start date + time range). */
export function parseCareSchedule(text: string): ParsedCareSchedule {
  const timing = extractCareTiming(text);
  const today = todayIso();
  const days = detectScheduleDays(text);
  const recurring = isRecurringSchedule(text, days);

  // Resolve an anchor start date: explicit date first, then a relative weekday phrase.
  let anchor = timing.date;
  if (!anchor) {
    const rel = text.match(/\b(next|this|coming|upcoming)?\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
    if (rel) {
      const d = DAY_WORDS.find(x => x.full === rel[2].toLowerCase())!;
      const modifier = (rel[1] || '').toLowerCase();
      const inclusive = modifier !== 'next' && modifier !== 'coming' && modifier !== 'upcoming';
      anchor = nextOccurrence(d.js, today, inclusive);
    }
  }

  let concreteDates: string[] = [];
  if (recurring && days.length) {
    concreteDates = expandScheduleDates(anchor || today, days);
  } else if (anchor) {
    concreteDates = [anchor];
  } else if (days.length === 1) {
    const d = DAY_WORDS.find(x => x.name === days[0])!;
    concreteDates = [nextOccurrence(d.js, today, false)];
    anchor = concreteDates[0];
  }

  const startDate = concreteDates[0] || anchor || '';
  return {
    days,
    recurring,
    anchor,
    concreteDates,
    startDate,
    start: timing.start,
    end: timing.end,
    duration: timing.duration,
    hasTime: !!timing.start,
  };
}

@Component({
  selector: 'app-intake-form',
  standalone: true,
  imports: [FormsModule, RouterLink, IconComponent],
  templateUrl: './intake-form.html',
  styleUrl: './intake-form.scss',
})
export class IntakeForm {
  private readonly data = inject(MockDataService);
  protected readonly mcp = inject(CareKakiMcpService);
  private readonly router = inject(Router);

  readonly rawInput = signal('');
  readonly parsing = signal(false);
  readonly parsed = signal<IntakeEntities | null>(null);
  readonly intakeId = signal('');
  readonly missingSlots = signal<string[]>([]);

  // MCP Integration signals
  readonly mcpValidating = signal(false);
  readonly mcpValidation = signal<McpValidationResult | null>(null);
  readonly mcpConfirmed = signal(false);
  readonly mcpSearching = signal(false);
  readonly clarificationAnswer = signal('');
  readonly schedulePreview = signal<(ParsedCareSchedule & { raw: string }) | null>(null);

  readonly examples: ExamplePrompt[] = [
    {
      label: 'Petaling Jaya Elderly Care (MCP Demo)',
      text: 'Need elderly care in Petaling Jaya on 2026-10-17 starting at 09:00 for 2 hours. Budget is RM200.',
    },
    {
      label: 'Post-surgery nursing (Cheras, KL)',
      text: 'I need a certified nurse for my mother in Cheras, KL. She had a hip replacement 2 weeks ago. Shift is 8am–4pm, Monday to Friday. Starting next Monday.',
    },
    {
      label: 'Weekend companionship (Penang)',
      text: 'Looking for a companion for my elderly father in Penang. He needs someone to talk to and accompany him on walks. Saturdays and Sundays, 9am to 5pm, starting 1 November.',
    },
    {
      label: 'Hospital transport (Johor Bahru)',
      text: 'Need transport for my grandmother from Johor Bahru to the hospital for dialysis. Single trip on 15 October, 7am to 11am. She uses a wheelchair.',
    },
  ];

  readonly serviceTypeOptions: { value: ServiceType; label: string; icon: string }[] = [
    { value: 'nursing', label: 'Nursing', icon: 'heart' },
    { value: 'home_care', label: 'Home Care', icon: 'shield' },
    { value: 'transport', label: 'Transport', icon: 'map-pin' },
    { value: 'companionship', label: 'Companionship', icon: 'users' },
  ];

  get serviceTypeLabel(): string {
    const p = this.parsed();
    if (!p) return '';
    return this.serviceTypeOptions.find(o => o.value === p.service_type)?.label ?? p.service_type;
  }

  get isComplete(): boolean {
    return this.missingSlots().length === 0 && this.parsed() !== null;
  }

  useExample(text: string) {
    this.rawInput.set(text);
    this.parsed.set(null);
    this.missingSlots.set([]);
    this.mcpValidation.set(null);
    this.mcpConfirmed.set(false);
    this.schedulePreview.set(null);
    this.parseIntake();
  }

  clear() {
    this.rawInput.set('');
    this.parsed.set(null);
    this.missingSlots.set([]);
    this.intakeId.set('');
    this.mcpValidation.set(null);
    this.mcpConfirmed.set(false);
    this.schedulePreview.set(null);
  }

  /** Entity extraction from natural language */
  parseIntake() {
    const text = this.rawInput().trim();
    if (!text) return;

    this.parsing.set(true);
    this.parsed.set(null);
    this.mcpValidation.set(null);
    this.mcpConfirmed.set(false);

    // Realistic agent latency
    setTimeout(async () => {
      const entities = this.extractEntities(text);
      this.parsed.set(entities.entities);
      this.missingSlots.set(entities.missing);
      this.intakeId.set('INT-' + this.timestampId());
      this.parsing.set(false);

      // Auto-validate with MCP if server is online
      await this.validateWithMcp();
    }, 600);
  }

  /**
   * Send entities to MCP tool carekaki_validate_request
   */
  async validateWithMcp() {
    const p = this.parsed();
    if (!p) return;

    this.mcpValidating.set(true);
    try {
      // Map entity model to MCP CareRequest parameters
      const reqPayload: Record<string, any> = {
        location: p.location.includes('Petaling Jaya') ? 'Petaling Jaya' :
                 (p.location.includes('Subang Jaya') ? 'Subang Jaya' :
                 (p.location.includes('Kuala Lumpur') ? 'Kuala Lumpur' :
                 (p.location.includes('Cheras') ? 'Cheras' :
                 (p.location.includes('Shah Alam') ? 'Shah Alam' : p.location)))),
        date: p.start_date || undefined,
        start_time: p.shift_hours.start || undefined,
        duration_hours: p.shift_hours.duration_hours || undefined,
        required_services: p.required_services,
        max_budget: p.max_budget,
        preferred_language: '',
        confirmed: this.mcpConfirmed(),
      };

      const result = await this.mcp.validateRequest(reqPayload);
      this.mcpValidation.set(result);
    } catch (err) {
      console.warn('MCP validation skipped (offline/error):', err);
    } finally {
      this.mcpValidating.set(false);
    }
  }

  /**
   * User clicks a choice option to resolve clarification question
   */
  async selectMcpChoice(field: string, value: any) {
    const p = this.parsed();
    if (!p) return;

    if (field === 'location') {
      p.location = String(value);
      p.location_zone = String(value);
    } else if (field === 'start_time') {
      p.shift_hours.start = String(value);
    } else if (field === 'duration_hours') {
      p.shift_hours.duration_hours = Number(value);
    } else if (field === 'date') {
      const raw = String(value);
      const s = parseCareSchedule(raw);
      if (s.startDate) {
        p.start_date = s.startDate;
        p.schedule_days = s.recurring ? s.days : [];
        p.schedule_dates = s.recurring && s.concreteDates.length > 1 ? s.concreteDates : [];
        p.shift_hours.days = s.days.length ? s.days : [wdNameOf(s.startDate)];
        if (s.start) p.shift_hours.start = s.start;
        if (s.duration > 0) p.shift_hours.duration_hours = s.duration;
        // Resolving a schedule can also fill time/duration from the same phrase.
        this.missingSlots.update(f => f.filter(slot =>
          !(slot === 'start_time' && p.shift_hours.start) &&
          !(slot === 'duration_hours' && p.shift_hours.duration_hours > 0)));
      } else {
        p.start_date = raw;
      }
    } else if (field === 'max_budget') {
      p.max_budget = Number(value);
    } else if (field === 'required_services') {
      p.required_services = Array.isArray(value) ? value : [String(value)];
    }
    p.shift_hours.end = shiftEnd(p.shift_hours.start, p.shift_hours.duration_hours);
    this.missingSlots.update(fields => fields.filter(slot => slot !== field));
    this.mcpConfirmed.set(false);
    this.parsed.set({ ...p, shift_hours: { ...p.shift_hours } });
    this.schedulePreview.set(null);
    await this.validateWithMcp();
  }

  /** Parse the free-text clarification answer into a previewable weekly schedule. */
  previewSchedule() {
    const raw = this.clarificationAnswer().trim();
    if (!raw) { this.schedulePreview.set(null); return; }
    const s = parseCareSchedule(raw);
    this.schedulePreview.set({ ...s, raw });
  }

  /** Apply the previewed schedule to the intake (fills date, days, time, duration). */
  applySchedule() {
    const pv = this.schedulePreview();
    if (!pv || !pv.startDate) return;
    this.selectMcpChoice('date', pv.raw);
  }

  /** Pick one concrete date from the expanded recurring schedule as the active search date. */
  chooseScheduleDate(iso: string) {
    const p = this.parsed();
    if (!p) return;
    p.start_date = iso;
    this.missingSlots.update(f => f.filter(slot => slot !== 'date'));
    this.mcpConfirmed.set(false);
    this.parsed.set({ ...p, shift_hours: { ...p.shift_hours } });
    this.validateWithMcp();
  }

  /** Clear the recurring schedule and keep only the single active date. */
  clearSchedule() {
    const p = this.parsed();
    if (!p) return;
    p.schedule_days = [];
    p.schedule_dates = [];
    this.parsed.set({ ...p });
  }

  async submitClarification(field: string) {
    const value = this.clarificationAnswer().trim();
    if (!value) return;
    if (field === 'date') {
      // Date accepts natural language ("1 November", "Saturdays and Sundays ... starting 1 Nov").
      await this.selectMcpChoice('date', value);
    } else {
      await this.selectMcpChoice(field, field === 'max_budget' || field === 'duration_hours' ? Number(value) : value);
    }
    this.clarificationAnswer.set('');
  }

  /**
   * User confirms requirements and searches providers via MCP
   */
  async confirmAndSearchMcp() {
    this.mcpConfirmed.set(true);
    await this.validateWithMcp();
    const p = this.parsed();
    if (p) {
      this.data.activeIntake.set({ ...p, shift_hours: { ...p.shift_hours } });
      this.data.activeScheduleDates.set(p.schedule_dates && p.schedule_dates.length > 1 ? p.schedule_dates : []);
    }
    this.router.navigate(['/matching']);
  }

  private extractEntities(text: string): { entities: IntakeEntities; missing: string[] } {
    const lower = text.toLowerCase();
    const missing: string[] = [];

    // --- Service type ---
    let serviceType: ServiceType = 'home_care';
    if (/\b(nurse|nursing|medical|medication|vitals|wound)\b/.test(lower)) serviceType = 'nursing';
    else if (/\b(transport|pickup|transfer|hospital|dialysis|trip)\b/.test(lower)) serviceType = 'transport';
    else if (/\b(companion|companionship|talk|accompany|walks|befriend)\b/.test(lower)) serviceType = 'companionship';
    else if (/\b(elderly|home care|daily living|meal prep|housekeeping|assist)\b/.test(lower)) serviceType = 'home_care';
    else missing.push('service_type');

    // --- Location ---
    const zones: { match: RegExp; zone: string; label: string }[] = [
      { match: /\b(petaling jaya|pj)\b/i, zone: 'Petaling Jaya', label: 'Petaling Jaya' },
      { match: /\b(subang jaya|subang)\b/i, zone: 'Subang Jaya', label: 'Subang Jaya' },
      { match: /\b(shah alam)\b/i, zone: 'Shah Alam', label: 'Shah Alam' },
      { match: /\b(cheras)\b/i, zone: 'Cheras', label: 'Cheras' },
      { match: /\b(kuala lumpur|\bkl\b|bukit jalil|wangsa maju|setapak)/i, zone: 'Kuala Lumpur', label: 'Kuala Lumpur' },
      { match: /\b(penang|george town|bayan lepas|butterworth)/i, zone: 'Penang', label: 'George Town, Penang' },
      { match: /\b(johor bahru|iskandar|skudai|johor)/i, zone: 'Johor', label: 'Johor Bahru, Johor' },
      { match: /\b(ipoh|taiping|kampar|perak)/i, zone: 'Ipoh (Perak)', label: 'Ipoh, Perak' },
      { match: /\b(melaka|alor gajah|batu berendam)/i, zone: 'Melaka', label: 'Melaka city, Melaka' },
      { match: /\b(seremban|port dickson|nilai|negeri sembilan)/i, zone: 'Negeri Sembilan', label: 'Seremban, Negeri Sembilan' },
    ];
    let zone = '';
    let locationLabel = '';
    for (const z of zones) {
      if (z.match.test(text)) { zone = z.zone; locationLabel = z.label; break; }
    }
    if (!zone) missing.push('location');

    const sched = parseCareSchedule(text);
    const start = sched.start;
    const end = sched.end;
    const duration = sched.duration;
    const startDate = sched.startDate;
    if (!startDate) missing.push('date');
    if (!start) missing.push('start_time');
    if (!Number.isFinite(duration) || duration <= 0) missing.push('duration_hours');
    const budgetMatch = text.match(/\b(?:rm|myr)\s*(\d+(?:\.\d+)?)\b/i);
    const maxBudget = budgetMatch ? Number(budgetMatch[1]) : undefined;
    if (!maxBudget || maxBudget <= 0) missing.push('max_budget');
    const requiredServices: string[] = [];
    if (/\belderly|eldercare|home care|nurs(?:e|ing)\b/i.test(text)) requiredServices.push('elderly_care');
    if (/\bmobility(?:\s+assistance)?|wheelchair|transport\b/i.test(text)) requiredServices.push('mobility_assistance');
    if (/\bcompanionship|companion\b/i.test(text)) requiredServices.push('companionship');
    if (/\bdementia\b/i.test(text)) requiredServices.push('dementia_care');
    if (!requiredServices.length) missing.push('required_services');

    // --- Days (recurring weekly pattern, or the single weekday of a one-off date) ---
    const days = sched.days.length ? sched.days : (startDate ? [wdNameOf(startDate)] : []);
    const scheduleDays = sched.recurring ? sched.days : [];
    const scheduleDates = sched.recurring && sched.concreteDates.length > 1 ? sched.concreteDates : [];

    // --- Patient conditions ---
    let conditions = '';
    const condMatch = text.match(/(?:she|he|they|patient|my (?:mother|father|grandmother|grandfather|wife|husband))[^.]*?(?:had|has|needs|requires|uses|with)\s+([^.,]+)/i);
    if (condMatch) {
      conditions = condMatch[1].trim();
    } else if (/\b(hip replacement|dementia|alzheimer|stroke|diabetes|dialysis|wheelchair|post-surgery|palliative|mobility|elderly)\b/i.test(text)) {
      const m = text.match(/\b(hip replacement|dementia|alzheimer|stroke|diabetes|dialysis|wheelchair|post-surgery|palliative|mobility|elderly)[^.,]*/i);
      conditions = m ? m[0].trim() : '';
    }
    conditions = conditions.replace(/^(?:a|an|the)\s+/i, '').trim() || 'General eldercare support required';

    const entities: IntakeEntities = {
      service_type: serviceType,
      location: locationLabel,
      location_zone: zone,
      shift_hours: { start, end, duration_hours: duration, days },
      patient_conditions: conditions,
      start_date: startDate,
      estimated_weeks: null,
      max_budget: maxBudget,
      required_services: requiredServices,
      schedule_days: scheduleDays,
      schedule_dates: scheduleDates,
    };

    return { entities, missing };
  }

  private timestampId(): string {
    const d = new Date();
    return d.toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.floor(100 + Math.random() * 900);
  }

  formatDate(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }

  /** Compact chip label, e.g. "Sun 1 Nov" */
  shortDate(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  /** Human-readable weekly day list, e.g. "Sat & Sun" or "Mon–Fri" */
  daysLabel(days: string[]): string {
    if (!days || !days.length) return '';
    const key = days.join(',');
    if (key === 'Mon,Tue,Wed,Thu,Fri') return 'Mon–Fri (weekdays)';
    if (key === 'Mon,Tue,Wed,Thu,Fri,Sat,Sun') return 'Every day';
    if (key === 'Sat,Sun') return 'Sat & Sun (weekends)';
    return days.join(', ');
  }
}
