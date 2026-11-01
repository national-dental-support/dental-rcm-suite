import { Request, Response } from 'express';
import sql from 'mssql';
import { formatDate, getFirstDayTwelveMonthsAgo, getLastDayOfPreviousMonth } from '../../../utils/general-utils';
import logger from '../../../utils/logger';
import { DatabaseConnectionController } from '../../database-connection-controller';
import { DateFilterUtils } from '../../../utils/date-filters';

/**
 * Controller for fetching uncollected Medicare claims per date of service (DOS).
 */
export class UncollectedMCRPerClaimByDOS extends DatabaseConnectionController {
    private dateFilter: DateFilterUtils;
  
  constructor() {
    super();
    this.dateFilter = new DateFilterUtils();
  };

  private generateUnionQuery(
    dateCondition: string,
    locations: string[],
    practiceGroups: string[],
    providers: string[]
  ): string { 
    return this.databases.map((db, dbIndex) => {
    /** 
     * The "skip variables helps the program know 
     * if we should add anything to the filter based 
     * on the the 
     * 
     **/
      const skipLocationFilter = locations.length === 0 || locations.map(l => l.toLowerCase()).includes('all');
      const skipPracticeGroupFilter = practiceGroups.length === 0 || practiceGroups.map(pg => pg.toLowerCase()).includes('all');
      const skipProviderFilter = providers.length === 0 || providers.map(p => p.toLowerCase()).includes('all');

      const locationFilter = !skipLocationFilter
        ? `AND f.name IN (${locations.map((_, i) => `@location${dbIndex}_${i}`).join(', ')})`
        : '';
      const practiceGroupsFilter = !skipPracticeGroupFilter
        ? `AND f.PayableTo IN (${practiceGroups.map((_, i) => `@practice_groups${dbIndex}_${i}`).join(', ')})`
        : '';
      const providerFilter = !skipProviderFilter
        ? `AND (u.ufname + ' ' + u.ulname) IN (${providers.map((_, i) => `@provider${dbIndex}_${i}`).join(', ')})`
        : '';

      return `
      SELECT 
          SUM(CASE WHEN 
            (CASE 
               WHEN (mcrABCga.mcr_allowed_national - ei.NetPayment) > 0 
               THEN (mcrABCga.mcr_allowed_national - ei.NetPayment) 
               ELSE 0 
             END) > 500 THEN 
               (mcrABCga.mcr_allowed_national - ei.NetPayment)
               ELSE 0 END) AS [Over $500],
          SUM(CASE WHEN 
            (mcrABCga.mcr_allowed_national - ei.NetPayment) BETWEEN 400 AND 499 THEN 
               (mcrABCga.mcr_allowed_national - ei.NetPayment) 
               ELSE 0 END) AS [$400-$499],
          SUM(CASE WHEN 
            (mcrABCga.mcr_allowed_national - ei.NetPayment) BETWEEN 300 AND 399 THEN 
               (mcrABCga.mcr_allowed_national - ei.NetPayment) 
               ELSE 0 END) AS [$300-$399],      
          SUM(CASE WHEN 
            (mcrABCga.mcr_allowed_national - ei.NetPayment) BETWEEN 200 AND 299 THEN 
               (mcrABCga.mcr_allowed_national - ei.NetPayment) 
               ELSE 0 END) AS [$200-$299],
          SUM(CASE WHEN 
            (mcrABCga.mcr_allowed_national - ei.NetPayment) BETWEEN 100 AND 199 THEN 
               (mcrABCga.mcr_allowed_national - ei.NetPayment) 
               ELSE 0 END) AS [$100-$199], 
          SUM(CASE WHEN 
            (mcrABCga.mcr_allowed_national - ei.NetPayment) BETWEEN 50 AND 99 THEN 
               (mcrABCga.mcr_allowed_national - ei.NetPayment) 
               ELSE 0 END) AS [$50-$99],
          SUM(CASE WHEN 
            (mcrABCga.mcr_allowed_national - ei.NetPayment) BETWEEN 0 AND 49 THEN 
               (mcrABCga.mcr_allowed_national - ei.NetPayment) 
               ELSE 0 END) AS [$0-$49]     
        FROM dbo.edi_inv_cpt AS c
        LEFT JOIN negan.dbo.mcr_allowed_by_cpt_ga AS mcrABCga
          ON c.code = mcrABCga.cpt_code
        LEFT JOIN 
          dbo.users AS u ON c.RendPrUserId = u.UID
        LEFT JOIN 
          dbo.edi_invoice AS inv ON c.Invoiceid = inv.Id
        LEFT JOIN 
          dbo.edi_facilities AS f ON inv.InvFacilityid = f.Id
        
        JOIN dbo.enc AS e
          ON e.Invoiceid = c.Invoiceid
        JOIN dbo.edi_invoice AS ei
          ON ei.Encounterid = e.Encounterid
        WHERE c.deleteFlag = 0
          AND e.ClaimReq = 1
          AND ei.DeleteFlag = 0
          AND e.deleteFlag = 0
          ${providerFilter}
          ${practiceGroupsFilter}
          ${locationFilter}
          ${dateCondition}
      `;
    }).join('UNION ALL')
  };

