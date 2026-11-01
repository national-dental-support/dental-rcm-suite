import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.services';

@Component({
    selector: 'app-login',
    templateUrl: './login.component.html',
    styleUrls: ['./login.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class LoginComponent implements OnInit {
  loading = false;
  error = '';

  /** Set once the server reports the bootstrap password is still in place. */
  mustChangePassword = false;

  form!: FormGroup;
  changeForm!: FormGroup;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required]],
    });

    this.changeForm = this.fb.group({
      newPassword: ['', [Validators.required, Validators.minLength(12)]],
      confirmPassword: ['', [Validators.required]],
    });
  }

  async login(): Promise<void> {
    if (this.form.invalid || this.loading) return;
    this.loading = true;
    this.error = '';
    this.cdr.markForCheck();

    const { email, password } = this.form.value;
    try {
      const identity = await this.authService.login(email, password);
      if (identity.mustChangePassword) {
        // The account is usable for nothing else until the password is replaced.
        this.mustChangePassword = true;
      } else {
        await this.router.navigate(['/app/home']);
      }
    } catch (err: any) {
      this.error = err?.status === 401
        ? 'That email and password do not match an account.'
        : 'Sign-in failed. Check that the API is reachable and try again.';
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  async changePassword(): Promise<void> {
    if (this.changeForm.invalid || this.loading) return;

    const { newPassword, confirmPassword } = this.changeForm.value;
    if (newPassword !== confirmPassword) {
      this.error = 'The two passwords do not match.';
      this.cdr.markForCheck();
      return;
    }

    this.loading = true;
    this.error = '';
    this.cdr.markForCheck();

    try {
      await this.authService.changePassword(this.form.value.password, newPassword);
      await this.router.navigate(['/app/home']);
    } catch (err: any) {
      this.error = err?.status === 400
        ? 'That password was rejected. Choose a longer or less predictable one.'
        : 'Could not change the password. Try again.';
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }
}
