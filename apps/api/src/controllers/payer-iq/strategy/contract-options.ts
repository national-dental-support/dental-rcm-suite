import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../../utils/logger';
import { DatabaseConnectionController } from '../../database-connection-controller';
import { extractCustomerId } from '../../../utils/resolve-user-scope';

export interface ContractOptionsRow {
  PayerContractID: number;
  ContractPlanName: string;
  MatchRows: number;
  UnderpaidCount: number;
  UnderpaidDollars: number;
}

export class ContractOptions extends DatabaseConnectionController {
  constructor() {
    super();
  }

  public get = async (req: Request, res: Response): Promise<Response> => {
    try {
      const limitParam = Number(req.query.limit ?? 25);
      const safeLimit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 25;

      // Enterprise isolation
      const xenCustId = extractCustomerId(req);
      const custWhere = xenCustId != null ? 'AND r.customer_id = @_custId' : '';

      // Uses recon_report to identify payers with underpaid claims.
      // Each InsuranceName is treated as a "contract" with a deterministic ID
      // derived from ABS(CHECKSUM(InsuranceName)).
      const query = `
      DECLARE @end   DATE = CAST(GETDATE() AS date);
      DECLARE @start DATE = DATEADD(MONTH, -12, @end);

      WITH claim_totals AS (
        SELECT
          r.InsuranceName,
          r.ClaimID,
          SUM(CASE WHEN r.TrxType = 'Charge'  THEN COALESCE(r.TrxAmt, 0) ELSE 0 END) AS ChargedAmt,
          SUM(CASE WHEN r.TrxType = 'Payment' THEN COALESCE(r.TrxAmt, 0) ELSE 0 END) AS PaidAmt
        FROM dbo.recon_report r
        WHERE r.DateOfService >= @start
          AND r.DateOfService < DATEADD(DAY, 1, @end)
          AND r.TrxType IN ('Charge', 'Payment')
          ${custWhere}
        GROUP BY
          r.InsuranceName,
          r.ClaimID
      ),
      payer_rollup AS (
        SELECT
          ABS(CHECKSUM(ct.InsuranceName)) AS PayerContractID,
          ct.InsuranceName AS ContractPlanName,
          COUNT(*) AS MatchRows,
          SUM(CASE WHEN ct.PaidAmt < ct.ChargedAmt AND ct.ChargedAmt > 0 THEN 1 ELSE 0 END) AS UnderpaidCount,
          SUM(CASE WHEN ct.PaidAmt < ct.ChargedAmt AND ct.ChargedAmt > 0
                   THEN (ct.ChargedAmt - ct.PaidAmt) ELSE 0 END) AS UnderpaidDollars
        FROM claim_totals ct
        GROUP BY
          ct.InsuranceName,
          ABS(CHECKSUM(ct.InsuranceName))
        HAVING SUM(CASE WHEN ct.PaidAmt < ct.ChargedAmt AND ct.ChargedAmt > 0 THEN 1 ELSE 0 END) > 0
      )
      SELECT TOP (@_limit)
        PayerContractID,
        ContractPlanName,
        MatchRows,
        UnderpaidCount,
        CAST(UnderpaidDollars AS decimal(18,2)) AS UnderpaidDollars
      FROM payer_rollup
      ORDER BY
        UnderpaidDollars DESC,
        UnderpaidCount DESC,
        PayerContractID ASC;
      `;

      logger.info('ContractOptions.get \u2192 executing contract options query');

      const coReq = this.pool.request();
      coReq.input('_limit', sql.Int, safeLimit);
      if (xenCustId != null) coReq.input('_custId', sql.Int, xenCustId);
      const result = await coReq.query(query);

      return res.status(200).json({
        message: 'Contract options data',
        data: (result.recordset ?? []) as ContractOptionsRow[],
      });
    } catch (error: unknown) {
      logger.error('ContractOptions.get \u2013 error executing query', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}
