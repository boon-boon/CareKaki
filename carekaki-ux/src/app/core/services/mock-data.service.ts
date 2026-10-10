import { Injectable, signal } from '@angular/core';
import {
  Caregiver,
  PricingMatrix,
  IntakeResult,
  IntakeEntities,
  MatchedCandidate,
  HandoffPayload,
  Quotation,
  JobOrder,
  WhatsAppMessage,
  DashboardKPI,
  ActivityItem,
} from '../models';

@Injectable({ providedIn: 'root' })
export class MockDataService {
  /* ---------- Cross-view handoff state (set by Intake, read by Matching) ---------- */
  readonly activeIntake = signal<IntakeEntities | null>(null);
  readonly activeScheduleDates = signal<string[]>([]);

  /* ---------- Staff Roster (12 caregivers from spec) ---------- */
  readonly caregivers: Caregiver[] = [
    { caregiver_id: 'CG-001', name: 'Siti Nurhaliza binti Ibrahim', certifications: 'Nursing|CPR|Dementia Care', primary_zone: 'Kuala Lumpur', hourly_rate_myr: 30.00, availability_status: 'available' },
    { caregiver_id: 'CG-002', name: 'Tan Wei Ming', certifications: 'Home Care|CPR|First Aid', primary_zone: 'Petaling Jaya', hourly_rate_myr: 22.00, availability_status: 'available' },
    { caregiver_id: 'CG-003', name: 'Aisha binti Rahman', certifications: 'Nursing|CPR|Wound Care', primary_zone: 'Cheras', hourly_rate_myr: 28.00, availability_status: 'available' },
    { caregiver_id: 'CG-004', name: 'Leong Chee Kwong', certifications: 'Transport|First Aid|Wheelchair Cert', primary_zone: 'Shah Alam', hourly_rate_myr: 18.00, availability_status: 'on_assignment' },
    { caregiver_id: 'CG-005', name: 'Mahalakshmi a/p Subramaniam', certifications: 'Nursing|Geriatric Care|CPR', primary_zone: 'Ipoh', hourly_rate_myr: 26.00, availability_status: 'available' },
    { caregiver_id: 'CG-006', name: 'Nurul Huda binti Abdullah', certifications: 'Home Care|Companionship|CPR', primary_zone: 'Klang', hourly_rate_myr: 20.00, availability_status: 'available' },
    { caregiver_id: 'CG-007', name: 'Mei Ling Tan', certifications: 'Nursing|Geriatric Care', primary_zone: 'Bukit Jalil', hourly_rate_myr: 27.00, availability_status: 'available' },
    { caregiver_id: 'CG-008', name: 'Raj a/l Kumaran', certifications: 'Transport|First Aid|Wheelchair Cert', primary_zone: 'Penang', hourly_rate_myr: 19.00, availability_status: 'on_leave' },
    { caregiver_id: 'CG-009', name: 'Fatimah binti Yusof', certifications: 'Nursing|Palliative Care|CPR', primary_zone: 'Johor Bahru', hourly_rate_myr: 32.00, availability_status: 'available' },
    { caregiver_id: 'CG-010', name: 'Chong Siew Fang', certifications: 'Home Care|CPR|Dementia Care', primary_zone: 'Melaka', hourly_rate_myr: 21.00, availability_status: 'available' },
    { caregiver_id: 'CG-011', name: 'Balakrishnan a/l Raman', certifications: 'Home Care|Companionship', primary_zone: 'Seremban', hourly_rate_myr: 17.00, availability_status: 'available' },
    { caregiver_id: 'CG-012', name: 'Raj a/l Kumaran', certifications: 'Nursing|Physiotherapy', primary_zone: 'Petaling Jaya', hourly_rate_myr: 29.00, availability_status: 'available' },
  ];

