import { Request, Response } from 'express';
import sql, { IResult, ConnectionPool } from 'mssql';
import Database from '../../../modules/db';
import chalk from 'chalk';
import { databases } from '../../../shared/databases';
export class SourceDataController {
  private pool: ConnectionPool;

  constructor() {
    const databaseInstance = Database.getInstance();
    this.pool = databaseInstance.getPool();
  }

  public get = async (req: Request, res: Response): Promise<Response> => {
    const rawPage  = Number(req.body.page)  || 1;
    const rawLimit = Number(req.body.limit) || 10;
    const page  = Math.max(1, Math.min(rawPage,  10000));
    const limit = Math.max(1, Math.min(rawLimit, 500));
    const { sort } = req.body;
    const offset = (page - 1) * limit;
    const filters = req.body.filters || {};

    const provider = filters.provider?.toLowerCase() === 'all' ? '' : filters.provider || '';
    const location = filters.location?.toLowerCase() === 'all' ? '' : filters.location || '';
    const payer = filters.payer?.toLowerCase() === 'all' ? '' : filters.payer || '';
    const cptGroupName = filters.cpt_group?.toLowerCase() === 'all' ? '' : filters.cpt_group || '';

    const columnMappings: { [key: string]: string } = {
      payer: 'insuranceName',
      insurance_paid: 'insurance_paid',
      provider: 'provider',
      patient: 'patient',
      patient_first_name: 'patient',
      submitted: 'submitted',
      contracted: 'contracted',
      total_paid: 'total_paid',
      ar_balance: 'ar_balance',
      code: 'code',
      patient_paid: 'patient_paid',
      date_of_service: 'dos_aging',
      dos_aging: 'dos_aging',
    };

    const sortColumn = columnMappings[sort?.column] || 'insuranceName';
    const sortDirection = sort?.direction === 'desc' ? 'DESC' : 'ASC';

    if (!Object.keys(columnMappings).includes(sort?.column)) {
      console.warn(`Invalid sort column: ${sort?.column}`);
      return res.status(400).json({ message: 'Invalid sort column provided.' });
    }


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
      ORDER BY ${sortColumn} ${sortDirection}
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY;
    `;

    const unionCountQuery = `
      SELECT COUNT(*) AS total
      FROM (
        ${databases.map(baseSelect).join('\nUNION ALL\n')}
      ) AS Combined;
    `;

    try {
      const sharedRequest = this.pool.request()
        .input('providerName', sql.VarChar, provider || 'all')
        .input('facilityName', sql.VarChar, location || 'all')
        .input('payorName', sql.VarChar, payer || 'all')
        .input('cptGroupName', sql.VarChar, cptGroupName || 'all');

      const countResult: IResult<any> = await sharedRequest.query(unionCountQuery);
      const totalRecords = countResult.recordset[0].total;

      const dataRequest = this.pool.request()
        .input('providerName', sql.VarChar, provider || 'all')
        .input('facilityName', sql.VarChar, location || 'all')
        .input('payorName', sql.VarChar, payer || 'all')
        .input('cptGroupName', sql.VarChar, cptGroupName || 'all')
        .input('offset', sql.Int, offset)
        .input('limit', sql.Int, limit);

      const dataResult: IResult<any> = await dataRequest.query(unionDataQuery);

      const formattedData = dataResult.recordset.map(record => ({
        ...record,
        submitted: parseFloat(record.submitted.toFixed(2)),
        total_paid: parseFloat(record.total_paid.toFixed(2)),
        contracted: parseFloat(record.contracted.toFixed(2)),
        patient_paid: parseFloat(record.patient_paid.toFixed(2)),
        insurance_paid: parseFloat(record.insurance_paid.toFixed(2)),
        ar_balance: parseFloat(record.ar_balance.toFixed(2))
      }));

      return res.status(200).json({
        data: formattedData,
        pagination: {
          currentPage: page,
          pageSize: limit,
          totalRecords,
        },
      });
    } catch (error: unknown) {
      console.error(
        chalk.bgRed.white('Source Data Controller; get; Error fetching data:'),
        error,
      );
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}

export const sourceDataController = new SourceDataController();
