import { Router, Request, Response } from 'express';
import sql from 'mssql';
import Database from '../../modules/db';

const router = Router();
const getPool = () => Database.getInstance().getPool();

function tenantFilter(req: Request, alias = 'rr') {
  const custId: number | null = (req as any).actor?.customer_id ?? null;
  if (custId == null) return { filter: '', bind: (r: sql.Request) => r };
  return {
    filter: `AND ${alias}.customer_id = @_custId`,
    bind: (r: sql.Request) => { r.input('_custId', sql.Int, custId); return r; },
  };
}

// GET /insightflow/patient-ltv
// Returns summary + by-cohort (year), by-payer breakdowns
router.get('/', async (req: Request, res: Response) => {
  try {
    const tf = tenantFilter(req);
    const pool = getPool();
    const r = pool.request();
    tf.bind(r);

    const result = await r.query(`
      -- Patient lifetime value: historical collections + 24-month projection
      WITH PatientHistory AS (
        SELECT
          rr.PatientFirstName + ' ' + rr.PatientLastName         AS patient_name,
          rr.InsuranceName                                        AS primary_payer,
          YEAR(MIN(rr.DateOfService))                             AS cohort_year,
          MIN(rr.DateOfService)                                   AS first_visit,
          MAX(rr.DateOfService)                                   AS last_visit,
          COUNT(DISTINCT rr.ClaimID)                             AS total_claims,
          SUM(CASE WHEN rr.TrxType = 'Charge' THEN rr.TrxAmt ELSE 0 END) AS total_billed,
          SUM(CASE WHEN rr.TrxType = 'Payment' THEN ABS(rr.TrxAmt) ELSE 0 END) AS total_collected
        FROM dbo.recon_report rr
        WHERE rr.PatientFirstName IS NOT NULL AND rr.PatientLastName IS NOT NULL
          AND rr.TrxAmt IS NOT NULL
          ${tf.filter}
        GROUP BY rr.PatientFirstName + ' ' + rr.PatientLastName, rr.InsuranceName
      ),
      PatientLTV AS (
        SELECT
          patient_name,
          primary_payer,
          cohort_year,
          first_visit,
          last_visit,
          total_claims,
          total_billed,
          total_collected,
          DATEDIFF(MONTH, first_visit, last_visit) + 1                               AS active_months,
          CASE
            WHEN DATEDIFF(MONTH, first_visit, last_visit) >= 1
              THEN total_collected / (DATEDIFF(MONTH, first_visit, last_visit) + 1.0)
            ELSE total_collected
          END                                                                         AS avg_monthly_value,
          -- LTV = actual + projection for remaining 24 months
          total_collected + (
            CASE
              WHEN DATEDIFF(MONTH, first_visit, last_visit) >= 1
                THEN (total_collected / (DATEDIFF(MONTH, first_visit, last_visit) + 1.0))
                     * CASE WHEN 24 - DATEDIFF(MONTH, last_visit, GETDATE()) > 0
                              THEN 24 - DATEDIFF(MONTH, last_visit, GETDATE())
                              ELSE 0 END
              ELSE 0
            END
          )                                                                           AS estimated_ltv
        FROM PatientHistory
      )
      -- 1. Overall summary
      SELECT
        COUNT(*)                          AS totalPatients,
        AVG(estimated_ltv)                AS avgLtv,
        SUM(total_collected)              AS totalLifetimeValue,
        AVG(active_months)                AS avgActiveMonths,
        AVG(total_claims * 1.0)          AS avgClaimsPerPatient
      FROM PatientLTV;

      -- 2. By cohort year
      WITH PatientHistory AS (
        SELECT
          rr.PatientFirstName + ' ' + rr.PatientLastName         AS patient_name,
          YEAR(MIN(rr.DateOfService))                             AS cohort_year,
          MIN(rr.DateOfService)                                   AS first_visit,
          MAX(rr.DateOfService)                                   AS last_visit,
          SUM(CASE WHEN rr.TrxType = 'Payment' THEN ABS(rr.TrxAmt) ELSE 0 END) AS total_collected
        FROM dbo.recon_report rr
        WHERE rr.PatientFirstName IS NOT NULL AND rr.PatientLastName IS NOT NULL
          ${tf.filter}
        GROUP BY rr.PatientFirstName + ' ' + rr.PatientLastName
      )
      SELECT
        cohort_year                                                              AS cohortYear,
        COUNT(*)                                                                 AS patientCount,
        AVG(total_collected + (
          CASE
            WHEN DATEDIFF(MONTH, first_visit, last_visit) >= 1
              THEN (total_collected / (DATEDIFF(MONTH, first_visit, last_visit) + 1.0))
                   * CASE WHEN 24 - DATEDIFF(MONTH, last_visit, GETDATE()) > 0
                            THEN 24 - DATEDIFF(MONTH, last_visit, GETDATE())
                            ELSE 0 END
            ELSE 0
          END
        ))                                                                       AS avgLtv,
        SUM(total_collected)                                                     AS totalCollected
      FROM PatientHistory
      GROUP BY cohort_year
      ORDER BY cohort_year DESC;

      -- 3. By payer
      WITH PatientHistory AS (
        SELECT
          rr.PatientFirstName + ' ' + rr.PatientLastName         AS patient_name,
          rr.InsuranceName                                        AS primary_payer,
          MIN(rr.DateOfService)                                   AS first_visit,
          MAX(rr.DateOfService)                                   AS last_visit,
          SUM(CASE WHEN rr.TrxType = 'Payment' THEN ABS(rr.TrxAmt) ELSE 0 END) AS total_collected
        FROM dbo.recon_report rr
        WHERE rr.PatientFirstName IS NOT NULL AND rr.PatientLastName IS NOT NULL
          ${tf.filter}
        GROUP BY rr.PatientFirstName + ' ' + rr.PatientLastName, rr.InsuranceName
      )
      SELECT TOP 10
        ISNULL(primary_payer, 'Self-Pay')                                        AS payer,
        COUNT(*)                                                                 AS patientCount,
        AVG(total_collected)                                                     AS avgCollected,
        SUM(total_collected)                                                     AS totalCollected
      FROM PatientHistory
      GROUP BY primary_payer
      ORDER BY totalCollected DESC;
    `);

    const rs = result.recordsets as any[][];
    res.json({
      summary: rs[0]?.[0] ?? {},
      byCohort: rs[1] ?? [],
      byPayer: rs[2] ?? [],
    });
  } catch (e: any) {
    console.error('patient-ltv error:', e?.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /insightflow/patient-ltv/top-patients?page=1&limit=20
router.get('/top-patients', async (req: Request, res: Response) => {
  try {
    const tf = tenantFilter(req);
    const pool = getPool();

    const page = Math.max(1, parseInt(String(req.query['page'] || '1'), 10));
    const limit = Math.min(50, Math.max(5, parseInt(String(req.query['limit'] || '20'), 10)));
    const offset = (page - 1) * limit;

    const r = pool.request();
    tf.bind(r);
    r.input('_offset', sql.Int, offset);
    r.input('_limit', sql.Int, limit);

    const result = await r.query(`
      WITH PatientHistory AS (
        SELECT
          rr.PatientFirstName + ' ' + rr.PatientLastName         AS patient_name,
          ISNULL(rr.InsuranceName, 'Self-Pay')                    AS primary_payer,
          YEAR(MIN(rr.DateOfService))                             AS cohort_year,
          MIN(rr.DateOfService)                                   AS first_visit,
          MAX(rr.DateOfService)                                   AS last_visit,
          COUNT(DISTINCT rr.ClaimID)                             AS total_claims,
          SUM(CASE WHEN rr.TrxType = 'Charge' THEN rr.TrxAmt ELSE 0 END) AS total_billed,
          SUM(CASE WHEN rr.TrxType = 'Payment' THEN ABS(rr.TrxAmt) ELSE 0 END) AS total_collected
        FROM dbo.recon_report rr
        WHERE rr.PatientFirstName IS NOT NULL AND rr.PatientLastName IS NOT NULL
          AND rr.TrxAmt IS NOT NULL
          ${tf.filter}
        GROUP BY rr.PatientFirstName + ' ' + rr.PatientLastName, rr.InsuranceName
      ),
      Ranked AS (
        SELECT
          patient_name, primary_payer, cohort_year, first_visit, last_visit,
          total_claims, total_billed, total_collected,
          DATEDIFF(MONTH, first_visit, last_visit) + 1  AS active_months,
          total_collected + (
            CASE
              WHEN DATEDIFF(MONTH, first_visit, last_visit) >= 1
                THEN (total_collected / (DATEDIFF(MONTH, first_visit, last_visit) + 1.0))
                     * CASE WHEN 24 - DATEDIFF(MONTH, last_visit, GETDATE()) > 0
                              THEN 24 - DATEDIFF(MONTH, last_visit, GETDATE())
                              ELSE 0 END
              ELSE 0
            END
          ) AS estimated_ltv,
          COUNT(*) OVER ()                              AS total_count
        FROM PatientHistory
      )
      SELECT *
      FROM Ranked
      ORDER BY estimated_ltv DESC
      OFFSET @_offset ROWS FETCH NEXT @_limit ROWS ONLY;
    `);

    const rows = result.recordset ?? [];
    const total = rows[0]?.total_count ?? 0;
    res.json({ patients: rows.map(({ total_count, ...rest }: any) => rest), total, page, limit });
  } catch (e: any) {
    console.error('patient-ltv/top-patients error:', e?.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
