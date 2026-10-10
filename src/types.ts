/** Shared domain types, mirroring the shapes produced by the n8n workflow. */

export interface AvailabilitySlot {
  date: string; // YYYY-MM-DD
  start: string; // HH:mm
  end: string; // HH:mm
}

export interface Provider {
  provider_id: string;
  name: string;
  location: string;
  hourly_rate: number;
  rating: number;
  verified: boolean;
  services: string[]; // lowercased
  languages: string[]; // original casing
  availability: AvailabilitySlot[];
}

/** A fully validated care request. */
export interface CareRequest {
  location: string;
  required_services: string[];
  date: string;
  start_time: string;
  duration_hours: number;
  max_budget: number;
  preferred_language: string; // "" means "no preference"
  schedule_days?: string[]; // Canonical Mon..Sun recurrence.
  schedule_dates?: string[]; // Dates being matched together; one entry means single-date inspection.
}

/** A partially collected request, as returned during clarification. */
export type DraftRequest = Partial<CareRequest>;

export interface Choice {
  label: string;
  value: string | number | boolean;
}

export interface Question {
  field: string;
  text: string;
  type: 'single_select' | 'multi_select' | 'date' | 'time';
  options: Choice[];
}

export type ValidationStatus =
  | 'valid'
  | 'needs_clarification'
  | 'needs_confirmation'
  | 'invalid_request';

export interface ValidationResult {
  status: ValidationStatus;
  message?: string;
  request?: CareRequest;
  draft_request?: DraftRequest;
  question?: Question;
  missing_fields?: string[];
  options?: Choice[];
}

export interface ProviderMatch {
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

export interface MatchResult {
  status: 'matches_found' | 'no_matches';
  request: CareRequest;
  total_matches: number;
  matches: ProviderMatch[];
  alternatives?: ProviderAlternative[];
  data_source: 'fictional_demo';
  booking_status: 'not_booked';
}

export interface MatchChecks {
  location: boolean;
  services: boolean;
  verified: boolean;
  availability: boolean;
  budget: boolean;
}

/** These are review-only suggestions that do not meet every requirement. */
export interface ProviderAlternative extends Omit<ProviderMatch, 'available'> {
  available: boolean;
  checks: MatchChecks;
  passed_checks: number;
  failed_checks: string[];
  eligible: false;
  unavailable_dates?: string[];
}

export interface ProviderDiagnostic {
  provider_id: string;
  name: string;
  eligible: boolean;
  checks: MatchChecks;
  failed_checks: string[];
  actual_values: {
    location: string;
    services: string[];
    verified: boolean;
    availability: AvailabilitySlot[];
    estimated_cost: number;
    covered_dates?: number;
    requested_dates?: number;
    unavailable_dates?: string[];
  };
}
