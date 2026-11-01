import { Request, Response } from 'express';
import sql from 'mssql';
import { DatabaseConnectionController } from '../../../controllers/database-connection-controller';

export class CollectionTrends extends DatabaseConnectionController {
  constructor() {
    super();
  }

  //  THIS is what ApiHandlerFactory expects
  public get = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { where: custWhere, bind: bindCust } = this.custFilter(req);
      const { where: bodyWhere, bind: bindBody } = this.bodyFilter(req);
      const { bind: bindDos } = this.dosRange(req);
      const query = `
DECLARE @EndDate DATE = CAST(@_dos_end AS DATE);
DECLARE @StartDate DATE = CAST(@_dos_start AS DATE);
WITH MonthlyTotals AS (
  SELECT
    FORMAT(PaymentPostDate, 'yyyy-MM') AS Month,
    SUM(CASE WHEN TrxType = 'Payment' THEN TrxAmt ELSE 0 END) AS TotalCollections,
    SUM(CASE WHEN TrxType = 'Payment' AND PayerType = 'Patient' THEN TrxAmt ELSE 0 END) AS PatientCollections,
    SUM(CASE WHEN TrxType = 'Payment' AND PayerType = 'Insurance' THEN TrxAmt ELSE 0 END) AS InsuranceCollections
  FROM dbo.recon_report
  WHERE PaymentPostDate IS NOT NULL AND TrxType = 'Payment'
    AND PaymentPostDate BETWEEN @StartDate AND @EndDate
  ${custWhere} ${bodyWhere}
  GROUP BY FORMAT(PaymentPostDate, 'yyyy-MM')
)
SELECT
  Month,
  PatientCollections,
  InsuranceCollections,
  TotalCollections,
  CASE
    WHEN TotalCollections = 0 THEN 0
    ELSE (PatientCollections * 100.0 / TotalCollections)
  END AS PatientPct,
  CASE
    WHEN TotalCollections = 0 THEN 0
    ELSE (InsuranceCollections * 100.0 / TotalCollections)
  END AS InsurancePct
FROM MonthlyTotals
ORDER BY Month;
      `;

      const request = this.pool.request();
      bindCust(request);
      bindBody(request);
      bindDos(request);
      const result = await request.query(query);

      return res.status(200).json(result.recordset);
    } catch (error: any) {
      console.error('CollectionTrends error:', error);
      return res.status(500).json({
        message: error?.message || 'Internal Server Error',
      });
    }
  };
}

export const collectionTrends = new CollectionTrends();