  /* ---------- Pricing Matrix (from spec) ---------- */
  readonly pricingMatrix: PricingMatrix = {
    version: '1.0',
    currency: 'MYR',
    last_updated: '2026-10-10',
    service_base_rates: {
      home_care: { base_hourly_rate: 22.00, description: 'General home care assistance — daily living, meal prep, light housekeeping' },
      nursing: { base_hourly_rate: 25.00, description: 'Certified nursing care — medication admin, wound dressing, vitals monitoring' },
      transport: { base_hourly_rate: 18.00, description: 'Patient transport — medical appointments, hospital discharge transfers' },
      companionship: { base_hourly_rate: 16.00, description: 'Companionship and social support — conversation, accompaniment, errands' },
    },
    surcharges: {
      night_shift: { applies_after: '22:00', applies_before: '06:00', multiplier: 1.50, description: '50% surcharge on base rate for night shift hours' },
      weekend: { days: ['Saturday', 'Sunday'], multiplier: 1.25, description: '25% surcharge on base rate for weekend shifts' },
      public_holiday: { multiplier: 2.00, description: '100% surcharge on base rate for Malaysian public holidays', holiday_list_ref: 'malaysia_public_holidays_2026.json' },
    },
    tax: { name: 'SST', rate: 0.08, description: 'Malaysian Sales and Service Tax at 8%' },
    billing_rules: { minimum_shift_hours: 4, rounding: '2 decimal places', billable_rate_rule: 'Use the higher of base_rate or caregiver_hourly_rate_myr' },
  };

  /* ---------- Sample Intake Result (from spec example) ---------- */
  readonly sampleIntake: IntakeResult = {
    intake_id: 'INT-20261010-001',
    timestamp: '2026-10-10T11:24:35+08:00',
    raw_input: 'I need a certified nurse for my mother in Cheras, KL. She had a hip replacement 2 weeks ago. Shift is 8am–4pm, Monday to Friday. Starting next Monday.',
    entities: {
      service_type: 'nursing',
      location: 'Cheras, Kuala Lumpur',
      location_zone: 'Kuala Lumpur',
      shift_hours: {
        start: '08:00',
        end: '16:00',
        duration_hours: 8,
        days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      },
      patient_conditions: 'post-hip-replacement recovery, mobility assistance needed',
      start_date: '2026-10-13',
      estimated_weeks: null,
    },
    completeness_check: 'PASS',
    missing_slots: [],
  };

  /* ---------- Sample Matched Candidates (from spec scoring) ---------- */
  readonly matchedCandidates: MatchedCandidate[] = [
    {
      rank: 1,
      caregiver_id: 'CG-003',
      name: 'Aisha binti Rahman',
      certifications: 'Nursing, CPR, Wound Care',
      primary_zone: 'Cheras, Kuala Lumpur',
      hourly_rate_myr: 28.00,
      total_score: 100.0,
      score_breakdown: { proximity_score: 100, skill_score: 100, availability_score: 100 },
      availability_status: 'available',
    },
    {
      rank: 2,
      caregiver_id: 'CG-007',
      name: 'Mei Ling Tan',
      certifications: 'Nursing, Geriatric Care',
      primary_zone: 'Bukit Jalil, Kuala Lumpur',
      hourly_rate_myr: 27.00,
      total_score: 90.0,
      score_breakdown: { proximity_score: 75, skill_score: 100, availability_score: 100 },
      availability_status: 'available',
    },
    {
      rank: 3,
      caregiver_id: 'CG-012',
      name: 'Raj a/l Kumaran',
      certifications: 'Nursing, Physiotherapy',
      primary_zone: 'Petaling Jaya, Selangor',
      hourly_rate_myr: 29.00,
      total_score: 80.0,
      score_breakdown: { proximity_score: 50, skill_score: 100, availability_score: 100 },
      availability_status: 'available',
    },
  ];

  /* ---------- Sample Handoff Payload ---------- */
  readonly handoffPayload: HandoffPayload = {
    handoff_version: '1.0',
    intake_id: 'INT-20261010-001',
    timestamp: '2026-10-10T11:24:35+08:00',
    entities: this.sampleIntake.entities,
    matched_candidates: this.matchedCandidates,
    selected_caregiver_id: 'CG-003',
    pricing_source: 'D:/WorkBuddy/Claw/CareKaki_Pro/data/pricing_matrix.json',
    roster_source: 'D:/WorkBuddy/Claw/CareKaki_Pro/data/staff_roster.csv',
  };

