import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener, Input, OnInit, Output } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.services';
import { SubscriptionService } from '../../core/services/subscription.service';
import { ProductSlug } from '../../core/models/master-claim.model';
import { ImpersonationService } from '../../core/services/impersonation.service';
import { Enterprise, EnterpriseService } from '../../core/services/enterprise.service';
import { environment } from '../../../environments/environment';

interface NavItem {
  label: string;
  /** Material Icons ligature name, rendered via <mat-icon>. */
  icon: string;
  route: string;
  slug?: string;
  /** Optional role requirement: 'manager' = Manager+Admin+SuperAdmin, 'admin' = Admin+SuperAdmin */
  roleReq?: 'manager' | 'admin';
}

const MANAGER_ROLES = ['Manager', 'Admin', 'Super Admin'];
const ADMIN_ROLES = ['Admin', 'Super Admin'];

@Component({
    selector: 'app-side-nav',
    templateUrl: './side-nav.html',
    styleUrls: ['./side-nav.scss'],
    standalone: false
})
export class SideNavComponent implements OnInit {
  showUserMenu = false;
  userEmail = '';
  userName = '';
  userProfilePicUrl: string | null = null;
  isSuperAdmin = false;
  private userRole = '';

  // -- Customer Switcher (SuperAdmin only) -------------------------------------
  enterprises: Enterprise[] = [];

  // -- Persona Switcher --------------------------------------------------------
  showPersonaSwitcher = false;
  personaUsers: { id: number; name: string; email: string; role: string }[] = [];
  personaSearch = '';

  /** Driven by layout.ts - sidebar completely hidden when true */
  @Input() navCollapsed = false;
  /** Emits when the user clicks the collapse button inside the sidebar */
  @Output() collapseToggle = new EventEmitter<void>();

  rcmExpanded = true;
  configureExpanded = true;
  collaborationExpanded = true;

  // -- Item definitions ---------------------------------------------------------

  /** Standalone items - no group */
  private readonly standaloneNavItems: NavItem[] = [
    { label: 'InsightFlow', icon: 'insights', route: '/app/insightflow', slug: 'insightflow' },
  ];

  /** RCM product group */
  private readonly rcmNavItems: NavItem[] = [
    { label: 'Claim Vision',  icon: 'find_in_page',    route: '/app/claim-vision', slug: 'claim-vision' },
    { label: 'Payer-IQ',      icon: 'request_quote',   route: '/app/payer-iq',     slug: 'payer-iq' },
    { label: 'Recon-IQ',      icon: 'account_balance', route: '/app/recon-iq',     slug: 'recon-iq' },
    { label: 'Denial-IQ',     icon: 'fact_check',      route: '/app/denial-iq',    slug: 'denial-iq' },
  ];

  /** Configure group */
  private readonly configureNavItems: NavItem[] = [
    { label: 'Admin',    icon: 'admin_panel_settings', route: '/app/admin',    roleReq: 'admin' },
    { label: 'Settings', icon: 'settings',             route: '/app/settings', roleReq: 'admin' },
  ];

  // -- Computed filtered arrays --------------------------------------------------

  standaloneItems: NavItem[] = [];
  rcmItems: NavItem[] = [];
  lockedRcmItems: NavItem[] = [];
  configureItems: NavItem[] = [];

  /** Dynamic external app links (driven by SIBLING_APPS env var via /api/app-registry) */
  externalApps: { name: string; url: string; icon: string }[] = [];

  private subscribedSlugs: string[] = [];


  private canShow(item: NavItem): boolean {
    // Product subscription check applies to ALL users (including Super Admins)
    if (item.slug && !this.subscribedSlugs.includes(item.slug)) return false;
    // Role check - Super Admins bypass role requirements
    if (this.isSuperAdmin) return true;
    if (item.roleReq === 'manager' && !MANAGER_ROLES.includes(this.userRole)) return false;
    if (item.roleReq === 'admin' && !ADMIN_ROLES.includes(this.userRole)) return false;
    return true;
  }

  private rebuildNavItems(): void {
    this.standaloneItems = this.standaloneNavItems.filter(i => this.canShow(i));
    this.rcmItems        = this.rcmNavItems.filter(i => this.canShow(i));
    this.lockedRcmItems  = this.rcmNavItems.filter(i => i.slug && !this.subscribedSlugs.includes(i.slug));
    this.configureItems  = this.configureNavItems.filter(i => this.canShow(i));
  }

  // -- Lifecycle -----------------------------------------------------------------

