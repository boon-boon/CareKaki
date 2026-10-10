import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../shared/icon/icon';
import { MockDataService } from '../../core/services/mock-data.service';
import { Quotation } from '../../core/models';

@Component({
  selector: 'app-quotation-view',
  standalone: true,
  imports: [RouterLink, IconComponent],
  templateUrl: './quotation-view.html',
  styleUrl: './quotation-view.scss',
})
export class QuotationView {
  private readonly data = inject(MockDataService);

  readonly quotation: Quotation = this.data.sampleQuotation;
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
Service: Nursing
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
}
