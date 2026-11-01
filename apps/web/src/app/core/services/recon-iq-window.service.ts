import { Injectable } from '@angular/core';

type ReconWindowKind = 'claims' | 'eob' | 'cms1500';

@Injectable({ providedIn: 'root' })
export class ReconIqWindowService {
  private refs: Partial<Record<ReconWindowKind, Window>> = {};

  openEncounterWindows(context: { patientAccount: string; paymentId: string }): void {
  const rects = this.getTiledRects();

  console.debug('[ReconIQ tile] base=', this.getBaseRect(), 'rects=', rects);

  const w1 = window.open('', 'recon_iq_claims', this.buildFeaturesRect(rects.claims));
  const w2 = window.open('', 'recon_iq_eob', this.buildFeaturesRect(rects.eob));

  if (w1) {
    this.refs.claims = w1;
    this.render(
      w1,
      'Recon-IQ \u2022 Claim Data (Placeholder)',
      `<p>Claim data for <code>${this.escape(context.patientAccount)}</code></p>`
    );
    this.enforceRectSync(w1, rects.claims);
  }

  if (w2) {
    this.refs.eob = w2;
    this.render(
      w2,
      'Recon-IQ \u2022 EOB Viewer',
      `<p>Loading EOB for <code>${this.escape(context.paymentId)}</code>\u2026</p>`
    );
    this.enforceRectSync(w2, rects.eob);
  }

  if (w1 && w2) {
    // If the browser clamped them to the same left/top, nudge the 2nd window
    if (this.areOverlapping(w1, w2)) {
      console.debug('[ReconIQ tile] overlap detected; nudging EOB window');
      try {
        w2.moveTo(Math.floor(rects.eob.left + 30), Math.floor(rects.eob.top));
      } catch {}
    }

    // Focus right window last so it doesn't look like one "disappeared"
    w2.focus();
  }

  if (!w1 || !w2) {
    console.warn('[Recon-IQ] One or more windows were blocked.');
  }
}



  // [ok] NEW: Update ONLY the existing EOB window with the PDF iframe
  updateEobPdf(title: string, eobPdfUrl: string): void {
  let w = this.refs.eob;

  if (!w || w.closed) {
    console.warn('[Recon-IQ] EOB window missing; attempting to reopen');
    // NOTE: if this is called after async, popup may still be blocked.
    w = this.open('eob', title, `<p style="padding:16px">Loading\u2026</p>`) ?? null;
  }

  if (!w || w.closed) {
    console.warn('[Recon-IQ] EOB window is not available (blocked or closed).');
    return;
  }

  const body = `
    <div style="height: calc(100vh - 56px);">
      <iframe
        src="${this.escape(eobPdfUrl)}"
        style="width:100%;height:100%;border:0;"
        title="EOB PDF"
      ></iframe>
    </div>
  `;

  this.render(w, title, body);
  w.focus();
}


  open(kind: ReconWindowKind, title: string, htmlBody: string, features?: string): Window | null {
    const opts =
      features ??
      'popup=yes,width=1100,height=800,left=80,top=60,resizable=yes,scrollbars=yes';

    // Reuse existing window if already open
    const existing = this.refs[kind];
    if (existing && !existing.closed) {
      existing.focus();
      this.render(existing, title, htmlBody);
      return existing;
    }

    // Open immediately within the click event to avoid popup blockers
    const w = window.open('', this.windowName(kind), opts);
    if (!w) return null;

    this.refs[kind] = w;
    this.render(w, title, htmlBody);
    w.focus();

    return w;
  }

  private windowName(kind: ReconWindowKind): string {
    if (kind === 'claims') return 'recon_iq_claims';
    if (kind === 'cms1500') return 'recon_iq_cms1500';
    return 'recon_iq_eob';
  }

  private render(w: Window, title: string, body: string): void {
    w.document.open();
    w.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${this.escape(title)}</title>
          <style>
            html, body { margin: 0; padding: 0; height: 100%; font-family: Poppins, sans-serif; }
            header { padding: 12px 16px; border-bottom: 1px solid #e5e7eb; }
            .wrap { height: 100%; }
          </style>
        </head>
        <body>
          <div class="wrap">
            <header><strong>${this.escape(title)}</strong></header>
            ${body}
          </div>
        </body>
      </html>
    `);
    w.document.close();

    //  This forces Edge to update the window title
    w.document.title = title;
  }

  private renderFull(w: Window, title: string, fullBody: string): void {
    w.document.open();
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${this.escape(title)}</title></head><body>${fullBody}</body></html>`);
    w.document.close();
    w.document.title = title;
  }

