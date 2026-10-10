import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../shared/icon/icon';
import { MockDataService } from '../../core/services/mock-data.service';
import { DashboardKPI, ActivityItem } from '../../core/models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, IconComponent],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  private readonly data = inject(MockDataService);

  readonly kpis: DashboardKPI[] = this.data.dashboardKPIs;
  readonly activity: ActivityItem[] = this.data.activityFeed;
  readonly caregivers = this.data.caregivers;
  readonly zones = this.data.zoneReference;

  /** Caregiver count grouped by availability status */
  get availabilityBreakdown() {
    const counts = { available: 0, on_assignment: 0, on_leave: 0 };
    for (const c of this.caregivers) {
      counts[c.availability_status]++;
    }
    return [
      { label: 'Available', value: counts.available, color: 'green' as const },
      { label: 'On Assignment', value: counts.on_assignment, color: 'amber' as const },
      { label: 'On Leave', value: counts.on_leave, color: 'red' as const },
    ];
  }

  /** Distribution of caregivers per zone */
  get zoneDistribution() {
    const map = new Map<string, number>();
    for (const c of this.caregivers) {
      map.set(c.primary_zone, (map.get(c.primary_zone) ?? 0) + 1);
    }
    const max = Math.max(...map.values());
    return Array.from(map.entries())
      .map(([zone, count]) => ({
        zone,
        count,
        pct: Math.round((count / max) * 100),
      }))
      .sort((a, b) => b.count - a.count);
  }

  /** Total caregivers count for donut */
  get totalCaregivers(): number {
    return this.caregivers.length;
  }

  /** Donut chart segments — circumference of r=15.9 is ~99.9 */
  get donutSegments(): { label: string; color: string; dash: string; offset: string }[] {
    const total = this.totalCaregivers;
    const circumference = 99.9;
    const colorMap: Record<string, string> = {
      green: 'var(--green-500)',
      amber: 'var(--amber-500)',
      red: 'var(--red-500)',
    };
    let acc = 0;
    return this.availabilityBreakdown.map(seg => {
      const len = (seg.value / total) * circumference;
      const segObj = {
        label: seg.label,
        color: colorMap[seg.color],
        dash: `${len} ${circumference - len}`,
        offset: `${-acc}`,
      };
      acc += len;
      return segObj;
    });
  }

  activityIcon(type: ActivityItem['type']): string {
    switch (type) {
      case 'intake': return 'intake';
      case 'match': return 'match';
      case 'quotation': return 'file-text';
      case 'job_order': return 'clipboard';
      case 'dispatch': return 'message';
      default: return 'activity';
    }
  }

  activityColor(type: ActivityItem['type']): string {
    switch (type) {
      case 'intake': return 'blue';
      case 'match': return 'teal';
      case 'quotation': return 'purple';
      case 'job_order': return 'amber';
      case 'dispatch': return 'green';
      default: return 'gray';
    }
  }

  formatMYR(n: number): string {
    return this.data.formatMYR(n);
  }
}
