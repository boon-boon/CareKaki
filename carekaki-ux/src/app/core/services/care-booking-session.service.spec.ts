import { TestBed } from '@angular/core/testing';
import { CareBookingSessionService, ConfirmedCareRequest } from './care-booking-session.service';
import { IntakeEntities } from '../models';

describe('CareBookingSessionService', () => {
  let service: CareBookingSessionService;
  const request: ConfirmedCareRequest = {
    location: 'Petaling Jaya',
    date: '2026-10-12',
    start_time: '15:15',
    duration_hours: 2.3,
    max_budget: 456,
    preferred_language: '',
    required_services: ['elderly_care', 'mobility_assistance'],
  };
  const intake: IntakeEntities = {
    service_type: 'home_care',
    location: 'Petaling Jaya',
    location_zone: 'Petaling Jaya',
    shift_hours: { start: '15:15', end: '17:33', duration_hours: 2.3, days: ['Mon'] },
    patient_conditions: 'General care',
    start_date: '2026-10-12',
    max_budget: 456,
    required_services: [...request.required_services],
    schedule_dates: ['2026-10-12', '2026-10-13'],
  };

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.resetTestingModule();
    service = TestBed.inject(CareBookingSessionService);
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('preserves exact custom criteria, all services and recurrence across reload', () => {
    service.begin(intake, request, 'client request', 'INT-123');
    expect(service.current()?.matchingRequest).toEqual(request);
    expect(service.current()?.scheduleDates).toEqual(['2026-10-12', '2026-10-13']);
    const restored = new CareBookingSessionService();
    expect(restored.current()?.matchingRequest).toEqual(request);
    expect(restored.current()?.intakeId).toBe('INT-123');
  });

  it('retains intake details when matching options change', () => {
    service.begin(intake, request, '', 'INT-123');
    service.updateSearch({ ...request, max_budget: 500 });
    expect(service.current()?.request.max_budget).toBe(456);
    expect(service.current()?.matchingRequest.max_budget).toBe(500);
  });

  it('keeps a review-only alternative without marking it booked', () => {
    service.begin(intake, request, '', 'INT-123');
    service.selectAlternativeForReview('CK010');
    const pending = new CareBookingSessionService().current();
    expect(pending?.reviewedAlternativeId).toBe('CK010');
    expect(pending?.selectionConfirmed).toBe(false);
    expect(pending?.selectedProviderId).toBeNull();
  });

  it('retains selected caregiver until explicit demo completion', () => {
    service.begin(intake, request, '', 'INT-123');
    service.selectProvider('CK001');
    service.confirmProvider('CK001');
    expect(new CareBookingSessionService().current()?.selectionConfirmed).toBe(true);
    service.updateSearch({ ...request, date: '2026-10-13' });
    expect(service.current()?.selectionConfirmed).toBe(false);
    expect(service.current()?.request.date).toBe('2026-10-12');
    service.finishDemoWorkflow();
    expect(service.current()).toBeNull();
    expect(new CareBookingSessionService().current()).toBeNull();
  });
});
