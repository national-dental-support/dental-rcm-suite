import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';
import { expandWithAliases } from '../../utils/expand-filter';
import { extractCustomerId } from '../../utils/resolve-user-scope';

// ---------------------------------------------------------------------------
// Helper - parse & validate filter params from query string
// ---------------------------------------------------------------------------
interface ReconFilters {
  months:     number;         // date window in months (default 6)
  location:   string | null;  // PracticeLocation value or null = all
  payer:      string | null;  // InsuranceName or null = all
  postStatus: 'all' | 'posted' | 'unposted';
}

function parseFilters(query: any): ReconFilters {
  const months = Math.min(Math.max(parseInt(query.months) || 6, 1), 36);
  const location   = typeof query.location   === 'string' && query.location   ? query.location   : null;
  const payer      = typeof query.payer      === 'string' && query.payer      ? query.payer      : null;
  const postStatus = ['posted', 'unposted'].includes(query.postStatus) ? query.postStatus : 'all';
  return { months, location, payer, postStatus };
}

function postStatusClause(f: ReconFilters, cphAlias = 'cph'): string {
  if (f.postStatus === 'posted')   return `AND ${cphAlias}.PostedFlag = '1'`;
  if (f.postStatus === 'unposted') return `AND (${cphAlias}.PostedFlag IS NULL OR ${cphAlias}.PostedFlag <> '1')`;
  return '';
}

// Expanded (multi-value) WHERE helpers - used when aliases are present
function rfWhereEx(locations: string[]): string {
  if (!locations.length) return '';
  return `AND rf.PracticeLocation IN (${locations.map((_, i) => `@Loc${i}`).join(',')})`;
}
function payerWhereEx(payers: string[]): string {
  if (!payers.length) return '';
  return `AND rr.InsuranceName IN (${payers.map((_, i) => `@Pay${i}`).join(',')})`;
}
function bindFiltersEx(r: sql.Request, locations: string[], payers: string[]): void {
  locations.forEach((v, i) => r.input(`Loc${i}`, sql.NVarChar, v));
  payers.forEach((v, i) => r.input(`Pay${i}`, sql.NVarChar, v));
}

// ---------------------------------------------------------------------------

export class ReconciliationReportController extends DatabaseConnectionController {
  constructor() { super(); }

  /** Enterprise isolation - filter reconciliation/remittanceFile rows through EOBERAClaim -> claims */
  private buildCustFilter(req: Request): { sql: string; addInputs: (r: sql.Request) => void } {
    const xenCustId = extractCustomerId(req);
    if (xenCustId == null) return { sql: '', addInputs: () => {} };
    return {
      sql: `AND EXISTS (SELECT 1 FROM dbo.EOBERAClaim ec_cust JOIN dbo.claims c_cust ON c_cust.ClaimID = ec_cust.ClaimID WHERE ec_cust.RemittanceFileID = rf.RemittanceFileID AND c_cust.customer_id = @_custId)`,
      addInputs: (r: sql.Request) => { r.input('_custId', sql.Int, xenCustId); },
    };
  }

  /** Bank deposit customer filter - goes through reconciliation -> EOBERAClaim -> claims */
  private buildCustFilterBank(req: Request): { sql: string; addInputs: (r: sql.Request) => void } {
    const xenCustId = extractCustomerId(req);
    if (xenCustId == null) return { sql: '', addInputs: () => {} };
    return {
      sql: `AND EXISTS (SELECT 1 FROM dbo.reconciliation r_cust JOIN dbo.EOBERAClaim ec_cust ON ec_cust.RemittanceFileID = r_cust.RemittanceFileID JOIN dbo.claims c_cust ON c_cust.ClaimID = ec_cust.ClaimID WHERE (r_cust.BankDepositID = bd.bank_reference OR r_cust.BankDepositID = bd.BankDepositID) AND c_cust.customer_id = @_custId2)`,
      addInputs: (r: sql.Request) => { r.input('_custId2', sql.Int, xenCustId); },
    };
  }

