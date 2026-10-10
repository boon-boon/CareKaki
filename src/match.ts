import type { CareRequest, MatchChecks, MatchResult, Provider, ProviderDiagnostic, ProviderMatch } from "./types.js";

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours! * 60 + minutes!;
}

/** Shared by search and explain so the diagnostic checks cannot drift. */
export function matchingChecks(request: CareRequest, provider: Provider): MatchChecks {
  const start = toMinutes(request.start_time);
  const end = start + request.duration_hours * 60;
  return {
    location: provider.location.toLowerCase() === request.location.toLowerCase(),
    services: request.required_services.every(service => provider.services.includes(service)),
    verified: provider.verified === true,
    availability: provider.availability.some(slot => slot.date === request.date && toMinutes(slot.start) <= start && toMinutes(slot.end) >= end),
    budget: provider.hourly_rate * request.duration_hours <= request.max_budget,
  };
}

/** Original top-five default; callers may explicitly request up to twenty. */
export function filterAndRank(request: CareRequest, providers: Provider[], limit = 5): MatchResult {
  const ranked: ProviderMatch[] = providers
    .filter(provider => Object.values(matchingChecks(request, provider)).every(Boolean))
    .map(provider => {
      const cost = provider.hourly_rate * request.duration_hours;
      const languageMatch = !request.preferred_language || provider.languages.some(language => language.toLowerCase() === request.preferred_language.toLowerCase());
      const languageScore = !request.preferred_language ? 50 : languageMatch ? 100 : 0;
      const score = (provider.rating / 5) * 100 * 0.50 + (1 - cost / request.max_budget) * 100 * 0.35 + languageScore * 0.15;
      return {
        provider_id: provider.provider_id, name: provider.name, location: provider.location,
        hourly_rate: provider.hourly_rate, estimated_cost: cost, currency: "MYR",
        rating: provider.rating, verified: provider.verified, languages: provider.languages,
        preferred_language_match: languageMatch, available: true, match_score: Number(score.toFixed(2)),
      };
    });
  ranked.sort((a, b) => b.match_score - a.match_score || a.estimated_cost - b.estimated_cost || a.provider_id.localeCompare(b.provider_id));
  return {
    status: ranked.length > 0 ? "matches_found" : "no_matches", request,
    total_matches: ranked.length, matches: ranked.slice(0, limit),
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
        availability: provider.availability, estimated_cost: provider.hourly_rate * request.duration_hours,
      },
    };
  });
}
