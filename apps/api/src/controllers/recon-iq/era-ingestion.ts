import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';
import { extractCustomerId } from '../../utils/resolve-user-scope';
import { broadcastToCustomer } from '../../websockets/index';
import { parse835 } from '../../modules/edi-parser/x12-parser';
import { processEra } from '../../modules/ingest/era-processor';

export class EraIngestionController extends DatabaseConnectionController {
  constructor() { super(); }

  /** POST /api/recon-iq/era-ingestion/upload */
  upload = async (req: Request, res: Response): Promise<void> => {
    try {
      const xenCustId = extractCustomerId(req);
      const actor = (req as any).user?.username ?? (req.headers['x-actor-email'] as string) ?? 'system';
      const file = (req as any).file as { originalname: string; size: number; buffer: Buffer; mimetype: string } | undefined;

      if (!file) { res.status(400).json({ message: 'No file provided' }); return; }

      const fileType = this.detectFileType(file.originalname, file.mimetype);
      const r = this.pool.request();
      r.input('CustId',    sql.Int,          xenCustId ?? 0);
      r.input('FileName',  sql.NVarChar(500), file.originalname);
      r.input('FileSize',  sql.Int,           file.size);
      r.input('FileType',  sql.NVarChar(10),  fileType);
      r.input('Actor',     sql.NVarChar(100), actor);

      const insResult = await r.query(`
        INSERT INTO dbo.RemittanceIngestionLog
          (customer_id, file_name, file_size_bytes, file_type, status, uploaded_by)
        OUTPUT INSERTED.id
        VALUES (@CustId, @FileName, @FileSize, @FileType, 'completed', @Actor)
      `);

      const logId = insResult.recordset[0].id;

      // Parse ERA/835 content
      const content = file.buffer.toString('utf8');
      const claimsFound = (content.match(/^CLP\*/gm) || []).length;

      // Extract payer name from N1*PR segment
      let payerName: string | null = null;
      const n1Match = content.match(/N1\*PR\*([^*~]+)/);
      if (n1Match) payerName = n1Match[1].trim();

      // Extract total amount from BPR segment (BPR*I*<amount>* or BPR*D*<amount>*)
      let totalAmount: number | null = null;
      const bprMatch = content.match(/BPR\*[ID]\*([0-9]+(?:\.[0-9]+)?)\*/);
      if (bprMatch) totalAmount = parseFloat(bprMatch[1]);

      // Update row with parsed content and metadata
      const upd = this.pool.request();
      upd.input('Id',          sql.Int,           logId);
      upd.input('ClaimsFound', sql.Int,            claimsFound);
      upd.input('FileContent', sql.NVarChar(sql.MAX), content);
      upd.input('PayerName',   sql.NVarChar(200),  payerName);
      upd.input('TotalAmount', sql.Decimal(12, 2), totalAmount);
      await upd.query(`
        UPDATE dbo.RemittanceIngestionLog
        SET status        = 'completed',
            claims_found  = @ClaimsFound,
            claims_matched = @ClaimsFound,
            completed_at  = GETDATE(),
            file_content  = @FileContent,
            payer_name    = @PayerName,
            total_amount  = @TotalAmount
        WHERE id = @Id
      `);

      // Full 835 processing pipeline: write remittanceFile, EOBERAClaim, remittanceLine, payerPayment
      let remittanceFileId: string | null = null;
      let claimsMatched = claimsFound;
      if (fileType === 'ERA' && content.includes('CLP*')) {
        try {
          const parsed = parse835(content);
          const eraResult = await processEra(parsed, xenCustId ?? 1, file.originalname, null, actor);
          remittanceFileId = eraResult.remittanceFileId;
          claimsMatched   = eraResult.claimsInserted;

          // Link the log row to the remittanceFile so history shows it
          await this.pool.request()
            .input('Id',   sql.Int,          logId)
            .input('RfId', sql.NVarChar(50), remittanceFileId)
            .query(`UPDATE dbo.RemittanceIngestionLog SET remittance_file_id = @RfId WHERE id = @Id`);

          logger.info('[EraIngestion] processEra complete', { logId, remittanceFileId, claimsInserted: claimsMatched });
        } catch (parseErr: any) {
          logger.warn('[EraIngestion] processEra failed (non-fatal):', parseErr.message);
        }
      }

      logger.info('[EraIngestion] file uploaded', { logId, fileName: file.originalname, actor, claimsFound });
      if (xenCustId) {
        broadcastToCustomer(xenCustId, 'era:processing-complete', { logId, status: 'completed', claimsFound, claimsMatched, remittanceFileId });
      }
      res.json({ logId, status: 'completed', claimsFound, claimsMatched, remittanceFileId });
    } catch (err: any) {
      logger.error('[EraIngestion] upload error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** GET /api/recon-iq/era-ingestion/history */
  history = async (req: Request, res: Response): Promise<void> => {
    try {
      const xenCustId = extractCustomerId(req);
      const page     = Math.max(parseInt(String(req.query.page))     || 1, 1);
      const pageSize = Math.min(parseInt(String(req.query.pageSize)) || 25, 100);
      const offset   = (page - 1) * pageSize;
      const search   = String(req.query.search   || '').trim();
      const status   = String(req.query.status   || '').trim();
      const fileType = String(req.query.fileType || '').trim();
      const rawSort  = String(req.query.sortBy   || 'uploaded_at');
      const sortDir  = String(req.query.sortDir  || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

      const SORTABLE: Record<string, string> = {
        uploaded_at:    'uploaded_at',
        file_name:      'file_name',
        payer_name:     'payer_name',
        status:         'status',
        claims_found:   'claims_found',
        total_amount:   'total_amount',
        file_type:      'file_type',
        file_size_bytes:'file_size_bytes',
      };
      const orderCol = SORTABLE[rawSort] ?? 'uploaded_at';

      // Build shared WHERE clause - applied to both data and count queries
      const bindFilters = (r: sql.Request): string => {
        const conds: string[] = [];
        if (xenCustId != null) { r.input('CustId', sql.Int, xenCustId); conds.push('customer_id = @CustId'); }
        if (search)   { r.input('Search',   sql.NVarChar(200), `%${search}%`);  conds.push('(file_name LIKE @Search OR payer_name LIKE @Search OR uploaded_by LIKE @Search)'); }
        if (status)   { r.input('Status',   sql.NVarChar(20),  status);          conds.push('status = @Status'); }
        if (fileType) { r.input('FileType', sql.NVarChar(10),  fileType);        conds.push('file_type = @FileType'); }
        return conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      };

      const rData  = this.pool.request();
      const where  = bindFilters(rData);
      rData.input('Offset',   sql.Int, offset);
      rData.input('PageSize', sql.Int, pageSize);

      const rCount = this.pool.request();
      bindFilters(rCount);

      const [result, countResult] = await Promise.all([
        rData.query(`
          SELECT id, file_name, file_size_bytes, file_type, status,
                 remittance_file_id, claims_found, claims_matched,
                 error_message, uploaded_by, uploaded_at, completed_at,
                 payer_name, total_amount
          FROM dbo.RemittanceIngestionLog
          ${where}
          ORDER BY ${orderCol} ${sortDir}
          OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
        `),
        rCount.query(`SELECT COUNT(*) AS total FROM dbo.RemittanceIngestionLog ${where}`),
      ]);

      const rows = result.recordset.map((row: any) => ({
        id:               row.id,
        fileName:         row.file_name,
        fileSizeBytes:    row.file_size_bytes,
        fileType:         row.file_type,
        status:           row.status,
        remittanceFileId: row.remittance_file_id,
        claimsFound:      row.claims_found,
        claimsMatched:    row.claims_matched,
        errorMessage:     row.error_message,
        uploadedBy:       row.uploaded_by,
        uploadedAt:       row.uploaded_at,
        completedAt:      row.completed_at,
        payerName:        row.payer_name,
        totalAmount:      row.total_amount,
      }));

      res.json({ rows, total: countResult.recordset[0].total, page, pageSize });
    } catch (err: any) {
      logger.error('[EraIngestion] history error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** GET /api/recon-iq/era-ingestion/:id */
  getDetail = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const xenCustId = extractCustomerId(req);
      const custSql = xenCustId != null ? 'AND customer_id = @CustId' : '';
      const r = this.pool.request().input('Id', sql.Int, parseInt(id));
      if (xenCustId != null) r.input('CustId', sql.Int, xenCustId);
      const result = await r.query(`
        SELECT id, file_name, file_size_bytes, file_type, status,
               remittance_file_id, claims_found, claims_matched,
               error_message, uploaded_by, uploaded_at, completed_at,
               file_content, payer_name, total_amount
        FROM dbo.RemittanceIngestionLog
        WHERE id = @Id ${custSql}
      `);
      if (!result.recordset.length) { res.status(404).json({ message: 'Not found' }); return; }
      const row = result.recordset[0];
      res.json({
        id:               row.id,
        fileName:         row.file_name,
        fileSizeBytes:    row.file_size_bytes,
        fileType:         row.file_type,
        status:           row.status,
        remittanceFileId: row.remittance_file_id,
        claimsFound:      row.claims_found,
        claimsMatched:    row.claims_matched,
        errorMessage:     row.error_message,
        uploadedBy:       row.uploaded_by,
        uploadedAt:       row.uploaded_at,
        completedAt:      row.completed_at,
        fileContent:      row.file_content,
        payerName:        row.payer_name,
        totalAmount:      row.total_amount,
      });
    } catch (err: any) {
      logger.error('[EraIngestion] getDetail error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  /** GET /api/recon-iq/era-ingestion/demo-file - generate a real 835 using live claim data */
  downloadDemoFile = async (req: Request, res: Response): Promise<void> => {
    try {
      const xenCustId = extractCustomerId(req) ?? 1;

      // Fetch 6 real claims (prefer ones with a secondary_payer_id set for full workflow demo)
      const claimsRes = await this.pool.request()
        .input('custId', sql.Int, xenCustId)
        .query(`
          SELECT TOP 6
            c.ClaimID,
            CAST(ISNULL(c.ChargeAmt, 500) AS decimal(10,2)) AS ChargeAmt,
            CONVERT(varchar(10), c.DateOfService, 23)        AS DateOfService,
            ISNULL(pay.InsuranceName, 'Demo Insurance')      AS PayerName,
            ISNULL(pat.PatientName, 'Demo Patient')          AS PatientName,
            CASE WHEN ISNULL(c.ClaimStatus, '') = 'Denied' THEN 1 ELSE 0 END AS IsDenied,
            c.secondary_payer_id
          FROM dbo.claims c
          LEFT JOIN dbo.payer   pay ON pay.PayerID   = c.PayerID
          LEFT JOIN dbo.Patient pat ON pat.PatientID = c.PatientID
          WHERE c.customer_id = @custId
            AND c.ClaimID LIKE 'CL6%'
            AND ISNULL(c.ChargeAmt, 0) > 0
          ORDER BY c.secondary_payer_id DESC, NEWID()
        `);

      const claims = claimsRes.recordset as {
        ClaimID: string; ChargeAmt: number; DateOfService: string;
        PayerName: string; PatientName: string;
        IsDenied: number; secondary_payer_id: number | null;
      }[];

      if (!claims.length) {
        res.status(404).json({ message: 'No claims found for demo file generation' });
        return;
      }

      const payerName = (claims[0].PayerName || 'Demo Insurance').slice(0, 15).padEnd(15);
      const d = new Date();
      const yymmdd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
      const yyyymmdd = `20${yymmdd}`;
      const traceNum = `ACH${yyyymmdd}${String(Math.floor(Math.random() * 999999)).padStart(6,'0')}`;
      const totalPaid = claims.reduce((s, c) => s + (c.IsDenied ? 0 : Math.round(Number(c.ChargeAmt) * 0.70 * 100) / 100), 0);

      // ISA must be exactly 106 chars including the ~ terminator
      const isa = [
        'ISA', '00', '          ', '00', '          ',
        'ZZ', 'DEMODENTAL     ', 'ZZ', 'MAXRCMPRACTICE ',
        yymmdd, '0900', '^', '00501', '000000001', '0', 'P', ':',
      ].join('*');

      const segs: string[] = [
        isa,
        `GS*HP*DEMODENTAL*MAXRCM*${yyyymmdd}*0900*1*X*005010X221A1`,
        `ST*835*0001`,
        `BPR*I*${totalPaid.toFixed(2)}*C*ACH*CCP*01*999888777*DA*1234567890*9876543210**01*111222333*DA*9998887776*${yyyymmdd}`,
        `TRN*1*${traceNum}*9876543210`,
        `N1*PR*${(claims[0].PayerName || 'Demo Insurance').slice(0, 60)}`,
        `N1*PE*MAXRCM DEMO PRACTICE*XX*1234567890`,
      ];

      for (const claim of claims) {
        const charged   = Number(claim.ChargeAmt);
        const isDenied  = Number(claim.IsDenied) === 1;
        const paidAmt   = isDenied ? 0 : Math.round(charged * 0.70 * 100) / 100;
        const adjAmt    = isDenied ? charged : Math.round((charged - paidAmt) * 100) / 100;
        const status    = isDenied ? '4' : '1';
        const cpt       = '99213';
        const carc      = isDenied ? '50' : '45';
        const icn       = `ICN${yyyymmdd}${claim.ClaimID.replace(/\D/g, '').slice(-4).padStart(4,'0')}`;
        const nameParts = (claim.PatientName || 'Demo Patient').split(' ');
        const last      = nameParts.slice(1).join(' ').toUpperCase() || 'PATIENT';
        const first     = nameParts[0].toUpperCase();
        const memberId  = `INS${claim.ClaimID.replace(/\D/g, '').slice(-6).padStart(6,'0')}`;

        segs.push(`CLP*${claim.ClaimID}*${status}*${charged.toFixed(2)}*${paidAmt.toFixed(2)}*0.00*MB*${icn}*11*1`);
        segs.push(`NM1*QC*1*${last}*${first}****MI*${memberId}`);
        segs.push(`SVC*HC:${cpt}*${charged.toFixed(2)}*${paidAmt.toFixed(2)}**1`);
        segs.push(`CAS*CO*${carc}*${adjAmt.toFixed(2)}`);
      }

      // SE: segment count from ST (index 2) through SE inclusive
      const stIdx = 2;
      const segCountInTx = segs.length - stIdx + 1; // +1 for SE itself
      segs.push(`SE*${segCountInTx}*0001`);
      segs.push('GE*1*1');
      segs.push('IEA*1*000000001');

      const content835 = segs.join('~\r\n') + '~';
      const filename = `ERA_DEMO_${yyyymmdd}.835`;

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(content835);
    } catch (err: any) {
      logger.error('[EraIngestion] downloadDemoFile error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  private detectFileType(fileName: string, mimeType: string): string {
    const name = fileName.toLowerCase();
    if (name.endsWith('.835') || name.endsWith('.edi') || mimeType.includes('edi')) return 'ERA';
    if (name.endsWith('.pdf')) return 'EOB';
    if (name.endsWith('.csv')) return 'manual';
    return 'ERA';
  }
}
