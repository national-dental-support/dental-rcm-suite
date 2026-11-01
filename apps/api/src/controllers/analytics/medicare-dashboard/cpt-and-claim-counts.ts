import { Request, Response } from 'express';
import sql, { IResult } from 'mssql';
import { DatabaseConnectionController } from '../../database-connection-controller';
import logger from '../../../utils/logger';
import { DateFilterUtils } from '../../../utils/date-filters';

export class CptAndClaimCountsByDOS extends DatabaseConnectionController {
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
          DATEFROMPARTS(YEAR(c.sdos), MONTH(c.sdos), 1) AS date_of_service,
          COUNT(DISTINCT e.Invoiceid) AS claims_count,
          COUNT(DISTINCT c.Id) AS cpt_count,
          CAST(COUNT(DISTINCT c.Id) AS FLOAT) / NULLIF(COUNT(DISTINCT e.Invoiceid), 0) AS cpt_per_claim
        FROM 
          dbo.edi_inv_cpt AS c
        JOIN 
          dbo.enc AS e ON e.Invoiceid = c.Invoiceid
        LEFT JOIN 
          dbo.users AS u ON c.RendPrUserId = u.UID
        LEFT JOIN 
          dbo.edi_invoice AS inv ON c.Invoiceid = inv.Id
        LEFT JOIN 
          dbo.edi_facilities AS f ON inv.InvFacilityid = f.Id
        LEFT JOIN 
          dbo.edi_inv_insurance AS ins ON inv.Id = ins.InvoiceId
        LEFT JOIN 
          dbo.insurance AS i ON ins.InsId = i.insId
        WHERE 
          e.ClaimReq = 1
          AND c.deleteFlag = 0
          ${providerFilter}
          ${practiceGroupsFilter}
          ${locationFilter}
          ${dateCondition}
        GROUP BY 
          YEAR(c.sdos), 
          MONTH(c.sdos)
      `;
    }).join('UNION ALL');
  }; 

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
          date_of_service,
          SUM(claims_count) AS claims_count,
          SUM(cpt_count) AS cpt_count,
          CAST(SUM(cpt_count) AS FLOAT) / NULLIF(SUM(claims_count), 0) AS cpt_per_claim
        FROM (
          ${this.generateUnionQuery(
            generatedDateRangeByDateObject.dateConditionForInvoiceLineItem,
            locations,
            practice_groups,
            providers
          )}
        ) AS CombinedCounts
        GROUP BY date_of_service
        ORDER BY date_of_service;
      `;

      const result: IResult<any> = await request.query(query);
      return res.status(200).json(result.recordset);
    } catch (error: unknown) {
      console.error('[CptAndClaimCountsByDOS.get] Query execution error:', error);
      logger.error('CptAndClaimCountsByDOS.get - Error executing query', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}

export const cptAndClaimCountsByDOS = new CptAndClaimCountsByDOS();
