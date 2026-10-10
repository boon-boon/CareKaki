/* ============================================================
   CareKaki Pro — Core Domain Models & Interfaces
   Compliant with CareKaki Pro Technical Specification v1.0
   ============================================================ */

export type AvailabilityStatus = 'available' | 'on_assignment' | 'on_leave';

export type ServiceType = 'home_care' | 'nursing' | 'transport' | 'companionship';

export interface Caregiver {
  caregiver_id: string; // CG-###
  name: string;
  certifications: string; // pipe-delimited e.g. Nursing|CPR|Wound Care
  primary_zone: string; // Malaysian zone e.g. Kuala Lumpur, Petaling Jaya
  hourly_rate_myr: number;
  availability_status: AvailabilityStatus;
  avatar_url?: string;
  languages?: string[];
}

export interface ShiftHours {
  start: string; // HH:mm e.g. 08:00
  end: string; // HH:mm e.g. 16:00
  duration_hours: number;
  days: string[]; // ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
}

export interface IntakeEntities {
  service_type: ServiceType | string;
  location: string;
  location_zone: string;
  shift_hours: ShiftHours;
  patient_conditions: string;
  start_date: string; // YYYY-MM-DD (first concrete occurrence for recurring schedules)
  estimated_weeks?: number | null;
  max_budget?: number;
  required_services?: string[];
  /** Recurring weekly days-of-week parsed from natural language, e.g. ['Sat','Sun'] */
  schedule_days?: string[];
  /** Concrete upcoming dates expanded from a recurring schedule (>= 2 entries) */
  schedule_dates?: string[];
}

export interface IntakeResult {
  intake_id: string;
  timestamp: string;
  raw_input: string;
  entities: IntakeEntities;
  completeness_check: 'PASS' | 'NEEDS_CLARIFICATION';
  missing_slots: string[];
}

export interface ScoreBreakdown {
  proximity_score: number; // 0-100
  skill_score: number; // 0-100
  availability_score: number; // 0-100
}

export interface MatchedCandidate {
  rank: number;
  caregiver_id: string;
  name: string;
  certifications: string;
  primary_zone: string;
  hourly_rate_myr: number;
  total_score: number;
  score_breakdown: ScoreBreakdown;
  availability_status: AvailabilityStatus;
  estimated_cost?: number;
  languages?: string[];
  match_score?: number;
  preferred_language_match?: boolean;
}

export interface HandoffPayload {
  handoff_version: string;
  intake_id: string;
  timestamp: string;
  entities: IntakeEntities;
  matched_candidates: MatchedCandidate[];
  selected_caregiver_id: string;
  pricing_source: string;
  roster_source: string;
}

export interface QuotationLineItem {
  description: string;
  rate_myr: number;
  hours: number;
  days: number;
  subtotal_myr: number;
}

export interface Quotation {
  quotation_id: string;
  date_issued: string;
  valid_until: string;
  client_name: string;
  client_contact: string;
  service_address: string;
  service_type: string;
  caregiver_name: string;
  caregiver_id: string;
  caregiver_certifications: string;
  shift_days: string;
  shift_start: string;
  shift_end: string;
  start_date: string;
  line_items: QuotationLineItem[];
  subtotal: number;
  sst_amount: number;
  total: number;
  billable_rate: number;
  duration_hours: number;
  num_days: number;
}

export interface EmergencyContact {
  name: string;
  phone: string;
  relation: string;
}

export interface JobOrder {
  job_order_id: string;
  date_issued: string;
  caregiver_name: string;
  caregiver_id: string;
  caregiver_certifications: string;
  client_name: string;
  patient_conditions: string;
  service_address: string;
  shift_days: string;
  shift_start: string;
  shift_end: string;
  duration_hours: number;
  start_date: string;
  expected_duration: string;
  special_instructions: string;
  equipment_list: string;
  emergency_contacts: EmergencyContact[];
  checklist: string[];
}

export interface WhatsAppMessage {
  message_id: string;
  recipient_name: string;
  recipient_id: string;
  message_text: string;
  char_count: number;
}

export interface ServiceBaseRate {
  base_hourly_rate: number;
  description: string;
}

export interface NightShiftSurcharge {
  applies_after: string;
  applies_before: string;
  multiplier: number;
  description: string;
}

export interface WeekendSurcharge {
  days: string[];
  multiplier: number;
  description: string;
}

export interface HolidaySurcharge {
  multiplier: number;
  description: string;
  holiday_list_ref: string;
}

