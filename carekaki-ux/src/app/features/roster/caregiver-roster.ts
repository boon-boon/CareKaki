import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IconComponent } from '../../shared/icon/icon';
import { MockDataService } from '../../core/services/mock-data.service';
import { CareKakiMcpService } from '../../core/services/carekaki-mcp.service';
import { Caregiver, AvailabilityStatus } from '../../core/models';

@Component({
  selector: 'app-caregiver-roster',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  templateUrl: './caregiver-roster.html',
  styleUrl: './caregiver-roster.scss',
})
export class CaregiverRoster implements OnInit {
  private readonly data = inject(MockDataService);
  protected readonly mcp = inject(CareKakiMcpService);

  // Active roster tab: 'mcp' (live MCP CSV) vs 'staff' (12 staff caregivers from spec)
  readonly rosterTab = signal<'mcp' | 'staff'>('mcp');

  // MCP Catalogue state
  readonly mcpProviders = signal<any[]>([]);
  readonly mcpLoading = signal(false);
  readonly mcpCityFilter = signal<string>('all');
  readonly mcpServiceFilter = signal<string>('all');
  readonly mcpVerifiedOnly = signal<boolean>(false);
  readonly mcpMaxRate = signal<number>(Number.POSITIVE_INFINITY);
  readonly catalogueCities = signal<string[]>([]);
  readonly catalogueServices = signal<string[]>([]);
  readonly catalogueMaxRate = signal(0);
  readonly catalogueTotal = signal(0);
  formatService(code: string): string { return code.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '); }
  async loadCatalogueFilters() {
    try {
      const [options, catalogue] = await Promise.all([this.mcp.getSearchOptions(), this.mcp.listProviders({ limit: 100 })]);
      this.catalogueCities.set(options.locations);
      this.catalogueServices.set(options.service_codes);
      this.catalogueTotal.set(catalogue.total_providers);
      const max = Math.max(1, ...catalogue.providers.map(p => Number(p.hourly_rate) || 0));
      this.catalogueMaxRate.set(max);
      if (!Number.isFinite(this.mcpMaxRate())) {
        this.mcpMaxRate.set(max);
        await this.loadMcpProviders();
      }
    } catch (error) { console.warn('Catalogue filter discovery failed:', error); }
  }

  // Staff Roster state
  readonly searchTerm = signal('');
  readonly zoneFilter = signal<string>('all');
  readonly statusFilter = signal<string>('all');
  readonly certFilter = signal<string>('all');
  readonly viewMode = signal<'table' | 'grid'>('table');

  readonly allCaregivers: Caregiver[] = this.data.caregivers;

  ngOnInit() {
    void this.loadCatalogueFilters();
    this.loadMcpProviders();
  }

  setTab(tab: 'mcp' | 'staff') {
    this.rosterTab.set(tab);
    if (tab === 'mcp' && this.mcpProviders().length === 0) {
      this.loadMcpProviders();
    }
  }

  /**
   * Load providers from MCP tool: carekaki_list_providers
   */
  async loadMcpProviders() {
    this.mcpLoading.set(true);
    try {
      const filters: Record<string, any> = {
        ...(Number.isFinite(this.mcpMaxRate()) ? { max_hourly_rate: Number(this.mcpMaxRate()) } : {}),
        verified_only: this.mcpVerifiedOnly(),
        limit: 50,
      };
      if (this.mcpCityFilter() !== 'all') {
        filters['location'] = this.mcpCityFilter();
      }
      if (this.mcpServiceFilter() !== 'all') {
        filters['service'] = this.mcpServiceFilter();
      }

      const res = await this.mcp.listProviders(filters);
      this.mcpProviders.set(res.providers || []);
    } catch (err) {
      console.warn('Failed to load MCP providers, using fallback:', err);
    } finally {
      this.mcpLoading.set(false);
    }
  }

  /** Unique zones derived from roster */
  get zones(): string[] {
    return [...new Set(this.allCaregivers.map(c => c.primary_zone))].sort();
  }

  /** Unique certification keywords */
  get certifications(): string[] {
    const set = new Set<string>();
    for (const c of this.allCaregivers) {
      c.certifications.split('|').forEach(cert => set.add(cert.trim()));
    }
    return [...set].sort();
  }

  /** Filtered caregiver list */
  readonly filtered = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    const zone = this.zoneFilter();
    const status = this.statusFilter();
    const cert = this.certFilter();

    return this.allCaregivers.filter(c => {
      if (term && !(
        c.name.toLowerCase().includes(term) ||
        c.caregiver_id.toLowerCase().includes(term) ||
        c.certifications.toLowerCase().includes(term) ||
        c.primary_zone.toLowerCase().includes(term)
      )) return false;
      if (zone !== 'all' && c.primary_zone !== zone) return false;
      if (status !== 'all' && c.availability_status !== status) return false;
      if (cert !== 'all' && !c.certifications.includes(cert)) return false;
      return true;
    });
  });

  readonly activeFilterCount = computed(() => {
    let n = 0;
    if (this.searchTerm()) n++;
    if (this.zoneFilter() !== 'all') n++;
    if (this.statusFilter() !== 'all') n++;
    if (this.certFilter() !== 'all') n++;
    return n;
  });

  get summary() {
    const all = this.allCaregivers;
    return {
      total: all.length,
      available: all.filter(c => c.availability_status === 'available').length,
      avgRate: this.data.formatMYR(all.reduce((s, c) => s + c.hourly_rate_myr, 0) / all.length),
    };
  }

  get mcpSummary() {
    const all = this.mcpProviders();
    const total = all.length;
    const verified = all.filter(p => p.verified).length;
    const avg = total > 0 ? (all.reduce((s, p) => s + (p.hourly_rate || 0), 0) / total) : 0;
    return {
      total,
      verified,
      avgRate: 'RM ' + avg.toFixed(2),
    };
  }

  certList(certifications: string): string[] {
    return (certifications || '').split('|').map(c => c.trim());
  }

  statusLabel(status: AvailabilityStatus): string {
    switch (status) {
      case 'available': return 'Available';
      case 'on_assignment': return 'On Assignment';
      case 'on_leave': return 'On Leave';
    }
  }

  statusClass(status: AvailabilityStatus): string {
    switch (status) {
      case 'available': return 'badge-green';
      case 'on_assignment': return 'badge-amber';
      case 'on_leave': return 'badge-red';
    }
  }

  initials(name: string): string {
    const parts = (name || '').split(' ').filter(p => !p.includes('/') && p.length > 1);
    return parts.slice(0, 2).map(p => p[0]).join('').toUpperCase();
  }

  avatarColor(id: string): string {
    const colors = ['teal', 'blue', 'purple', 'amber', 'green', 'red'];
    const n = parseInt(id.replace(/\D/g, ''), 10) || 0;
    return colors[n % colors.length];
  }

  formatMYR(n: number): string {
    return this.data.formatMYR(n);
  }

  resetFilters() {
    this.searchTerm.set('');
    this.zoneFilter.set('all');
    this.statusFilter.set('all');
    this.certFilter.set('all');
  }

  resetMcpFilters() {
    this.mcpCityFilter.set('all');
    this.mcpServiceFilter.set('all');
    this.mcpVerifiedOnly.set(false);
    this.mcpMaxRate.set(this.catalogueMaxRate());
    this.loadMcpProviders();
  }
}
