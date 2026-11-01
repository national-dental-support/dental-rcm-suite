import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../../utils/logger';
import { DatabaseConnectionController } from '../../database-connection-controller';

/**
 * ContractsController - payer contract data and routing arbitrage analysis.
 *
 * Business concept: clearinghouses silently route claims through whichever
 * network path is cheapest for THEM, not the most reimbursement-optimal for the
 * practice. Payer-IQ exposes the rate delta across available routing paths and lets
 * users re-route to the most cost-efficient option.
 */
export class ContractsController extends DatabaseConnectionController {
  constructor() {
    super();
  }

  /**
   * GET /payer-iq/contracts
   * All active payer contracts with payer info, network, fee schedule counts
   * and 90-day payment performance from recon_report.
   */
  public getContracts = async (req: Request, res: Response): Promise<Response> => {
    try {
      const result = await this.pool.request().query(`
        SELECT
          cpc.PayerContractID,
          cpc.PayerID,
          cpc.ContractDisplayName,
          cpc.ActiveFlag,
          cpc.CreatedAt,
          ISNULL(p.InsuranceName, cp.PayerName)          AS PayerName,
          p.CarrierName,
          cd.ContractNumber,
          cd.ContractPlanName,
          cd.EffectiveDate,
          cd.ExpirationDate,
          cd.ContractStatusID,
          cd.ContractTypeID,
          ct.ApplicableFees,
          ct.ContractBackground,
          -- Fee schedule line count (contractFeeScheduleDetail has PayerContractID as int)
          (SELECT COUNT(*)
           FROM   dbo.contractFeeScheduleDetail cfd
           WHERE  cfd.PayerContractID = cpc.PayerContractID)               AS FeeScheduleDetailCount,
          -- Fee schedule count (contractFeeSchedule has PayerContractID as nvarchar)
          (SELECT COUNT(*)
           FROM   dbo.contractFeeSchedule cfs
           WHERE  cfs.PayerContractID = CAST(cpc.PayerContractID AS NVARCHAR(50)))
                                                                           AS FeeScheduleCount,
          -- Designated routing network for this specific contract (migration 201 FK)
          ISNULL(cln.LeaseNetworkKey, 'No Network')                       AS PrimaryNetworkKey,
          ISNULL(cln.NetworkName, 'Unknown')                              AS PrimaryNetworkName,
          ISNULL(cln.DirectIndirect, 'Unknown')                           AS NetworkRouteType,
          -- 90-day claim volume
          (SELECT COUNT(DISTINCT rr.ClaimID)
           FROM   dbo.recon_report rr
           WHERE  rr.PayerID = cpc.PayerID
             AND  rr.DateOfService >= DATEADD(day, -90, GETUTCDATE()))     AS ClaimsLast90d,
          -- Avg payment (Payment TrxType rows)
          (SELECT AVG(CAST(rr.TrxAmt AS FLOAT))
           FROM   dbo.recon_report rr
           WHERE  rr.PayerID = cpc.PayerID
             AND  rr.TrxType = 'Payment'
             AND  rr.DateOfService >= DATEADD(day, -90, GETUTCDATE()))     AS AvgPaymentAmt,
          -- Contractual adjustment exposure
          (SELECT SUM(CAST(rr.ContractualAdjustments AS FLOAT))
           FROM   dbo.recon_report rr
           WHERE  rr.PayerID = cpc.PayerID
             AND  rr.DateOfService >= DATEADD(day, -90, GETUTCDATE()))     AS TotalContractualAdj
        FROM      dbo.contractPayerContracts cpc
        LEFT JOIN dbo.payer                 p    ON p.PayerID          = cpc.PayerID
        LEFT JOIN dbo.contractPayer         cp   ON cp.PayerID         = cpc.PayerID
        LEFT JOIN dbo.contractDetails       cd   ON cd.PayerContractID = cpc.PayerContractID
        -- contractTerms may have multiple rows per contract; pick most recent to avoid duplicates
        LEFT JOIN (SELECT PayerContractID, ApplicableFees, ContractBackground,
                          ROW_NUMBER() OVER (PARTITION BY PayerContractID ORDER BY PayerContractID DESC) AS rn
                   FROM dbo.contractTerms) ct ON ct.PayerContractID = cpc.PayerContractID AND ct.rn = 1
        -- Contract's designated routing network (migration 201)
        LEFT JOIN dbo.contractLeaseNetwork  cln  ON cln.LeaseNetworkID = cpc.LeaseNetworkID
        WHERE cpc.ActiveFlag = 1
        ORDER BY ISNULL(p.InsuranceName, cp.PayerName)
      `);

      return res.status(200).json({ data: result.recordset ?? [] });
    } catch (err: unknown) {
      logger.error('ContractsController.getContracts error', { error: err });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /**
   * GET /payer-iq/contracts/:id/fee-schedule
   * CPT/CDT-level fee schedule lines for a specific contract.
   */
  public getFeeSchedule = async (req: Request, res: Response): Promise<Response> => {
    try {
      const contractId = parseInt(req.params.id, 10);
      if (!contractId || contractId <= 0) {
        return res.status(400).json({ message: 'Valid contract id required' });
      }

      const request = this.pool.request();
      request.input('contractId', sql.Int, contractId);

      // Try contractFeeScheduleDetail first (int PayerContractID)
      const detail = await request.query(`
        SELECT
          cfd.FeeScheduleLineID,
          cfd.CPT           AS ProcedureCode,
          cfd.AllowedAmount AS ContractedRate,
          cfd.ServiceCode,
          cfd.EffectiveDate,
          cfd.ExpirationDate,
          cfsh.FeeScheduleName,
          cfsh.FeeScheduleType
        FROM      dbo.contractFeeScheduleDetail cfd
        LEFT JOIN dbo.contractFeeScheduleHeader cfsh
               ON cfsh.PayerContractID = cfd.PayerContractID
              AND cfsh.FeeScheduleID   = cfd.FeeScheduleID
        WHERE cfd.PayerContractID = @contractId
        ORDER BY cfd.CPT
      `);

      if (detail.recordset.length > 0) {
        return res.status(200).json({ data: detail.recordset, source: 'detail' });
      }

      // Fallback: contractFeeSchedule (nvarchar PayerContractID)
      const r2 = this.pool.request();
      r2.input('contractIdStr', sql.NVarChar(50), String(contractId));
      const schedule = await r2.query(`
        SELECT
          cfs.FeeScheduleID,
          cfs.CPT           AS ProcedureCode,
          cfs.ReimbursedAmount AS ContractedRate,
          cfs.ServiceCode,
          cfs.EffectiveDate,
          cfs.ExpirationDate
        FROM dbo.contractFeeSchedule cfs
        WHERE cfs.PayerContractID = @contractIdStr
        ORDER BY cfs.CPT
      `);

      return res.status(200).json({ data: schedule.recordset, source: 'schedule' });
    } catch (err: unknown) {
      logger.error('ContractsController.getFeeSchedule error', { error: err });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /**
   * GET /payer-iq/contracts/routing-arbitrage?cpt_code=&customer_id=
   *
   * Core arbitrage endpoint. For each payer that has active contracts,
   * shows all available routing paths (lease networks) and their contracted
   * rates. Highlights payers where the spread across paths > $5.
   *
   * The arbitrage opportunity: e.g. Cigna reachable via Availity ($952),
   * Change Healthcare ($905), and Direct EDI ($968). Always pick Direct EDI.
   */
  public getRoutingArbitrage = async (req: Request, res: Response): Promise<Response> => {
    try {
      const cptCode   = (req.query.cpt_code as string) || null;

      const request = this.pool.request();
      request.input('cptCode', sql.NVarChar(20), cptCode);

      // Each contract is linked to exactly one routing path via cpc.LeaseNetworkID
      // (added in migration 201). Multiple contracts per payer (each on a different
      // network path) produce a real arbitrage spread when grouped by PayerID.
      const result = await request.query(`
        SELECT
          cpc.PayerContractID,
          cpc.ContractDisplayName                         AS ContractName,
          ISNULL(p.InsuranceName, cp.PayerName)           AS PayerName,
          p.CarrierName,
          cpc.PayerID,
          ISNULL(cln.LeaseNetworkKey,  'No Network')      AS NetworkKey,
          ISNULL(cln.NetworkName,       'Default')        AS NetworkName,
          ISNULL(cln.DirectIndirect,    'Unknown')        AS RouteType,
          -- Contracted rate from fee schedule for this contract/CPT
          ISNULL(
            (SELECT AVG(CAST(cfs.ReimbursedAmount AS FLOAT))
             FROM   dbo.contractFeeSchedule cfs
             WHERE  cfs.PayerContractID = CAST(cpc.PayerContractID AS NVARCHAR(50))
               AND  (@cptCode IS NULL OR cfs.CPT = @cptCode)),
            0
          )                                               AS AvgContractedRate,
          -- Fee schedule line count for this contract
          (SELECT COUNT(*)
           FROM   dbo.contractFeeSchedule cfs
           WHERE  cfs.PayerContractID = CAST(cpc.PayerContractID AS NVARCHAR(50))
             AND  (@cptCode IS NULL OR cfs.CPT = @cptCode))
                                                          AS FeeScheduleLines,
          -- Actual payment performance from recon_report (shared per payer, not per contract)
          ISNULL(
            (SELECT AVG(CAST(rr.TrxAmt AS FLOAT))
             FROM   dbo.recon_report rr
             WHERE  rr.PayerID  = cpc.PayerID
               AND  rr.TrxType  = 'Payment'
               AND  (@cptCode IS NULL OR rr.CPT = @cptCode)
               AND  rr.DateOfService >= DATEADD(day, -90, GETUTCDATE())),
            0
          )                                               AS AvgActualPaid,
          ISNULL(
            (SELECT COUNT(DISTINCT rr.ClaimID)
             FROM   dbo.recon_report rr
             WHERE  rr.PayerID  = cpc.PayerID
               AND  rr.TrxType  = 'Payment'
               AND  (@cptCode IS NULL OR rr.CPT = @cptCode)
               AND  rr.DateOfService >= DATEADD(day, -90, GETUTCDATE())),
            0
          )                                               AS ClaimVolume
        FROM      dbo.contractPayerContracts cpc
        LEFT JOIN dbo.payer                 p   ON p.PayerID          = cpc.PayerID
        LEFT JOIN dbo.contractPayer         cp  ON cp.PayerID         = cpc.PayerID
        -- Direct FK join: each contract \u2192 its specific routing network (migration 201)
        LEFT JOIN dbo.contractLeaseNetwork  cln ON cln.LeaseNetworkID = cpc.LeaseNetworkID
        WHERE cpc.ActiveFlag = 1
        ORDER BY ISNULL(p.InsuranceName, cp.PayerName), AvgContractedRate DESC
      `);

      // Group rows by payer and compute arbitrage spread
      const byPayer: Record<number, { payerName: string; payerId: number; routes: any[] }> = {};

      for (const row of result.recordset) {
        const pid = row.PayerID as number;
        if (!byPayer[pid]) {
          byPayer[pid] = { payerName: row.PayerName, payerId: pid, routes: [] };
        }
        byPayer[pid].routes.push(row);
      }

      const arbitrage = Object.values(byPayer).map(entry => {
        const rates = entry.routes
          .map(r => r.AvgContractedRate as number)
          .filter(v => v > 0);

        const best  = rates.length ? Math.max(...rates) : 0;
        const worst = rates.length ? Math.min(...rates) : 0;
        const spread = best - worst;

        const optimalRoute = entry.routes.find(r => r.AvgContractedRate === best) ?? entry.routes[0];

        return {
          payerId:            entry.payerId,
          payerName:          entry.payerName,
          routes:             entry.routes,
          bestRate:           Math.round(best  * 100) / 100,
          worstRate:          Math.round(worst * 100) / 100,
          arbitrageSpread:    Math.round(spread * 100) / 100,
          opportunityExists:  spread > 5,
          optimalRoute,
        };
      }).sort((a, b) => b.arbitrageSpread - a.arbitrageSpread);

      return res.status(200).json({ data: arbitrage });
    } catch (err: unknown) {
      logger.error('ContractsController.getRoutingArbitrage error', { error: err });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /**
   * GET /payer-iq/contracts/savings-summary?days=90
   * Summary of claims routed and payment performance over the period.
   */
  public getSavingsSummary = async (req: Request, res: Response): Promise<Response> => {
    try {
      const days = parseInt(req.query.days as string, 10) || 90;

      const request = this.pool.request();
      request.input('days', sql.Int, days);

      const result = await request.query(`
        WITH recent AS (
          SELECT
            ClaimID,
            PayerID,
            TrxType,
            ISNULL(TrxAmt, 0)                AS TrxAmt,
            ISNULL(ContractualAdjustments, 0) AS ContractualAdj
          FROM dbo.recon_report
          WHERE DateOfService >= DATEADD(day, -@days, GETUTCDATE())
        ),
        claim_totals AS (
          SELECT
            ClaimID,
            PayerID,
            SUM(CASE WHEN TrxType = 'Charge'  THEN TrxAmt ELSE 0 END) AS Charged,
            SUM(CASE WHEN TrxType = 'Payment' THEN TrxAmt ELSE 0 END) AS Paid,
            SUM(ContractualAdj) AS ContractualAdj
          FROM recent
          GROUP BY ClaimID, PayerID
        ),
        contracted_payers AS (
          SELECT DISTINCT PayerID FROM dbo.contractPayerContracts WHERE ActiveFlag = 1
        )
        SELECT
          COUNT(DISTINCT ct.ClaimID)                                           AS TotalClaims,
          ISNULL(SUM(ct.Charged), 0)                                           AS TotalBilled,
          ISNULL(SUM(ct.Paid), 0)                                              AS TotalPaid,
          ISNULL(SUM(ct.ContractualAdj), 0)                                   AS TotalContractualAdj,
          ISNULL(AVG(
            CASE WHEN ct.Charged > 0
                 THEN ct.Paid / ct.Charged * 100
                 ELSE NULL END
          ), 0)                                                                AS AvgPaymentRatePct,
          COUNT(DISTINCT ct.PayerID)                                           AS UniquePayersRouted,
          -- Claims for payers with an active contract
          COUNT(DISTINCT CASE WHEN cp.PayerID IS NOT NULL THEN ct.ClaimID ELSE NULL END)
                                                                               AS ClaimsWithContractedRate
        FROM claim_totals ct
        LEFT JOIN contracted_payers cp ON cp.PayerID = ct.PayerID
      `);

      return res.status(200).json({ data: result.recordset[0] ?? {} });
    } catch (err: unknown) {
      logger.error('ContractsController.getSavingsSummary error', { error: err });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  /**
   * GET /payer-iq/contracts/:id/routing-paths
   * All routing paths (lease networks) available for a specific contract's payer.
   */
  public getRoutingPaths = async (req: Request, res: Response): Promise<Response> => {
    try {
      const contractId = parseInt(req.params.id, 10);
      if (!contractId || contractId <= 0) {
        return res.status(400).json({ message: 'Valid contract id required' });
      }

      const request = this.pool.request();
      request.input('contractId', sql.Int, contractId);

      const result = await request.query(`
        -- UNION: contracted network (from cpc.LeaseNetworkID) + all payer-level network links
        SELECT
          cln.LeaseNetworkID,
          cln.LeaseNetworkKey,
          cln.NetworkName,
          cln.GovernmentCommercial,
          cln.DirectIndirect,
          cln.AgreementKnown,
          1                  AS IsContractedRoute,
          NULL               AS MatchMethod,
          NULL               AS CrosswalkActive,
          -- Contracted rate avg for this network's contract
          ISNULL((SELECT AVG(CAST(cfs.ReimbursedAmount AS FLOAT))
                  FROM dbo.contractFeeSchedule cfs
                  WHERE cfs.PayerContractID = CAST(cpc.PayerContractID AS NVARCHAR(50))), 0)
                             AS AvgContractedRate
        FROM      dbo.contractPayerContracts cpc
        JOIN      dbo.contractLeaseNetwork   cln ON cln.LeaseNetworkID = cpc.LeaseNetworkID
        WHERE     cpc.PayerContractID = @contractId AND cpc.ActiveFlag = 1

        UNION

        -- Additional payer-level paths (not already shown via contracted network)
        SELECT
          cln.LeaseNetworkID,
          cln.LeaseNetworkKey,
          cln.NetworkName,
          cln.GovernmentCommercial,
          cln.DirectIndirect,
          cln.AgreementKnown,
          0                  AS IsContractedRoute,
          cpx.MatchMethod,
          cpx.ActiveFlag,
          -- Lookup rate if a contract for this payer exists on this specific network
          ISNULL((SELECT AVG(CAST(cfs.ReimbursedAmount AS FLOAT))
                  FROM dbo.contractPayerContracts cpc2
                  JOIN dbo.contractFeeSchedule cfs ON cfs.PayerContractID = CAST(cpc2.PayerContractID AS NVARCHAR(50))
                  WHERE cpc2.PayerID = cpc.PayerID AND cpc2.LeaseNetworkID = cln.LeaseNetworkID AND cpc2.ActiveFlag = 1), 0)
                             AS AvgContractedRate
        FROM      dbo.contractPayerContracts  cpc
        JOIN      dbo.contractLeaseNetworkPayer clnp ON clnp.PayerID      = cpc.PayerID
        JOIN      dbo.contractLeaseNetwork      cln  ON cln.LeaseNetworkID = clnp.LeaseNetworkID
        LEFT JOIN dbo.contractPayerXwalk        cpx  ON cpx.ContractPayerID = cpc.PayerID
        WHERE     cpc.PayerContractID = @contractId AND cpc.ActiveFlag = 1
          AND     cln.LeaseNetworkID != cpc.LeaseNetworkID

        ORDER BY IsContractedRoute DESC, LeaseNetworkKey
      `);

      return res.status(200).json({ data: result.recordset ?? [] });
    } catch (err: unknown) {
      logger.error('ContractsController.getRoutingPaths error', { error: err });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}
