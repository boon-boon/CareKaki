import type { CareRequest, MatchChecks, MatchResult, Provider, ProviderAlternative, ProviderDiagnostic, ProviderMatch } from "./types.js";

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours! * 60 + minutes!;
}

function requestedDates(request: CareRequest): string[] {
  return request.schedule_dates?.length ? request.schedule_dates : [request.date];
}

function uncoveredDates(request: CareRequest, provider: Provider): string[] {
  const start = toMinutes(request.start_time);
  const end = start + request.duration_hours * 60;
  return requestedDates(request).filter(date => !provider.availability.some(slot =>
    slot.date === date && toMinutes(slot.start) <= start && toMinutes(slot.end) >= end));
}

/** Shared by search and explain so the diagnostic checks cannot drift. */
export function matchingChecks(request: CareRequest, provider: Provider): MatchChecks {
  return {
    location: provider.location.toLowerCase() === request.location.toLowerCase(),
    services: request.required_services.every(service => provider.services.includes(service)),
    verified: provider.verified === true,
    availability: uncoveredDates(request, provider).length === 0,
    // max_budget is TOTAL cost for all requested occurrences, not a per-day limit.
    budget: provider.hourly_rate * request.duration_hours * requestedDates(request).length <= request.max_budget,
  };
}

/** Original top-five default; callers may explicitly request up to twenty. */
export function filterAndRank(request: CareRequest, providers: Provider[], limit = 5): MatchResult {
  const ranked: ProviderMatch[] = providers
    .filter(provider => Object.values(matchingChecks(request, provider)).every(Boolean))
    .map(provider => {
      const cost = provider.hourly_rate * request.duration_hours * requestedDates(request).length;
      const languageMatch = !request.preferred_language || provider.languages.some(language => language.toLowerCase() === request.preferred_language.toLowerCase());
      const languageScore = !request.preferred_language ? 50 : languageMatch ? 100 : 0;
      const score = (provider.rating / 5) * 100 * 0.50 + (1 - cost / request.max_budget) * 100 * 0.35 + languageScore * 0.15;
      return {
        provider_id: provider.provider_id, name: provider.name, location: provider.location,
        hourly_rate: provider.hourly_rate, estimated_cost: cost, currency: "MYR",
        rating: provider.rating, verified: provider.verified, languages: provider.languages,
        preferred_language_match: languageMatch, available: true, match_score: Number(score.toFixed(2)),
        ...(requestedDates(request).length > 1
          ? { covered_dates: requestedDates(request).length, requested_dates: requestedDates(request).length }
          : {}),
      };
    });
  ranked.sort((a, b) => b.match_score - a.match_score || a.estimated_cost - b.estimated_cost || a.provider_id.localeCompare(b.provider_id));
  // Strict criteria stay intact: suggestions are verified but NOT eligible/bookable.
  const alternatives: ProviderAlternative[] = [];
  if (!ranked.length) {
    for (const provider of providers) {
      const checks = matchingChecks(request, provider);
      if (!checks.verified) continue;
      const estimated_cost = provider.hourly_rate * request.duration_hours * requestedDates(request).length;
      const unavailable_dates = uncoveredDates(request, provider);
      const preferred_language_match = !request.preferred_language ||
        provider.languages.some(l => l.toLowerCase() === request.preferred_language.toLowerCase());
      const languageScore = !request.preferred_language ? 50 : preferred_language_match ? 100 : 0;
      const qualityScore = (provider.rating / 5) * 50
        + Math.max(0, 1 - estimated_cost / request.max_budget) * 35 + languageScore * 0.15;
      alternatives.push({
        provider_id: provider.provider_id, name: provider.name, location: provider.location,
        hourly_rate: provider.hourly_rate, estimated_cost, currency: "MYR",
        rating: provider.rating, verified: true, languages: provider.languages,
        preferred_language_match, available: checks.availability,
        match_score: Number(qualityScore.toFixed(2)), checks,
        passed_checks: Object.values(checks).filter(Boolean).length,
        failed_checks: Object.entries(checks).filter(([, ok]) => !ok).map(([key]) => key),
        eligible: false, unavailable_dates,
        covered_dates: requestedDates(request).length - unavailable_dates.length,
        requested_dates: requestedDates(request).length,
      });
    }
    alternatives.sort((a, b) => b.passed_checks - a.passed_checks ||
      (b.covered_dates ?? 0) - (a.covered_dates ?? 0) ||
      b.match_score - a.match_score || a.estimated_cost - b.estimated_cost ||
      a.provider_id.localeCompare(b.provider_id));
  }
  return {
    status: ranked.length > 0 ? "matches_found" : "no_matches", request,
    total_matches: ranked.length, matches: ranked.slice(0, limit),
    ...(alternatives.length ? { alternatives: alternatives.slice(0, Math.min(limit, 5)) } : {}),
    data_source: "fictional_demo", booking_status: "not_booked",
  };
}

export function explainMatching(request: CareRequest, providers: Provider[]): ProviderDiagnostic[] {
  return providers.map(provider => {
    const checks = matchingChecks(request, provider);
    return {
      provider_id: provider.provider_id, name: provider.name,
      eligible: Object.values(checks).every(Boolean), checks,
      failed_checks: Object.entries(checks).filter(([, passed]) => !passed).map(([key]) => key),
      actual_values: {
        location: provider.location, services: provider.services, verified: provider.verified,
        availability: provider.availability,
        estimated_cost: provider.hourly_rate * request.duration_hours * requestedDates(request).length,
        requested_dates: requestedDates(request).length,
        covered_dates: requestedDates(request).length - uncoveredDates(request, provider).length,
        unavailable_dates: uncoveredDates(request, provider),
      },
    };
  });
}
