import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe, CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IconComponent } from '../../shared/icon/icon';
import { MockDataService } from '../../core/services/mock-data.service';
import { CareKakiMcpService } from '../../core/services/carekaki-mcp.service';
import { CareBookingSessionService, ConfirmedCareRequest } from '../../core/services/care-booking-session.service';
import { MatchedCandidate, McpProviderMatch, McpProviderAlternative, McpDiagnostic } from '../../core/models';

@Component({
  selector: 'app-matching-results',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, IconComponent, DecimalPipe],
  templateUrl: './matching-results.html',
  styleUrl: './matching-results.scss',
})
export class MatchingResults implements OnInit {
  private readonly data = inject(MockDataService);
  protected readonly mcp = inject(CareKakiMcpService);
  protected readonly bookingSession = inject(CareBookingSessionService);

  readonly intake = this.data.sampleIntake;
  readonly specCandidates: MatchedCandidate[] = this.data.matchedCandidates;
  readonly handoff = this.data.handoffPayload;

  // Active Mode: 'mcp' (live MCP server) vs 'spec' (hardcoded spec reference)
  readonly activeTab = signal<'mcp' | 'spec'>('mcp');

  // MCP live search state
  readonly mcpMatches = signal<McpProviderMatch[]>([]);
  readonly inferenceMode = signal<'ai' | 'deterministic_fallback'>('deterministic_fallback');
  readonly alternatives = signal<McpProviderAlternative[]>([]);
  readonly reviewedAlternativeId = signal<string>('');
  readonly mcpLoading = signal(false);
  readonly mcpError = signal<string | null>(null);
  readonly mcpDiagnostics = signal<McpDiagnostic[]>([]);
  readonly showDiagnostics = signal(false);
  readonly diagnosticsLoading = signal(false);

  // Search parameters for live MCP query
  readonly searchCity = signal('');
  readonly searchDate = signal('');
  readonly searchTime = signal('09:00');
  readonly searchDuration = signal(2);
  readonly searchServices = signal<string[]>([]);
  readonly searchBudget = signal(200);
  readonly searchLanguage = signal('');

  readonly selectedId = signal<string>('');
  readonly showPayload = signal(false);
  readonly confirmed = signal(false);

  /** Recurring schedule dates carried over from the Intake view (if any). */
  readonly scheduleDates = signal<string[]>([]);
  /** Whole-schedule search is the default; individual chips opt into one date. */
  readonly scheduleMode = signal<'all' | 'single'>('single');

  /** Scoring weights per spec */
  readonly weights = { proximity: 0.40, skill: 0.35, availability: 0.25 };

  readonly catalogueCities = signal<string[]>([]);
  readonly catalogueServices = signal<string[]>([]);
  readonly catalogueLanguages = signal<string[]>([]);
  readonly serviceOptions = computed(() => this.catalogueServices().map(code => ({ code, label: this.formatService(code) })));

