import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../../utils/logger';
import { DatabaseConnectionController } from '../../database-connection-controller';
import { extractCustomerId } from '../../../utils/resolve-user-scope';

export class FullyReconciledPayments extends DatabaseConnectionController {
  constructor() { super(); }

  // -- Summary list -------------------------------------------------------------
  public get = async (req: Request, res: Response): Promise<Response> => {
    try {
      const page      = Math.max(1, Number(req.query.page ?? 1));
      const pageSize  = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 25)));
      const search    = ((req.query.search as string) ?? '').trim().toLowerCase();
      const from      = req.query.from  as string | undefined;
      const to        = req.query.to    as string | undefined;

      const pool = (this as any).pool as sql.ConnectionPool;
      const isSuperAdmin = (req as any).actor?.isSuperAdmin === true;
      const xenCustId = isSuperAdmin ? null : extractCustomerId(req);

      const custFilter = xenCustId != null
        ? `AND EXISTS (
             SELECT 1 FROM dbo.EOBERAClaim ec_c
             JOIN dbo.claims c_c ON c_c.ClaimID = ec_c.ClaimID
             WHERE ec_c.RemittanceFileID = cph.RemittanceFileID
               AND c_c.customer_id = @_custId
           )`
        : '';

      const sqlText = `
        WITH recon_agg AS (
          SELECT RemittanceFileID,
            MIN(BankDepositID) AS BankDepositID,
            MIN(CreateDate)    AS ReconciledDate
          FROM dbo.reconciliation
          GROUP BY RemittanceFileID
        ),
        claim_agg AS (
          SELECT ec.RemittanceFileID,
            COUNT(DISTINCT ec.ClaimID)  AS ClaimCount,
            SUM(rl.ChargeAmt)           AS TotalCharge,
            SUM(rl.AllowedAmt)          AS TotalAllowed,
            SUM(rl.PaidAmt)             AS TotalPaid,
            SUM(rl.PatientRespAmt)      AS TotalPatientResp,
            SUM(rl.AdjustmentAmt)       AS TotalAdjustment
          FROM dbo.EOBERAClaim ec
          JOIN dbo.remittanceLine rl
            ON rl.ClaimID = ec.ClaimID AND rl.customer_id = ec.customer_id
          WHERE ec.customer_id = 1
          GROUP BY ec.RemittanceFileID
        ),
        loc_agg AS (
          SELECT src.RemittanceFileID,
            STRING_AGG(src.loc, '|') AS locationList,
            COUNT(*) AS locationCount
          FROM (
            SELECT DISTINCT ec.RemittanceFileID,
              ISNULL(prov.Location, 'Unknown') AS loc
            FROM dbo.EOBERAClaim ec
            JOIN dbo.claims c ON c.ClaimID = ec.ClaimID
            JOIN dbo.provider prov
              ON prov.ProviderID = c.ProviderID AND prov.customer_id = c.customer_id
            WHERE ec.customer_id = 1
          ) src
          GROUP BY src.RemittanceFileID
        )
        SELECT
          cph.RemittanceFileID                             AS reconciledId,
          CONVERT(varchar(10), cph.PostedDate, 23)        AS postedDate,
          ISNULL(cph.PostedBy, '')                        AS postedBy,
          ISNULL(rf.FileType, '')                         AS fileType,
          CONVERT(varchar(10), rf.FileDate, 23)           AS fileDate,
          ISNULL(rf.PracticeLocation, '')                 AS practiceLocation,
          ISNULL(la.locationList, ISNULL(rf.PracticeLocation, '')) AS locationList,
          ISNULL(la.locationCount, 1)                     AS locationCount,
          ISNULL(rf.era_payer, '')                        AS payerName,
          CAST(ISNULL(rf.Amount, 0) AS decimal(18,2))     AS amountFullEra,
          CONVERT(varchar(10), ra.ReconciledDate, 23)     AS reconciledDate,
          CONVERT(varchar(10), bd.DepositDate, 23)        AS depositDate,
          CAST(ISNULL(bd.DepositAmount, 0) AS decimal(18,2)) AS amountDeposited,
          ISNULL(bd.DepositMethod, '')                    AS depositMethod,
          ISNULL(b.BankName, 'Unknown')                   AS bankName,
          CAST(pbp.PayerBankProfileID AS varchar(50))     AS bankFeedId,
          ISNULL(bac.bank_name, '')                       AS bankAccountName,
          ISNULL(bac.nickname, '')                        AS bankAccountNickname,
          ISNULL(ca.ClaimCount, 0)                        AS claimCount,
          CAST(ISNULL(ca.TotalCharge, 0)      AS decimal(18,2)) AS totalCharge,
          CAST(ISNULL(ca.TotalAllowed, 0)     AS decimal(18,2)) AS totalAllowed,
          CAST(ISNULL(ca.TotalPaid, 0)        AS decimal(18,2)) AS totalPaid,
          CAST(ISNULL(ca.TotalPatientResp, 0) AS decimal(18,2)) AS totalPatientResp,
          CAST(ISNULL(ca.TotalAdjustment, 0)  AS decimal(18,2)) AS totalAdjustment,
          -- Sweep simulation: satellite account (Wells Fargo) \u2192 central (Chase), 3 days after post
          CONVERT(varchar(10), DATEADD(DAY, 3, cph.PostedDate), 23) AS sweepDate,
          ISNULL(bac.bank_name, 'Wells Fargo')                      AS sweepSourceBankName,
          ISNULL(bac.nickname, 'Insurance Receipts')                AS sweepSourceAccountName,
          'Chase Business Banking'                                   AS sweepDestBankName,
          'Main Operating Account'                                   AS sweepDestAccountName,
          CAST(ISNULL(bd.DepositAmount, 0) AS decimal(18,2))        AS sweepAmount
        FROM dbo.claimPostHistory cph
        LEFT JOIN dbo.remittanceFile rf
          ON rf.RemittanceFileID = cph.RemittanceFileID
        LEFT JOIN recon_agg ra
          ON ra.RemittanceFileID = cph.RemittanceFileID
        LEFT JOIN dbo.bankDeposit bd
          ON bd.BankDepositID = ra.BankDepositID
        LEFT JOIN dbo.payerPayment pp
          ON pp.PayerPaymentID = bd.PayerPaymentID
        LEFT JOIN dbo.payerBankProfile pbp
          ON pbp.PayerID = pp.PayerID
        LEFT JOIN dbo.bank b
          ON b.BankID = pp.IssuingBankID
        LEFT JOIN dbo.BankAccountConnection bac
          ON bac.id = cph.bank_account_id
        LEFT JOIN claim_agg ca
          ON ca.RemittanceFileID = cph.RemittanceFileID
        LEFT JOIN loc_agg la
          ON la.RemittanceFileID = cph.RemittanceFileID
        WHERE cph.PostedFlag = '1'
          AND (@from IS NULL OR bd.DepositDate >= @from)
          AND (@to   IS NULL OR bd.DepositDate <= @to)
          ${custFilter}
        ORDER BY cph.PostedDate DESC
        OFFSET @_offset ROWS FETCH NEXT @_pageSize ROWS ONLY;
      `;

      const request = pool.request();
      request.input('_offset',   sql.Int,  (page - 1) * pageSize);
      request.input('_pageSize', sql.Int,  pageSize);
      request.input('from',      sql.Date, from ?? null);
      request.input('to',        sql.Date, to   ?? null);
      if (xenCustId != null) request.input('_custId', sql.Int, xenCustId);

      const result  = await request.query(sqlText);
      let rows: any[] = result.recordset ?? [];

      if (search) {
        rows = rows.filter(r =>
          (r.reconciledId   ?? '').toLowerCase().includes(search) ||
          (r.payerName      ?? '').toLowerCase().includes(search) ||
          (r.bankName       ?? '').toLowerCase().includes(search) ||
          (r.bankFeedId     ?? '').toLowerCase().includes(search) ||
          (r.depositDate    ?? '').toLowerCase().includes(search) ||
          (r.locationList   ?? '').toLowerCase().includes(search) ||
          (r.practiceLocation ?? '').toLowerCase().includes(search) ||
          (r.postedBy       ?? '').toLowerCase().includes(search)
        );
      }

      return res.status(200).json({
        message: 'Fully paid and reconciled payments',
        asOf: new Date().toISOString(),
        pagination: { page, pageSize, totalRows: rows.length },
        rows,
      });
    } catch (error) {
      logger.error('FullyReconciledPayments.get error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  // -- Claim-level adjudication detail for one remittance file ------------------
  public getClaims = async (req: Request, res: Response): Promise<Response> => {
    try {
      const fileId = req.params.fileId as string;
      if (!fileId) return res.status(400).json({ message: 'fileId required' });

      const pool = (this as any).pool as sql.ConnectionPool;
      const req2 = pool.request().input('fileId', sql.VarChar(50), fileId);

      const [claimsResult, locResult] = await Promise.all([
        req2.query(`
          SELECT
            ec.ClaimID                                        AS claimId,
            ISNULL(prov.Location, 'Unknown')                  AS location,
            ISNULL(pay.InsuranceName, '')                      AS payerName,
            CONVERT(varchar(10), c.DateOfService, 23)         AS dateOfService,
            CAST(ISNULL(rl.ChargeAmt,      0) AS decimal(18,2)) AS chargeAmt,
            CAST(ISNULL(rl.AllowedAmt,     0) AS decimal(18,2)) AS allowedAmt,
            CAST(ISNULL(rl.PaidAmt,        0) AS decimal(18,2)) AS paidAmt,
            CAST(ISNULL(rl.PatientRespAmt, 0) AS decimal(18,2)) AS patientRespAmt,
            CAST(ISNULL(rl.AdjustmentAmt,  0) AS decimal(18,2)) AS adjustmentAmt,
            CAST(rl.ChargeAmt - rl.AllowedAmt AS decimal(18,2)) AS writeOff,
            ISNULL(rl.era_line_status, '')                     AS lineStatus
          FROM dbo.EOBERAClaim ec
          JOIN dbo.remittanceLine rl
            ON rl.ClaimID = ec.ClaimID AND rl.customer_id = ec.customer_id
          JOIN dbo.payer pay
            ON pay.PayerID = rl.PayerID AND pay.customer_id = ec.customer_id
          JOIN dbo.claims c ON c.ClaimID = ec.ClaimID
          JOIN dbo.provider prov
            ON prov.ProviderID = c.ProviderID AND prov.customer_id = c.customer_id
          WHERE ec.RemittanceFileID = @fileId
            AND ec.customer_id = 1
          ORDER BY prov.Location, ec.ClaimID;
        `),
        pool.request().input('fileId', sql.VarChar(50), fileId).query(`
          SELECT
            ISNULL(prov.Location, 'Unknown')                AS location,
            COUNT(DISTINCT ec.ClaimID)                      AS claimCount,
            CAST(SUM(rl.ChargeAmt)     AS decimal(18,2))    AS totalCharge,
            CAST(SUM(rl.AllowedAmt)    AS decimal(18,2))    AS totalAllowed,
            CAST(SUM(rl.PaidAmt)       AS decimal(18,2))    AS totalPaid,
            CAST(SUM(rl.PatientRespAmt)AS decimal(18,2))    AS totalPatientResp,
            CAST(SUM(rl.AdjustmentAmt) AS decimal(18,2))    AS totalAdjustment
          FROM dbo.EOBERAClaim ec
          JOIN dbo.remittanceLine rl
            ON rl.ClaimID = ec.ClaimID AND rl.customer_id = ec.customer_id
          JOIN dbo.claims c ON c.ClaimID = ec.ClaimID
          JOIN dbo.provider prov
            ON prov.ProviderID = c.ProviderID AND prov.customer_id = c.customer_id
          WHERE ec.RemittanceFileID = @fileId
            AND ec.customer_id = 1
          GROUP BY prov.Location
          ORDER BY prov.Location;
        `),
      ]);

      return res.status(200).json({
        fileId,
        claims:     claimsResult.recordset ?? [],
        byLocation: locResult.recordset   ?? [],
      });
    } catch (error) {
      logger.error('FullyReconciledPayments.getClaims error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}