  /** GET /filter-options - available locations and payers */
  getFilterOptions = async (_req: Request, res: Response) => {
    try {
      const custRF = this.buildCustFilter(_req);
      const custBD = this.buildCustFilterBank(_req);
      const locReq = this.pool.request();
      custRF.addInputs(locReq);
      const payerReq = this.pool.request();
      custBD.addInputs(payerReq);

      const [locQ, payerQ] = await Promise.allSettled([
        locReq.query(`
          SELECT DISTINCT rf.PracticeLocation AS value
          FROM dbo.remittanceFile rf
          WHERE rf.PracticeLocation IS NOT NULL
            ${custRF.sql}
          ORDER BY rf.PracticeLocation
        `),
        payerReq.query(`
          SELECT DISTINCT p.InsuranceName AS value
          FROM dbo.bankDeposit bd
          JOIN dbo.payerPayment pp ON pp.PayerPaymentID = bd.PayerPaymentID
          JOIN dbo.payer p ON CAST(p.payerid AS NVARCHAR) = CAST(pp.payerid AS NVARCHAR)
          WHERE p.InsuranceName IS NOT NULL
            ${custBD.sql}
          ORDER BY p.InsuranceName
        `),
      ]);
      res.json({
        locations: locQ.status  === 'fulfilled' ? locQ.value.recordset.map((r: any) => r.value)  : [],
        payers:    payerQ.status === 'fulfilled' ? payerQ.value.recordset.map((r: any) => r.value) : [],
      });
    } catch (err: any) {
      logger.error('[ReconReport] getFilterOptions error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** GET /summary - executive KPIs */
  getSummary = async (req: Request, res: Response) => {
    try {
      const f = parseFilters(req.query);
      const locations = f.location ? await expandWithAliases(this.pool, 'location', [f.location]) : [];
      const payers    = f.payer    ? await expandWithAliases(this.pool, 'payer',    [f.payer])    : [];
      const custRF = this.buildCustFilter(req);
      const custBD = this.buildCustFilterBank(req);

      const makeReq = () => {
        const r = this.pool.request();
        bindFiltersEx(r, locations, payers);
        custRF.addInputs(r);
        return r;
      };

      const [q1, q2, q3, q4, q5, q6] = await Promise.allSettled([

        // Q1: matched reconciliation stats
        makeReq().query(`
          SELECT
            COUNT(DISTINCT r.RemittanceFileID)                                                         AS matchedCount,
            ISNULL(SUM(DISTINCT rf.Amount), 0)                                                         AS matchedAmount,
            COUNT(DISTINCT CASE WHEN ISNULL(cph.PostedFlag,0)=1 THEN r.RemittanceFileID END)           AS postedCount,
            COUNT(DISTINCT CASE WHEN ISNULL(cph.PostedFlag,0)=0 THEN r.RemittanceFileID END)           AS unpostedCount
          FROM dbo.reconciliation r
          JOIN dbo.remittanceFile rf ON rf.RemittanceFileID = r.RemittanceFileID
          LEFT JOIN dbo.claimPostHistory cph ON cph.RemittanceFileID = r.RemittanceFileID
          WHERE r.MatchFlag IN ('true','1')
            AND rf.FileDate >= DATEADD(MONTH, -${f.months}, GETDATE())
            ${rfWhereEx(locations)}
            ${custRF.sql}
        `),

        // Q2: unmatched counts
        (() => { const r2 = this.pool.request(); bindFiltersEx(r2, locations, payers); custBD.addInputs(r2); custRF.addInputs(r2); return r2; })().query(`
          SELECT
            (SELECT COUNT(*) FROM dbo.bankDeposit bd
             WHERE NOT EXISTS (
               SELECT 1 FROM dbo.reconciliation r
               WHERE (r.BankDepositID = bd.bank_reference OR r.BankDepositID = bd.BankDepositID)
                 AND r.MatchFlag IN ('true','1')
             )
             ${custBD.sql}) AS unmatchedPayments,
            (SELECT COUNT(*) FROM dbo.remittanceFile rf
             WHERE NOT EXISTS (
               SELECT 1 FROM dbo.reconciliation r
               WHERE r.RemittanceFileID = rf.RemittanceFileID AND r.MatchFlag IN ('true','1')
             )
             AND rf.FileDate >= DATEADD(MONTH, -${f.months}, GETDATE())
             ${rfWhereEx(locations)}
             ${custRF.sql}) AS unmatchedEOBs
        `),

        // Q3: claim-level denial rate - era_line_status='denied' from 835 CLP status=4
        makeReq().query(`
          SELECT
            COUNT(DISTINCT ec.ClaimID) AS totalClaims,
            COUNT(DISTINCT CASE WHEN rl.era_line_status = 'denied' THEN ec.ClaimID END) AS deniedClaims,
            ISNULL(SUM(DISTINCT c.ChargeAmt), 0) AS totalCharges
          FROM dbo.reconciliation r
          JOIN dbo.remittanceFile rf ON rf.RemittanceFileID = r.RemittanceFileID
          JOIN dbo.EOBERAClaim ec ON ec.RemittanceFileID = r.RemittanceFileID
          JOIN dbo.claims c ON c.ClaimID = ec.ClaimID
          LEFT JOIN dbo.remittanceLine rl ON rl.ClaimID = ec.ClaimID
                                         AND rl.era_line_status = 'denied'
          WHERE r.MatchFlag IN ('true','1')
            AND rf.FileDate >= DATEADD(MONTH, -${f.months}, GETDATE())
            ${rfWhereEx(locations)}
            ${custRF.sql}
        `),

        // Q4: total bank deposit transactions (dual-schema: snake_case from migration 126, CamelCase from 001)
        (() => { const r4 = this.pool.request(); custBD.addInputs(r4); return r4; })().query(`
          SELECT
            COUNT(*)                                                              AS bankTxCount,
            ISNULL(SUM(ISNULL(bd.deposit_amount, bd.DepositAmount)), 0)          AS bankTxTotal
          FROM dbo.bankDeposit bd
          WHERE ISNULL(bd.deposit_date, bd.DepositDate) >= DATEADD(MONTH, -${f.months}, GETDATE())
            ${custBD.sql}
        `),

        // Q5: total PMS posting transactions
        makeReq().query(`
          SELECT
            COUNT(DISTINCT cph.ClaimPostHistoryID)  AS pmsTxCount,
            ISNULL(SUM(rf.Amount), 0)               AS pmsTxTotal
          FROM dbo.claimPostHistory cph
          JOIN dbo.remittanceFile rf ON rf.RemittanceFileID = cph.RemittanceFileID
          WHERE cph.PostedFlag = '1'
            AND cph.PostedDate >= DATEADD(MONTH, -${f.months}, GETDATE())
            ${rfWhereEx(locations)}
            ${custRF.sql}
        `),

        // Q6: in-transit count/amount
        makeReq().query(`
          SELECT
            COUNT(DISTINCT r.RemittanceFileID)      AS inTransitCount,
            ISNULL(SUM(DISTINCT rf.Amount), 0)      AS inTransitTotal
          FROM dbo.reconciliation r
          JOIN dbo.remittanceFile rf ON rf.RemittanceFileID = r.RemittanceFileID
          LEFT JOIN dbo.claimPostHistory cph ON cph.RemittanceFileID = r.RemittanceFileID
          WHERE r.MatchFlag IN ('true','1')
            AND rf.FileDate >= DATEADD(MONTH, -${f.months}, GETDATE())
            AND (cph.PostedFlag IS NULL OR cph.PostedFlag <> '1')
            ${rfWhereEx(locations)}
            ${custRF.sql}
        `),
      ]);

      let matchedCount = 0, matchedAmount = 0, postedCount = 0, unpostedCount = 0;
      if (q1.status === 'fulfilled') {
        const d = q1.value.recordset[0];
        matchedCount  = d.matchedCount  ?? 0;
        matchedAmount = Math.round(Math.abs(d.matchedAmount ?? 0));
        postedCount   = d.postedCount   ?? 0;
        unpostedCount = d.unpostedCount ?? 0;
      } else { logger.warn('[ReconReport] Q1 failed', { error: q1.reason }); }

      let unmatchedPayments = 0, unmatchedEOBs = 0;
      if (q2.status === 'fulfilled') {
        const d = q2.value.recordset[0];
        unmatchedPayments = d.unmatchedPayments ?? 0;
        unmatchedEOBs     = d.unmatchedEOBs     ?? 0;
      } else { logger.warn('[ReconReport] Q2 failed', { error: q2.reason }); }

      let totalClaims = 0, deniedClaims = 0, denialRate = 0;
      if (q3.status === 'fulfilled') {
        const d = q3.value.recordset[0];
        totalClaims  = d.totalClaims  ?? 0;
        deniedClaims = d.deniedClaims ?? 0;
        denialRate   = totalClaims > 0 ? Math.round((deniedClaims / totalClaims) * 10000) / 100 : 0;
      } else { logger.warn('[ReconReport] Q3 failed', { error: q3.reason }); }

      let bankTxCount = 0, bankTxTotal = 0;
      if (q4.status === 'fulfilled') {
        const d = q4.value.recordset[0];
        bankTxCount = d.bankTxCount ?? 0;
        bankTxTotal = Math.round(Math.abs(d.bankTxTotal ?? 0));
      } else { logger.warn('[ReconReport] Q4 failed', { error: (q4 as any).reason }); }

      let pmsTxCount = 0, pmsTxTotal = 0;
      if (q5.status === 'fulfilled') {
        const d = q5.value.recordset[0];
        pmsTxCount = d.pmsTxCount ?? 0;
        pmsTxTotal = Math.round(Math.abs(d.pmsTxTotal ?? 0));
      } else { logger.warn('[ReconReport] Q5 failed', { error: (q5 as any).reason }); }

      let inTransitCount = 0, inTransitTotal = 0;
      if (q6.status === 'fulfilled') {
        const d = q6.value.recordset[0];
        inTransitCount = d.inTransitCount ?? 0;
        inTransitTotal = Math.round(Math.abs(d.inTransitTotal ?? 0));
      } else { logger.warn('[ReconReport] Q6 failed', { error: (q6 as any).reason }); }

      const queryLabels = ['matchedStats', 'unmatchedCounts', 'denialRate', 'bankDeposits', 'pmsPostings', 'inTransit'];
      const allResults = [q1, q2, q3, q4, q5, q6];
      const warnings: string[] = [];
      allResults.forEach((r, i) => {
        if (r.status === 'rejected') {
          warnings.push(`${queryLabels[i]} query failed: ${(r as PromiseRejectedResult).reason?.message ?? 'unknown error'}`);
        }
      });

      res.json({
        matchedCount, matchedAmount, postedCount, unpostedCount,
        unmatchedPayments, unmatchedEOBs, totalClaims, deniedClaims, denialRate,
        bankTxCount, bankTxTotal, pmsTxCount, pmsTxTotal,
        bankPmsDiff: bankTxTotal - pmsTxTotal,
        inTransitCount, inTransitTotal,
        period: `Last ${f.months} months`,
        filters: f,
        warnings,
      });
    } catch (err: any) {
      logger.error('[ReconReport] getSummary error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** GET /by-payer - reconciliation breakdown by payer */
  getByPayer = async (req: Request, res: Response) => {
    try {
      const f = parseFilters(req.query);
      const locations = f.location ? await expandWithAliases(this.pool, 'location', [f.location]) : [];
      const payers    = f.payer    ? await expandWithAliases(this.pool, 'payer',    [f.payer])    : [];
      const custRF = this.buildCustFilter(req);
      const r = this.pool.request();
      bindFiltersEx(r, locations, payers);
      custRF.addInputs(r);

      const result = await r.query(`
        SELECT
          ISNULL(rr.InsuranceName, 'Unknown')                                                          AS payerName,
          COUNT(DISTINCT r.RemittanceFileID)                                                            AS remittanceCount,
          ISNULL(SUM(DISTINCT rf.Amount), 0)                                                            AS totalAmount,
          COUNT(DISTINCT ec.ClaimID)                                                                    AS linkedClaims,
          COUNT(DISTINCT CASE WHEN rl.era_line_status = 'denied' THEN ec.ClaimID END)                  AS deniedClaims,
          ISNULL(AVG(DISTINCT rf.Amount), 0)                                                            AS avgAmount
        FROM dbo.reconciliation r
        JOIN dbo.remittanceFile rf ON rf.RemittanceFileID = r.RemittanceFileID
        LEFT JOIN dbo.EOBERAClaim ec ON ec.RemittanceFileID = r.RemittanceFileID
        LEFT JOIN (
          SELECT ClaimID, MAX(InsuranceName) AS InsuranceName
          FROM dbo.recon_report
          WHERE InsuranceName IS NOT NULL
          GROUP BY ClaimID
        ) rr ON rr.ClaimID = ec.ClaimID
        LEFT JOIN dbo.claims c ON c.ClaimID = ec.ClaimID
        LEFT JOIN dbo.remittanceLine rl ON rl.ClaimID = ec.ClaimID
                                       AND rl.era_line_status = 'denied'
        LEFT JOIN dbo.claimPostHistory cph ON cph.RemittanceFileID = r.RemittanceFileID
        WHERE r.MatchFlag IN ('true','1')
          AND rf.FileDate >= DATEADD(MONTH, -${f.months}, GETDATE())
          ${rfWhereEx(locations)}
          ${payerWhereEx(payers)}
          ${postStatusClause(f)}
          ${custRF.sql}
        GROUP BY rr.InsuranceName
        ORDER BY SUM(DISTINCT rf.Amount) DESC
      `);

      const rows = result.recordset.map((row: any) => ({
        payerName:       row.payerName,
        remittanceCount: row.remittanceCount,
        totalAmount:     Math.round(Math.abs(row.totalAmount ?? 0)),
        linkedClaims:    row.linkedClaims,
        deniedClaims:    row.deniedClaims,
        denialRate:      row.linkedClaims > 0
          ? Math.round((row.deniedClaims / row.linkedClaims) * 10000) / 100 : 0,
        avgAmount: Math.round(Math.abs(row.avgAmount ?? 0)),
      }));

      res.json({ rows });
    } catch (err: any) {
      logger.error('[ReconReport] getByPayer error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** GET /monthly-trend - 12-month reconciliation trend */
  getMonthlyTrend = async (req: Request, res: Response) => {
    try {
      const f = parseFilters(req.query);
      const locations = f.location ? await expandWithAliases(this.pool, 'location', [f.location]) : [];
      const custRF = this.buildCustFilter(req);
      const r = this.pool.request();
      bindFiltersEx(r, locations, []);
      custRF.addInputs(r);

      const result = await r.query(`
        SELECT TOP 24
          FORMAT(rf.FileDate, 'yyyy-MM')                                                               AS period,
          COUNT(DISTINCT r.RemittanceFileID)                                                           AS reconcileCount,
          ISNULL(SUM(DISTINCT rf.Amount), 0)                                                           AS reconcileAmount,
          COUNT(DISTINCT ec.ClaimID)                                                                    AS claimCount,
          COUNT(DISTINCT CASE WHEN rl.era_line_status = 'denied' THEN ec.ClaimID END)                  AS deniedCount,
          COUNT(DISTINCT CASE WHEN ISNULL(cph.PostedFlag,0)=1 THEN r.RemittanceFileID END)             AS postedCount
        FROM dbo.reconciliation r
        JOIN dbo.remittanceFile rf ON rf.RemittanceFileID = r.RemittanceFileID
        LEFT JOIN dbo.claimPostHistory cph ON cph.RemittanceFileID = r.RemittanceFileID
        LEFT JOIN dbo.EOBERAClaim ec ON ec.RemittanceFileID = r.RemittanceFileID
        LEFT JOIN dbo.claims c ON c.ClaimID = ec.ClaimID
        LEFT JOIN dbo.remittanceLine rl ON rl.ClaimID = ec.ClaimID
                                       AND rl.era_line_status = 'denied'
        WHERE r.MatchFlag IN ('true','1')
          AND rf.FileDate >= DATEADD(MONTH, -${f.months + 1}, GETDATE())
          ${rfWhereEx(locations)}
          ${postStatusClause(f)}
          ${custRF.sql}
        GROUP BY FORMAT(rf.FileDate, 'yyyy-MM')
        ORDER BY period DESC
      `);

      const rows = result.recordset.map((row: any) => ({
        period:          row.period,
        reconcileCount:  row.reconcileCount,
        reconcileAmount: Math.round(Math.abs(row.reconcileAmount ?? 0)),
        claimCount:      row.claimCount,
        deniedCount:     row.deniedCount,
        postedCount:     row.postedCount,
        denialRate:      row.claimCount > 0
          ? Math.round((row.deniedCount / row.claimCount) * 10000) / 100 : 0,
      }));

      res.json({ rows });
    } catch (err: any) {
      logger.error('[ReconReport] getMonthlyTrend error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** GET /by-provider - reconciliation breakdown by provider */
  getByProvider = async (req: Request, res: Response) => {
    try {
      const f = parseFilters(req.query);
      const locations = f.location ? await expandWithAliases(this.pool, 'location', [f.location]) : [];
      const payers    = f.payer    ? await expandWithAliases(this.pool, 'payer',    [f.payer])    : [];
      const custRF = this.buildCustFilter(req);
      const r = this.pool.request();
      bindFiltersEx(r, locations, payers);
      custRF.addInputs(r);

      const result = await r.query(`
        SELECT
          ISNULL(rr.ProviderName, 'Unknown')                                                             AS providerName,
          COUNT(DISTINCT r.RemittanceFileID)                                                              AS remittanceCount,
          ISNULL(SUM(DISTINCT rf.Amount), 0)                                                              AS totalAmount,
          COUNT(DISTINCT ec.ClaimID)                                                                      AS linkedClaims,
          COUNT(DISTINCT CASE WHEN rl.era_line_status = 'denied' THEN ec.ClaimID END)                    AS deniedClaims,
          ISNULL(AVG(DISTINCT rf.Amount), 0)                                                              AS avgAmount
        FROM dbo.reconciliation r
        JOIN dbo.remittanceFile rf ON rf.RemittanceFileID = r.RemittanceFileID
        LEFT JOIN dbo.EOBERAClaim ec ON ec.RemittanceFileID = r.RemittanceFileID
        LEFT JOIN (
          SELECT ClaimID, MAX(ProviderName) AS ProviderName, MAX(InsuranceName) AS InsuranceName
          FROM dbo.recon_report
          GROUP BY ClaimID
        ) rr ON rr.ClaimID = ec.ClaimID
        LEFT JOIN dbo.claims c ON c.ClaimID = ec.ClaimID
        LEFT JOIN dbo.remittanceLine rl ON rl.ClaimID = ec.ClaimID
                                       AND rl.era_line_status = 'denied'
        LEFT JOIN dbo.claimPostHistory cph ON cph.RemittanceFileID = r.RemittanceFileID
        WHERE r.MatchFlag IN ('true','1')
          AND rf.FileDate >= DATEADD(MONTH, -${f.months}, GETDATE())
          ${rfWhereEx(locations)}
          ${payerWhereEx(payers)}
          ${postStatusClause(f)}
          ${custRF.sql}
        GROUP BY rr.ProviderName
        ORDER BY SUM(DISTINCT rf.Amount) DESC
      `);

      const rows = result.recordset.map((row: any) => ({
        providerName:    row.providerName,
        remittanceCount: row.remittanceCount,
        totalAmount:     Math.round(Math.abs(row.totalAmount ?? 0)),
        linkedClaims:    row.linkedClaims,
        deniedClaims:    row.deniedClaims,
        denialRate:      row.linkedClaims > 0
          ? Math.round((row.deniedClaims / row.linkedClaims) * 10000) / 100 : 0,
        avgAmount: Math.round(Math.abs(row.avgAmount ?? 0)),
      }));

      res.json({ rows });
    } catch (err: any) {
      logger.error('[ReconReport] getByProvider error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** GET /posting-audit - paginated log of EOB posting events */
  getPostingAudit = async (req: Request, res: Response) => {
    try {
      const page     = Math.max(parseInt(String(req.query.page))     || 1, 1);
      const pageSize = Math.min(parseInt(String(req.query.pageSize)) || 25, 100);
      const offset   = (page - 1) * pageSize;
      const from     = typeof req.query.from     === 'string' && req.query.from     ? req.query.from     : null;
      const to       = typeof req.query.to       === 'string' && req.query.to       ? req.query.to       : null;
      const location = typeof req.query.location === 'string' && req.query.location ? req.query.location : null;
      const payer    = typeof req.query.payer    === 'string' && req.query.payer    ? req.query.payer    : null;
      const postedBy = typeof req.query.postedBy === 'string' && req.query.postedBy ? req.query.postedBy : null;

      const custRF = this.buildCustFilter(req);
      const r = this.pool.request();
      custRF.addInputs(r);
      r.input('PageSize', sql.Int, pageSize);
      r.input('Offset',   sql.Int, offset);
      if (from)     r.input('From',     sql.NVarChar, from);
      if (to)       r.input('To',       sql.NVarChar, to);
      if (location) r.input('Location', sql.NVarChar, location);
      if (payer)    r.input('Payer',    sql.NVarChar, payer);
      if (postedBy) r.input('PostedBy', sql.NVarChar, postedBy);

      const fromClause  = from     ? `AND cph.PostedDate >= @From`              : '';
      const toClause    = to       ? `AND cph.PostedDate <= @To`                : '';
      const locClause   = location ? `AND rf.PracticeLocation = @Location`      : '';
      const payerClause = payer    ? `AND ins.InsuranceName = @Payer`           : '';
      const byClause    = postedBy ? `AND cph.PostedBy LIKE '%' + @PostedBy + '%'` : '';

      const result = await r.query(`
        SELECT
          cph.RemittanceFileID,
          FORMAT(rf.FileDate, 'yyyy-MM-dd')     AS eobDate,
          ISNULL(ins.InsuranceName, 'Unknown')  AS payerName,
          rf.PracticeLocation                   AS location,
          COUNT(DISTINCT ec.ClaimID)            AS claimCount,
          cph.PostedBy,
          FORMAT(cph.PostedDate, 'yyyy-MM-dd')  AS postedDate,
          CASE WHEN cph.PostedFlag = '1' THEN 'posted' ELSE 'pending' END AS postStatus
        FROM dbo.claimPostHistory cph
        JOIN dbo.remittanceFile rf ON rf.RemittanceFileID = cph.RemittanceFileID
        LEFT JOIN dbo.EOBERAClaim ec ON ec.RemittanceFileID = cph.RemittanceFileID
        LEFT JOIN (
          SELECT ClaimID, MAX(InsuranceName) AS InsuranceName
          FROM dbo.recon_report
          GROUP BY ClaimID
        ) ins ON ins.ClaimID = ec.ClaimID
        WHERE cph.PostedFlag = '1'
          ${fromClause} ${toClause} ${locClause} ${payerClause} ${byClause}
          ${custRF.sql}
        GROUP BY cph.RemittanceFileID, rf.FileDate, ins.InsuranceName, rf.PracticeLocation, cph.PostedBy, cph.PostedDate, cph.PostedFlag
        ORDER BY cph.PostedDate DESC
        OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
      `);

      const countReq = this.pool.request();
      custRF.addInputs(countReq);
      if (from)     countReq.input('From',     sql.NVarChar, from);
      if (to)       countReq.input('To',       sql.NVarChar, to);
      if (location) countReq.input('Location', sql.NVarChar, location);
      if (payer)    countReq.input('Payer',    sql.NVarChar, payer);
      if (postedBy) countReq.input('PostedBy', sql.NVarChar, postedBy);

      const countResult = await countReq.query(`
        SELECT COUNT(DISTINCT cph.RemittanceFileID) AS total
        FROM dbo.claimPostHistory cph
        JOIN dbo.remittanceFile rf ON rf.RemittanceFileID = cph.RemittanceFileID
        WHERE cph.PostedFlag = '1'
          ${fromClause} ${toClause} ${locClause} ${payerClause} ${byClause}
          ${custRF.sql}
      `);

      const total = countResult.recordset[0]?.total ?? 0;
      const rows = result.recordset.map((row: any) => ({
        remittanceFileId: row.RemittanceFileID,
        eobDate:    row.eobDate,
        payerName:  row.payerName,
        location:   row.location ?? '',
        claimCount: row.claimCount,
        postedBy:   row.PostedBy ?? '',
        postedDate: row.postedDate,
        postStatus: row.postStatus,
      }));

      res.json({ rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
    } catch (err: any) {
      logger.error('[ReconReport] getPostingAudit error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** GET /in-transit - matched remittances not yet posted to PMS */
  getInTransit = async (req: Request, res: Response) => {
    try {
      const f = parseFilters(req.query);
      const locations = f.location ? await expandWithAliases(this.pool, 'location', [f.location]) : [];
      const payers    = f.payer    ? await expandWithAliases(this.pool, 'payer',    [f.payer])    : [];
      const custRF = this.buildCustFilter(req);
      const r = this.pool.request();
      bindFiltersEx(r, locations, payers);
      custRF.addInputs(r);

      const result = await r.query(`
        SELECT
          r.RemittanceFileID,
          FORMAT(rf.FileDate, 'yyyy-MM-dd')                          AS fileDate,
          rf.Amount,
          rf.PracticeLocation                                        AS location,
          ISNULL(rr.InsuranceName, 'Unknown')                       AS payerName,
          COUNT(DISTINCT ec.ClaimID)                                AS claimCount,
          DATEDIFF(DAY, rf.FileDate, GETDATE())                     AS daysAged
        FROM dbo.reconciliation r
        JOIN dbo.remittanceFile rf ON rf.RemittanceFileID = r.RemittanceFileID
        LEFT JOIN dbo.claimPostHistory cph ON cph.RemittanceFileID = r.RemittanceFileID
        LEFT JOIN dbo.EOBERAClaim ec ON ec.RemittanceFileID = r.RemittanceFileID
        LEFT JOIN (
          SELECT ClaimID, MAX(InsuranceName) AS InsuranceName
          FROM dbo.recon_report
          WHERE InsuranceName IS NOT NULL
          GROUP BY ClaimID
        ) rr ON rr.ClaimID = ec.ClaimID
        WHERE r.MatchFlag IN ('true','1')
          AND rf.FileDate >= DATEADD(MONTH, -${f.months}, GETDATE())
          AND (cph.PostedFlag IS NULL OR cph.PostedFlag <> '1')
          ${rfWhereEx(locations)}
          ${payerWhereEx(payers)}
          ${custRF.sql}
        GROUP BY r.RemittanceFileID, rf.FileDate, rf.Amount, rf.PracticeLocation, rr.InsuranceName, cph.PostedDate
        ORDER BY rf.FileDate ASC
      `);

      const rows = result.recordset.map((row: any) => ({
        remittanceFileId: row.RemittanceFileID,
        fileDate:   row.fileDate,
        amount:     Math.round(Math.abs(row.Amount ?? 0)),
        location:   row.location ?? '',
        payerName:  row.payerName,
        claimCount: row.claimCount,
        daysAged:   row.daysAged,
      }));

      res.json({ rows, total: rows.length });
    } catch (err: any) {
      logger.error('[ReconReport] getInTransit error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** GET /export - claim-level CSV download */
  getExport = async (req: Request, res: Response) => {
    try {
      const f = parseFilters(req.query);
      const locations = f.location ? await expandWithAliases(this.pool, 'location', [f.location]) : [];
      const payers    = f.payer    ? await expandWithAliases(this.pool, 'payer',    [f.payer])    : [];
      const custRF = this.buildCustFilter(req);
      const r = this.pool.request();
      bindFiltersEx(r, locations, payers);
      custRF.addInputs(r);

      const result = await r.query(`
        SELECT
          ec.ClaimID,
          ISNULL(pat.FirstName + ' ' + pat.LastName, '')              AS patientName,
          FORMAT(c.DateOfService, 'yyyy-MM-dd')                       AS dateOfService,
          ISNULL(rf.PracticeLocation, '')                             AS location,
          ISNULL(p.InsuranceName, '')                                 AS primaryPayer,
          ISNULL(c.ChargeAmt, 0)                                      AS chargeAmt,
          ISNULL(rl.AllowedAmt, 0)                                    AS allowedAmt,
          ISNULL(rl.PaidAmt, 0)                                       AS paidAmt,
          ISNULL(rl.AdjustmentAmt, 0)                                 AS adjustmentAmt,
          ISNULL(rl.era_adj_code, '')                                 AS adjustmentCode,
          ISNULL(rl.PatientRespAmt, 0)                                AS patientRespAmt,
          ISNULL(p2.InsuranceName, '')                                AS secondaryPayer,
          ISNULL(sbq.status, '')                                      AS secondaryBillingStatus,
          CASE WHEN cph.PostedFlag = '1' THEN 'Y' ELSE 'N' END       AS posted,
          FORMAT(cph.PostedDate, 'yyyy-MM-dd')                        AS postedDate,
          ISNULL(cph.PostedBy, '')                                    AS postedBy,
          ec.RemittanceFileID                                         AS eraReference,
          FORMAT(rf.FileDate, 'yyyy-MM-dd')                          AS eraDate
        FROM dbo.reconciliation r
        JOIN dbo.remittanceFile rf  ON rf.RemittanceFileID = r.RemittanceFileID
        JOIN dbo.EOBERAClaim ec     ON ec.RemittanceFileID = r.RemittanceFileID
        JOIN dbo.claims c           ON c.ClaimID = ec.ClaimID
        LEFT JOIN dbo.patient pat   ON pat.PatientID = c.PatientID
        LEFT JOIN dbo.payer p       ON p.PayerID = c.PayerID
        LEFT JOIN dbo.remittanceLine rl
          ON rl.ClaimID = c.ClaimID
        LEFT JOIN dbo.claimPostHistory cph ON cph.RemittanceFileID = r.RemittanceFileID
        LEFT JOIN dbo.payer p2      ON p2.PayerID = c.secondary_payer_id
        LEFT JOIN dbo.SecondaryBillingQueue sbq
          ON sbq.claim_id = c.ClaimID AND sbq.primary_remittance_file_id = r.RemittanceFileID
        WHERE r.MatchFlag IN ('true','1')
          AND rf.FileDate >= DATEADD(MONTH, -${f.months}, GETDATE())
          ${rfWhereEx(locations)}
          ${payerWhereEx(payers)}
          ${postStatusClause(f)}
          ${custRF.sql}
        ORDER BY rf.FileDate DESC, ec.ClaimID
      `);

      const today = new Date().toISOString().slice(0, 10);
      const header = 'Claim ID,Patient Name,Date of Service,Location,Primary Payer,Charge Amount,Allowed Amount,Paid Amount,Adjustment Amount,Adjustment Code,Patient Responsibility,Secondary Payer,Secondary Billing Status,Posted,Posted Date,Posted By,ERA Reference,ERA Date';

      const escape = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;

      const lines = [
        header,
        ...result.recordset.map((row: any) => [
          row.ClaimID, row.patientName, row.dateOfService, row.location,
          row.primaryPayer, row.chargeAmt, row.allowedAmt, row.paidAmt,
          row.adjustmentAmt, row.adjustmentCode, row.patientRespAmt,
          row.secondaryPayer, row.secondaryBillingStatus, row.posted,
          row.postedDate ?? '', row.postedBy, row.eraReference, row.eraDate ?? '',
        ].map(escape).join(',')),
      ];

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="recon-detail-${today}.csv"`);
      res.send(lines.join('\n'));
    } catch (err: any) {
      logger.error('[ReconReport] getExport error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };
}