export interface TaxConfig {
  name: string;
  rate: number;
  description: string;
}

export interface BillingRules {
  minimum_shift_hours: number;
  rounding: string;
  billable_rate_rule: string;
}

export interface PricingMatrix {
  version: string;
  currency: 'MYR';
  last_updated: string;
  service_base_rates: Record<string, ServiceBaseRate>;
  surcharges: {
    night_shift: NightShiftSurcharge;
    weekend: WeekendSurcharge;
    public_holiday: HolidaySurcharge;
  };
  tax: TaxConfig;
  billing_rules: BillingRules;
}

export interface DashboardKPI {
  label: string;
  value: number;
  sublabel: string;
  trend: string;
  trend_direction: 'up' | 'down' | 'neutral';
  icon: string;
  color: 'teal' | 'green' | 'blue' | 'amber' | 'rose';
}

export interface ActivityItem {
  id: string;
  type: 'intake' | 'match' | 'quotation' | 'dispatch' | 'job_order';
  title: string;
  description: string;
  timestamp: string;
  status: 'success' | 'pending' | 'warning';
}

/* ============================================================
   CareKaki MCP Integration Types
   Mirroring the MCP tools served on the same origin (relative /mcp)
   ============================================================ */

export interface McpChoice {
  label: string;
  value: string | number | boolean;
}

export interface McpQuestion {
  field: string;
  text: string;
  type: 'single_select' | 'multi_select' | 'date' | 'time';
  options: McpChoice[];
}

export interface McpDraftRequest {
  location?: string;
  required_services?: string[];
  date?: string;
  start_time?: string;
  duration_hours?: number;
  max_budget?: number;
  preferred_language?: string;
  schedule_days?: string[];
  schedule_dates?: string[];
}

export interface McpValidationResult {
  status: 'valid' | 'needs_clarification' | 'needs_confirmation' | 'invalid_request';
  message?: string;
  request?: {
    location: string;
    required_services: string[];
    date: string;
    start_time: string;
    duration_hours: number;
    max_budget: number;
    preferred_language: string;
    schedule_days?: string[];
    schedule_dates?: string[];
  };
  draft_request?: McpDraftRequest;
  question?: McpQuestion;
  missing_fields?: string[];
  options?: McpChoice[];
}

export interface McpProviderMatch {
  ai?: { rank: number; suitability: 'excellent' | 'good' | 'fair' | 'limited'; strengths: string[]; tradeoffs: string[]; explanation: string };
  provider_id: string;
  name: string;
  location: string;
  hourly_rate: number;
  estimated_cost: number;
  currency: 'MYR';
  rating: number;
  verified: boolean;
  languages: string[];
  preferred_language_match: boolean;
  available: true;
  match_score: number;
  covered_dates?: number;
  requested_dates?: number;
}

export interface McpProviderAlternative extends Omit<McpProviderMatch, 'available'> {
  available: boolean;
  eligible: false;
  passed_checks: number;
  failed_checks: string[];
  checks: { location: boolean; services: boolean; verified: boolean; availability: boolean; budget: boolean };
  unavailable_dates?: string[];
}

export interface McpSearchResult {
  mode?: 'ai' | 'deterministic_fallback';
  status: 'matches_found' | 'no_matches' | 'needs_clarification' | 'needs_confirmation' | 'invalid_request';
  request?: any;
  total_matches?: number;
  matches?: McpProviderMatch[];
  alternatives?: McpProviderAlternative[];
  data_source?: 'fictional_demo';
  booking_status?: 'not_booked';
  question?: McpQuestion;
  missing_fields?: string[];
  options?: McpChoice[];
  draft_request?: any;
}

export interface McpSearchOptions {
  locations: string[];
  service_codes: string[];
  languages: string[];
  available_dates: string[];
  start_times: McpChoice[];
  duration_hours: number[];
  total_budgets: number[];
  currency: 'MYR';
}

export interface McpDiagnostic {
  provider_id: string;
  name: string;
  eligible: boolean;
  checks: {
    location: boolean;
    services: boolean;
    verified: boolean;
    availability: boolean;
    budget: boolean;
  };
  failed_checks: string[];
  actual_values: {
    location: string;
    services: string[];
    verified: boolean;
    availability: Array<{ date: string; start: string; end: string }>;
    estimated_cost: number;
    covered_dates?: number;
    requested_dates?: number;
    unavailable_dates?: string[];
  };
}
