import { Request, Response } from 'express';
import sql from 'mssql';
import { DatabaseConnectionController } from '../../../controllers/database-connection-controller';

export class PayerCollectionDetails extends DatabaseConnectionController {
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
DECLARE @EndDate DATE = CAST(@_dos_end AS DATE);
DECLARE @StartDate DATE = CAST(@_dos_start AS DATE);

WITH PayerCollections AS (
    SELECT
        rr.InsuranceName,
        SUM(
            CASE
                WHEN rr.PayerType = 'Insurance'
                     AND rr.PaymentPostDate BETWEEN @StartDate AND @EndDate
                     AND rr.TrxType = 'Payment'
                THEN rr.TrxAmt ELSE 0
            END
        ) AS InsuranceCollections,
        SUM(
            CASE
                WHEN rr.PayerType = 'Patient'
                     AND rr.PaymentPostDate BETWEEN @StartDate AND @EndDate
                     AND rr.TrxType = 'Payment'
                THEN rr.TrxAmt ELSE 0
            END
        ) AS PatientCollections
    FROM dbo.recon_report rr
    WHERE rr.PaymentPostDate BETWEEN @StartDate AND @EndDate
    ${custWhere} ${bodyWhere}
    GROUP BY rr.InsuranceName
),
PayerClaimAmounts AS (
    SELECT
        rr.InsuranceName,
        SUM(c.ChargeAmt) AS ClaimAmount
    FROM (
        SELECT DISTINCT
            InsuranceName,
            ClaimID
        FROM dbo.recon_report
        WHERE PaymentPostDate BETWEEN @StartDate AND @EndDate
          AND ClaimID IS NOT NULL
          ${custWhere}
    ) rr
    INNER JOIN dbo.claims c
        ON rr.ClaimID = c.ClaimID
    GROUP BY rr.InsuranceName
),
WithTotals AS (
    SELECT
        pc.InsuranceName,
        pc.InsuranceCollections,
        pc.PatientCollections,
        pca.ClaimAmount,
        (pc.InsuranceCollections + pc.PatientCollections) AS TotalCollections
    FROM PayerCollections pc
    LEFT JOIN PayerClaimAmounts pca
        ON pc.InsuranceName = pca.InsuranceName
)
SELECT
    InsuranceName,
    TotalCollections,
    InsuranceCollections,
    PatientCollections,
    CASE
        WHEN TotalCollections = 0 THEN NULL
        ELSE (InsuranceCollections / TotalCollections) * 100.0
    END AS InsurancePercentage,
    CASE
        WHEN TotalCollections = 0 THEN NULL
        ELSE (PatientCollections / TotalCollections) * 100.0
    END AS PatientPercentage,
    ClaimAmount AS Claim
FROM WithTotals
ORDER BY TotalCollections DESC;
      `;

      const result = await request.query(query);
      return res.status(200).json(result.recordset);
    } catch (error: any) {
      console.error('PayerCollectionDetails error:', error);
      return res.status(500).json({ message: error?.message || 'Internal Server Error' });
    }
  };
}

export const payerCollectionDetails = new PayerCollectionDetails();