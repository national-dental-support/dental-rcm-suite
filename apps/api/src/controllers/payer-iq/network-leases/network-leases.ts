import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../../utils/logger';
import { DatabaseConnectionController } from '../../database-connection-controller';
import { applyGlobalFilters } from '../../../utils/global-filters';

export interface NetworkLeaseNetworkTotalRow {
  NetworkName: string;
  TotalChargeAmount: number;
  TotalPayments: number;
  TotalPatientVolume: number;
  TotalCPTVolume: number;
}

export interface NetworkLeasePayerRow {
  NetworkName: string;
  PayerName: string;
  TotalChargeAmount: number;
  TotalPayments: number;
  TotalPatientVolume: number;
  TotalCPTVolume: number;
}

export interface NetworkLeasesResponse {
  message: string;
  data: {
    networks: NetworkLeaseNetworkTotalRow[];
    payers: NetworkLeasePayerRow[];
  };
}

export class NetworkLeases extends DatabaseConnectionController {
  constructor() {
    super();
  }

  public get = async (req: Request, res: Response): Promise<Response> => {
    try {
      let built;
      try {
        // Date filter applies to claims alias c
        // Payer filter must apply to PayerDim alias pd, using column pd.PayerName
        built = applyGlobalFilters(
          req,
          {
            claims: 'c',
            payer: 'pd',
            payerNameColumn: 'PayerName',
          }
        );
      } catch (e) {
        if (e instanceof Error && e.message === 'INVALID_DATE') {
          return res.status(400).json({
            message: 'Invalid date format. Use YYYY-MM-DD for start/end.',
          });
        }
        throw e;
      }

      const query = `
DECLARE @StartDate date = @start;
DECLARE @EndDate   date = @end;

IF OBJECT_ID('tempdb..#ClaimIDs')  IS NOT NULL DROP TABLE #ClaimIDs;
IF OBJECT_ID('tempdb..#Base')      IS NOT NULL DROP TABLE #Base;

-- Step 1: materialize the date-filtered claim set once so subsequent joins
-- can do index seeks instead of full-table scans.
SELECT
    c.ClaimID,
    c.PayerID,
    c.PatientID,
    c.ChargeAmt
INTO #ClaimIDs
FROM dbo.claims c
LEFT JOIN (
    SELECT p.PayerID, COALESCE(p.InsuranceName, p.payer) AS PayerName
    FROM dbo.payer p
) pd ON pd.PayerID = c.PayerID
WHERE ${built.clauseParts.join('\n      AND ')};

WITH PayerDim AS (
    SELECT p.PayerID, COALESCE(p.InsuranceName, p.payer) AS PayerName
    FROM dbo.payer p
),
PayerToNetwork AS (
    SELECT np.PayerID, n.NetworkName
    FROM dbo.contractLeaseNetworkPayer np
    JOIN dbo.contractLeaseNetwork n
      ON n.LeaseNetworkID = np.LeaseNetworkID
    WHERE n.customer_id = @custId OR n.customer_id = 0
),
-- Scoped to claims in range only \u2014 avoids full serviceline/transactions scans
CptByClaim AS (
    SELECT sl.ClaimID, COUNT(sl.ServiceLineID) AS CptVolume
    FROM dbo.serviceline sl
    WHERE sl.ClaimID IN (SELECT ClaimID FROM #ClaimIDs)
    GROUP BY sl.ClaimID
),
PaymentsByClaim AS (
    SELECT
        t.ClaimID,
        SUM(CASE WHEN t.TrxType = 'Payment' THEN t.TrxAmt ELSE 0 END) AS TotalPayments
    FROM dbo.transactions t
    WHERE t.ClaimID IN (SELECT ClaimID FROM #ClaimIDs)
    GROUP BY t.ClaimID
)
SELECT
    COALESCE(nm.NetworkName, 'Unknown Network') AS NetworkName,
    COALESCE(pd.PayerName,  'Unknown Payer')   AS PayerName,
    ci.ClaimID,
    ci.PatientID,
    ci.ChargeAmt,
    ISNULL(cb.CptVolume, 0)     AS CptVolume,
    ISNULL(pb.TotalPayments, 0) AS TotalPayments
INTO #Base
FROM #ClaimIDs ci
LEFT JOIN CptByClaim cb ON cb.ClaimID = ci.ClaimID
LEFT JOIN PaymentsByClaim pb ON pb.ClaimID = ci.ClaimID
LEFT JOIN PayerDim pd ON pd.PayerID = ci.PayerID
LEFT JOIN PayerToNetwork nm ON nm.PayerID = ci.PayerID;

-- Result set #1: network totals
SELECT
    NetworkName,
    CAST(SUM(ChargeAmt)     AS decimal(18,2)) AS TotalChargeAmount,
    CAST(SUM(TotalPayments) AS decimal(18,2)) AS TotalPayments,
    COUNT(DISTINCT PatientID)                 AS TotalPatientVolume,
    SUM(CptVolume)                            AS TotalCPTVolume
FROM #Base
GROUP BY NetworkName
ORDER BY NetworkName;

-- Result set #2: payer rows
SELECT
    NetworkName,
    PayerName,
    CAST(SUM(ChargeAmt)     AS decimal(18,2)) AS TotalChargeAmount,
    CAST(SUM(TotalPayments) AS decimal(18,2)) AS TotalPayments,
    COUNT(DISTINCT PatientID)                 AS TotalPatientVolume,
    SUM(CptVolume)                            AS TotalCPTVolume
FROM #Base
GROUP BY NetworkName, PayerName
ORDER BY NetworkName, PayerName;
      `;

      const custId: number = (req as any).actor?.customer_id ?? 0;
      const request = this.pool.request();
      built.inputs.forEach(({ name, value }) => request.input(name, value));
      request.input('custId', sql.Int, custId);

      logger.info('NetworkLeases.get \u2192 executing network leases query', {
        startDate: built.startDate,
        endDate: built.endDate,
        payers: built.payers,
      });

      const result = await request.query(query);

      // ---- Safe recordset extraction (TS-friendly) ----
      const recordsetsAny = (result as any).recordsets as unknown;

      let networks: NetworkLeaseNetworkTotalRow[] = [];
      let payerRows: NetworkLeasePayerRow[] = [];

      if (Array.isArray(recordsetsAny)) {
        networks = (recordsetsAny[0] ?? []) as NetworkLeaseNetworkTotalRow[];
        payerRows = (recordsetsAny[1] ?? []) as NetworkLeasePayerRow[];
      } else if (recordsetsAny && typeof recordsetsAny === 'object') {
        const sets = Object.values(
          recordsetsAny as Record<string, unknown[]>
        ) as unknown[][];
        networks = (sets[0] ?? []) as NetworkLeaseNetworkTotalRow[];
        payerRows = (sets[1] ?? []) as NetworkLeasePayerRow[];
      } else {
        networks = ((result as any).recordset ?? []) as NetworkLeaseNetworkTotalRow[];
        payerRows = [];
      }

      return res.status(200).json({
        message: 'Network leases data',
        data: {
          networks,
          payers: payerRows,
        },
      });
    } catch (error: unknown) {
      logger.error('NetworkLeases.get \u2013 error executing query', {
        message: 'Internal server error',
        error,
      });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}