  /* ---------- Sample Quotation ---------- */
  get sampleQuotation(): Quotation {
    const rate = 28.00;
    const hours = 8;
    const days = 5;
    const subtotal = rate * hours * days;
    const sst = subtotal * 0.08;
    return {
      quotation_id: 'QT-20261010-001',
      date_issued: '2026-10-10',
      valid_until: '2026-10-17',
      client_name: 'Mr. Tan Boon Keong',
      client_contact: '+60 12-345 6789',
      service_address: 'Jalan Cheras, 56100 Kuala Lumpur',
      service_type: 'nursing',
      caregiver_name: 'Aisha binti Rahman',
      caregiver_id: 'CG-003',
      caregiver_certifications: 'Nursing, CPR, Wound Care',
      shift_days: 'Mon–Fri',
      shift_start: '08:00',
      shift_end: '16:00',
      start_date: '2026-10-13',
      line_items: [
        { description: 'Nursing care — 8h/day, Mon–Fri', rate_myr: rate, hours: hours, days: days, subtotal_myr: subtotal },
      ],
      subtotal: this.round2(subtotal),
      sst_amount: this.round2(sst),
      total: this.round2(subtotal + sst),
      billable_rate: rate,
      duration_hours: hours,
      num_days: days,
    };
  }

  /* ---------- Sample Job Order ---------- */
  readonly sampleJobOrder: JobOrder = {
    job_order_id: 'JO-20261010-001',
    date_issued: '2026-10-10',
    caregiver_name: 'Aisha binti Rahman',
    caregiver_id: 'CG-003',
    caregiver_certifications: 'Nursing, CPR, Wound Care',
    client_name: 'Mr. Tan Boon Keong',
    patient_conditions: 'post-hip-replacement recovery, mobility assistance needed',
    service_address: 'Jalan Cheras, 56100 Kuala Lumpur',
    shift_days: 'Mon, Tue, Wed, Thu, Fri',
    shift_start: '08:00',
    shift_end: '16:00',
    duration_hours: 8,
    start_date: '2026-10-13',
    expected_duration: 'Ongoing (estimated 4–6 weeks)',
    special_instructions: 'Patient had hip replacement 2 weeks ago. Requires assistance with mobility, wound care monitoring, and medication administration (pain management). Ensure fall prevention measures are in place.',
    equipment_list: '• Wheelchair (available on-site)\n• Walking frame\n• Wound dressing supplies\n• Blood pressure monitor\n• Medication tray',
    emergency_contacts: [
      { name: 'Tan Boon Keong (Son)', phone: '+60 12-345 6789', relation: 'Son' },
      { name: 'Gleneagles Hospital', phone: '+60 3-4255 3500', relation: 'Nearest Hospital' },
    ],
    checklist: [
      'Confirm patient identity on arrival',
      'Review patient condition and care plan',
      'Administer scheduled medications (if applicable)',
      'Monitor and record vitals',
      'Assist with mobility and transfers',
      'Document shift report before departure',
    ],
  };

  /* ---------- Sample WhatsApp Message ---------- */
  get sampleWhatsApp(): WhatsAppMessage {
    const text = `Hello Aisha binti Rahman,

You have been assigned a new care assignment:

Client: Mr. Tan Boon Keong
Location: Jalan Cheras, 56100 Kuala Lumpur
Service Type: Nursing
Patient Condition: post-hip-replacement recovery, mobility assistance needed
Shift: Mon–Fri, 08:00–16:00
Start Date: 2026-10-13

Please confirm your availability by replying to this message.

Job Order ID: JO-20261010-001`;
    return {
      message_id: 'WA-001',
      recipient_name: 'Aisha binti Rahman',
      recipient_id: 'CG-003',
      message_text: text,
      char_count: text.length,
    };
  }

