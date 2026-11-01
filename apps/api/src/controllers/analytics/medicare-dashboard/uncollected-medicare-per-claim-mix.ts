import { Request, Response } from 'express';
import sql, { IResult } from 'mssql';
import logger from '../../../utils/logger';
import { DatabaseConnectionController } from '../../database-connection-controller';
import { DateFilterUtils } from '../../../utils/date-filters';

export class UncollectedMedicarePerClaimMixByDOS extends DatabaseConnectionController {
  private dateFilter: DateFilterUtils;

  constructor() {
    super();
    this.dateFilter = new DateFilterUtils();
  }

  private generateUnionQuery(
    dateCondition: string,
    locations: string[],
    practiceGroups: string[],
    providers: string[]
  ): string {
    return this.databases
      .map((db, dbIndex) => {
        const skipLocationFilter =
          locations.length === 0 || locations.map(l => l.toLowerCase()).includes('all');
        const skipPracticeGroupFilter =
          practiceGroups.length === 0 || practiceGroups.map(pg => pg.toLowerCase()).includes('all');
        const skipProviderFilter =
          providers.length === 0 || providers.map(p => p.toLowerCase()).includes('all');

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
            DATEFROMPARTS(YEAR(c.sdos), MONTH(c.sdos), 1) AS date_of_service,
            ROUND(SUM(inv_uncollected), 0) AS total_uncollected_for_month,
            ROUND(SUM(CASE WHEN inv_uncollected BETWEEN 0 AND 49 THEN inv_uncollected ELSE 0 END), 0) AS [$0-$49],
            ROUND(SUM(CASE WHEN inv_uncollected BETWEEN 50 AND 99 THEN inv_uncollected ELSE 0 END), 0) AS [$50-$99],
            ROUND(SUM(CASE WHEN inv_uncollected BETWEEN 100 AND 199 THEN inv_uncollected ELSE 0 END), 0) AS [$100-$199],
            ROUND(SUM(CASE WHEN inv_uncollected BETWEEN 200 AND 299 THEN inv_uncollected ELSE 0 END), 0) AS [$200-$299],
            ROUND(SUM(CASE WHEN inv_uncollected BETWEEN 300 AND 399 THEN inv_uncollected ELSE 0 END), 0) AS [$300-$399],
            ROUND(SUM(CASE WHEN inv_uncollected BETWEEN 400 AND 499 THEN inv_uncollected ELSE 0 END), 0) AS [$400-$499],
            ROUND(SUM(CASE WHEN inv_uncollected >= 500 THEN inv_uncollected ELSE 0 END), 0) AS [Over $500]
          FROM dbo.edi_inv_cpt AS c
          LEFT JOIN negan.dbo.mcr_allowed_by_cpt_ga AS mcrABCga
            ON c.code = mcrABCga.cpt_code
          JOIN dbo.enc AS e ON e.Invoiceid = c.Invoiceid
          JOIN dbo.edi_invoice AS i ON i.Encounterid = e.encounterid
          LEFT JOIN dbo.users AS u ON c.RendPrUserId = u.UID
          LEFT JOIN dbo.edi_invoice AS inv ON c.Invoiceid = inv.Id
          LEFT JOIN dbo.edi_facilities AS f ON inv.InvFacilityid = f.Id
          LEFT JOIN (
            SELECT 
              c.Invoiceid,
              SUM(CASE 
                WHEN (mcrABCga.mcr_allowed_national - CASE WHEN i.PayorType = 1 THEN inv.NetPayment ELSE 0 END) > 0 
                THEN (mcrABCga.mcr_allowed_national - CASE WHEN i.PayorType = 1 THEN inv.NetPayment ELSE 0 END) 
                ELSE 0 
              END) AS inv_uncollected
            FROM dbo.edi_inv_cpt AS c
            LEFT JOIN negan.dbo.mcr_allowed_by_cpt_ga AS mcrABCga ON c.code = mcrABCga.cpt_code
            JOIN dbo.enc AS e ON e.Invoiceid = c.Invoiceid
            JOIN dbo.edi_invoice AS i ON i.Encounterid = e.Encounterid
            LEFT JOIN dbo.edi_invoice AS inv ON c.Invoiceid = inv.Id
            LEFT JOIN dbo.edi_facilities AS f ON inv.InvFacilityid = f.Id
            LEFT JOIN dbo.users AS u ON c.RendPrUserId = u.UID
            WHERE c.deleteFlag = 0 AND e.ClaimReq = 1 AND i.filestatus NOT IN ('CHR')
              AND i.ExcludeFromStmt = 0 AND i.isClaimAppealed = 0
              AND i.DeleteFlag = 0 AND e.deleteFlag = 0
              ${providerFilter}
              ${practiceGroupsFilter}
              ${locationFilter}
              ${dateCondition}
            GROUP BY c.Invoiceid
          ) AS cbi ON cbi.Invoiceid = c.Invoiceid
          WHERE
            c.deleteFlag = 0
            AND e.ClaimReq = 1
            AND i.DeleteFlag = 0
            AND e.deleteFlag = 0
            ${providerFilter}
            ${practiceGroupsFilter}
            ${locationFilter}
            ${dateCondition}
          GROUP BY YEAR(c.sdos), MONTH(c.sdos)
        `;
      })
      .join(' UNION ALL ');
  }

  public get = async (req: Request, res: Response): Promise<Response> => {
    const filters = req.body.filters || {};
    const practice_groups: string[] = Array.isArray(filters.practice_group) ? filters.practice_group : [];
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
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();

    if ((!start_date || start_date === '') && (!end_date || end_date === '')) {
      start_date = `${currentYear}-01-01`;
      end_date = currentDate.toISOString().split('T')[0];
    } else {
      if (!start_date || start_date === '') start_date = null;
      if (!end_date || end_date === '') end_date = currentDate.toISOString().split('T')[0];
    }

    const dateFilterRequestObject = { startDate: start_date, endDate: end_date };
    const generatedDateRangeByDateObject = this.dateFilter.filterByDateObject(dateFilterRequestObject);
    const dateCondition = generatedDateRangeByDateObject.dateConditionForInvoiceLineItem;

    const hasLocationFilter = locations.length > 0 && !locations.map(l => l.toLowerCase()).includes('all');
    const hasPracticeGroupsFilter = practice_groups.length > 0 && !practice_groups.map(pg => pg.toLowerCase()).includes('all');
    const hasProviderFilter = providers.length > 0 && !providers.map(p => p.toLowerCase()).includes('all');

    const request = this.pool.request();

    if (start_date) request.input('start_date', sql.Date, start_date);
    if (end_date) request.input('end_date', sql.Date, end_date);

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
          date_of_service,
          SUM(total_uncollected_for_month) AS total_uncollected_for_month,
          SUM([$0-$49]) AS [$0-$49],
          SUM([$50-$99]) AS [$50-$99],
          SUM([$100-$199]) AS [$100-$199],
          SUM([$200-$299]) AS [$200-$299],
          SUM([$300-$399]) AS [$300-$399],
          SUM([$400-$499]) AS [$400-$499],
          SUM([Over $500]) AS [Over $500]
        FROM (
          ${this.generateUnionQuery(dateCondition, locations, practice_groups, providers)}
        ) AS Combined
        GROUP BY date_of_service
        ORDER BY date_of_service;
      `;

      const result: IResult<any> = await request.query(query);
      return res.status(200).json(result.recordset);
    } catch (error) {
      logger.error(`UncollectedMedicarePerClaimMixByDOS.get - Error executing query`, {
      });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}

export const uncollectedMedicarePerClaimMixByDOS = new UncollectedMedicarePerClaimMixByDOS();
