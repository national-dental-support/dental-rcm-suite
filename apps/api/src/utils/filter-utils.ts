/**
 * Validates that a date string matches YYYY-MM-DD (or YYYY-MM-DD HH:MM[:SS]) format.
 * Returns the sanitized string or null if invalid.
 */
function sanitizeDate(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  // Only allow ISO date / datetime formats - prevents SQL injection in date literals
  if (!/^\d{4}-\d{2}-\d{2}(\s\d{2}:\d{2}(:\d{2})?)?$/.test(trimmed)) return null;
  return trimmed;
}

export class FilterUtils {
  /**
   * Builds SQL filter conditions based on provided filters.
   * All string values are escaped via single-quote doubling (T-SQL standard).
   * All date values are validated against a strict ISO format.
   *
   * Disclaimer: This only works for Procedures....for now.
   */
  public static buildFilterConditions(filters: any): string {
    const conditions: string[] = [];

    // Location filter
    if (filters.location && filters.location.toLowerCase() !== 'all') {
      const location = filters.location.replace(/'/g, "''");
      conditions.push(`p.location = '${location}'`);
    }

    // Provider filter
    if (filters.provider && filters.provider.toLowerCase() !== 'all') {
      const provider = filters.provider.replace(/'/g, "''");
      conditions.push(`p.provider = '${provider}'`);
    }

    // Query filter
    if (filters.query && filters.query !== 'all') {
      const query = filters.query.replace(/'/g, "''");
      conditions.push(`(p.patient = '${query}'
        OR p.claim_id = '${query}'
        OR p.payer = '${query}'
        OR p.provider = '${query}')`);
    }

    // Payer filter
    if (filters.payer && filters.payer.toLowerCase() !== 'all') {
      const payer = filters.payer.replace(/'/g, "''");
      conditions.push(`p.payer = '${payer}'`);
    }

    // Payment received date range
    if (filters.payment_received?.start_date || filters.payment_received?.end_date) {
      /* istanbul ignore next */
      const startDate = sanitizeDate(filters.payment_received?.start_date);
      /* istanbul ignore next */
      const endDate   = sanitizeDate(filters.payment_received?.end_date);

      if (startDate && endDate) {
        conditions.push(`p.payment_date BETWEEN '${startDate}' AND '${endDate} 23:59:59'`);
      } else if (startDate) {
        conditions.push(`p.payment_date >= '${startDate}'`);
      } else if (endDate) {
        conditions.push(`p.payment_date <= '${endDate} 23:59:59'`);
      }
    }

    // Date of service range
    if (filters.date_of_service?.start_date || filters.date_of_service?.end_date) {
      /* istanbul ignore next */
      const startDate = sanitizeDate(filters.date_of_service?.start_date);
      /* istanbul ignore next */
      const endDate   = sanitizeDate(filters.date_of_service?.end_date);

      if (startDate && endDate) {
        conditions.push(`p.date_of_service BETWEEN '${startDate}' AND '${endDate} 23:59:59'`);
      } else if (startDate) {
        conditions.push(`p.date_of_service >= '${startDate}'`);
      } else if (endDate) {
        conditions.push(`p.date_of_service <= '${endDate} 23:59:59'`);
      }
    }

    // CPT group filter
    if (filters.cpt_group && filters.cpt_group.toLowerCase() !== 'all') {
      const cptCategory = filters.cpt_group.replace(/'/g, "''");
      conditions.push(`p.cpt_category_id = '${cptCategory}'`);
    }

    // AR balance range
    if (filters.ar_balance && filters.ar_balance.toLowerCase() !== 'all') {
      conditions.push(`ISNUMERIC(p.ar_balance) = 1`);
      switch (filters.ar_balance) {
        case 'Over $500':
          conditions.push(`CAST(p.ar_balance AS FLOAT) > 500`);
          break;
        case '$400-$499':
          conditions.push(`CAST(p.ar_balance AS FLOAT) BETWEEN 400 AND 499`);
          break;
        case '$300-$399':
          conditions.push(`CAST(p.ar_balance AS FLOAT) BETWEEN 300 AND 399`);
          break;
        case '$200-$299':
          conditions.push(`CAST(p.ar_balance AS FLOAT) BETWEEN 200 AND 299`);
          break;
        case '$100-$199':
          conditions.push(`CAST(p.ar_balance AS FLOAT) BETWEEN 100 AND 199`);
          break;
        case '$50-$99':
          conditions.push(`CAST(p.ar_balance AS FLOAT) BETWEEN 50 AND 99`);
          break;
        case '$0-$49':
          conditions.push(`CAST(p.ar_balance AS FLOAT) BETWEEN 0 AND 49`);
          break;
      }
    }

    // Combine conditions into a valid SQL WHERE clause
    if (conditions.length > 0) {
      return `WHERE ${conditions.join(' AND ')}`;
    }

    // Return an empty string if no conditions are provided
    return '';
  }
}
