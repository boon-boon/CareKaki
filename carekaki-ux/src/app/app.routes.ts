import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full',
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./features/dashboard/dashboard').then(m => m.Dashboard),
    title: 'Dashboard — CareKaki',
  },
  {
    path: 'intake',
    loadComponent: () =>
      import('./features/intake/intake-form').then(m => m.IntakeForm),
    title: 'New Intake — CareKaki',
  },
  {
    path: 'roster',
    loadComponent: () =>
      import('./features/roster/caregiver-roster').then(m => m.CaregiverRoster),
    title: 'Caregivers — CareKaki',
  },
  {
    path: 'matching',
    loadComponent: () =>
      import('./features/matching/matching-results').then(m => m.MatchingResults),
    title: 'Matching — CareKaki',
  },
  {
    path: 'quotations',
    loadComponent: () =>
      import('./features/quotations/quotation-view').then(m => m.QuotationView),
    title: 'Quotations — CareKaki',
  },
  {
    path: 'job-orders',
    loadComponent: () =>
      import('./features/job-orders/job-order-view').then(m => m.JobOrderView),
    title: 'Job Orders — CareKaki',
  },
  {
    path: 'pricing',
    loadComponent: () =>
      import('./features/pricing/pricing-matrix').then(m => m.PricingMatrixView),
    title: 'Pricing — CareKaki',
  },
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
