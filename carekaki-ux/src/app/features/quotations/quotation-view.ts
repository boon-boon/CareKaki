import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../shared/icon/icon';
import { MockDataService } from '../../core/services/mock-data.service';
import { CareBookingSessionService } from '../../core/services/care-booking-session.service';
import { CareKakiMcpService } from '../../core/services/carekaki-mcp.service';
import { Caregiver, Quotation, QuotationLineItem } from '../../core/models';

/** Human-readable labels for the service codes used across the intake/MCP flow. */
const SERVICE_LABELS: Record<string, string> = {
  elderly_care: 'Elderly Care',
  home_care: 'Home Care',
  nursing: 'Nursing',
  transport: 'Transport',
  companionship: 'Companionship',
  mobility_assistance: 'Mobility Assistance',
  dementia_care: 'Dementia Care',
};

/** Maps a service code onto a key in MockDataService.pricingMatrix.service_base_rates. */
const SERVICE_TO_PRICING_KEY: Record<string, string> = {
  elderly_care: 'home_care',
  mobility_assistance: 'home_care',
  dementia_care: 'nursing',
  companionship: 'companionship',
  home_care: 'home_care',
  nursing: 'nursing',
  transport: 'transport',
};

const DEFAULT_SST_RATE = 0.08;

@Component({
  selector: 'app-quotation-view',
  standalone: true,
  imports: [RouterLink, IconComponent],
  templateUrl: './quotation-view.html',
  styleUrl: './quotation-view.scss',
})
export class QuotationView {
  private readonly data = inject(MockDataService);
  private readonly bookingSession = inject(CareBookingSessionService);
  private readonly mcp = inject(CareKakiMcpService);

  /**
   * Live document derived from the cross-route booking session.
   *
   * Falls back to the static `sampleQuotation` ONLY when there is no pending
   * session (e.g. the user opens /quotations directly without going through
   * Intake → Matching). This fallback is intentional and keeps the page from
   * rendering blank in demo deep-link scenarios.
   */
  quotation: Quotation = this.buildQuotation();
  readonly quotationLoading = signal(!!this.bookingSession.current()?.selectedProviderId);
  readonly quotationError = signal<string | null>(null);

  constructor() {
    if (this.quotationLoading()) void this.loadLiveQuotation();
  }

  private async loadLiveQuotation(): Promise<void> {
    const id = this.bookingSession.current()?.selectedProviderId;
    if (!id) { this.quotationLoading.set(false); return; }
    try {
      const response = await this.mcp.getProvider(id);
      const provider = response.provider;
      if (response.status !== 'found' || !provider || provider.provider_id !== id ||
          !Number.isFinite(provider.hourly_rate) || provider.hourly_rate <= 0) {
        throw new Error('Selected caregiver could not be resolved to a valid rate.');
      }
      this.quotation = this.buildQuotation({ id, name: provider.name, hourlyRate: provider.hourly_rate });
    } catch (error) {
      this.quotationError.set('Unable to load the selected caregiver’s live hourly rate. Please reconnect and reopen this quotation.');
      console.warn('Live quotation pricing unavailable:', error);
    } finally {
      this.quotationLoading.set(false);
    }
  }

  readonly copied = signal(false);

  readonly terms = [
    'Quotation valid for 7 days from issue date.',
    'Cancellation within 24 hours of shift start incurs 50% charge.',
    'Rates are inclusive of caregiver transport within primary zone.',
    'SST at 8% is applied per Malaysian tax regulations.',
  ];

  formatMYR(n: number): string {
    return this.data.formatMYR(n);
  }

