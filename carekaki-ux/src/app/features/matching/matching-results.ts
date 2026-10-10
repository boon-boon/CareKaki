import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe, CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IconComponent } from '../../shared/icon/icon';
import { MockDataService } from '../../core/services/mock-data.service';
import { CareKakiMcpService } from '../../core/services/carekaki-mcp.service';
import { MatchedCandidate, McpProviderMatch, McpDiagnostic } from '../../core/models';

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

  readonly intake = this.data.sampleIntake;
  readonly specCandidates: MatchedCandidate[] = this.data.matchedCandidates;
  readonly handoff = this.data.handoffPayload;

  // Active Mode: 'mcp' (live MCP server) vs 'spec' (hardcoded spec reference)
  readonly activeTab = signal<'mcp' | 'spec'>('mcp');

  // MCP live search state
  readonly mcpMatches = signal<McpProviderMatch[]>([]);
  readonly mcpLoading = signal(false);
  readonly mcpError = signal<string | null>(null);
  readonly mcpDiagnostics = signal<McpDiagnostic[]>([]);
  readonly showDiagnostics = signal(false);
  readonly diagnosticsLoading = signal(false);

  // Search parameters for live MCP query
  readonly searchCity = signal('Petaling Jaya');
  readonly searchDate = signal('2026-10-17');
  readonly searchTime = signal('09:00');
  readonly searchDuration = signal(2);
  readonly searchService = signal('elderly_care');
  readonly searchBudget = signal(200);
  readonly searchLanguage = signal('');

  readonly selectedId = signal<string>('CK002');
  readonly showPayload = signal(false);
  readonly confirmed = signal(false);

  /** Recurring schedule dates carried over from the Intake view (if any). */
  readonly scheduleDates = signal<string[]>([]);

  /** Scoring weights per spec */
  readonly weights = { proximity: 0.40, skill: 0.35, availability: 0.25 };

  private static readonly CITY_OPTIONS = ['Petaling Jaya', 'Subang Jaya', 'Kuala Lumpur', 'Shah Alam', 'Cheras'];

  ngOnInit() {
    this.seedFromIntake();
    this.runMcpSearch();
  }

  /** Apply the intake entities + recurring schedule chosen on the Intake page. */
  private seedFromIntake() {
    const ai = this.data.activeIntake();
    if (!ai) return;
    const zone = ai.location_zone || ai.location || '';
    const city = MatchingResults.CITY_OPTIONS.find(c => zone.includes(c)) || MatchingResults.CITY_OPTIONS.find(c => (ai.location || '').includes(c));
    if (city) this.searchCity.set(city);
    if (ai.start_date) this.searchDate.set(ai.start_date);
    if (ai.shift_hours?.start) this.searchTime.set(ai.shift_hours.start);
    if (ai.shift_hours?.duration_hours) this.searchDuration.set(ai.shift_hours.duration_hours);
    if (ai.required_services?.length) this.searchService.set(ai.required_services[0]);
    if (ai.max_budget) this.searchBudget.set(ai.max_budget);
    this.scheduleDates.set(this.data.activeScheduleDates());
  }

  /** Switch the active search date to one of the recurring schedule dates. */
  useScheduleDate(iso: string) {
    this.searchDate.set(iso);
    this.runMcpSearch();
  }

  shortDate(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short' });
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
  async runMcpSearch() {
    this.mcpLoading.set(true);
    this.mcpError.set(null);
    try {
      const result = await this.mcp.searchProviders({
        location: this.searchCity(),
        date: this.searchDate(),
        start_time: this.searchTime(),
        duration_hours: Number(this.searchDuration()),
        required_services: [this.searchService()],
        max_budget: Number(this.searchBudget()),
        preferred_language: this.searchLanguage(),
        confirmed: true,
      }, 5);

      if (result.matches && result.matches.length > 0) {
        this.mcpMatches.set(result.matches);
        this.selectedId.set(result.matches[0].provider_id);
      } else {
        this.mcpMatches.set([]);
      }
    } catch (err: any) {
      console.warn('MCP search failed, falling back:', err);
      this.mcpError.set(err.message || 'MCP server connection error');
    } finally {
      this.mcpLoading.set(false);
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
          location: this.searchCity(),
          date: this.searchDate(),
          start_time: this.searchTime(),
          duration_hours: Number(this.searchDuration()),
          required_services: [this.searchService()],
          max_budget: Number(this.searchBudget()),
          preferred_language: this.searchLanguage(),
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
  }

  confirmSelection() {
    this.confirmed.set(true);
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
