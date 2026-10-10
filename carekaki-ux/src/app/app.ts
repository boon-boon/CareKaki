import { Component, signal, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { JsonPipe } from '@angular/common';
import { IconComponent } from './shared/icon/icon';
import { CareKakiMcpService } from './core/services/carekaki-mcp.service';

interface NavLink {
  label: string;
  icon: string;
  route: string;
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, JsonPipe, IconComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly mcp = inject(CareKakiMcpService);
  protected readonly sidebarOpen = signal(false);
  protected readonly mcpInspectorOpen = signal(false);
  protected readonly testRunning = signal(false);
  protected readonly testResult = signal<any>(null);
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

  toggleMcpInspector() {
    this.mcpInspectorOpen.update(v => !v);
  }

  closeMcpInspector() {
    this.mcpInspectorOpen.set(false);
  }

  async runQuickMcpTest() {
    this.testRunning.set(true);
    try {
      const res = await this.mcp.getSearchOptions();
      this.testResult.set({ success: true, data: res });
    } catch (err: any) {
      this.testResult.set({ success: false, error: err.message });
    } finally {
      this.testRunning.set(false);
    }
  }

  async refreshMcp() {
    await this.mcp.checkHealth();
  }
}
