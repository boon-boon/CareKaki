import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../shared/icon/icon';
import { MockDataService } from '../../core/services/mock-data.service';
import { CareBookingSessionService } from '../../core/services/care-booking-session.service';
import { Caregiver, JobOrder, WhatsAppMessage } from '../../core/models';

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

@Component({
  selector: 'app-job-order-view',
  standalone: true,
  imports: [RouterLink, IconComponent],
  templateUrl: './job-order-view.html',
  styleUrl: './job-order-view.scss',
})
export class JobOrderView {
  private readonly data = inject(MockDataService);
  private readonly bookingSession = inject(CareBookingSessionService);

  /**
   * Live documents derived from the cross-route booking session.
   *
   * Falls back to the static `sampleJobOrder` / `sampleWhatsApp` ONLY when there
   * is no pending session (direct deep-link to /job-orders). Fields that the
   * session does not carry (checklist, equipment, emergency contacts, special
   * instructions) are reused from the static template document.
   */
  readonly jobOrder: JobOrder = this.buildJobOrder();
  readonly whatsapp: WhatsAppMessage = this.buildWhatsApp(this.jobOrder);

  readonly activeTab = signal<'job-order' | 'whatsapp'>('job-order');
  readonly checkedItems = signal<Set<number>>(new Set());
  readonly copied = signal(false);

  formatDate(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  toggleCheck(i: number) {
    const set = new Set(this.checkedItems());
    if (set.has(i)) set.delete(i);
    else set.add(i);
    this.checkedItems.set(set);
  }

  isChecked(i: number): boolean {
    return this.checkedItems().has(i);
  }

  get progress(): number {
    return Math.round((this.checkedItems().size / this.jobOrder.checklist.length) * 100);
  }

  copyMessage() {
    navigator.clipboard?.writeText(this.whatsapp.message_text);
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

  private buildJobOrder(): JobOrder {
    const session = this.bookingSession.current();

    // ------------------------------------------------------------------
    // Explicit fallback: no live booking session → static demo document.
    // ------------------------------------------------------------------
    if (!session) {
      return this.data.sampleJobOrder;
    }

    const request = session.matchingRequest ?? session.request;
    const intake = session.intake;
    const template = this.data.sampleJobOrder;

    const hours = request.duration_hours > 0 ? request.duration_hours : 1;
    const scheduleDates = this.resolveScheduleDates(session, request);
    const startDate = request.date || scheduleDates[0] || intake.start_date || '';
    const shiftStart = request.start_time || intake.shift_hours?.start || '09:00';
    const shiftEnd = this.addHours(shiftStart, hours);
    const shiftDays = this.shiftDaysLabel(session, request, scheduleDates);

    const provider = this.resolveProvider(session.selectedProviderId);

    return {
      job_order_id: this.jobOrderId(session.intakeId, startDate, provider?.caregiver_id ?? session.selectedProviderId),
      date_issued: this.todayIso(),
      caregiver_name: provider?.name ?? 'Caregiver to be assigned',
      caregiver_id: provider?.caregiver_id ?? (session.selectedProviderId ?? 'TBD'),
      caregiver_certifications: provider
        ? provider.certifications.split('|').map(c => c.trim()).join(', ')
        : '',
      client_name: template.client_name,
      patient_conditions: intake.patient_conditions || template.patient_conditions,
      service_address: request.location || intake.location || template.service_address,
      shift_days: shiftDays,
      shift_start: shiftStart,
      shift_end: shiftEnd,
      duration_hours: hours,
      start_date: startDate,
      expected_duration: template.expected_duration,
      special_instructions: template.special_instructions,
      equipment_list: template.equipment_list,
      emergency_contacts: template.emergency_contacts,
      checklist: template.checklist,
    };
  }

  private buildWhatsApp(jobOrder: JobOrder): WhatsAppMessage {
    const session = this.bookingSession.current();

    // Explicit fallback: no live session → static demo message.
    if (!session) {
      return this.data.sampleWhatsApp;
    }

    const request = session.matchingRequest ?? session.request;
    const intake = session.intake;
    const serviceLabel = this.serviceLabel(request.required_services[0] ?? intake.service_type);

    const text = `Hello ${jobOrder.caregiver_name},

You have been assigned a new care assignment:

Client: ${jobOrder.client_name}
Location: ${jobOrder.service_address}
Service Type: ${serviceLabel}
Patient Condition: ${jobOrder.patient_conditions}
Shift: ${jobOrder.shift_days}, ${jobOrder.shift_start}–${jobOrder.shift_end}
Start Date: ${jobOrder.start_date}

Please confirm your availability by replying to this message.

Job Order ID: ${jobOrder.job_order_id}`;

    return {
      message_id: `WA-${jobOrder.job_order_id.replace(/^JO-/, '')}`,
      recipient_name: jobOrder.caregiver_name,
      recipient_id: jobOrder.caregiver_id,
      message_text: text,
      char_count: text.length,
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

  private resolveScheduleDates(
    session: ReturnType<CareBookingSessionService['current']>,
    request: { schedule_dates?: string[] },
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
      if (days.join(',') === 'Mon,Tue,Wed,Thu,Fri') return 'Mon, Tue, Wed, Thu, Fri';
      if (days.join(',') === 'Sat,Sun') return 'Sat, Sun';
      return days.join(', ');
    }
    if (scheduleDates.length > 1) return `${scheduleDates.length} scheduled visits`;
    return 'Single visit';
  }

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

  private jobOrderId(intakeId: string, startDate: string, caregiverId: string | null): string {
    const compactDate = (startDate || this.todayIso()).replace(/-/g, '');
    const suffix = ((caregiverId ?? 'GEN').replace(/[^A-Za-z0-9]/g, '').slice(-3) || 'GEN').toUpperCase();
    const intakeSuffix = intakeId.replace(/[^0-9]/g, '').slice(-3) || '001';
    return `JO-${compactDate}-${intakeSuffix}${suffix}`;
  }

  private todayIso(): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    const get = (part: string) => parts.find(p => p.type === part)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  }
}