  constructor(
    private router: Router,
    private authService: AuthService,
    private subscriptionService: SubscriptionService,
    public impersonation: ImpersonationService,
    public enterpriseSvc: EnterpriseService,
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private elRef: ElementRef,
  ) {}

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.showUserMenu && !this.elRef.nativeElement.querySelector('.user-avatar')?.contains(event.target as Node)) {
      this.showUserMenu = false;
    }
  }

  ngOnInit(): void {
    this.impersonation.restore();
    this.loadUserInfo();
    this.subscriptionService.state$.subscribe(data => {
      const subs = data.subscriptions as string[];
      this.isSuperAdmin          = subs.includes('superadmin');
      this.userRole              = data.role ?? '';
      this.subscribedSlugs       = subs.filter(s => s !== 'superadmin') as ProductSlug[];
      this.rebuildNavItems();
      if (this.isSuperAdmin) {
        this.enterpriseSvc.loadEnterprises();
      }
    });

    this.enterpriseSvc.enterprises$.subscribe(list => {
      this.enterprises = list;
      this.cdr.markForCheck();
    });

    // Load external sibling app links from backend (SIBLING_APPS env var)
    this.http.get<{ name: string; url: string; icon: string }[]>('/api/app-registry').subscribe({
      next: apps => { this.externalApps = apps || []; },
      error: (err) => {
        console.warn('[SideNav] /api/app-registry unavailable \u2014 no sibling apps will be shown.', err?.status ?? err);
        this.externalApps = [];
      },
    });
  }

  // -- Actions -------------------------------------------------------------------

  toggleCollapse(): void {
    this.collapseToggle.emit();
  }

  toggleUserMenu(): void {
    this.showUserMenu = !this.showUserMenu;
  }

  logout(): void {
    this.authService.logout();
  }

  loadUserInfo(): void {
    this.userEmail =
      localStorage.getItem('xUserEmail') ??
      sessionStorage.getItem('xUserEmail') ??
      '';
    const first    = localStorage.getItem('myRCMAzureUserFirstName') ?? '';
    const last     = localStorage.getItem('myRCMAzureUserLastName') ?? '';
    this.userName  = [first, last].filter(Boolean).join(' ');
  }

  get userInitials(): string {
    if (!this.userName) return '';
    const names = this.userName.trim().split(' ');
    return names.length === 1
      ? names[0].charAt(0).toUpperCase()
      : names[0].charAt(0).toUpperCase() + names[names.length - 1].charAt(0).toUpperCase();
  }

  // -- Persona Switcher --------------------------------------------------------

  personaGroups: { role: string; users: { id: number; name: string; email: string; role: string }[] }[] = [];

  openPersonaSwitcher(): void {
    if (this.personaGroups.length > 0) {
      this.showPersonaSwitcher = true;
      return;
    }
    this.http.get<any>(`${environment.server.baseUrl}/admin/users`)
      .subscribe({ next: (res) => {
        const users = Array.isArray(res) ? res : res.data ?? [];
        this.personaUsers = users.map((u: any) => ({
          id: parseInt(u.userID ?? u.id, 10),
          name: u.name ?? `${u.FirstName ?? ''} ${u.LastName ?? ''}`.trim(),
          email: u.email ?? u.Email ?? '',
          role: u.role ?? u.Role ?? '',
        }));
        const grouped: Record<string, typeof this.personaUsers> = {};
        for (const u of this.personaUsers) {
          (grouped[u.role] = grouped[u.role] || []).push(u);
        }
        const order = ['Manager', 'AR Specialist', 'Admin', 'Super Admin', 'User'];
        this.personaGroups = order
          .filter(r => grouped[r]?.length)
          .map(r => ({ role: r, users: grouped[r].sort((a, b) => a.name.localeCompare(b.name)) }));
        this.showPersonaSwitcher = true;
        this.cdr.detectChanges();
      }, error: (err) => console.error('[Persona] Error:', err) });
  }

  onPersonaSelect(event: Event): void {
    const id = parseInt((event.target as HTMLSelectElement).value, 10);
    const user = this.personaUsers.find(u => u.id === id);
    if (user) {
      this.showPersonaSwitcher = false;
      this.impersonation.startImpersonation(user);
    }
  }

  // -- Customer Switcher (SuperAdmin only) -------------------------------------

  onEnterpriseChange(event: Event): void {
    const id = parseInt((event.target as HTMLSelectElement).value, 10);
    const ent = this.enterprises.find(e => e.id === id);
    if (ent) {
      this.enterpriseSvc.setActive(ent);
      window.location.reload();
    }
  }
}
