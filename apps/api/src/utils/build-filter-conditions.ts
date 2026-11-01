// Deprecating
import sql from 'mssql';

export interface FilterParam {
  name: string;
  /** Call request.input(p.name, sql.NVarChar, p.value) to bind this parameter. */
  value: string;
}

export interface FilterResult {
  conditions: string;
  /** Bind each entry via request.input(p.name, sql.NVarChar, p.value) before executing the query. */
  params: FilterParam[];
}

export const buildFilterConditions = (filters: any): FilterResult => {
  console.log(
    'buildFilterConditions; buildFilterConditions; Filters',
    filters,
  );

  let conditions = '';
  const params: FilterParam[] = [];
  let paramIndex = 0;

  const nextParam = (prefix: string) => `_bfc_${prefix}_${paramIndex++}`;

  const addCondition = (condition: string) => {
    conditions += ` ${condition}`;
  };

  const addParam = (name: string, value: string) => params.push({ name, value });

  // Location filter
  if (filters.location && filters.location.toLowerCase() !== 'all') {
    console.log('buildFilterConditions, location detected');
    const pName = nextParam('loc');
    addParam(pName, filters.location);
    addCondition(`AND p.location = @${pName}`);
  };

  // Provider filter
  if (filters.provider && filters.provider.toLowerCase() !== 'all') {
    console.log('buildFilterConditions, provider detected');
    const pName = nextParam('prov');
    addParam(pName, filters.provider);
    addCondition(`AND p.provider = @${pName}`);
  };

  // Query filter (search-like functionality)
  if (filters.query && filters.query !== 'all') {
    const pName = nextParam('q');
    addParam(pName, filters.query);
    addCondition(`AND (p.patient = @${pName}
          OR p.claim_id = @${pName}
          OR p.payer = @${pName}
          OR p.provider = @${pName})`);
  };

  // Payer filter
  if (filters.payer && filters.payer.toLowerCase() !== 'all') {
    console.log('buildFilterConditions, payer detected');
    const pName = nextParam('payer');
    addParam(pName, filters.payer);
    addCondition(`AND p.payer = @${pName}`);
  };

  // Payment received date range
  if (
    filters.payment_received?.start_date ||
    filters.payment_received?.end_date
  ) {
    /* istanbul ignore next */
    const startDate = filters.payment_received?.start_date?.trim();
    /* istanbul ignore next */
    const endDate = filters.payment_received?.end_date?.trim();

    if (startDate && endDate) {
      const pStart = nextParam('prStart');
      const pEnd   = nextParam('prEnd');
      addParam(pStart, startDate);
      addParam(pEnd,   `${endDate} 23:59:59`);
      addCondition(`AND p.payment_date BETWEEN @${pStart} AND @${pEnd}`);
    } else if (startDate) {
      const pStart = nextParam('prStart');
      addParam(pStart, startDate);
      addCondition(`AND p.payment_date >= @${pStart}`);
    } else if (endDate) {
      const pEnd = nextParam('prEnd');
      addParam(pEnd, `${endDate} 23:59:59`);
      addCondition(`AND p.payment_date <= @${pEnd}`);
    }

    console.log('buildFilterConditions; payment_received range:', {
      startDate,
      endDate,
    });
  };

  // Date of service range
  if (
    filters.date_of_service?.start_date ||
    filters.date_of_service?.end_date
  ) {
    /* istanbul ignore next */
    const startDate = filters.date_of_service?.start_date?.trim();
    /* istanbul ignore next */
    const endDate = filters.date_of_service?.end_date?.trim();

    if (startDate && endDate) {
      const pStart = nextParam('dosStart');
      const pEnd   = nextParam('dosEnd');
      addParam(pStart, startDate);
      addParam(pEnd,   `${endDate} 23:59:59`);
      addCondition(`AND p.date_of_service BETWEEN @${pStart} AND @${pEnd}`);
    } else if (startDate) {
      const pStart = nextParam('dosStart');
      addParam(pStart, startDate);
      addCondition(`AND p.date_of_service >= @${pStart}`);
    } else if (endDate) {
      const pEnd = nextParam('dosEnd');
      addParam(pEnd, `${endDate} 23:59:59`);
      addCondition(`AND p.date_of_service <= @${pEnd}`);
    }

    console.log('buildFilterConditions; date_of_service range:', {
      startDate,
      endDate,
    });
  };

  // CPT group filter
  if (filters.cpt_group && filters.cpt_group.toLowerCase() !== 'all') {
    console.log('buildFilterConditions, CPT category detected');
    const pName = nextParam('cpt');
    addParam(pName, filters.cpt_group);
    addCondition(`AND p.cpt_category_id = @${pName}`);
  };

  // AR balance range
  if (filters.ar_balance && filters.ar_balance.toLowerCase() !== 'all') {
    console.log('buildFilterConditions, AR balance detected');
    addCondition(`AND ISNUMERIC(p.ar_balance) = 1`); // Ensure only numeric values are processed
    switch (filters.ar_balance) {
      case 'Over $500':
        addCondition(`AND CAST(p.ar_balance AS FLOAT) > 500`);
        break;
      case '$400-$499':
        addCondition(`AND CAST(p.ar_balance AS FLOAT) BETWEEN 400 AND 499`);
        break;
      case '$300-$399':
        addCondition(`AND CAST(p.ar_balance AS FLOAT) BETWEEN 300 AND 399`);
        break;
      case '$200-$299':
        addCondition(`AND CAST(p.ar_balance AS FLOAT) BETWEEN 200 AND 299`);
        break;
      case '$100-$199':
        addCondition(`AND CAST(p.ar_balance AS FLOAT) BETWEEN 100 AND 199`);
        break;
      case '$50-$99':
        addCondition(`AND CAST(p.ar_balance AS FLOAT) BETWEEN 50 AND 99`);
        break;
      case '$0-$49':
        addCondition(`AND CAST(p.ar_balance AS FLOAT) BETWEEN 0 AND 49`);
        break;
    }
  }

  return { conditions, params };
};