  private escape(v: string): string {
    return (v ?? '').replace(/[&<>"']/g, (c) => {
      switch (c) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#39;';
        default: return c;
      }
    });
  }

  private getBaseRect() {
    const x = window.screenX ?? 0;
    const y = window.screenY ?? 0;

    const outerW = window.outerWidth ?? 500;
    const outerH = window.outerHeight ?? 800;

    return { x, y, outerW, outerH };
  }

  private buildFeaturesRect(rect: { left: number; top: number; width: number; height: number }): string {
  return [
    'popup=yes',
    'resizable=yes',
    'scrollbars=yes',
    `width=${Math.floor(rect.width)}`,
    `height=${Math.floor(rect.height)}`,
    `left=${Math.floor(rect.left)}`,
    `top=${Math.floor(rect.top)}`,
  ].join(',');
}


private enforceRect(w: Window, rect: { left: number; top: number; width: number; height: number }): void {
  try {
    // Some browsers need the move/resize after the window exists
    setTimeout(() => {
      if (w.closed) return;
      w.moveTo(Math.floor(rect.left), Math.floor(rect.top));
      w.resizeTo(Math.floor(rect.width), Math.floor(rect.height));
      w.focus();
    }, 0);
  } catch {
    // moveTo/resizeTo can be blocked by browser policies; feature string will still usually work
  }
}

private enforceRectSync(w: Window, rect: { left: number; top: number; width: number; height: number }): void {
  try {
    // Do not delay this - keep it in the click stack
    w.moveTo(Math.floor(rect.left), Math.floor(rect.top));
    w.resizeTo(Math.floor(rect.width), Math.floor(rect.height));
  } catch {
    // Some policies block these; features string still usually applies
  }
}

private areOverlapping(a: Window, b: Window): boolean {
  // screenX/screenY are available on same-origin popups opened by you
  const ax = (a as any).screenX ?? 0;
  const ay = (a as any).screenY ?? 0;
  const bx = (b as any).screenX ?? 0;
  const by = (b as any).screenY ?? 0;

  return Math.abs(ax - bx) < 20 && Math.abs(ay - by) < 20;
}



private getTiledRects(): {
  claims: { left: number; top: number; width: number; height: number };
  eob: { left: number; top: number; width: number; height: number };
} {
  const base = this.getBaseRect();

  const gap = 12;
  const top = base.y + 40;
  const height = Math.max(600, base.outerH - 80);

  const width = Math.max(520, Math.floor((base.outerW - gap) / 2));

  const claims = { left: base.x, top, width, height };
  const eob = { left: base.x + width + gap, top, width, height };

  return { claims, eob };
}

openClaimsWindow(context: { patientAccount: string; paymentId: string; claimId?: string }): void {
  const rects = this.getTiledRects();
  const w = window.open('', 'recon_iq_claims', this.buildFeaturesRect(rects.claims));
  if (!w) return;

  this.refs.claims = w;

  this.render(
    w,
    'Recon-IQ \u2022 Claim Viewer',
    `<h2>Claim Viewer</h2>
     <p><b>Patient Account:</b> ${this.escape(context.patientAccount)}</p>
     <p><b>Check #:</b> ${this.escape(context.paymentId)}</p>
     <p><b>Claim ID:</b> ${this.escape(context.claimId ?? '')}</p>`
  );

  this.enforceRectSync(w, rects.claims);
  w.focus();
}

