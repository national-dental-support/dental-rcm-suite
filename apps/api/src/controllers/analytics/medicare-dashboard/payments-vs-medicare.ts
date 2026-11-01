import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../../utils/logger';
import { DateFilterUtils } from '../../../utils/date-filters';
import { DatabaseConnectionController } from '../../database-connection-controller';

export class PaymentsVsMedicareByDOS extends DatabaseConnectionController {
  private dateFilter: DateFilterUtils;

  constructor() {
    super();
    this.dateFilter = new DateFilterUtils();
  }

  public get = async (req: Request, res: Response): Promise<Response> => {
    const filters = req.body.filters || {};
    const practiceGroups: string[] = Array.isArray(filters.practice_groups) ? filters.practice_groups : [];
    const locations: string[] = Array.isArray(filters.location) ? filters.location : [];
    const providers: string[] =
      Array.isArray(filters.provider)
        ? filters.provider
        : typeof filters.provider === 'string'
          ? filters.provider.trim() === '' || filters.provider.toLowerCase() === 'all'
            ? ['all']
            : [filters.provider]
          : ['all'];

    /* istanbul ignore next */
    const { start_date, end_date } = filters?.date_of_service || {};
    const dateFilterRequestObject = { startDate: start_date, endDate: end_date };
    const generatedDateRangeByDateObject = this.dateFilter.filterByDateObject(dateFilterRequestObject);

    const buildFilters = (dbIndex: number) => {
      const skipLocation = locations.length === 0 || locations.includes('all');
      const skipGroup = practiceGroups.length === 0 || practiceGroups.includes('all');
      const skipProvider = providers.length === 0 || providers.includes('all');

      const location = !skipLocation
        ? `AND f.name IN (${locations.map((_, i) => `@location${dbIndex}_${i}`).join(', ')})`
        : '';
      const group = !skipGroup
        ? `AND f.PayableTo IN (${practiceGroups.map((_, i) => `@practice_groups${dbIndex}_${i}`).join(', ')})`
        : '';
      const provider = !skipProvider
        ? `AND (u.ufname + ' ' + u.ulname) IN (${providers.map((_, i) => `@provider${dbIndex}_${i}`).join(', ')})`
        : '';

      return { location, group, provider };
    };

    const allowableUnion = this.databases.map((db, dbIndex) => {
      const { location, group, provider } = buildFilters(dbIndex);
      return `
        SELECT
          CONVERT(VARCHAR(10), DATEFROMPARTS(YEAR(c.sdos), MONTH(c.sdos), 1), 23) AS date_of_service,
          SUM(mcrABCga.mcr_allowed_national) AS medicare_allowable
        FROM dbo.edi_inv_cpt AS c
        LEFT JOIN negan.dbo.mcr_allowed_by_cpt_ga AS mcrABCga ON c.code = mcrABCga.cpt_code
        JOIN dbo.enc AS e ON e.Invoiceid = c.Invoiceid
        JOIN dbo.edi_invoice AS i ON i.Encounterid = e.encounterid
        LEFT JOIN dbo.users AS u ON c.RendPrUserId = u.uid
        LEFT JOIN dbo.edi_facilities AS f ON i.InvFacilityid = f.id
        WHERE c.deleteFlag = 0 AND e.ClaimReq = 1 AND i.DeleteFlag = 0 AND e.deleteFlag = 0
        ${provider} ${group} ${location}
        ${generatedDateRangeByDateObject.dateConditionForInvoiceLineItem}
        GROUP BY YEAR(c.sdos), MONTH(c.sdos)
      `;
    }).join('UNION ALL');

    const allowableQuery = `
      SELECT date_of_service, SUM(medicare_allowable) AS medicare_allowable
      FROM (${allowableUnion}) AS Combined
      GROUP BY date_of_service
      ORDER BY date_of_service
    `;

    const paymentsUnion = this.databases.map((db, dbIndex) => {
      const { location, group, provider } = buildFilters(dbIndex);
      return `
        SELECT 
          p.paid AS paid,
          p.timestamp AS timestamp,
          f.PayableTo,
          i.ServiceDt
        FROM dbo.edi_paymentdetail p  
        LEFT JOIN dbo.edi_inspayments ins ON p.paymentId = ins.paymentId
        LEFT JOIN dbo.edi_invoice i ON p.invoiceId = i.id
        LEFT JOIN dbo.edi_facilities f ON i.InvFacilityId = f.id
        LEFT JOIN dbo.users u ON i.RenProviderId = u.uid
        WHERE 1=1 AND ins.deleteFlag <> 1 AND i.DeleteFlag <> 1 AND ins.PayorType = 1
        ${generatedDateRangeByDateObject.dateConditionForInvoice}
        ${provider} ${group} ${location}
      `;
    }).join('UNION ALL');

    const paymentsQuery = `
      SELECT date_of_service, SUM(ISNULL(paid, 0)) AS payments
      FROM (
        SELECT 
          CONVERT(VARCHAR(10), DATEFROMPARTS(YEAR(ServiceDt), MONTH(ServiceDt), 1), 23) AS date_of_service,
          paid
        FROM (${paymentsUnion}) AS RawPayments
      ) AS Payments
      GROUP BY date_of_service
      ORDER BY date_of_service
    `;

    try {
      const request = this.pool.request();

      if (generatedDateRangeByDateObject.params.start_date)
        request.input('start_date', sql.DateTime, new Date(generatedDateRangeByDateObject.params.start_date));
      if (generatedDateRangeByDateObject.params.end_date)
        request.input('end_date', sql.DateTime, new Date(generatedDateRangeByDateObject.params.end_date));

      // Bind dynamic filters
      this.databases.forEach((_, dbIndex) => {
        locations.forEach((val, i) => request.input(`location${dbIndex}_${i}`, sql.VarChar, val));
        practiceGroups.forEach((val, i) => request.input(`practice_groups${dbIndex}_${i}`, sql.VarChar, val));
        providers.forEach((val, i) => request.input(`provider${dbIndex}_${i}`, sql.VarChar, val));
      });

      const allowableResult = await request.query(allowableQuery);
      const paymentsResult = await request.query(paymentsQuery);

      const allowableData = allowableResult.recordset;
      const paymentData = paymentsResult.recordset;

      const combined = allowableData.map(record => {
        const match = paymentData.find(p => p.date_of_service === record.date_of_service);
        const payments = match?.payments ?? 0;
        const medicare_allowable = record.medicare_allowable ?? 0;
        return {
          date_of_service: record.date_of_service,
          medicare_allowable,
          payments,
          uncollected: medicare_allowable - payments,
          percent_of_payments: (payments / medicare_allowable) * 100
        };
      });

      return res.status(200).json(combined);
    } catch (error: any) {
      logger.error(`PaymentsVsMedicareByDOS.get - Error executing query`, { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}

export const paymentsVsMedicareByDOS = new PaymentsVsMedicareByDOS();
