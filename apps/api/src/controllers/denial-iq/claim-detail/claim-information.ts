import { Request, Response } from 'express';
import logger from '../../../utils/logger';
import { DatabaseConnectionController } from '../../database-connection-controller';
import sql from 'mssql';
import { extractCustomerId } from '../../../utils/resolve-user-scope';

export class ClaimInformation extends DatabaseConnectionController {
  constructor() {
    super();
  }

  public get = async (req: Request, res: Response): Promise<Response> => {
    try {
      const claimId = (req.query.claimId as string) ?? '';

      if (!claimId) {
        return res.status(400).json({
          message: 'Missing required query parameter: claimId',
        });
      }
      const xenCustId = extractCustomerId(req);
      const request = this.pool.request();
      request.input('ClaimIDParam', sql.NVarChar(50), claimId);
      if (xenCustId != null) request.input('_custId', sql.Int, xenCustId);

      const custFilter = xenCustId != null ? ' AND c.customer_id = @_custId' : '';
      const custFilterRR = xenCustId != null ? ' AND rr.customer_id = @_custId' : '';

      const query = `
      DECLARE @ClaimID nvarchar(50) = @ClaimIDParam;
      DECLARE @AsOfDate date;

      -- "Today" = last activity date for this claim (claimhistory or recon_report)
      SELECT
          @AsOfDate = MAX(ActivityDate)
      FROM (
          SELECT
              COALESCE(ch.ClaimWorkEndedTime, ch.ClaimWorkStartedTime, ch.ClaimSubmittedDate) AS ActivityDate
          FROM dbo.claimhistory ch
          WHERE ch.ClaimID = @ClaimID

          UNION ALL

          SELECT
              COALESCE(rr.PaymentPostDate, rr.PostDate, rr.DateOfService) AS ActivityDate
          FROM dbo.recon_report rr
          WHERE rr.ClaimID = @ClaimID
      ) x;

      IF @AsOfDate IS NULL
      BEGIN
          SET @AsOfDate = CAST(GETDATE() AS date);
      END;

      ;WITH ClaimBase AS (
          SELECT
              c.ClaimID,
              c.PatientID,
              c.PayerID,
              c.ProviderID,
              c.ChargeAmt,
              c.ClaimSubmittedDate,
              c.DateOfService,
              COALESCE(c.xen_claim_note, c.ClaimNote, '') AS ClaimNote
          FROM dbo.claims c
          WHERE c.ClaimID = @ClaimID${custFilter}
      ),
      LatestHistoryAny AS (
          SELECT
              ch.*,
              ROW_NUMBER() OVER (
                  PARTITION BY ch.ClaimID
                  ORDER BY ch.ClaimModifiedDate DESC, ch.ClaimWorkStartedTime DESC
              ) AS rn
          FROM dbo.claimhistory ch
          WHERE ch.ClaimID = @ClaimID
      ),
      ClaimRollup AS (
          SELECT
              rr.ClaimID,
              MIN(rr.PatientID)           AS PatientID,
              MIN(rr.SubscriberFirstName) AS SubscriberFirstName,
              MIN(rr.SubscriberLastName)  AS SubscriberLastName,
              COALESCE(MIN(rr.SubscriberID), MIN(rr.InsurancePolicyNumber)) AS SubscriberID,
              MIN(rr.Location)            AS PracticeLocation,
              MIN(rr.ProviderName)        AS ProviderName,

              MIN(CASE WHEN rr.PrimarySecondaryTertiary = 'Primary'   THEN rr.InsuranceName END) AS PrimaryIns,
              MIN(CASE WHEN rr.PrimarySecondaryTertiary = 'Secondary' THEN rr.InsuranceName END) AS SecondaryIns,
              MIN(CASE WHEN rr.PrimarySecondaryTertiary = 'Tertiary'  THEN rr.InsuranceName END) AS TertiaryIns,

              MIN(rr.InsuranceName) AS PayerName,
              MIN(CASE WHEN rr.TrxType = 'Charge' THEN rr.Network END) AS Network,

              SUM(CASE WHEN rr.TrxType = 'Charge'     THEN rr.TrxAmt ELSE 0 END) AS TotalCharges,
              SUM(CASE WHEN rr.TrxType = 'Payment'    THEN rr.TrxAmt ELSE 0 END) AS TotalPayments,
              SUM(CASE WHEN rr.TrxType = 'Adjustment' THEN rr.TrxAmt ELSE 0 END) AS TotalAdjustments,

              -- Payment date = latest PaymentPostDate from payment transactions
              MAX(CASE WHEN rr.TrxType = 'Payment' THEN rr.PaymentPostDate END) AS LatestPaymentDate,
              -- Deposit created date from recon_report (if populated)
              MAX(rr.DepositCreated) AS DepositCreatedDate,

              SUM(CASE WHEN rr.PayerType = 'Insurance' THEN
                      CASE
                          WHEN rr.TrxType = 'Charge'                  THEN rr.TrxAmt
                          WHEN rr.TrxType IN ('Payment','Adjustment') THEN -rr.TrxAmt
                          ELSE 0
                      END
                  ELSE 0 END) AS InsuranceAR,

              SUM(CASE WHEN rr.PayerType = 'Patient' THEN
                      CASE
                          WHEN rr.TrxType = 'Charge'                  THEN rr.TrxAmt
                          WHEN rr.TrxType IN ('Payment','Adjustment') THEN -rr.TrxAmt
                          ELSE 0
                      END
                  ELSE 0 END) AS PatientAR

          FROM dbo.recon_report rr
          WHERE rr.ClaimID = @ClaimID${custFilterRR}
          GROUP BY rr.ClaimID
      ),

      -- Payment/deposit details from payerPayment chain (if available)
      PaymentDetail AS (
          SELECT TOP 1
              pp.PaidDate,
              pp.IssueDate,
              pp.PaymentMethod    AS PmtMethod,
              pp.CheckNumber,
              pp.EFTTraceNumber,
              pp.RemittanceType,
              pp.PaymentAmount,
              ppa.AmountApplied,
              CAST(NULL AS date) AS DepositDate
          FROM dbo.payerPaymentAllocation ppa
          INNER JOIN dbo.payerPayment pp
              ON pp.PayerPaymentID = ppa.PayerPaymentID
          WHERE ppa.ClaimID = @ClaimID
          ORDER BY COALESCE(pp.PaidDate, pp.IssueDate) DESC
      )

      SELECT
          -- LEFT CARD
          SubscriberName = LTRIM(RTRIM(
              COALESCE(
                  NULLIF(LTRIM(RTRIM(
                      COALESCE(cr.SubscriberFirstName, '') + ' ' +
                      COALESCE(cr.SubscriberLastName, '')
                  )), ''),
                  NULLIF(LTRIM(RTRIM(
                      COALESCE(pt.FirstName, '') + ' ' +
                      COALESCE(pt.LastName, '')
                  )), ''),
                  ''
              )
          )),
          SubscriberID     = cr.SubscriberID,
          PracticeLocation = COALESCE(cr.PracticeLocation, pv.Location),
          Provider         = COALESCE(cr.ProviderName, pv.Provider),
          NPI              = pv.NPI,
          TaxID            = pv.TaxID,

          -- MIDDLE CARD
          DateOfService    = cb.DateOfService,
          ReceivedDate     = cb.ClaimSubmittedDate,
          AgingDays        = DATEDIFF(DAY, cb.ClaimSubmittedDate, CAST(GETDATE() AS date)),
          PaymentDate      = COALESCE(pd.PaidDate, pd.IssueDate, cr.LatestPaymentDate),
          DepositAmount    = COALESCE(pd.AmountApplied, cr.TotalPayments, pd.PaymentAmount),
          DepositCleared   = COALESCE(pd.DepositDate, pd.PaidDate, pd.IssueDate, cr.DepositCreatedDate),
          DepositCheckNo   = COALESCE(CAST(pd.CheckNumber AS nvarchar(50)), CAST(pd.EFTTraceNumber AS nvarchar(50))),

          -- RIGHT TOP CARD
          PayerName        = COALESCE(cr.PayerName, py.InsuranceName),
          RemittanceMethod = pd.RemittanceType,
          PaymentMethod    = pd.PmtMethod,
          Network          = cr.Network,
          PlaceOfService   = CAST(NULL AS nvarchar(50)),

          -- ReasonCode = CARC denial code only
          ReasonCode       = NULLIF(lh.CARCCode, ''),

          -- RIGHT BOTTOM CARD
          InsuranceBalDue  = ISNULL(cr.InsuranceAR, 0),
          PatientBalDue    = ISNULL(cr.PatientAR, 0),
          PrimaryIns       = COALESCE(cr.PrimaryIns, py.InsuranceName),
          SecondaryIns     = cr.SecondaryIns,
          TertiaryIns      = cr.TertiaryIns,

          -- PATIENT NAME (patient table first; fall back to recon_report subscriber)
          PatientName      = NULLIF(LTRIM(RTRIM(
              COALESCE(
                NULLIF(LTRIM(RTRIM(COALESCE(pt.FirstName,'') + ' ' + COALESCE(pt.LastName,''))), ''),
                NULLIF(LTRIM(RTRIM(COALESCE(cr.SubscriberFirstName,'') + ' ' + COALESCE(cr.SubscriberLastName,''))), '')
              )
          )), ''),
          DOB              = pt.dob,

          -- CLINICAL NARRATIVE
          ClaimNote        = cb.ClaimNote,

          -- ASSIGNED USER
          AssignedTo       = lh.AssignedTo,
          AssignedUserName = CASE
              WHEN lh.AssignedTo IS NOT NULL
              THEN NULLIF(LTRIM(RTRIM(
                  COALESCE(u.FirstName, '') + ' ' + COALESCE(u.LastName, '')
              )), '')
              ELSE NULL
          END

      FROM ClaimBase cb
      LEFT JOIN ClaimRollup cr
          ON cb.ClaimID = cr.ClaimID
      LEFT JOIN LatestHistoryAny lh
          ON cb.ClaimID = lh.ClaimID
         AND lh.rn = 1
      LEFT JOIN dbo.Users u
          ON CAST(u.userID AS NVARCHAR) = CAST(lh.AssignedTo AS NVARCHAR)
      LEFT JOIN dbo.patient pt
          ON pt.PatientID = cb.PatientID
      LEFT JOIN dbo.payer py
          ON py.PayerID = cb.PayerID
      LEFT JOIN dbo.provider pv
          ON pv.ProviderID = cb.ProviderID
      LEFT JOIN PaymentDetail pd
          ON 1 = 1;
      `;

     logger.info('ClaimInformation.get \u2192 executing claim information query', {
        claimId,
      });

      const result = await request.query(query);

      return res.status(200).json({
        message: 'Claim information data',
        data: result.recordset || [],
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`ClaimInformation.get \u2013 error executing query: ${msg}`);
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}
