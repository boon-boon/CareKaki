import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../shared/icon/icon';
import { MockDataService } from '../../core/services/mock-data.service';
import { JobOrder, WhatsAppMessage } from '../../core/models';

@Component({
  selector: 'app-job-order-view',
  standalone: true,
  imports: [RouterLink, IconComponent],
  templateUrl: './job-order-view.html',
  styleUrl: './job-order-view.scss',
})
export class JobOrderView {
  private readonly data = inject(MockDataService);

  readonly jobOrder: JobOrder = this.data.sampleJobOrder;
  readonly whatsapp: WhatsAppMessage = this.data.sampleWhatsApp;

  readonly activeTab = signal<'job-order' | 'whatsapp'>('job-order');
  readonly checkedItems = signal<Set<number>>(new Set());
  readonly copied = signal(false);

  formatDate(iso: string): string {
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
}