openPaymentWindow(context: { paymentId: string; referenceId: string; date?: string; payer?: string; type?: string; amount?: string; }): void {
  const rects = this.getTiledRects();
  const w = window.open('', 'recon_iq_payments', this.buildFeaturesRect(rects.claims));
  if (!w) return;

  this.refs.claims = w;
  const isEft   = (context.type ?? '').toUpperCase() === 'EFT';
  const typeLabel = (context.type ?? 'Payment').toUpperCase();
  const accentColor = isEft ? '#2563eb' : '#7c3aed';
  const accentLight = isEft ? '#eff6ff' : '#f5f3ff';
  const accentBorder = isEft ? '#bfdbfe' : '#ddd6fe';
  const typeIcon = isEft ? '\u26A1' : '\uD83C\uDFE6';

  this.renderFull(w, 'Recon-IQ \u2022 Payment Viewer', `
    <style>
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      body { background: #f1f5f9; font-family: 'Segoe UI', system-ui, sans-serif; color: #0f172a; min-height: 100vh; padding: 24px; }
      .page { max-width: 640px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }

      /* Header card */
      .hdr { background: linear-gradient(135deg, ${accentLight} 0%, #e0f2fe 100%); border: 1px solid ${accentBorder}; border-radius: 14px; padding: 24px; display: flex; align-items: flex-start; gap: 16px; }
      .hdr__icon { width: 52px; height: 52px; border-radius: 50%; background: ${accentColor}; display: flex; align-items: center; justify-content: center; font-size: 24px; flex-shrink: 0; box-shadow: 0 4px 14px rgba(0,0,0,.18); }
      .hdr__body { flex: 1; }
      .hdr__type { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; color: ${accentColor}; margin-bottom: 4px; }
      .hdr__amount { font-size: 34px; font-weight: 800; color: #1e3a8a; letter-spacing: -.5px; line-height: 1.1; }
      .hdr__sub { font-size: 12px; color: #1e40af; margin-top: 6px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .hdr__sep { color: #93c5fd; }
      .badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; }
      .badge--type { background: #dbeafe; color: #1d4ed8; border: 1px solid #bfdbfe; }
      .badge--ok   { background: #dcfce7; color: #15803d; border: 1px solid #86efac; }

      /* Detail card */
      .card { background: #fff; border: 1px solid #e7edf5; border-radius: 12px; overflow: hidden; }
      .card__header { display: flex; align-items: center; gap: 8px; padding: 11px 16px; background: #f8fafc; border-bottom: 1px solid #e7edf5; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: #e7edf5; }
      .grid--3 { grid-template-columns: 1fr 1fr 1fr; }
      .cell { background: #fff; padding: 14px 16px; display: flex; flex-direction: column; gap: 3px; }
      .cell--full { grid-column: 1 / -1; }
      .cell__label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; }
      .cell__value { font-size: 14px; font-weight: 600; color: #0f172a; }
      .cell__value--accent { color: ${accentColor}; font-size: 16px; font-weight: 700; }
      .cell__value--green  { color: #15803d; font-size: 16px; font-weight: 700; }
      .mono { font-family: 'Courier New', monospace; font-size: 13px; }

      /* Status strip */
      .status-strip { background: #f0fdf4; border: 1px solid #86efac; border-radius: 10px; padding: 12px 16px; display: flex; align-items: center; gap: 12px; font-size: 13px; color: #15803d; font-weight: 500; }
      .status-strip__icon { font-size: 20px; }

      /* Footer */
      .footer { text-align: center; font-size: 11px; color: #94a3b8; padding-top: 4px; }
    </style>
    <div class="page">

      <div class="hdr">
        <div class="hdr__icon">${typeIcon}</div>
        <div class="hdr__body">
          <div class="hdr__type">${typeLabel} Payment</div>
          <div class="hdr__amount">${this.escape(context.amount ?? '\u2014')}</div>
          <div class="hdr__sub">
            <span>${this.escape(context.payer ?? 'Unknown Payer')}</span>
            <span class="hdr__sep">\u00B7</span>
            <span>${this.escape(context.date ?? '\u2014')}</span>
            <span class="hdr__sep">\u00B7</span>
            <span class="badge badge--type">${typeLabel}</span>
          </div>
        </div>
      </div>

      <div class="status-strip">
        <span class="status-strip__icon">\u2705</span>
        Payment received and logged in bank feed \u2014 pending ERA/EOB match.
      </div>

      <div class="card">
        <div class="card__header">\uD83D\uDCC4 Payment Details</div>
        <div class="grid">
          <div class="cell">
            <span class="cell__label">Bank Deposit ID</span>
            <span class="cell__value mono">${this.escape(context.paymentId)}</span>
          </div>
          <div class="cell">
            <span class="cell__label">${isEft ? 'EFT Trace Number' : 'Check Number'}</span>
            <span class="cell__value mono">${this.escape(context.referenceId)}</span>
          </div>
          <div class="cell">
            <span class="cell__label">Payment Date</span>
            <span class="cell__value">${this.escape(context.date ?? '\u2014')}</span>
          </div>
          <div class="cell">
            <span class="cell__label">Payment Type</span>
            <span class="cell__value"><span class="badge badge--type">${typeLabel}</span></span>
          </div>
          <div class="cell">
            <span class="cell__label">Payer</span>
            <span class="cell__value">${this.escape(context.payer ?? 'Unknown')}</span>
          </div>
          <div class="cell">
            <span class="cell__label">Amount</span>
            <span class="cell__value cell__value--green">${this.escape(context.amount ?? '\u2014')}</span>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card__header">\u2699\uFE0F Reconciliation Status</div>
        <div class="grid grid--3">
          <div class="cell">
            <span class="cell__label">Bank Feed</span>
            <span class="cell__value" style="color:#15803d">\u2713 Matched</span>
          </div>
          <div class="cell">
            <span class="cell__label">ERA/EOB Link</span>
            <span class="cell__value" style="color:#d97706">Pending</span>
          </div>
          <div class="cell">
            <span class="cell__label">Posted to PMS</span>
            <span class="cell__value" style="color:#d97706">Pending</span>
          </div>
        </div>
      </div>

      <div class="footer">Recon-IQ \u2022 Payment Viewer &nbsp;|&nbsp; ${this.escape(context.paymentId)}</div>
    </div>
  `);

  this.enforceRectSync(w, rects.claims);
  w.focus();
}

