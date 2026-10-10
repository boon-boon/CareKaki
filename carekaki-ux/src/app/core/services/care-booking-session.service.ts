import { Injectable, signal } from '@angular/core';
import { IntakeEntities, McpValidationResult } from '../models';

export type ConfirmedCareRequest = NonNullable<McpValidationResult['request']>;

export interface CareBookingSession {
  intake: IntakeEntities;
  request: ConfirmedCareRequest;
  matchingRequest: ConfirmedCareRequest;
  scheduleDates: string[];
  rawInput: string;
  intakeId: string;
  selectedProviderId: string | null;
  reviewedAlternativeId?: string | null;
  selectionConfirmed: boolean;
}

/** Keeps one unfinished demo booking across routes and refreshes in the same tab.
 * No booking is made by this service. Never persist this demo data to localStorage.
 */
@Injectable({ providedIn: 'root' })
export class CareBookingSessionService {
  private readonly key = 'carekaki:pending-booking:v1';
  readonly current = signal<CareBookingSession | null>(this.restore());

  private restore(): CareBookingSession | null {
    try {
      const stored = sessionStorage.getItem(this.key);
      if (!stored) return null;
      const session: CareBookingSession = JSON.parse(stored);
      const req = session?.request;
      if (!req || !session.intake?.shift_hours ||
        typeof req.location !== 'string' || !Array.isArray(req.required_services) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(req.date) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(req.start_time) ||
        typeof req.duration_hours !== 'number' || req.duration_hours <= 0 ||
        typeof req.max_budget !== 'number' || req.max_budget <= 0) return null;
      return {
        ...session,
        matchingRequest: session.matchingRequest ?? req,
        scheduleDates: Array.isArray(session.scheduleDates) ? session.scheduleDates : [],
        rawInput: session.rawInput ?? '',
        intakeId: session.intakeId ?? '',
        selectedProviderId: session.selectedProviderId ?? null,
        reviewedAlternativeId: session.reviewedAlternativeId ?? null,
        selectionConfirmed: session.selectionConfirmed === true,
      };
    } catch {
      return null; // Unavailable storage or outdated/corrupt payload
    }
  }

  private persist(next: CareBookingSession): void {
    this.current.set(next);
    try {
      sessionStorage.setItem(this.key, JSON.stringify(next));
    } catch {
      // Cross-route navigation still works through the in-memory signal.
    }
  }

  begin(intake: IntakeEntities, request: ConfirmedCareRequest, rawInput: string, intakeId: string): void {
    const normalizedIntake = structuredClone(intake);
    const normalizedRequest = structuredClone(request);
    this.persist({
      intake: normalizedIntake,
      request: normalizedRequest,
      matchingRequest: { ...normalizedRequest, required_services: [...normalizedRequest.required_services] },
      scheduleDates: [...(intake.schedule_dates ?? [])],
      rawInput,
      intakeId,
      selectedProviderId: null,
      reviewedAlternativeId: null,
      selectionConfirmed: false,
    });
  }

  updateSearch(request: ConfirmedCareRequest): void {
    const session = this.current();
    if (!session) return;
    this.persist({
      ...session,
      matchingRequest: { ...request, required_services: [...request.required_services] },
      selectedProviderId: null,
      reviewedAlternativeId: null,
      selectionConfirmed: false,
    });
  }

  selectProvider(providerId: string): void {
    const session = this.current();
    if (!session) return;
    this.persist({ ...session, selectedProviderId: providerId, reviewedAlternativeId: null, selectionConfirmed: false });
  }

  selectAlternativeForReview(providerId: string): void {
    const session = this.current();
    if (!session) return;
    this.persist({ ...session, reviewedAlternativeId: providerId, selectedProviderId: null, selectionConfirmed: false });
  }

  confirmProvider(providerId: string): void {
    const session = this.current();
    if (!session || session.selectedProviderId !== providerId) return;
    this.persist({ ...session, selectionConfirmed: true });
  }

  /** Only the explicit final workflow action clears the pending data. */
  finishDemoWorkflow(): void {
    this.current.set(null);
    try { sessionStorage.removeItem(this.key); } catch { /* storage unavailable */ }
  }
}
