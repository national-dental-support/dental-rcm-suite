import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../../utils/logger';
import { DatabaseConnectionController } from '../../database-connection-controller';
import { DateFilterUtils } from '../../../utils/date-filters';

export class UncollectedMedicareByCptGroup extends DatabaseConnectionController {
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
          cg.cpt_group_name,
          SUM(CASE 
                WHEN (mcrABCga.mcr_allowed_national - i.NetPayment) > 0 
                THEN (mcrABCga.mcr_allowed_national - i.NetPayment) 
                ELSE 0 
              END) AS total_uncollected
        FROM (SELECT cpt_code, cpt_group_name FROM CptGroups) AS cg
        LEFT JOIN dbo.edi_inv_cpt AS c
          ON cg.cpt_code = c.code
        LEFT JOIN negan.dbo.mcr_allowed_by_cpt_ga AS mcrABCga
          ON c.code = mcrABCga.cpt_code
        JOIN dbo.enc AS e
          ON e.Invoiceid = c.Invoiceid
        JOIN dbo.edi_invoice AS i
          ON i.Encounterid = e.Encounterid
        LEFT JOIN dbo.users AS u 
          ON c.RendPrUserId = u.UID
        LEFT JOIN dbo.edi_facilities AS f 
          ON i.InvFacilityid = f.Id
        WHERE c.deleteFlag = 0
          AND e.ClaimReq = 1
          AND i.filestatus NOT IN ('CHR')
          AND i.ExcludeFromStmt = 0
          AND i.isClaimAppealed = 0
          AND i.DeleteFlag = 0
          AND e.deleteFlag = 0
          ${providerFilter}
          ${practiceGroupsFilter}
          ${locationFilter}
          ${dateCondition}
        GROUP BY cg.cpt_group_name
      `;
    }).join('\nUNION ALL\n');
  }

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
          cpt_group_name,
          SUM(total_uncollected) AS total_uncollected
        FROM (
          ${this.generateUnionQuery(
            generatedDateRangeByDateObject.dateConditionForInvoiceLineItem,
            locations,
            practice_groups,
            providers
          )}
        ) AS Combined
        GROUP BY cpt_group_name
        ORDER BY total_uncollected DESC;
      `;

      const result = await request.query(query);

      const totalSum = result.recordset.reduce((sum, row) => sum + (row.total_uncollected || 0), 0);

      const responseWithPercentages = result.recordset.reduce(
        (acc, row) => {
          const { cpt_group_name, total_uncollected } = row;
          const amount = Math.round(total_uncollected || 0);
          acc[cpt_group_name] = {
            amount,
            percentage: totalSum > 0 ? Math.round((amount / totalSum) * 100) : 0,
          };
          return acc;
        },
        {} as Record<string, { amount: number; percentage: number }>
      );

      logger.info(`UncollectedMedicareByCptGroup.get - Query executed successfully`, {
        response: responseWithPercentages,
      });

      return res.status(200).json(responseWithPercentages);
    } catch (error) {
      logger.error(`UncollectedMedicareByCptGroup.get - Error executing query`, {
      });

      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}

export const uncollectedMedicareByCPTGroup = new UncollectedMedicareByCptGroup();
