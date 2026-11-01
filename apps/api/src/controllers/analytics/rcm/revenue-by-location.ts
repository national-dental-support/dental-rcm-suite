import { Request, Response } from 'express';
import { DatabaseConnectionController } from '../../database-connection-controller';
import logger from '../../../utils/logger';
import chalk from 'chalk';

export class RevenueByLocation extends DatabaseConnectionController {
  constructor() {
    super();
  }

  public async get(req: Request, res: Response): Promise<Response> {
    const { where: custWhere, bind: bindCust } = this.custFilter(req);
    const { where: bodyWhere, bind: bindBody } = await this.bodyFilterResolved(req);
    const { bind: bindDos } = this.dosRange(req);
    const request = this.pool.request();
    bindCust(request);
    bindBody(request);
    bindDos(request);

    // Per-claim CTE ensures ChargeAmt, ClaimBalanceDue, and PayerType are de-duplicated
    // before rolling up to practice level. Uses ACR formula for Net Collection %:
    //   Payments / (Payments + Adjustments + Outstanding Balance)
    // This avoids the unreliable ContractedRate column that caused >100% rates.
    const revenueByPracticeQuery = `
      DECLARE @EndDate   DATE = CAST(@_dos_end   AS DATE);
      DECLARE @StartDate DATE = CAST(@_dos_start AS DATE);

      ;WITH ClaimAgg AS (
          SELECT
              ISNULL(Operations, 'Unknown')                                   AS Practice,
              ClaimID,
              MAX(ISNULL(ChargeAmt, 0))                                       AS ClaimCharge,
              MAX(ISNULL(NULLIF(PayerType, ''), 'Insurance'))                 AS PayerType,
              SUM(CASE WHEN TrxType = 'Payment'                    THEN TrxAmt      ELSE 0 END) AS Payments,
              SUM(CASE WHEN TrxType IN ('Adjustment', 'Writeoff')  THEN ABS(TrxAmt) ELSE 0 END) AS Adjustments,
              MAX(ISNULL(ClaimBalanceDue, 0))                                 AS Balance,
              SUM(CASE WHEN TrxType = 'Refund'                     THEN TrxAmt      ELSE 0 END) AS Refunds
          FROM dbo.recon_report
          WHERE DateOfService BETWEEN @StartDate AND @EndDate
            ${custWhere} ${bodyWhere}
          GROUP BY ISNULL(Operations, 'Unknown'), ClaimID
      ),
      PracticeAgg AS (
          SELECT
              Practice,
              SUM(ClaimCharge)                                                       AS Charges,
              SUM(CASE WHEN PayerType <> 'Patient' THEN ClaimCharge ELSE 0 END)     AS InsuranceSubmitted,
              SUM(Payments)                                                          AS NetCollections,
              SUM(Adjustments)                                                       AS Adjustments,
              SUM(Balance)                                                           AS OutstandingBalance,
              SUM(Refunds)                                                           AS Refunds
          FROM ClaimAgg
          GROUP BY Practice
      )
      SELECT
          Practice,
          Charges,
          InsuranceSubmitted,
          NetCollections,
          Adjustments,
          OutstandingBalance,
          Refunds,
          CASE
              WHEN (NetCollections + Adjustments + OutstandingBalance) <= 0 THEN NULL
              ELSE 100.0 * NetCollections / (NetCollections + Adjustments + OutstandingBalance)
          END AS NetCollectionPct
      FROM PracticeAgg
      ORDER BY Charges DESC;
    `;

    try {
      logger.info(chalk.greenBright('RevenueByLocation; get; called (per-claim ACR)'));

      const result = await request.query(revenueByPracticeQuery);

      return res.status(200).json(result.recordset);
    } catch (error: any) {
      console.error('RevenueByLocation; RAW ERROR:', error);
      logger.error('RevenueByLocation; get; Error fetching data:', error);

      return res.status(500).json({
        message: 'An error occurred while fetching revenue by practice.',
      });
    }
  }
}

export const revenueByLocation = new RevenueByLocation();
