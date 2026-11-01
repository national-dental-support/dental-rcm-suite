import { Request, Response } from 'express';
import logger from '../../../utils/logger';
import { DatabaseConnectionController } from '../../database-connection-controller';
import { buildDateAndPayerFilters } from '../../../utils/global-filters';

export interface PayerDetailsTreeRow {
  SortLevel: number;
  LevelType: 'CATEGORY' | 'GROUP' | 'PAYER' | 'PLAN';
  Category: string;
  GroupName: string | null;
  PayerName: string | null;
  PlanName: string | null;
  TotalCharges: number;
  Claims: number;
}

export class PayerDetails extends DatabaseConnectionController {
  constructor() {
    super();
  }

  public get = async (req: Request, res: Response): Promise<Response> => {
    try {
      let built: ReturnType<typeof buildDateAndPayerFilters>;
      try {
        built = buildDateAndPayerFilters(req, { claims: 'r', payer: 'r' });
      } catch (e) {
        if (e instanceof Error && e.message === 'INVALID_DATE') {
          return res.status(400).json({
            message: 'Invalid date format. Use YYYY-MM-DD for start/end.',
          });
        }
        throw e;
      }

      const lineRollupWhere: string[] = [
        ...built.clauseParts,
        `r.TrxType IN ('Charge','Payment')`,
      ];

      const query = `
        /* Map payer names to lease network names via contractLeaseNetworkPayer */
        WITH lease_lookup AS (
          SELECT DISTINCT
            p.InsuranceName AS PayerName,
            n.NetworkName
          FROM dbo.contractLeaseNetworkPayer np
          JOIN dbo.payer p
            ON p.PayerID = np.PayerID
          JOIN dbo.contractLeaseNetwork n
            ON n.LeaseNetworkID = np.LeaseNetworkID
        ),

        line_rollup AS (
          SELECT
            r.ClaimID,
            r.DateOfService,
            r.InsuranceName AS PayerName,
            SUM(CASE WHEN r.TrxType = 'Charge'  THEN COALESCE(r.TrxAmt, 0.0) ELSE 0.0 END) AS ChargeAmt,
            SUM(CASE WHEN r.TrxType = 'Payment' THEN COALESCE(r.TrxAmt, 0.0) ELSE 0.0 END) AS PaidAmt
          FROM dbo.recon_report r
          WHERE ${lineRollupWhere.join('\n            AND ')}
          GROUP BY
            r.ClaimID,
            r.DateOfService,
            r.InsuranceName
        ),

        classified AS (
          SELECT
            lr.*,
            ll.NetworkName,
            CASE
              WHEN ll.NetworkName IS NOT NULL
                THEN 'Lease Network'
              WHEN lr.PayerName LIKE '%Medicare%'
                OR lr.PayerName LIKE '%Medicaid%'
                OR lr.PayerName LIKE '%Tricare%'
                OR lr.PayerName LIKE '%VA %'
                OR lr.PayerName LIKE '%Veterans%'
                OR lr.PayerName LIKE '%CHAMPVA%'
                THEN 'Government'
              ELSE 'Commercial'
            END AS Category,
            CASE
              WHEN ll.NetworkName IS NOT NULL
                THEN ll.NetworkName
              WHEN lr.PayerName LIKE '%Medicare Advantage%' OR lr.PayerName LIKE '%Advantage%'
                THEN 'Medicare Advantage'
              WHEN lr.PayerName LIKE '%Medicare%'
                THEN 'Medicare'
              WHEN lr.PayerName LIKE '%Medicaid%'
                THEN 'Medicaid'
              WHEN lr.PayerName LIKE '%Tricare%'
                OR lr.PayerName LIKE '%VA %'
                OR lr.PayerName LIKE '%Veterans%'
                OR lr.PayerName LIKE '%CHAMPVA%'
                THEN 'Federal Plans'
              ELSE 'Payer Direct'
            END AS GroupName
          FROM line_rollup lr
          LEFT JOIN lease_lookup ll
            ON ll.PayerName = lr.PayerName
        ),

        not_fully_paid AS (
          SELECT *
          FROM classified
          WHERE ChargeAmt > PaidAmt
            AND ChargeAmt > 0
        ),

        /* ACTUAL ROLLUPS */
        actual_category AS (
          SELECT
            Category,
            SUM(ChargeAmt) AS TotalCharges,
            COUNT(DISTINCT ClaimID) AS Claims
          FROM not_fully_paid
          GROUP BY Category
        ),
        actual_group AS (
          SELECT
            Category,
            GroupName,
            SUM(ChargeAmt) AS TotalCharges,
            COUNT(DISTINCT ClaimID) AS Claims
          FROM not_fully_paid
          GROUP BY Category, GroupName
        ),
        actual_payer AS (
          SELECT
            Category,
            GroupName,
            PayerName,
            SUM(ChargeAmt) AS TotalCharges,
            COUNT(DISTINCT ClaimID) AS Claims
          FROM not_fully_paid
          GROUP BY Category, GroupName, PayerName
        ),

        /* SCAFFOLDS (FIXED ROWS) */
        scaffold_category AS (
          SELECT v.Category
          FROM (VALUES ('Commercial'), ('Government'), ('Lease Network')) v(Category)
        ),
        scaffold_gov_groups AS (
          SELECT Category = 'Government', GroupName
          FROM (VALUES ('Medicare'), ('Medicaid'), ('Medicare Advantage'), ('Federal Plans')) v(GroupName)
        ),
        scaffold_commercial_groups AS (
          SELECT Category = 'Commercial', GroupName
          FROM (VALUES ('Payer Direct')) v(GroupName)
        ),
        scaffold_lease_groups AS (
          SELECT DISTINCT
            'Lease Network' AS Category,
            n.NetworkName AS GroupName
          FROM dbo.contractLeaseNetwork n
        ),

        /* FINAL TREE (SCAFFOLD <- ACTUAL) */
        payer_rollup_fixed AS (
          /* Level 1: Categories */
          SELECT
            1 AS SortLevel,
            'CATEGORY' AS LevelType,
            s.Category,
            CAST(NULL AS nvarchar(200)) AS GroupName,
            CAST(NULL AS nvarchar(200)) AS PayerName,
            CAST(NULL AS nvarchar(200)) AS PlanName,
            COALESCE(a.TotalCharges, 0.0) AS TotalCharges,
            COALESCE(a.Claims, 0) AS Claims
          FROM scaffold_category s
          LEFT JOIN actual_category a
            ON a.Category = s.Category

          UNION ALL

          /* Level 2: Groups */
          SELECT
            2 AS SortLevel,
            'GROUP' AS LevelType,
            g.Category,
            g.GroupName,
            CAST(NULL AS nvarchar(200)) AS PayerName,
            CAST(NULL AS nvarchar(200)) AS PlanName,
            COALESCE(ag.TotalCharges, 0.0) AS TotalCharges,
            COALESCE(ag.Claims, 0) AS Claims
          FROM (
            SELECT Category, GroupName FROM scaffold_gov_groups
            UNION ALL
            SELECT Category, GroupName FROM scaffold_commercial_groups
            UNION ALL
            SELECT Category, GroupName FROM scaffold_lease_groups
            UNION ALL
            SELECT Category, GroupName
            FROM actual_group
            WHERE Category = 'Commercial'
              AND GroupName <> 'Payer Direct'
          ) g
          LEFT JOIN actual_group ag
            ON ag.Category = g.Category
           AND ag.GroupName = g.GroupName

          UNION ALL

          /* Level 3: Payers (data-driven) */
          SELECT
            3 AS SortLevel,
            'PAYER' AS LevelType,
            ap.Category,
            ap.GroupName,
            ap.PayerName,
            CAST(NULL AS nvarchar(200)) AS PlanName,
            ap.TotalCharges,
            ap.Claims
          FROM actual_payer ap
        )

        SELECT
          SortLevel,
          LevelType,
          Category,
          GroupName,
          PayerName,
          PlanName,
          CAST(TotalCharges AS float) AS TotalCharges,
          Claims
        FROM payer_rollup_fixed
        ORDER BY
          CASE Category
            WHEN 'Commercial' THEN 1
            WHEN 'Government' THEN 2
            WHEN 'Lease Network' THEN 3
          END,
          SortLevel,
          GroupName,
          PayerName,
          PlanName;
      `;

      const request = this.pool.request();
      built.inputs.forEach(({ name, value }) => request.input(name, value));

      logger.info('PayerDetails.get \u2192 executing payer details tree query', {
        startDate: built.startDate,
        endDate: built.endDate,
        payers: built.payers,
      });

      const result = await request.query(query);

      return res.status(200).json({
        message: 'Payer details tree data',
        data: (result.recordset ?? []) as PayerDetailsTreeRow[],
      });
    } catch (error: unknown) {
      logger.error('PayerDetails.get \u2013 error executing query', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}