  formatService(code: string): string { return code.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '); }

  async loadCatalogueOptions() {
    try {
      const options = await this.mcp.getSearchOptions();
      this.catalogueCities.set(options.locations);
      this.catalogueServices.set(options.service_codes);
      this.catalogueLanguages.set(options.languages ?? []);

      // Preserve any request explicitly supplied by the intake or saved booking.
      // Only choose defaults when opening the matching page without an intake.
      const hasIntake = !!this.bookingSession.current() || !!this.data.activeIntake();
      if (!hasIntake) {
        if (!this.searchCity() || !options.locations.includes(this.searchCity())) {
          this.searchCity.set(options.locations[0] ?? '');
        }
        if (!this.searchServices().length) this.searchServices.set(options.service_codes.slice(0, 1));
        if (!this.searchDate()) {
          const futureDate = options.available_dates.find(date => date >= this.todayMalaysiaDate);
          this.searchDate.set(futureDate ?? '');
        }
        if (this.searchCity() && this.searchDate() && this.searchServices().length) {
          await this.runMcpSearch(true);
        }
      }
    } catch (error) {
      console.warn('Could not load live matching filters:', error);
      if (!this.bookingSession.current() && !this.data.activeIntake()) {
        this.mcpError.set('Could not load the available cities and services from MCP. Please check the backend.');
      }
    }
  }
  private searchSequence = 0;

  ngOnInit() {
    this.seedFromIntake();
    if (this.bookingSession.current() || this.data.activeIntake()) {
      void this.runMcpSearch(true);
    }
    void this.loadCatalogueOptions();
  }

  /** Apply the intake entities + recurring schedule chosen on the Intake page. */
  private seedFromIntake() {
    const pending = this.bookingSession.current();
    if (pending) {
      const request = pending.matchingRequest;
      this.searchCity.set(request.location);
      this.searchDate.set(request.date);
      this.searchTime.set(request.start_time);
      this.searchDuration.set(request.duration_hours);
      this.searchServices.set([...request.required_services]);
      this.searchBudget.set(request.max_budget);
      this.searchLanguage.set(request.preferred_language);
      this.scheduleDates.set([...pending.scheduleDates]);
      this.scheduleMode.set(pending.scheduleDates.length > 1 &&
        (request.schedule_dates?.length ?? pending.scheduleDates.length) > 1 ? 'all' : 'single');
      this.selectedId.set(pending.selectedProviderId ?? '');
      this.confirmed.set(pending.selectionConfirmed);
      this.reviewedAlternativeId.set(pending.reviewedAlternativeId ?? '');
      return;
    }
    const ai = this.data.activeIntake();
    if (!ai) return;
    const zone = ai.location_zone || ai.location || '';
    if (zone) this.searchCity.set(zone);
    if (ai.start_date) this.searchDate.set(ai.start_date);
    if (ai.shift_hours?.start) this.searchTime.set(ai.shift_hours.start);
    if (ai.shift_hours?.duration_hours) this.searchDuration.set(ai.shift_hours.duration_hours);
    if (ai.required_services?.length) this.searchServices.set([...ai.required_services]);
    if (ai.max_budget) this.searchBudget.set(ai.max_budget);
    this.scheduleDates.set(this.data.activeScheduleDates());
    if (this.scheduleDates().length > 1) this.scheduleMode.set('all');
  }

  readonly todayMalaysiaDate = (() => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    const get = (part: string) => parts.find(p => p.type === part)?.value ?? '';
    return get('year') + '-' + get('month') + '-' + get('day');
  })();

  /**
   * Toggle a requested service.
   *
   * At least one service must stay selected. The browser has already flipped the
   * native checkbox by the time this handler runs, and the template's one-way
   * `[checked]` binding only rewrites the DOM when the bound value actually
   * changes. On the guard path the signal is intentionally left untouched, so we
   * must explicitly restore the native control to match the signal; otherwise
   * the tick disappears while the `.checked` class stays highlighted (a
   * persistent visual desync). The native element is reset via the event target.
   */
  toggleService(code: string, checked: boolean, target: HTMLInputElement | null = null) {
    const previous = this.searchServices();
    const next = checked ? [...new Set([...previous, code])] : previous.filter(item => item !== code);
    if (next.length === 0) {
      // Guard: keep the last service selected and force the DOM back in sync.
      if (target) target.checked = previous.includes(code);
      return;
    }
    this.searchServices.set(next);
    if (target) target.checked = next.includes(code);
    void this.runMcpSearch();
  }

  private searchRequest(): ConfirmedCareRequest {
    return {
      location: this.searchCity(),
      date: this.searchDate(),
      start_time: this.searchTime(),
      duration_hours: Number(this.searchDuration()),
      required_services: [...this.searchServices()],
      max_budget: Number(this.searchBudget()),
      preferred_language: this.searchLanguage(),
      schedule_days: this.bookingSession.current()?.intake.schedule_days ?? [],
      ...(this.scheduleDates().length > 1 ? {
        schedule_dates: this.scheduleMode() === 'all' ? [...this.scheduleDates()] : [this.searchDate()],
      } : {}),
    };
  }

