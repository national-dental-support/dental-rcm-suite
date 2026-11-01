import { Request, Response } from 'express';
import sql from 'mssql';
import { DatabaseConnectionController } from '../../../controllers/database-connection-controller';

export class PatientCollections extends DatabaseConnectionController {
  constructor() {
    super();
  }

  // ApiHandlerFactory expects a `get` method with this signature
  public get = async (req: Request, res: Response): Promise<Response> => {
    try {
      // Accepts { filters: { payment_received: { start_date, end_date } } } in req.body
      const pr = req.body?.filters?.payment_received ?? req.body?.filters?.date_of_service ?? {};
      let start_date = pr.start_date ?? req.body?.start_date;
      let end_date   = pr.end_date   ?? req.body?.end_date;
      // Default each independently: end -> today, start -> 1 year before today
      const today = new Date();
      if (!end_date) end_date = today.toISOString().slice(0, 10);
      if (!start_date) {
        const d = new Date(today);
        d.setFullYear(d.getFullYear() - 1);
        start_date = d.toISOString().slice(0, 10);
      }

      // Prior year period: 2 years ago through 1 year ago
      const priorYearStart = (() => {
        const d = new Date(start_date);
        d.setFullYear(d.getFullYear() - 1);
        return d.toISOString().slice(0, 10);
      })();
      const priorYearEnd = (() => {
        const d = new Date(end_date);
        d.setFullYear(d.getFullYear() - 1);
        return d.toISOString().slice(0, 10);
      })();

      const { where: custWhere, bind: bindCust } = this.custFilter(req);
      const { where: bodyWhere, bind: bindBody } = this.bodyFilter(req);

      // Current period
      const queryCurrent = `
        SELECT SUM(TrxAmt) AS PatientCollection
        FROM dbo.recon_report
        WHERE PayerType = 'Patient' AND TrxType = 'Payment'
          AND PaymentPostDate >= @start_date AND PaymentPostDate <= @end_date
          ${custWhere} ${bodyWhere};
      `;

      // Prior year period
      const queryPrior = `
        SELECT SUM(TrxAmt) AS PatientCollection
        FROM dbo.recon_report
        WHERE PayerType = 'Patient' AND TrxType = 'Payment'
          AND PaymentPostDate >= @prior_start AND PaymentPostDate <= @prior_end
          ${custWhere} ${bodyWhere};
      `;

      // All-time
      const queryAllTime = `
        SELECT SUM(TrxAmt) AS PatientCollection
        FROM dbo.recon_report
        WHERE PayerType = 'Patient' AND TrxType = 'Payment'
          ${custWhere} ${bodyWhere};
      `;

      const makeReq = () => {
        const r = this.pool.request();
        r.input('start_date', sql.Date, start_date);
        r.input('end_date', sql.Date, end_date);
        r.input('prior_start', sql.Date, priorYearStart);
        r.input('prior_end', sql.Date, priorYearEnd);
        bindCust(r);
        bindBody(r);
        return r;
      };

      const [currentResult, priorResult, allTimeResult] = await Promise.all([
        makeReq().query(queryCurrent),
        makeReq().query(queryPrior),
        makeReq().query(queryAllTime),
      ]);

      const value = currentResult.recordset[0]?.PatientCollection ?? 0;
      const prior = priorResult.recordset[0]?.PatientCollection ?? 0;
      const allTime = allTimeResult.recordset[0]?.PatientCollection ?? 0;

      return res.status(200).json({
        total: value,
        formatted: this.formatToMoney(value),
        prior_year: prior,
        prior_year_formatted: this.formatToMoney(prior),
        all_time: allTime,
        all_time_formatted: this.formatToMoney(allTime),
      });
    } catch (error: any) {
      console.error('PatientCollections error:', error);
      return res.status(500).json({
        message: error?.message || 'Internal Server Error',
      });
    }
  };

  /**
   * Shift a yyyy-mm-dd date string by N years
   */
  private shiftYear(dateStr: string, deltaYears: number): string {
    const d = new Date(dateStr);
    d.setFullYear(d.getFullYear() + deltaYears);
    // Format as yyyy-mm-dd
    return d.toISOString().slice(0, 10);
  }

  private formatToMoney(amount: number): string {
    if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
    if (amount >= 1_000) return `${(amount / 1_000).toFixed(2)}K`;
    return amount.toFixed(2);
  }
}

export const patientCollections = new PatientCollections();