import { TestBed } from '@angular/core/testing';
import { MatchingResults } from './matching-results';
import { CareKakiMcpService } from '../../core/services/carekaki-mcp.service';
import { CareBookingSessionService } from '../../core/services/care-booking-session.service';
import { IntakeEntities } from '../../core/models';

describe('MatchingResults recurring MCP handoff', () => {
  beforeEach(() => {
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  afterEach(() => sessionStorage.clear());

  it('searches all weekdays by default, but lets the user inspect one date and return to all', () => {
    const calls: any[] = [];
    TestBed.configureTestingModule({
      providers: [{
        provide: CareKakiMcpService,
        useValue: {
          searchProviders: (request: any) => {
            calls.push(request);
            return Promise.resolve({ status: 'no_matches', matches: [], alternatives: [] });
          },
        },
      }],
    });
    const booking = TestBed.inject(CareBookingSessionService);
    const scheduleDates = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'];
    const intake: IntakeEntities = {
      service_type: 'home_care',
      location: 'Petaling Jaya', location_zone: 'Petaling Jaya',
      shift_hours: { start: '13:00', end: '18:00', duration_hours: 5, days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] },
      patient_conditions: 'General care', start_date: scheduleDates[0], max_budget: 1000,
      required_services: ['elderly_care'], schedule_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      schedule_dates: scheduleDates,
    };
    booking.begin(intake, {
      location: 'Petaling Jaya', date: scheduleDates[0], start_time: '13:00',
      duration_hours: 5, max_budget: 1000, preferred_language: '',
      required_services: ['elderly_care'], schedule_days: [...intake.schedule_days!],
      schedule_dates: [...scheduleDates],
    }, 'weekday care', 'INT-123');

    const component = TestBed.runInInjectionContext(() => new MatchingResults());
    component.ngOnInit();
    expect(component.scheduleMode()).toBe('all');
    expect(calls[0].schedule_dates).toEqual(scheduleDates);
    expect(calls[0].date).toBe('2026-10-12');

    component.useScheduleDate('2026-10-14');
    expect(component.scheduleMode()).toBe('single');
    expect(calls[1].schedule_dates).toEqual(['2026-10-14']);
    expect(booking.current()?.intake.schedule_dates).toEqual(scheduleDates);

    component.useFullSchedule();
    expect(component.scheduleMode()).toBe('all');
    expect(calls[2].schedule_dates).toEqual(scheduleDates);
    expect(booking.current()?.matchingRequest.schedule_dates).toEqual(scheduleDates);
  });

  it('keeps the last selected service and re-syncs the native checkbox when deselect is attempted', () => {
    TestBed.configureTestingModule({
      providers: [{
        provide: CareKakiMcpService,
        useValue: {
          searchProviders: () => Promise.resolve({ status: 'no_matches', matches: [], alternatives: [] }),
        },
      }],
    });

    const component = TestBed.runInInjectionContext(() => new MatchingResults());

    // Only the default 'elderly_care' service is selected.
    component.searchServices.set(['elderly_care']);
    expect(component.searchServices()).toEqual(['elderly_care']);

    // Simulate the browser having already flipped the native checkbox to off.
    const nativeCheckbox = { checked: false } as HTMLInputElement;
    component.toggleService('elderly_care', false, nativeCheckbox);

    // The service must remain selected...
    expect(component.searchServices()).toEqual(['elderly_care']);
    expect(component.searchServices().includes('elderly_care')).toBe(true);
    // ...and the native control must be forced back in sync with the signal.
    expect(nativeCheckbox.checked).toBe(true);
  });

  it('adds and removes services normally, and re-syncs the native checkbox on success', () => {
    TestBed.configureTestingModule({
      providers: [{
        provide: CareKakiMcpService,
        useValue: {
          searchProviders: () => Promise.resolve({ status: 'no_matches', matches: [], alternatives: [] }),
        },
      }],
    });

    const component = TestBed.runInInjectionContext(() => new MatchingResults());
    component.searchServices.set(['elderly_care']);

    // Add a second service.
    const addTarget = { checked: true } as HTMLInputElement;
    component.toggleService('companionship', true, addTarget);
    expect(component.searchServices()).toEqual(['elderly_care', 'companionship']);
    expect(addTarget.checked).toBe(true);

    // Remove one of the several selected services.
    const removeTarget = { checked: false } as HTMLInputElement;
    component.toggleService('elderly_care', false, removeTarget);
    expect(component.searchServices()).toEqual(['companionship']);
    expect(removeTarget.checked).toBe(false);
  });
});
