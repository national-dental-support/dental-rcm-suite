import { Request, Response } from 'express';
import logger from '../../../../utils/logger';
import { DatabaseConnectionController } from '../../../database-connection-controller';
import { resolveUserScope, extractCustomerId, buildCustomerFilter } from '../../../../utils/resolve-user-scope';

export class TodaySummary extends DatabaseConnectionController {
  constructor() {
    super();
  }

  public get = async (req: Request, res: Response): Promise<Response> => {
    try {
      const actorEmail = (req.headers['x-actor-email'] as string) ?? '';
      const oid = (req.headers['x-actor-oid'] as string) || null;
      const xenCustId = extractCustomerId(req);
      const scope = await resolveUserScope(this.pool, actorEmail, xenCustId, oid);

      const request = this.pool.request();

      // Enterprise isolation
      const custFilter = buildCustomerFilter(scope.customerId, 'ch');
      custFilter.addInputs(request);

      const query = `
        -- Placeholder today summary \u2014 scoped to enterprise
        SELECT
          'Today Summary' AS Summary,
          0 AS Value
      `;

      logger.info('TodaySummary.get \u2192 executing today summary query');
      const result = await request.query(query);

      return res.status(200).json({
        message: 'Today summary data',
        data: result.recordset || [],
      });
    } catch (error: unknown) {
      logger.error('TodaySummary.get \u2013 error executing query', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}