  formatDate(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  copyQuotation() {
    const q = this.quotation;
    const text = `CLIENT QUOTATION
Quotation ID: ${q.quotation_id}
Date Issued: ${q.date_issued}
Valid Until: ${q.valid_until}

Client: ${q.client_name}
Service: ${this.serviceLabel(q.service_type)}
Caregiver: ${q.caregiver_name} (${q.caregiver_id})
Shift: ${q.shift_days}, ${q.shift_start}–${q.shift_end}
Start Date: ${q.start_date}

Subtotal: ${this.formatMYR(q.subtotal)}
SST (8%): ${this.formatMYR(q.sst_amount)}
Total Payable: ${this.formatMYR(q.total)}`;
    navigator.clipboard?.writeText(text);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }

  /** Humanizes a service code, e.g. `elderly_care` → "Elderly Care". */
  serviceLabel(code: string): string {
    if (!code) return 'Care Service';
    return SERVICE_LABELS[code] ?? code
      .split('_')
      .filter(part => part.length > 0)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private round2(n: number): number {
    return Math.round(n * 100) / 100;
  }

  /**
   * Builds a Quotation from the live session, or the static sample fallback.
   *
   * Field sourcing from CareBookingSessionService.current():
   *  - request.location          → service_address context
   *  - request.required_services → service_type + line-item descriptions
   *  - request.start_time        → shift_start
   *  - request.duration_hours    → shift_end / duration / hours
   *  - request.date / schedule   → start_date / shift_days / num_days
   *  - selectedProviderId        → caregiver_name/id/certifications + billable rate
   */
  private buildQuotation(mcpProvider?: { id: string; name: string; hourlyRate: number }): Quotation {
    const session = this.bookingSession.current();

    // ------------------------------------------------------------------
    // Explicit fallback: no live booking session → static demo document.
    // ------------------------------------------------------------------
    if (!session) {
      return this.data.sampleQuotation;
    }

    const request = session.matchingRequest ?? session.request;
    const intake = session.intake;

    const services = request.required_services.length > 0
      ? request.required_services
      : ['nursing'];
    const primaryService = services[0];
    const serviceTypeLabel = this.serviceLabel(primaryService);

    const hours = request.duration_hours > 0 ? request.duration_hours : 1;
    const scheduleDates = this.resolveScheduleDates(session, request);
    const days = scheduleDates.length > 0 ? scheduleDates.length : 1;
    const startDate = request.date || scheduleDates[0] || intake.start_date || '';
    const shiftStart = request.start_time || intake.shift_hours?.start || '09:00';
    const shiftEnd = this.addHours(shiftStart, hours);

    const shiftDays = this.shiftDaysLabel(session, request, scheduleDates);

    // Resolve the confirmed provider against the roster (single source of truth).
    const provider = this.resolveProvider(session.selectedProviderId);
    const caregiverName = mcpProvider?.name ?? provider?.name ?? 'Caregiver to be assigned';
    const caregiverId = mcpProvider?.id ?? provider?.caregiver_id ?? (session.selectedProviderId ?? 'TBD');
    const caregiverCertifications = provider
      ? provider.certifications.split('|').map(c => c.trim()).join(', ')
      : '';

    // Billable rate = higher of pricing-matrix base rate or caregiver hourly rate.
    const baseRate = this.baseRateFor(primaryService);
    const caregiverRate = mcpProvider?.hourlyRate ?? provider?.hourly_rate_myr ?? 0;
    const rate = this.round2(mcpProvider ? caregiverRate : Math.max(baseRate, caregiverRate, 0));

    const lineItems: QuotationLineItem[] = services.map(code => {
      const label = this.serviceLabel(code);
      const codeBase = this.baseRateFor(code);
      const lineRate = this.round2(mcpProvider ? caregiverRate : Math.max(codeBase, caregiverRate, 0));
      const subtotal = this.round2(lineRate * hours * days);
      return {
        description: `${label} — ${hours}h/day, ${shiftDays}`,
        rate_myr: lineRate,
        hours,
        days,
        subtotal_myr: subtotal,
      };
    });

    const subtotal = this.round2(
      lineItems.reduce((sum, item) => sum + item.subtotal_myr, 0),
    );
    const sstRate = this.data.pricingMatrix?.tax?.rate ?? DEFAULT_SST_RATE;
    const sst = this.round2(subtotal * sstRate);

    const today = this.todayIso();

    return {
      quotation_id: this.quotationId(session.intakeId, startDate, caregiverId),
      date_issued: today,
      valid_until: this.addDays(today, 7),
      client_name: 'Care Recipient',
      client_contact: '',
      service_address: request.location || intake.location || '',
      service_type: primaryService,
      caregiver_name: caregiverName,
      caregiver_id: caregiverId,
      caregiver_certifications: caregiverCertifications,
      shift_days: shiftDays,
      shift_start: shiftStart,
      shift_end: shiftEnd,
      start_date: startDate,
      line_items: lineItems,
      subtotal,
      sst_amount: sst,
      total: this.round2(subtotal + sst),
      billable_rate: rate,
      duration_hours: hours,
      num_days: days,
    };
  }

  /** Resolves the selected provider id against the roster, then spec candidates. */
  private resolveProvider(selectedProviderId: string | null): Caregiver | null {
    if (!selectedProviderId) return null;
    const roster = this.data.caregivers.find(c => c.caregiver_id === selectedProviderId);
    if (roster) return roster;
    const spec = this.data.matchedCandidates.find(c => c.caregiver_id === selectedProviderId);
    if (spec) {
      return {
        caregiver_id: spec.caregiver_id,
        name: spec.name,
        certifications: spec.certifications.replace(/,/g, '|'),
        primary_zone: spec.primary_zone,
        hourly_rate_myr: spec.hourly_rate_myr,
        availability_status: spec.availability_status,
      };
    }
    return null;
  }

  /** Base hourly rate for a service code from the pricing matrix (0 if unknown). */
  private baseRateFor(code: string): number {
    const key = SERVICE_TO_PRICING_KEY[code] ?? code;
    return this.data.pricingMatrix?.service_base_rates?.[key]?.base_hourly_rate ?? 0;
  }

  /** Concrete recurring dates if any; otherwise empty (single visit). */
  private resolveScheduleDates(
    session: ReturnType<CareBookingSessionService['current']>,
    request: { schedule_dates?: string[]; schedule_days?: string[] },
  ): string[] {
    if (!session) return [];
    const requestDates = request.schedule_dates ?? [];
    if (requestDates.length > 0) return [...requestDates];
    if (session.scheduleDates.length > 0) return [...session.scheduleDates];
    if (session.intake.schedule_dates && session.intake.schedule_dates.length > 0) {
      return [...session.intake.schedule_dates];
    }
    return [];
  }

  private shiftDaysLabel(
    session: ReturnType<CareBookingSessionService['current']>,
    request: { schedule_days?: string[] },
    scheduleDates: string[],
  ): string {
    const days = request.schedule_days?.length
      ? request.schedule_days
      : (session?.intake.schedule_days ?? []);
    if (days.length > 0) {
      if (days.join(',') === 'Mon,Tue,Wed,Thu,Fri') return 'Mon–Fri';
      if (days.join(',') === 'Sat,Sun') return 'Sat–Sun';
      return days.join(', ');
    }
    if (scheduleDates.length > 1) return `${scheduleDates.length} scheduled visits`;
    return 'Single visit';
  }

  /** Adds hours to an HH:mm time, clamping within the same day. */
  private addHours(start: string, hours: number): string {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(start);
    if (!match) return '';
    const totalMinutes = Math.min(
      Number(match[1]) * 60 + Number(match[2]) + Math.round(hours * 60),
      23 * 60 + 59,
    );
    const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
    const mm = String(totalMinutes % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  private quotationId(intakeId: string, startDate: string, caregiverId: string): string {
    const compactDate = (startDate || this.todayIso()).replace(/-/g, '');
    const suffix = (caregiverId.replace(/[^A-Za-z0-9]/g, '').slice(-3) || 'GEN').toUpperCase();
    const intakeSuffix = intakeId.replace(/[^0-9]/g, '').slice(-3) || '001';
    return `QT-${compactDate}-${intakeSuffix}${suffix}`;
  }

  private todayIso(): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    const get = (part: string) => parts.find(p => p.type === part)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  }

  private addDays(iso: string, amount: number): string {
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return iso;
    d.setDate(d.getDate() + amount);
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(d);
    const get = (part: string) => parts.find(p => p.type === part)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  }
}