openEobWindow(context: { eobId: string; referenceId?: string; date?: string; payer?: string; type?: string; amount?: string; }): void {
  const rects = this.getTiledRects();
  const w = window.open('', 'recon_iq_eob', this.buildFeaturesRect(rects.eob));
  if (!w) return;

  this.refs.eob = w;
  const isEra     = (context.type ?? '').toUpperCase() === 'ERA' || (context.eobId ?? '').startsWith('RMF');
  const typeLabel = isEra ? 'ERA' : 'EOB';
  const docLabel  = isEra ? 'Electronic Remittance Advice' : 'Explanation of Benefits';

  this.renderFull(w, `Recon-IQ \u2022 ${typeLabel} Viewer`, `
    <style>
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      body { background: #f1f5f9; font-family: 'Segoe UI', system-ui, sans-serif; color: #0f172a; min-height: 100vh; padding: 24px; }
      .page { max-width: 640px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }

      .hdr { background: linear-gradient(135deg, #faf5ff 0%, #ede9fe 100%); border: 1px solid #c4b5fd; border-radius: 14px; padding: 24px; display: flex; align-items: flex-start; gap: 16px; }
      .hdr__icon { width: 52px; height: 52px; border-radius: 50%; background: #7c3aed; display: flex; align-items: center; justify-content: center; font-size: 24px; flex-shrink: 0; box-shadow: 0 4px 14px rgba(124,58,237,.25); }
      .hdr__body { flex: 1; }
      .hdr__type { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; color: #6d28d9; margin-bottom: 4px; }
      .hdr__amount { font-size: 34px; font-weight: 800; color: #3b0764; letter-spacing: -.5px; line-height: 1.1; }
      .hdr__sub { font-size: 12px; color: #6d28d9; margin-top: 6px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .hdr__sep { color: #c4b5fd; }
      .badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; letter-spacing: .02em; }
      .badge--era { background: #ede9fe; color: #6d28d9; border: 1px solid #c4b5fd; }
      .badge--eob { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }

      .status-strip { background: #fef9c3; border: 1px solid #fde68a; border-radius: 10px; padding: 12px 16px; display: flex; align-items: center; gap: 12px; font-size: 13px; color: #92400e; font-weight: 500; }
      .status-strip__icon { font-size: 20px; }

      .card { background: #fff; border: 1px solid #e7edf5; border-radius: 12px; overflow: hidden; }
      .card__header { display: flex; align-items: center; gap: 8px; padding: 11px 16px; background: #f8fafc; border-bottom: 1px solid #e7edf5; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: #e7edf5; }
      .grid--3 { grid-template-columns: 1fr 1fr 1fr; }
      .cell { background: #fff; padding: 14px 16px; display: flex; flex-direction: column; gap: 3px; }
      .cell__label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; }
      .cell__value { font-size: 14px; font-weight: 600; color: #0f172a; }
      .cell__value--accent { color: #7c3aed; font-size: 16px; font-weight: 700; }
      .mono { font-family: 'Courier New', monospace; font-size: 13px; }

      .footer { text-align: center; font-size: 11px; color: #94a3b8; padding-top: 4px; }
      .link-hint { text-align: center; font-size: 12px; color: #6d28d9; padding: 4px 0; }
    </style>
    <div class="page">

      <div class="hdr">
        <div class="hdr__icon">\uD83D\uDCCB</div>
        <div class="hdr__body">
          <div class="hdr__type">${docLabel}</div>
          <div class="hdr__amount">${this.escape(context.amount ?? '\u2014')}</div>
          <div class="hdr__sub">
            <span>${this.escape(context.payer ?? 'Unknown Payer')}</span>
            <span class="hdr__sep">\u00B7</span>
            <span>${this.escape(context.date ?? '\u2014')}</span>
            <span class="hdr__sep">\u00B7</span>
            <span class="badge badge--${isEra ? 'era' : 'eob'}">${typeLabel}</span>
          </div>
        </div>
      </div>

      <div class="status-strip">
        <span class="status-strip__icon">\u23F3</span>
        ${typeLabel} received from payer \u2014 awaiting bank deposit match to complete reconciliation.
      </div>

      <div class="card">
        <div class="card__header">\uD83D\uDCC4 Remittance Details</div>
        <div class="grid">
          <div class="cell">
            <span class="cell__label">Remittance File ID</span>
            <span class="cell__value mono">${this.escape(context.eobId)}</span>
          </div>
          <div class="cell">
            <span class="cell__label">${isEra ? 'ERA Trace Number' : 'EOB Reference'}</span>
            <span class="cell__value mono">${this.escape(context.referenceId ?? '\u2014')}</span>
          </div>
          <div class="cell">
            <span class="cell__label">File Date</span>
            <span class="cell__value">${this.escape(context.date ?? '\u2014')}</span>
          </div>
          <div class="cell">
            <span class="cell__label">File Type</span>
            <span class="cell__value"><span class="badge badge--${isEra ? 'era' : 'eob'}">${typeLabel}</span></span>
          </div>
          <div class="cell">
            <span class="cell__label">Payer</span>
            <span class="cell__value">${this.escape(context.payer ?? 'Unknown')}</span>
          </div>
          <div class="cell">
            <span class="cell__label">Remittance Amount</span>
            <span class="cell__value cell__value--accent">${this.escape(context.amount ?? '\u2014')}</span>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card__header">\u2699\uFE0F Reconciliation Status</div>
        <div class="grid grid--3">
          <div class="cell">
            <span class="cell__label">${typeLabel} Received</span>
            <span class="cell__value" style="color:#15803d">\u2713 Complete</span>
          </div>
          <div class="cell">
            <span class="cell__label">Bank Match</span>
            <span class="cell__value" style="color:#d97706">Pending</span>
          </div>
          <div class="cell">
            <span class="cell__label">Posted to PMS</span>
            <span class="cell__value" style="color:#d97706">Pending</span>
          </div>
        </div>
      </div>

      <div class="link-hint">To view claim adjudication detail, open ERA Ingestion and search for ${this.escape(context.eobId)}</div>
      <div class="footer">Recon-IQ \u2022 ${typeLabel} Viewer &nbsp;|&nbsp; ${this.escape(context.eobId)}</div>
    </div>
  `);

  this.enforceRectSync(w, rects.eob);
  w.focus();
}

openReconciliationWindow(context: { eobId: string; amount: string; location?: string }): void {
  const rects = this.getTiledRects();
  const w = window.open('', 'recon_iq_eob', this.buildFeaturesRect(rects.eob));
  if (!w) return;

  this.refs.eob = w;

  this.render(
    w,
    'Recon-IQ \u2022 EOB Viewer',
    `<h2>EOB Viewer</h2>
     <p><b>Patient Account:</b> ${this.escape(context.location)}</p>
     <p><b>Check #:</b> ${this.escape(context.amount)}</p>
     <p><b>EOB ID:</b> ${this.escape(context.eobId ?? '')}</p>
     `
  );

  this.enforceRectSync(w, rects.eob);
  w.focus();
}

}
