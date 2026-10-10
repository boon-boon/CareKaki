import { Component, inject, signal } from '@angular/core';
import { IconComponent } from '../../shared/icon/icon';
import { MockDataService } from '../../core/services/mock-data.service';
import { PricingMatrix, ServiceType } from '../../core/models';

interface ServiceRateCard {
  key: ServiceType;
  label: string;
  icon: string;
  color: string;
}

@Component({
  selector: 'app-pricing-matrix',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './pricing-matrix.html',
  styleUrl: './pricing-matrix.scss',
})
export class PricingMatrixView {
  private readonly data = inject(MockDataService);

  readonly matrix: PricingMatrix = this.data.pricingMatrix;
  readonly zones = this.data.zoneReference;
  readonly certMapping = this.data.certMapping;
  readonly activeTab = signal<'rates' | 'surcharges' | 'rules'>('rates');

  readonly serviceCards: ServiceRateCard[] = [
    { key: 'nursing', label: 'Nursing', icon: 'heart', color: 'teal' },
    { key: 'home_care', label: 'Home Care', icon: 'shield', color: 'blue' },
    { key: 'transport', label: 'Transport', icon: 'map-pin', color: 'amber' },
    { key: 'companionship', label: 'Companionship', icon: 'users', color: 'purple' },
  ];

  readonly surcharges = [
    {
      name: 'Night Shift',
      icon: 'clock',
      color: 'purple',
      multiplier: this.data.pricingMatrix.surcharges.night_shift.multiplier,
      condition: 'Applies after 22:00, before 06:00',
      description: this.data.pricingMatrix.surcharges.night_shift.description,
    },
    {
      name: 'Weekend',
      icon: 'calendar',
      color: 'blue',
      multiplier: this.data.pricingMatrix.surcharges.weekend.multiplier,
      condition: 'Saturday & Sunday shifts',
      description: this.data.pricingMatrix.surcharges.weekend.description,
    },
    {
      name: 'Public Holiday',
      icon: 'star',
      color: 'amber',
      multiplier: this.data.pricingMatrix.surcharges.public_holiday.multiplier,
      condition: 'Malaysian public holidays',
      description: this.data.pricingMatrix.surcharges.public_holiday.description,
    },
  ];

  formatMYR(n: number): string {
    return this.data.formatMYR(n);
  }

  get baseRateLabel(): string {
    return this.matrix.currency;
  }

  /** Example calculation for the pricing calculator */
  readonly calcRate = signal<number>(28);
  readonly calcHours = signal<number>(8);
  readonly calcDays = signal<number>(5);

  get calcSubtotal(): number {
    return Math.round(this.calcRate() * this.calcHours() * this.calcDays() * 100) / 100;
  }
  get calcSst(): number {
    return Math.round(this.calcSubtotal * this.matrix.tax.rate * 100) / 100;
  }
  get calcTotal(): number {
    return Math.round((this.calcSubtotal + this.calcSst) * 100) / 100;
  }
}