  /**
   * Handles the GET request to retrieve uncollected Medicare claim amounts per claim category.
   * 
   * @param {Request} req - Express request object.
   * @param {Response} res - Express response object.
   * @returns {Promise<Response>} - JSON response with uncollected amounts grouped by price categories.
   */
  public get = async (req: Request, res: Response): Promise<Response> => {
    const filters = req.body.filters || {};
    const practice_groups: string[] = Array.isArray(filters.practice_groups) ? filters.practice_groups : [];
    const locations: string[] = Array.isArray(filters.location) ? filters.location : [];
    const providers: string[] =
      Array.isArray(filters.provider)
        ? filters.provider
        : typeof filters.provider === 'string'
          ? filters.provider.trim() === '' || filters.provider.toLowerCase() === 'all'
            ? ['all']
            : [filters.provider]
          : ['all'];

    let start_date = filters.date_of_service?.start_date;
    let end_date = filters.date_of_service?.end_date;
    let useDefaultDates = false;
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();

    if ((!start_date || start_date === '') && (!end_date || end_date === '')) {
      useDefaultDates = true;
      start_date = `${currentYear}-01-01`;
      end_date = currentDate.toISOString().split('T')[0];
    } else {
      if (!start_date || start_date === '') start_date = null;
      if (!end_date || end_date === '') end_date = currentDate.toISOString().split('T')[0];
    }

    const dateFilterRequestObject = { startDate: start_date, endDate: end_date };
    const generatedDateRangeByDateObject = this.dateFilter.filterByDateObject(dateFilterRequestObject);

    const hasLocationFilter = locations.length > 0 && !locations.map(l => l.toLowerCase()).includes('all');
    const hasPracticeGroupsFilter = practice_groups.length > 0 && !practice_groups.map(pg => pg.toLowerCase()).includes('all');
    const hasProviderFilter = providers.length > 0 && !providers.map(p => p.toLowerCase()).includes('all');

    const request = this.pool.request();
    request.input('start_date', sql.Date, start_date);
    request.input('end_date', sql.Date, end_date);

    if (hasLocationFilter) {
      this.databases.forEach((_, dbIndex) => {
        locations.forEach((loc, i) => {
          request.input(`location${dbIndex}_${i}`, sql.VarChar, loc);
        });
      });
    }

    if (hasPracticeGroupsFilter) {
      this.databases.forEach((_, dbIndex) => {
        practice_groups.forEach((pg, i) => {
          request.input(`practice_groups${dbIndex}_${i}`, sql.VarChar, pg);
        });
      });
    }

    if (hasProviderFilter) {
      this.databases.forEach((_, dbIndex) => {
        providers.forEach((p, i) => {
          request.input(`provider${dbIndex}_${i}`, sql.VarChar, p);
        });
      });
    }

    try {
      const query = `
        SELECT 
          SUM([Over $500]) AS [Over $500],
          SUM([$400-$499]) AS [$400-$499],
          SUM([$300-$399]) AS [$300-$399],
          SUM([$200-$299]) AS [$200-$299],
          SUM([$100-$199]) AS [$100-$199],
          SUM([$50-$99]) AS [$50-$99],
          SUM([$0-$49]) AS [$0-$49]
        FROM (
          ${this.generateUnionQuery(
            generatedDateRangeByDateObject.dateConditionForInvoiceLineItem,
            locations,
            practice_groups,
            providers
          )}
        ) AS combined;
      `;

      const result = await request.query(query);

      const totals: { [key: string]: number } = result.recordset[0];

      const totalSum = Object.values(totals).reduce<number>((sum, amount) => sum + (amount || 0), 0);

      const responseWithPercentages = Object.entries(totals).reduce(
        (acc, [key, value]) => {
          const amount = Math.round(value || 0); // Round to nearest dollar
          acc[key] = {
            amount,
            percentage: totalSum > 0 ? Math.round((amount / totalSum) * 100) : 0, // Round percentage as well
          };
          return acc;
        },
        {} as Record<string, { amount: number; percentage: number }>
      );

      logger.info(`UncollectedMCRPerClaimByDOS.get - Query executed successfully`, {
        response: responseWithPercentages,
      });

      return res.status(200).json(responseWithPercentages);
    } catch (error) {
      logger.error(`UncollectedMCRPerClaimByDOS.get - Error executing query`, {
      });

      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}

export const uncollectedMCRPerClaimByDOS = new UncollectedMCRPerClaimByDOS();
