import { Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable({ providedIn: 'root' })
export class ErrorDisplayService {
  constructor(private snack: MatSnackBar) {}

  show(message: string, action = 'Dismiss', duration = 4000): void {
    this.snack.open(message, action, { duration });
  }

  log(context: string, err: unknown): void {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${context}]`, err);
    // Structured output for log aggregation
    if (typeof err === 'object' && err !== null) {
      console.error(`[${context}] detail:`, msg);
    }
  }
}
