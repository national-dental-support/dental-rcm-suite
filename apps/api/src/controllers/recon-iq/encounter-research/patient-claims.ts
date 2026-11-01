import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../../utils/logger';
import { DatabaseConnectionController } from '../../database-connection-controller';
import { extractCustomerId, buildClaimsCustomerWhere } from '../../../utils/resolve-user-scope';

type PatientHeader = {
  patientAccount: string;
  patientName: string | null;
};

type PatientClaimRow = {
  claimId: string;
  dateClaimSubmitted: string; // YYYY-MM-DD
  eobId: string | null;
  dateEobReceived: string | null; // YYYY-MM-DD
};

export class PatientClaims extends DatabaseConnectionController {
  constructor() {
    super();
  }

  public get = async (req: Request, res: Response): Promise<Response> => {
    try {
      // [ok] Accept incoming patient id from the route
      const patientAccount = String(req.params.patientAccount ?? '').trim();
      if (!patientAccount) {
        return res.status(400).json({
          message: 'Missing required route param: patientAccount',
        });
      }

      const page = Number(req.query.page ?? 1);
      const pageSize = Number(req.query.pageSize ?? 25);
      const search = (req.query.search as string) ?? '';

      logger.info('PatientClaims.get \u2192 querying claims for patient', {
        patientAccount,
        page,
        pageSize,
        search,
      });

      const pool = (this as any).pool as sql.ConnectionPool;

      // Enterprise isolation
      const xenCustId = extractCustomerId(req);
      const custC = buildClaimsCustomerWhere(xenCustId, 'c');

      const safePage = Number.isFinite(page) && page > 0 ? page : 1;
      const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 100) : 25;

      // [ok] Query claims + optional EOB, and patient name header
      const sqlText = `
      SELECT
          ISNULL(NULLIF(LTRIM(RTRIM(COALESCE(p.FirstName,'') + ' ' + COALESCE(p.LastName,''))), ''), p.PatientName) AS patientName,
          CAST(c.ClaimID AS varchar(50))              AS claimId,
          CONVERT(varchar(10), c.DateOfService, 23)   AS dateClaimSubmitted,
          CAST(ec.RemittanceFileID AS varchar(50))    AS eobId,
          CONVERT(varchar(10), rf.FileDate, 23)       AS dateEobReceived
      FROM dbo.claims c
      LEFT JOIN dbo.Patient p
          ON p.PatientID = c.PatientID
      LEFT JOIN dbo.EOBERAClaim ec
          ON ec.ClaimID = c.ClaimID
      LEFT JOIN dbo.remittanceFile rf
          ON rf.RemittanceFileID = ec.RemittanceFileID
      WHERE c.PatientID = @patientId
        ${custC.where}
      ORDER BY c.DateOfService DESC
      OFFSET @_offset ROWS FETCH NEXT @_pageSize ROWS ONLY;
      `;

      const pcReq = pool.request();
      pcReq.input('patientId', sql.VarChar(50), patientAccount);
      pcReq.input('_offset', sql.Int, (safePage - 1) * safePageSize);
      pcReq.input('_pageSize', sql.Int, safePageSize);
      custC.addInputs(pcReq);
      const result = await pcReq.query(sqlText);

      const recordset = result.recordset ?? [];

      // Patient header (same shape as before)
      const patient: PatientHeader = {
        patientAccount,
        patientName: recordset[0]?.patientName ?? null,
      };

      // Map rows to the same shape (and let EOB be nullable)
      const allRows: PatientClaimRow[] = recordset.map((r: any) => ({
        claimId: String(r.claimId ?? ''),
        dateClaimSubmitted: String(r.dateClaimSubmitted ?? ''),
        eobId: r.eobId ?? null,
        dateEobReceived: r.dateEobReceived ?? null,
      }));

      // Optional search (same behavior you had)
      const rows = search
        ? allRows.filter((r) => {
            const s = search.toLowerCase();
            return (
              r.claimId.toLowerCase().includes(s) ||
              (r.eobId ?? '').toLowerCase().includes(s)
            );
          })
        : allRows;

      return res.status(200).json({
        message: 'Recon IQ patient claims',
        asOf: new Date().toISOString(),
        patient,
        filters: { search },
        pagination: {
          page: safePage,
          pageSize: safePageSize,
          totalRows: rows.length,
          totalPages: Math.ceil(rows.length / safePageSize),
        },
        rows,
      });
    } catch (error: unknown) {
      logger.error('PatientClaims.get \u2013 error building response', { error });
      return res.status(500).json({
        message: 'Internal server error',
      });
    }
  };
}
