// controllers/analytics/ar/ar-distribution.ts
import { Request, Response } from 'express';
import logger from '../../../utils/logger';
import { DatabaseConnectionController } from '../../database-connection-controller';

/**
 * AR Distribution Across Open Balances
 *
 * PostDate-only model:
 * - Claim aging anchor = first Charge PostDate for the claim
 * - AR balance = canonical transactional AR by claim
 * - No 13-month window; this is an open AR distribution
 */
export class ARDistributionAcrossOpenBalances extends DatabaseConnectionController {
  constructor() {
    super();
  }

  public get = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { where: custWhere, bind: bindCust } = this.custFilter(req);
      const { where: bodyWhere, bind: bindBody } = this.bodyFilter(req);
      const { bind: bindDos } = this.dosRange(req);
      const request = this.pool.request();
      bindCust(request);
      bindBody(request);
      bindDos(request);

      const query = `
DECLARE @Today DATE = CAST(@_dos_end AS DATE);

;WITH ClaimAR AS (
    SELECT
        ClaimID,

        -- Anchor age to the first charge posting date for the claim
        MIN(CASE WHEN TrxType = 'Charge' THEN PostDate END) AS ClaimPostDate,

        -- Canonical open AR balance
        SUM(
            CASE
                WHEN TrxType = 'Charge' THEN ISNULL(TrxAmt, 0)
                WHEN TrxType IN ('Adjustment', 'Payment', 'Writeoff', 'Courtesy') THEN -ISNULL(TrxAmt, 0)
                WHEN TrxType IN ('Refund', 'Recoupment', 'ReturnedCheck', 'Debit') THEN ISNULL(TrxAmt, 0)
                ELSE 0
            END
        ) AS ARBalance
    FROM dbo.recon_report
    WHERE ClaimID IS NOT NULL
      AND PostDate IS NOT NULL
      ${custWhere} ${bodyWhere}
    GROUP BY ClaimID
),
ClaimBuckets AS (
    SELECT
        ClaimID,
        ARBalance,
        DATEDIFF(DAY, ClaimPostDate, @Today) AS AgeDays,
        CASE
            WHEN DATEDIFF(DAY, ClaimPostDate, @Today) < 30 THEN '<30 Days'
            WHEN DATEDIFF(DAY, ClaimPostDate, @Today) < 61 THEN '31-60 Days'
            WHEN DATEDIFF(DAY, ClaimPostDate, @Today) < 91 THEN '61-90 Days'
            ELSE '>90 Days'
        END AS AgingBracket,
        CASE
            WHEN ARBalance < 0 THEN '<$0'
            WHEN ARBalance <= 1000 THEN '$0-$1,000'
            WHEN ARBalance <= 2000 THEN '$1,001-$2,000'
            ELSE '>$2,000'
        END AS BalanceRange
    FROM ClaimAR
    WHERE ARBalance <> 0
      AND ClaimPostDate IS NOT NULL
),
Agg AS (
    SELECT
        AgingBracket,
        BalanceRange,
        COUNT(*) AS NumAccounts,
        SUM(ARBalance) AS ARBalance
    FROM ClaimBuckets
    GROUP BY AgingBracket, BalanceRange
)
SELECT
    AgingBracket,

    SUM(CASE WHEN BalanceRange = '<$0' THEN NumAccounts ELSE 0 END) AS NumAccts_LT0,
    SUM(CASE WHEN BalanceRange = '<$0' THEN ARBalance ELSE 0 END) AS ARBalance_LT0,

    SUM(CASE WHEN BalanceRange = '$0-$1,000' THEN NumAccounts ELSE 0 END) AS NumAccts_0_1000,
    SUM(CASE WHEN BalanceRange = '$0-$1,000' THEN ARBalance ELSE 0 END) AS ARBalance_0_1000,

    SUM(CASE WHEN BalanceRange = '$1,001-$2,000' THEN NumAccounts ELSE 0 END) AS NumAccts_1001_2000,
    SUM(CASE WHEN BalanceRange = '$1,001-$2,000' THEN ARBalance ELSE 0 END) AS ARBalance_1001_2000,

    SUM(CASE WHEN BalanceRange = '>$2,000' THEN NumAccounts ELSE 0 END) AS NumAccts_GT2000,
    SUM(CASE WHEN BalanceRange = '>$2,000' THEN ARBalance ELSE 0 END) AS ARBalance_GT2000

FROM Agg
GROUP BY AgingBracket
ORDER BY
    CASE AgingBracket
        WHEN '<30 Days' THEN 1
        WHEN '31-60 Days' THEN 2
        WHEN '61-90 Days' THEN 3
        ELSE 4
    END;
      `;

      logger.info('ARDistributionAcrossOpenBalances; executing query for AR Distribution...');
      const result = await request.query(query);

      const rows = (result.recordset || []).map((r: any) => ({
        AgingBracket: r.AgingBracket,
        NumAccts_LT0: r.NumAccts_LT0 ?? 0,
        ARBalance_LT0: r.ARBalance_LT0 ?? 0,
        NumAccts_0_1000: r.NumAccts_0_1000 ?? 0,
        ARBalance_0_1000: r.ARBalance_0_1000 ?? 0,
        NumAccts_1001_2000: r.NumAccts_1001_2000 ?? 0,
        ARBalance_1001_2000: r.ARBalance_1001_2000 ?? 0,
        NumAccts_GT2000: r.NumAccts_GT2000 ?? 0,
        ARBalance_GT2000: r.ARBalance_GT2000 ?? 0,
      }));

      return res.status(200).json({ rows });
    } catch (error: unknown) {
      logger.error('ARDistributionAcrossOpenBalances; get; Error fetching data:', error);
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json({
        message: 'Internal server error',
        error: msg,
      });
    }
  };
}

export const arDistributionAcrossOpenBalances = new ARDistributionAcrossOpenBalances();