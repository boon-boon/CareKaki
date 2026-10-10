import { TestBed } from '@angular/core/testing';
import { QuotationView } from './quotation-view';
import { CareBookingSessionService } from '../../core/services/care-booking-session.service';
import { CareKakiMcpService } from '../../core/services/carekaki-mcp.service';

describe('Quotation MCP provider pricing', () => {
  beforeEach(() => {
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  afterEach(() => sessionStorage.clear());

  it('uses CK021 live hourly rate instead of the mock nursing price', async () => {
    TestBed.configureTestingModule({
      providers: [{
        provide: CareKakiMcpService,
        useValue: {
          getProvider: async (id: string) => ({
            status: 'found',
            provider: { provider_id: id, name: 'Bangsar Caregiver Services', hourly_rate: 45 },
          }),
        },
      }],
    });
    const booking = TestBed.inject(CareBookingSessionService);
    const request = {
      location: 'Bangsar', date: '2026-10-21', start_time: '11:00',
      duration_hours: 5, max_budget: 300, preferred_language: '',
      required_services: ['dementia_care'],
    };
    const intake = {
      service_type: 'nursing', location: 'Bangsar', location_zone: 'Bangsar',
      shift_hours: { start: '11:00', end: '16:00', duration_hours: 5, days: ['Wed'] },
      patient_conditions: '', start_date: request.date, required_services: request.required_services,
      max_budget: 300,
    };
    booking.begin(intake, request, 'Care in Bangsar', 'INT-123');
    booking.selectProvider('CK021');
    booking.confirmProvider('CK021');

    const view = TestBed.runInInjectionContext(() => new QuotationView());
    await vi.waitFor(() => expect(view.quotationLoading()).toBe(false));
    expect(view.quotationError()).toBeNull();
    expect(view.quotation.caregiver_name).toBe('Bangsar Caregiver Services');
    expect(view.quotation.line_items[0].rate_myr).toBe(45);
    expect(view.quotation.subtotal).toBe(225);
    expect(view.quotation.sst_amount).toBe(18);
    expect(view.quotation.total).toBe(243);
  });
});