  /** Inspect a single date without discarding the original weekly recurrence. */
  useScheduleDate(iso: string) {
    this.scheduleMode.set('single');
    this.searchDate.set(iso);
    void this.runMcpSearch();
  }

  useFullSchedule() {
    if (this.scheduleDates().length < 2) return;
    this.scheduleMode.set('all');
    this.searchDate.set(this.scheduleDates()[0]);
    void this.runMcpSearch();
  }

  changeSearchDate(iso: string) {
    this.scheduleMode.set('single');
    this.searchDate.set(iso);
    void this.runMcpSearch();
  }

  shortDate(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  get recurringLabel(): string {
    const days = this.bookingSession.current()?.intake.schedule_days ?? [];
    if (days.join(',') === 'Mon,Tue,Wed,Thu,Fri') return 'Monday–Friday';
    if (days.join(',') === 'Sat,Sun') return 'Saturday–Sunday';
    return days.join(', ') || 'Recurring';
  }

  setTab(tab: 'mcp' | 'spec') {
    this.activeTab.set(tab);
    if (tab === 'mcp' && this.mcpMatches().length === 0) {
      this.runMcpSearch();
    }
  }

  /**
   * Call live MCP search tool: carekaki_search_providers
   */
  async runMcpSearch(restoreSelection = false) {
    const request = this.searchRequest();
    const sequence = ++this.searchSequence;
    if (!restoreSelection) {
      this.bookingSession.updateSearch(request);
      this.selectedId.set('');
      this.confirmed.set(false);
    }
    this.mcpDiagnostics.set([]);
    this.mcpMatches.set([]);
    this.alternatives.set([]);
    if (!restoreSelection) this.reviewedAlternativeId.set('');
    if (!request.location || !request.date || !/^([01]\d|2[0-3]):[0-5]\d$/.test(request.start_time) ||
      !Number.isFinite(request.duration_hours) || request.duration_hours <= 0 ||
      !Number.isFinite(request.max_budget) || request.max_budget <= 0 ||
      request.required_services.length === 0 || (Number(request.start_time.slice(0, 2)) * 60 +
        Number(request.start_time.slice(3, 5)) + request.duration_hours * 60 > 1440)) {
      this.mcpError.set('Enter a valid time, duration, budget and service selection before matching.');
      this.mcpLoading.set(false);
      return;
    }
    this.mcpLoading.set(true);
    this.mcpError.set(null);
    try {
      const result = await this.mcp.aiSearchProviders({
        ...request,
        confirmed: true,
      }, 5);

      // Ignore responses for an older search if the user changed the criteria.
      if (sequence !== this.searchSequence) return;
      this.inferenceMode.set(result.mode === 'ai' ? 'ai' : 'deterministic_fallback');
      if (result.matches && result.matches.length > 0) {
        this.mcpMatches.set(result.matches);
        const saved = this.bookingSession.current();
        const wanted = saved?.selectedProviderId;
        const selection = wanted && result.matches.some(p => p.provider_id === wanted)
          ? wanted : result.matches[0].provider_id;
        this.selectedId.set(selection);
        if (selection !== wanted) {
          this.bookingSession.selectProvider(selection);
          this.confirmed.set(false);
        }
      } else {
        this.mcpMatches.set([]);
        this.alternatives.set(result.alternatives ?? []);
        if (restoreSelection && this.reviewedAlternativeId() &&
          !(result.alternatives ?? []).some(a => a.provider_id === this.reviewedAlternativeId())) {
          this.reviewedAlternativeId.set('');
        }
        if (result.status === 'needs_clarification' || result.status === 'invalid_request') {
          this.mcpError.set(result.question?.text ?? 'Please correct the search criteria.');
        }
      }
    } catch (err: any) {
      console.warn('MCP search failed, falling back:', err);
      if (sequence === this.searchSequence) this.mcpError.set(err.message || 'MCP server connection error');
    } finally {
      if (sequence === this.searchSequence) this.mcpLoading.set(false);
    }
  }

  /**
   * Call live MCP explain tool: carekaki_explain_matching
   */
  async toggleDiagnostics() {
    this.showDiagnostics.update(v => !v);
    if (this.showDiagnostics() && this.mcpDiagnostics().length === 0) {
      this.diagnosticsLoading.set(true);
      try {
        const result = await this.mcp.explainMatching({
          ...this.searchRequest(),
          confirmed: true,
        });
        this.mcpDiagnostics.set(result.diagnostics || []);
      } catch (err: any) {
        console.warn('Diagnostics failed:', err);
      } finally {
        this.diagnosticsLoading.set(false);
      }
    }
  }

  selectCandidate(id: string) {
    this.selectedId.set(id);
    this.confirmed.set(false);
    this.bookingSession.selectProvider(id);
  }

  selectAlternativeForReview(id: string) {
    if (!this.alternatives().some(a => a.provider_id === id)) return;
    this.reviewedAlternativeId.set(id);
    this.confirmed.set(false);
    this.bookingSession.selectAlternativeForReview(id);
  }

  confirmSelection() {
    if (!this.selectedMcp() || this.activeTab() !== 'mcp') return;
    this.confirmed.set(true);
    this.bookingSession.confirmProvider(this.selectedId());
  }

  readonly selectedSpec = computed<MatchedCandidate | undefined>(() =>
    this.specCandidates.find(c => c.caregiver_id === this.selectedId())
  );

  readonly selectedMcp = computed<McpProviderMatch | undefined>(() =>
    this.mcpMatches().find(c => c.provider_id === this.selectedId())
  );

  /** Weighted contribution of each factor for a candidate */
  contributions(c: MatchedCandidate) {
    return [
      { key: 'Proximity', weight: '40%', raw: c.score_breakdown.proximity_score, points: c.score_breakdown.proximity_score * this.weights.proximity, color: 'teal' },
      { key: 'Skill Match', weight: '35%', raw: c.score_breakdown.skill_score, points: c.score_breakdown.skill_score * this.weights.skill, color: 'blue' },
      { key: 'Availability', weight: '25%', raw: c.score_breakdown.availability_score, points: c.score_breakdown.availability_score * this.weights.availability, color: 'purple' },
    ];
  }

  mcpContributions(c: McpProviderMatch) {
    const cost = c.estimated_cost;
    const maxBudget = Number(this.searchBudget());
    const ratingScore = (c.rating / 5) * 100;
    const affordabilityScore = Math.max(0, (1 - cost / maxBudget) * 100);
    const langScore = !this.searchLanguage() ? 50 : (c.preferred_language_match ? 100 : 0);

    return [
      { key: 'Rating', weight: '50%', raw: ratingScore, points: ratingScore * 0.50, color: 'teal' },
      { key: 'Affordability', weight: '35%', raw: affordabilityScore, points: affordabilityScore * 0.35, color: 'blue' },
      { key: 'Language', weight: '15%', raw: langScore, points: langScore * 0.15, color: 'purple' },
    ];
  }

  scoreClass(score: number): string {
    if (score >= 90) return 'score-excellent';
    if (score >= 75) return 'score-good';
    if (score >= 50) return 'score-fair';
    return 'score-low';
  }

  rankLabel(rank: number): string {
    return rank === 1 ? 'Best Match' : `Rank ${rank}`;
  }

  certList(certifications: string): string[] {
    return certifications.split(',').map(c => c.trim());
  }

  initials(name: string): string {
    const parts = name.split(' ').filter(p => !p.includes('/') && p.length > 1);
    return parts.slice(0, 2).map(p => p[0]).join('').toUpperCase();
  }

  formatDate(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }

  formatMYR(n: number): string {
    return this.data.formatMYR(n);
  }

  get payloadJson(): string {
    return JSON.stringify(this.handoff, null, 2);
  }

  copyPayload() {
    navigator.clipboard.writeText(this.payloadJson);
  }
}
