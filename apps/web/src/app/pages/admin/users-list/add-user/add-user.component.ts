// src/app/pages/admin/users-list/add-user/add-user.component.ts
import {ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { combineLatest, forkJoin, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { AdminService, UserProduct, UserScope } from '../../../../core/services/admin.service';
import { CatalogService } from '../../../../core/services/catalog.service';
import { SubscriptionService } from '../../../../core/services/subscription.service';

type Role = 'Super Admin' | 'Admin' | 'Training Admin' | 'AR Specialist' | 'Manager' | 'User';

@Component({
    selector: 'rp-add-user',
    templateUrl: './add-user.component.html',
    styleUrls: ['./add-user.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class AddUserComponent implements OnInit {
  form!: FormGroup;

  mode: 'add' | 'edit' = 'add';
  pageTitle = 'Add New User';
  submitLabel = 'Save New User';
  editingUserId?: string;

  roles: Role[] = ['Super Admin', 'Admin', 'Training Admin', 'Manager', 'AR Specialist', 'User'];

  providers: string[] = [];
  locations: string[] = [];
  payers: string[] = [];
  products: UserProduct[] = [];
  managers: { id: number; name: string }[] = [];
  selectedManagerId: number | null = null;

  listsLoading = true;

  constructor(
    private fb: FormBuilder,
    private snack: MatSnackBar,
    private router: Router,
    private route: ActivatedRoute,
    private adminSvc: AdminService,
    private catalogSvc: CatalogService,
    private subsSvc: SubscriptionService,
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      firstName: ['', Validators.required],
      lastName:  ['', Validators.required],
      email:     ['', [Validators.required, Validators.email]],
      role:      ['AR Specialist', Validators.required],
      permissions: this.fb.group({
        reassignToAnotherUser: [true],
        escalateClaim:         [true],
        viewUnassigned:        [false],
        trainingAdmin:         [false],
        teamAdmin:             [false],
        orgAdmin:              [false],
        techMonitoringAccess:  [false],
      }),
      products: this.fb.array([] as FormControl[]),
      queue: this.fb.group({
        providers: this.fb.array([] as FormControl[]),
        locations: this.fb.array([] as FormControl[]),
        payers:    this.fb.array([] as FormControl[]),
      }),
    });

    // Load active catalog items, product catalog, and managers
    forkJoin({
      providers: this.catalogSvc.activeNames('provider'),
      locations: this.catalogSvc.activeNames('location'),
      payers:    this.catalogSvc.activeNames('payer'),
      productCatalog: this.subsSvc.getProducts(),
      managers: this.adminSvc.getManagers(),
    }).subscribe({
      next: ({ providers, locations, payers, productCatalog, managers }) => {
        this.providers = providers;
        this.locations = locations;
        this.payers    = payers;
        this.products  = productCatalog
          .filter(p => p.slug !== 'superadmin')
          .map(p => ({ id: p.id, slug: p.slug as string, name: p.name, assigned: true }));
        this.managers = managers;
        this.rebuildQueueArrays();
        this.rebuildProductsArray();
        this.listsLoading = false;
      },
      error: () => {
        this.snack.open('Could not load form data.', 'OK', { duration: 4000 });
        this.listsLoading = false;
      },
    });

    // React to route changes (add vs edit mode)
    combineLatest([this.route.data, this.route.paramMap])
      .pipe(
        map(([data, params]) => ({
          mode: (data?.['mode'] as 'add' | 'edit') ?? 'add',
          id: params.get('id') ?? undefined,
        })),
      )
      .subscribe(({ mode, id }) => {
        this.mode = mode;
        this.editingUserId = id;

        if (this.mode === 'edit') {
          this.pageTitle   = 'Edit User';
          this.submitLabel = 'Save Changes';

          if (this.editingUserId) {
            forkJoin({
              user: this.adminSvc.get(this.editingUserId),
              userProducts: this.adminSvc.getUserProducts(this.editingUserId),
              scope: this.adminSvc.getUserScope(this.editingUserId),
            }).subscribe({
              next: ({ user, userProducts, scope }: any) => {
                const perms = user.permissions ?? {};
                this.form.patchValue({
                  firstName: user.firstName ?? '',
                  lastName:  user.lastName  ?? '',
                  email:     user.email     ?? '',
                  role: (['Super Admin', 'Admin', 'Training Admin', 'AR Specialist', 'Manager', 'User'].includes(user.role)
                    ? user.role as Role
                    : 'User' as Role),
                  permissions: {
                    reassignToAnotherUser: perms.reassignToAnotherUser ?? true,
                    escalateClaim:         perms.escalateClaim         ?? true,
                    viewUnassigned:        perms.viewUnassigned        ?? false,
                    trainingAdmin:         perms.trainingAdmin         ?? false,
                    teamAdmin:             perms.teamAdmin             ?? false,
                    orgAdmin:              perms.orgAdmin              ?? false,
                    techMonitoringAccess:  perms.techMonitoringAccess  ?? false,
                  },
                });
                // Update products with server-side assignments
                this.products = userProducts;
                this.rebuildProductsArray(userProducts.map((p: UserProduct) => p.assigned));
                // Pre-check queue scope checkboxes from saved scope
                this.applyScopeToForm(scope);
              },
            });
          }
        } else {
          this.pageTitle   = 'Add New User';
          this.submitLabel = 'Save New User';
          this.form.patchValue({
            firstName: '',
            lastName:  '',
            email:     '',
            role:      'AR Specialist',
            permissions: {
              reassignToAnotherUser: true,
              escalateClaim:         true,
              viewUnassigned:        false,
              trainingAdmin:         false,
              teamAdmin:             false,
              orgAdmin:              false,
              techMonitoringAccess:  false,
            },
          });
          this.rebuildQueueArrays(false);
          // New users default to all products enabled
          this.rebuildProductsArray(this.products.map(() => true));
        }
      });
  }

  // -- FormArray helpers -----------------------------------------------------

  get productsArray(): FormArray<FormControl<boolean>> {
    return this.form.get('products') as FormArray<FormControl<boolean>>;
  }
  get providersArray(): FormArray<FormControl<boolean>> {
    return this.form.get(['queue', 'providers']) as FormArray<FormControl<boolean>>;
  }
  get locationsArray(): FormArray<FormControl<boolean>> {
    return this.form.get(['queue', 'locations']) as FormArray<FormControl<boolean>>;
  }
  get payersArray(): FormArray<FormControl<boolean>> {
    return this.form.get(['queue', 'payers']) as FormArray<FormControl<boolean>>;
  }

  private rebuildProductsArray(values?: boolean[]): void {
    const arr = this.fb.array(
      this.products.map((_, i) => this.fb.control(values ? (values[i] ?? true) : true)),
    );
    this.form.setControl('products', arr);
  }

  private rebuildQueueArrays(preserveValues = false): void {
    const queue = this.form.get('queue') as FormGroup;

    const rebuild = (key: string, items: string[]) => {
      const existing = (queue.get(key) as FormArray).value as boolean[];
      const newArray = this.fb.array(
        items.map((_, i) => this.fb.control(preserveValues ? (existing[i] ?? false) : false)),
      );
      queue.setControl(key, newArray);
    };

    rebuild('providers', this.providers);
    rebuild('locations', this.locations);
    rebuild('payers',    this.payers);
  }

  private applyScopeToForm(scope: UserScope): void {
    const check = (items: string[], saved: string[], arr: FormArray<FormControl<boolean>>) => {
      const savedSet = new Set(saved.map(s => s.toLowerCase()));
      items.forEach((name, i) => {
        arr.at(i)?.setValue(savedSet.has(name.toLowerCase()));
      });
    };
    check(this.providers, scope.providers ?? [], this.providersArray);
    check(this.locations, scope.locations ?? [], this.locationsArray);
    check(this.payers,    scope.payers    ?? [], this.payersArray);
  }

  private buildScopeFromForm(): UserScope {
    const v = this.form.value;
    return {
      locations: this.locations.filter((_, i) => v.queue.locations[i]),
      providers: this.providers.filter((_, i) => v.queue.providers[i]),
      payers:    this.payers.filter((_, i) => v.queue.payers[i]),
    };
  }

  // -- Queue search state ----------------------------------------------------

  providerSearchTerm = '';
  locationSearchTerm = '';
  payerSearchTerm    = '';

  filteredCount(items: string[], term: string): number {
    const q = term.toLowerCase();
    return items.filter(s => s.toLowerCase().includes(q)).length;
  }

  // -- Queue select-all helpers ----------------------------------------------

  private setAllInArray(arr: FormArray<FormControl<boolean>>, value: boolean): void {
    arr.controls.forEach(c => c.setValue(value));
  }

  isAllSelected(arr: FormArray<FormControl<boolean>>): boolean {
    return arr.length > 0 && arr.controls.every(c => c.value === true);
  }

  isSomeSelected(arr: FormArray<FormControl<boolean>>): boolean {
    return arr.controls.some(c => c.value === true) && !this.isAllSelected(arr);
  }

  toggleSelectAll(arr: FormArray<FormControl<boolean>>): void {
    this.setAllInArray(arr, !this.isAllSelected(arr));
  }

  // -- Actions ---------------------------------------------------------------

  cancel() {
    this.router.navigate(['/app/admin']);
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.value;
    const selectedProductIds = this.products
      .filter((_, i) => v.products[i])
      .map(p => p.id);

    const scope = this.buildScopeFromForm();

    const managerObs = this.selectedManagerId != null
      ? this.adminSvc.setUserManager(Number(this.editingUserId), this.selectedManagerId)
      : of(void 0);

    if (this.mode === 'edit') {
      forkJoin({
        user: this.adminSvc.update(this.editingUserId!, {
          firstName:   v.firstName,
          lastName:    v.lastName,
          email:       v.email,
          role:        v.role,
          permissions: { ...v.permissions },
        }),
        products: this.adminSvc.updateUserProducts(this.editingUserId!, selectedProductIds),
        scope: this.adminSvc.updateUserScope(this.editingUserId!, scope),
        manager: managerObs,
      }).subscribe({
        next: () => {
          this.snack.open('User updated', 'OK', { duration: 2500 });
          this.router.navigate(['/app/admin/users']);
        },
        error: () => this.snack.open('Failed to update user', 'OK', { duration: 3000 }),
      });
    } else {
      this.adminSvc.create({
        firstName:   v.firstName,
        lastName:    v.lastName,
        email:       v.email,
        role:        v.role,
        permissions: { ...v.permissions },
      }).subscribe({
        next: (res) => {
          const redirect = () => {
            this.router.navigate(['/app/admin/users']);
          };
          if (res.id) {
            const newUserManagerObs = this.selectedManagerId != null
              ? this.adminSvc.setUserManager(res.id, this.selectedManagerId)
              : of(void 0);
            forkJoin({
              products: this.adminSvc.updateUserProducts(String(res.id), selectedProductIds),
              scope: this.adminSvc.updateUserScope(String(res.id), scope),
              manager: newUserManagerObs,
            }).subscribe({
              next: () => {
                this.snack.open('User created successfully', 'OK', { duration: 3000 });
                redirect();
              },
              error: (err) => {
                this.snack.open('User created but product assignment failed: ' + (err?.error?.message || 'Unknown error'), 'OK', { duration: 5000 });
                redirect();
              },
            });
          } else {
            this.snack.open('User created but ID not returned \u2014 products not assigned', 'OK', { duration: 5000 });
            redirect();
          }
        },
        error: (err) => {
          const msg = err?.error?.message ?? 'Failed to create user';
          this.snack.open(msg, 'OK', { duration: 4000 });
        },
      });
    }
  }
}
