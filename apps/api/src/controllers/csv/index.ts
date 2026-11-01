import { Request, Response } from 'express';
import sql, { ConnectionPool } from 'mssql';
import Database from '../../modules/db';
import chalk from 'chalk';
import * as fastcsv from 'fast-csv';
import { Writable } from 'stream';
import { databases } from '../../shared/databases';

export class CSVDownloaderController {
  private pool: ConnectionPool;

  constructor() {
    const databaseInstance = Database.getInstance();
    this.pool = databaseInstance.getPool();
  }

  public export = async (req: Request, res: Response): Promise<Response | void> => {
    const { filters = {} } = req.body;

    const provider = filters.provider?.toLowerCase() === 'all' ? '' : filters.provider || '';
    const location = filters.location?.toLowerCase() === 'all' ? '' : filters.location || '';
    const payer = filters.payer?.toLowerCase() === 'all' ? '' : filters.payer || '';
    const cptGroupName = filters.cpt_group?.toLowerCase() === 'all' ? '' : filters.cpt_group || '';

    const baseSelect = (db: string) => `
      SELECT
        CAST(c.BilledFee AS DECIMAL(10, 2)) AS submitted,
        CONVERT(VARCHAR(10), c.SDOS, 120) AS dos_aging,
        DATEDIFF(DAY, c.SDOS, GETDATE()) AS days_ago,
        c.Code AS code,
        CONCAT(u.ufname, ' ', u.ulname) AS provider,
        f.Name AS location,
        CONCAT(p.ufname, ' ', p.ulname) AS patient,
        p.UID AS patient_id,
        ins.insuranceName AS insuranceName,
        CAST(epd.paid AS DECIMAL(10, 2)) AS total_paid,
        ROUND(mcrABCga.mcr_allowed_national, 2) AS contracted,
        mcrABCga.cpt_group_name AS cpt_category,
        CAST(CASE WHEN c.BillToPt = 1 THEN epd.paid ELSE 0.00 END AS DECIMAL(10, 2)) AS patient_paid,
        CAST(CASE WHEN c.BillToPt = 0 THEN epd.paid ELSE 0.00 END AS DECIMAL(10, 2)) AS insurance_paid,
        CAST(CAST(c.BilledFee AS DECIMAL(10, 2)) - CAST(epd.paid AS DECIMAL(10, 2)) AS DECIMAL(10, 2)) AS ar_balance
      FROM dbo.edi_inv_cpt c
      JOIN dbo.edi_invoice i ON c.InvoiceId = i.Id
      JOIN dbo.users u ON i.RenProviderId = u.UID
      JOIN dbo.edi_facilities f ON i.InvFacilityid = f.Id
      JOIN dbo.users p ON i.PatientId = p.UID
      JOIN negan.dbo.mcr_allowed_by_cpt_ga AS mcrABCga ON c.Code = mcrABCga.cpt_code
      JOIN dbo.insurance ins ON i.BilledToId = ins.insId
      JOIN dbo.edi_paymentdetail epd ON c.InvoiceId = epd.InvoiceId
      JOIN dbo.edi_inspayments ip ON epd.PaymentId = ip.PaymentId
      WHERE 
        (@providerName = 'all' OR (u.ufname + ' ' + u.ulname) LIKE '%' + @providerName + '%')
        AND (@cptGroupName = 'all' OR mcrABCga.cpt_group_name LIKE '%' + @cptGroupName + '%')
        AND (@payorName = 'all' OR ins.insuranceName LIKE '%' + @payorName + '%')
        AND (@facilityName = 'all' OR f.name LIKE '%' + @facilityName + '%')
    `;

    const unionDataQuery = `
      SELECT *
      FROM (
        ${databases.map(baseSelect).join('\nUNION ALL\n')}
      ) AS Combined
      ORDER BY dos_aging DESC;
    `;

    try {
      const dataRequest = this.pool.request()
        .input('providerName', sql.VarChar, provider || 'all')
        .input('facilityName', sql.VarChar, location || 'all')
        .input('payorName', sql.VarChar, payer || 'all')
        .input('cptGroupName', sql.VarChar, cptGroupName || 'all');

      const result = await dataRequest.query(unionDataQuery);

      const csvStream = fastcsv.format({ headers: true, quote: '"' });
      const writableStream = new Writable();

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=procedures.csv');

      writableStream._write = /* istanbul ignore next */ (chunk, encoding, callback) => {
        csvStream.write(chunk);
        callback();
      };

      writableStream.on('finish', () => {
        csvStream.end();
      });

      result.recordset.forEach((row: any) => {
        csvStream.write(row);
      });

      writableStream.end();
      csvStream.pipe(res);

    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error(chalk.bgRed.white(`Error during CSV download: ${err.message}`));
        return res.status(500).json({ message: 'An error occurred while generating the CSV file.' });
      } else {
        console.error(chalk.bgRed.white('Unexpected error:'), err);
        return res.status(500).json({ message: 'An unexpected error occurred.' });
      }
    }
  };
}

export const csvController = new CSVDownloaderController();
