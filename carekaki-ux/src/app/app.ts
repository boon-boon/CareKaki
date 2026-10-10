import { Component, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { IconComponent } from './shared/icon/icon';

interface NavLink {
  label: string;
  icon: string;
  route: string;
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly sidebarOpen = signal(false);
  protected readonly currentYear = new Date().getFullYear();

  protected readonly navLinks: NavLink[] = [
    { label: 'Dashboard', icon: 'dashboard', route: '/dashboard' },
    { label: 'New Intake', icon: 'intake', route: '/intake' },
    { label: 'Caregivers', icon: 'users', route: '/roster' },
    { label: 'Matching', icon: 'match', route: '/matching' },
    { label: 'Quotations', icon: 'file-text', route: '/quotations' },
    { label: 'Job Orders', icon: 'clipboard', route: '/job-orders' },
    { label: 'Pricing', icon: 'dollar', route: '/pricing' },
  ];

  protected readonly mobileNav: NavLink[] = [
    { label: 'Home', icon: 'dashboard', route: '/dashboard' },
    { label: 'Intake', icon: 'intake', route: '/intake' },
    { label: 'Caregivers', icon: 'users', route: '/roster' },
    { label: 'Matching', icon: 'match', route: '/matching' },
    { label: 'Pricing', icon: 'dollar', route: '/pricing' },
  ];

  toggleSidebar() {
    this.sidebarOpen.update(v => !v);
  }

  closeSidebar() {
    this.sidebarOpen.set(false);
  }
}
