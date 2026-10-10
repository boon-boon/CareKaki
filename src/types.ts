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
}

export interface MatchResult {
  status: 'matches_found' | 'no_matches';
  request: CareRequest;
  total_matches: number;
  matches: ProviderMatch[];
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
  };
}
