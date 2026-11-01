/*************************************************************
 *  DateFilterUtils.ts
 *  ----------------------------------------------------------
 *  Builds three WHERE-clause fragments + the parameters to
 *  bind for c.SDOS (invoice line items), p.timestamp (payments),
 *  and i.ServiceDt (invoices).  It gracefully handles the four
 *  possible inputs coming from the frontend:
 *
 *     1. start-only   ->  filter FROM that day forward
 *     2. end-only     ->  filter UP TO that moment
 *     3. both         ->  closed range
 *     4. "" / ""      ->  current year-to-date (Jan-01 .. now)
 *
 *  Nothing to change on the frontend: empty strings are treated
 *  as "no date".
 *************************************************************/

import logger from './logger';

export interface RequestObject {
  startDate?: string;   // may be "", undefined, or "YYYY-MM-DD"
  endDate?:   string;   // may be "", undefined, or "YYYY-MM-DD"
}

export interface DateFilterResult {
  dateConditionForInvoiceLineItem: string;     // alias c
  dateConditionForPayments:       string;     // alias p
  dateConditionForInsurancePayments: string  // alias ins
  dateConditionForInvoice:        string;     // alias i
  params: { start_date?: string; end_date?: string };
  priorYearParams?: { prior_start_date?: string; prior_end_date?: string };
  priorYearConditions?: {
    dateConditionForInvoiceLineItem: string;
    dateConditionForPayments: string;
    dateConditionForInsurancePayments: string;
    dateConditionForInvoice: string;
  };
}

/* --- helpers ----------------------------------------------- */
const isReal = (d?: string): d is string => !!d && d.trim().length > 0;
const formatDate = (d: Date): string => d.toISOString().split('T')[0];

/* Append this to get the full day (when neccesary) */
/* istanbul ignore next */
const toEoD  = (d: string) => `${d.trim()}T23:59:59.997`;

export class DateFilterUtils {
  public filterByDateObject({ startDate, endDate }: RequestObject): DateFilterResult {
    const snippets = { invoiceLineItem: '', payments: '', insurancePayments:'', invoice: '' };
    const params: { start_date?: string; end_date?: string } = {};

    const priorSnippets = { invoiceLineItem: '', payments: '', insurancePayments: '', invoice: '' };
    const priorYearParams: { prior_start_date?: string; prior_end_date?: string } = {};

    const shiftYear = (d: string) => formatDate(new Date(new Date(d).setFullYear(new Date(d).getFullYear() - 1)));

    /* -- lower bound (>=) ------------------------------------ */
    if (isReal(startDate)) {
      // keep simple YYYY-MM-DD
      params.start_date = startDate.trim();
      priorYearParams.prior_start_date = shiftYear(startDate.trim());
      snippets.invoiceLineItem += 'AND c.SDOS      >= @start_date ';
      snippets.payments        += 'AND p.timestamp >= @start_date ';
      snippets.insurancePayments += 'AND ins.date >= @start_date ';
      snippets.invoice         += 'AND i.ServiceDt >= @start_date ';
      priorSnippets.invoiceLineItem += 'AND c.SDOS      >= @prior_start_date ';
      priorSnippets.payments        += 'AND p.timestamp >= @prior_start_date ';
      priorSnippets.insurancePayments += 'AND ins.date >= @prior_start_date ';
      priorSnippets.invoice         += 'AND i.ServiceDt >= @prior_start_date ';
    }

    /* -- upper bound (<=) ------------------------------------ */
    if (isReal(endDate)) {
      // keep simple YYYY-MM-DD
      params.end_date = endDate.trim();
      priorYearParams.prior_end_date = shiftYear(endDate.trim());
      snippets.invoiceLineItem += 'AND c.SDOS      <= @end_date ';
      snippets.payments        += 'AND p.timestamp <= @end_date ';
      snippets.insurancePayments += 'AND ins.date <= @end_date ';
      snippets.invoice         += 'AND i.ServiceDt <= @end_date ';
      priorSnippets.invoiceLineItem += 'AND c.SDOS      <= @prior_end_date ';
      priorSnippets.payments        += 'AND p.timestamp <= @prior_end_date ';
      priorSnippets.insurancePayments += 'AND ins.date <= @prior_end_date ';
      priorSnippets.invoice         += 'AND i.ServiceDt <= @prior_end_date ';
    }

    /* -- default: current YTD when both are blank ----------- */
    if (!isReal(startDate) && !isReal(endDate)) {
      const now       = new Date();
      const yearStart = `${now.getFullYear()}-01-01`;

      params.start_date = yearStart;
      params.end_date   = formatDate(now);

      const cond = 'AND c.SDOS      >= @start_date AND c.SDOS      <= @end_date ';
      snippets.invoiceLineItem = cond;
      snippets.payments        = cond.replace(/c\.SDOS/g, 'p.timestamp');
      snippets.insurancePayments = cond.replace(/c\.SDOS/g, 'ins.date');
      snippets.invoice         = cond.replace(/c\.SDOS/g, 'i.ServiceDt');

      const priorStart = `${now.getFullYear() - 1}-01-01`;
      const priorEnd = formatDate(new Date(new Date().setFullYear(now.getFullYear() - 1)));
      priorYearParams.prior_start_date = priorStart;
      priorYearParams.prior_end_date = priorEnd;

      const priorCond = 'AND c.SDOS      >= @prior_start_date AND c.SDOS      <= @prior_end_date ';
      priorSnippets.invoiceLineItem = priorCond;
      priorSnippets.payments        = priorCond.replace(/c\.SDOS/g, 'p.timestamp');
      priorSnippets.insurancePayments = priorCond.replace(/c\.SDOS/g, 'ins.date');
      priorSnippets.invoice         = priorCond.replace(/c\.SDOS/g, 'i.ServiceDt');
    }

    logger.info('DateFilterUtils \u2013 params', params);
    logger.info('DateFilterUtils \u2013 priorYearParams', priorYearParams);

    return {
      dateConditionForInvoiceLineItem: snippets.invoiceLineItem.trim(),
      dateConditionForPayments:       snippets.payments.trim(),
      dateConditionForInsurancePayments: snippets.insurancePayments.trim(),
      dateConditionForInvoice:        snippets.invoice.trim(),
      params,
      priorYearParams,
      priorYearConditions: {
        dateConditionForInvoiceLineItem: priorSnippets.invoiceLineItem.trim(),
        dateConditionForPayments:       priorSnippets.payments.trim(),
        dateConditionForInsurancePayments: priorSnippets.insurancePayments.trim(),
        dateConditionForInvoice:        priorSnippets.invoice.trim()
      }
    };
  }
}