  /* ---------- Dashboard KPIs ---------- */
  readonly dashboardKPIs: DashboardKPI[] = [
    { label: 'Total Caregivers', value: 12, sublabel: 'Across 7 zones', trend: '+2 this month', trend_direction: 'up', icon: 'users', color: 'teal' },
    { label: 'Available Now', value: 9, sublabel: '75% of roster', trend: '3 on assignment', trend_direction: 'neutral', icon: 'check-circle', color: 'green' },
    { label: 'Active Assignments', value: 4, sublabel: '2 starting this week', trend: '+1 today', trend_direction: 'up', icon: 'clipboard', color: 'blue' },
    { label: 'Pending Intakes', value: 3, sublabel: 'Awaiting confirmation', trend: '2 require review', trend_direction: 'down', icon: 'inbox', color: 'amber' },
  ];

  /* ---------- Activity Feed ---------- */
  readonly activityFeed: ActivityItem[] = [
    { id: 'ACT-1', type: 'intake', title: 'New intake received', description: 'Nursing care request — Cheras, KL · Mon–Fri 8am–4pm', timestamp: '11:24 AM today', status: 'success' },
    { id: 'ACT-2', type: 'match', title: 'Caregiver matched', description: 'CG-003 Aisha binti Rahman — Score: 100.0', timestamp: '11:25 AM today', status: 'success' },
    { id: 'ACT-3', type: 'quotation', title: 'Quotation generated', description: 'QT-20261010-001 — RM 1,512.00 total', timestamp: '11:26 AM today', status: 'success' },
    { id: 'ACT-4', type: 'dispatch', title: 'WhatsApp dispatch sent', description: 'Assignment notification sent to CG-003', timestamp: '11:27 AM today', status: 'success' },
    { id: 'ACT-5', type: 'intake', title: 'Intake pending review', description: 'Companionship — Penang · ambiguous start date', timestamp: '10:15 AM today', status: 'pending' },
    { id: 'ACT-6', type: 'job_order', title: 'Job order generated', description: 'JO-20261010-001 — Caregiver assignment confirmed', timestamp: '09:48 AM today', status: 'success' },
  ];

  /* ---------- Malaysian Zones (Appendix A) ---------- */
  readonly zoneReference: { zone: string; covers: string[]; adjacent: string[] }[] = [
    { zone: 'Kuala Lumpur', covers: ['KL city center', 'Cheras', 'Bukit Jalil', 'Wangsa Maju', 'Setapak'], adjacent: ['Selangor (Petaling Jaya, Shah Alam)'] },
    { zone: 'Selangor', covers: ['Petaling Jaya', 'Shah Alam', 'Klang', 'Subang', 'Kajang'], adjacent: ['Kuala Lumpur', 'Negeri Sembilan'] },
    { zone: 'Penang', covers: ['George Town', 'Bayan Lepas', 'Butterworth'], adjacent: ['Kedah', 'Perak (north)'] },
    { zone: 'Johor', covers: ['Johor Bahru', 'Iskandar Puteri', 'Skudai'], adjacent: ['Melaka', 'Pahang (east)'] },
    { zone: 'Ipoh (Perak)', covers: ['Ipoh', 'Taiping', 'Kampar'], adjacent: ['Penang', 'Selangor (south)'] },
    { zone: 'Melaka', covers: ['Melaka city', 'Alor Gajah', 'Batu Berendam'], adjacent: ['Johor', 'Negeri Sembilan'] },
    { zone: 'Negeri Sembilan', covers: ['Seremban', 'Port Dickson', 'Nilai'], adjacent: ['Selangor', 'Melaka'] },
  ];

  /* ---------- Certification-to-Service Mapping (Appendix B) ---------- */
  readonly certMapping: { service: string; required: string[]; bonus: string[] }[] = [
    { service: 'Nursing', required: ['Nursing'], bonus: ['CPR', 'Wound Care', 'Geriatric Care', 'Palliative Care', 'Dementia Care'] },
    { service: 'Home Care', required: ['Home Care'], bonus: ['CPR', 'First Aid', 'Dementia Care'] },
    { service: 'Transport', required: ['Transport'], bonus: ['First Aid', 'Wheelchair Cert'] },
    { service: 'Companionship', required: ['Companionship', 'Home Care'], bonus: ['CPR', 'First Aid'] },
  ];

  /* ---------- Helpers ---------- */
  private round2(n: number): number {
    return Math.round(n * 100) / 100;
  }

  formatMYR(n: number): string {
    return 'RM ' + n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
