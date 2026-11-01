import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../utils/logger';
import { DatabaseConnectionController } from '../database-connection-controller';

/**
 * Generates a demo EOB/ERA document as HTML.
 * GET /api/pdf/generate?claimId=...
 *
 * Pulls claim data from SQL and renders an EOB-style HTML document.
 * No MongoDB dependency - pure SQL + HTML generation.
 */
export class PdfGenerate extends DatabaseConnectionController {
  constructor() { super(); }

  public get = async (req: Request, res: Response): Promise<Response | void> => {
    try {
      const claimId = req.query.claimId as string | undefined;

      // Default demo data
      let d: any = {
        payerName: 'Cigna Dental', payerAddress: '900 Cottage Grove Road, Hartford, CT 06152',
        providerName: 'BrightSmile Dental', providerNPI: '1234567890', providerTaxId: '12-3456789',
        subscriberName: 'John Smith', subscriberId: 'CIG-2025-00001', patientName: 'John Smith',
        dateOfService: new Date().toLocaleDateString('en-US'), claimId: claimId || 'DEMO-001',
        checkNumber: 'CHK-' + Math.floor(100000 + Math.random() * 900000),
        checkDate: new Date().toLocaleDateString('en-US'),
        lines: [
          { cpt: 'D0120', desc: 'Periodic Oral Eval', charged: 65, allowed: 55, paid: 44, patient: 11, adjCode: 'CO-45', adjAmt: 10 },
          { cpt: 'D1110', desc: 'Prophylaxis Adult', charged: 120, allowed: 100, paid: 80, patient: 20, adjCode: 'CO-45', adjAmt: 20 },
          { cpt: 'D0274', desc: 'Bitewings (4 films)', charged: 85, allowed: 70, paid: 56, patient: 14, adjCode: 'CO-45', adjAmt: 15 },
        ],
      };

      // Pull real data if claimId provided
      if (claimId) {
        try {
          const r = await this.pool.request().input('cid', sql.NVarChar(50), claimId).query(`
            SELECT TOP 1 c.ClaimID, c.DateOfService, c.ChargeAmt,
              ISNULL(py.InsuranceName,'') AS PayerName,
              ISNULL(LTRIM(RTRIM(COALESCE(pt.FirstName,'') + ' ' + COALESCE(pt.LastName,''))), '') AS PatientName,
              ISNULL(rr.InsurancePolicyNumber,'') AS MemberID,
              ISNULL(LTRIM(RTRIM(COALESCE(rr.SubscriberFirstName,'') + ' ' + COALESCE(rr.SubscriberLastName,''))), '') AS SubscriberName,
              ISNULL(pv.Provider,'') AS ProviderName,
              ISNULL(CAST(pv.NPI AS nvarchar(20)),'') AS ProviderNPI,
              ISNULL(CAST(pv.TaxID AS nvarchar(20)),'') AS ProviderTaxID,
              ISNULL(rr.InsurancePaymentAmt,0) AS PaidAmt, ISNULL(rr.InsuranceBalanceAmt,0) AS BalanceAmt,
              ISNULL(lh.CARCCode,'') AS DenialCode
            FROM dbo.claims c
            LEFT JOIN dbo.patient pt ON pt.PatientID = c.PatientID
            LEFT JOIN dbo.payer py ON py.PayerID = c.PayerID
            LEFT JOIN dbo.provider pv ON pv.ProviderID = c.ProviderID
            LEFT JOIN dbo.recon_report rr ON rr.ClaimID = c.ClaimID
            LEFT JOIN (SELECT ClaimID, CARCCode, ROW_NUMBER() OVER (PARTITION BY ClaimID ORDER BY ClaimModifiedDate DESC) AS rn FROM dbo.claimhistory WHERE ClaimID = @cid) lh ON lh.ClaimID = c.ClaimID AND lh.rn = 1
            WHERE c.ClaimID = @cid`);
          const row = r.recordset[0];
          if (row) {
            const charged = parseFloat(row.ChargeAmt) || 0;
            const paid = parseFloat(row.PaidAmt) || 0;
            const bal = parseFloat(row.BalanceAmt) || 0;
            d.payerName = row.PayerName || d.payerName;
            d.providerName = row.ProviderName || d.providerName;
            d.providerNPI = row.ProviderNPI || d.providerNPI;
            d.providerTaxId = row.ProviderTaxID || d.providerTaxId;
            d.subscriberName = row.SubscriberName || row.PatientName || d.subscriberName;
            d.subscriberId = row.MemberID || d.subscriberId;
            d.patientName = row.PatientName || d.patientName;
            d.dateOfService = row.DateOfService ? new Date(row.DateOfService).toLocaleDateString('en-US') : d.dateOfService;
            d.claimId = row.ClaimID;
            d.lines = [{ cpt: row.DenialCode || 'D0120', desc: 'Service', charged, allowed: charged * 0.85, paid, patient: bal, adjCode: row.DenialCode || 'CO-45', adjAmt: charged - (charged * 0.85) }];
          }
        } catch (e: any) { logger.warn('[PDF] Claim lookup failed:', e.message); }
      }

      const fmt = (n: number) => '$' + n.toFixed(2);
      const totC = d.lines.reduce((s: number, l: any) => s + l.charged, 0);
      const totP = d.lines.reduce((s: number, l: any) => s + l.paid, 0);
      const totPt = d.lines.reduce((s: number, l: any) => s + l.patient, 0);
      const totA = d.lines.reduce((s: number, l: any) => s + l.adjAmt, 0);
      const rows = d.lines.map((l: any) => `<tr><td>${l.cpt}</td><td>${l.desc}</td><td class="r">${fmt(l.charged)}</td><td class="r">${fmt(l.allowed)}</td><td class="r">${fmt(l.paid)}</td><td class="r">${fmt(l.patient)}</td><td>${l.adjCode}</td><td class="r">${fmt(l.adjAmt)}</td></tr>`).join('');

      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>EOB \u2014 ${d.claimId}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Courier New',monospace;font-size:10px;background:#fff;color:#000;padding:20px;max-width:800px;margin:0 auto}h1{font-size:14px;margin-bottom:4px}h2{font-size:11px;margin:12px 0 4px;border-bottom:1px solid #000;padding-bottom:2px}.header{display:flex;justify-content:space-between;border:2px solid #000;padding:10px;margin-bottom:10px}.header-left{flex:1}.header-right{text-align:right}table{width:100%;border-collapse:collapse;margin:4px 0}th,td{border:1px solid #999;padding:3px 5px;text-align:left;font-size:9px}th{background:#e0e0e0;font-weight:bold}.r{text-align:right}.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:6px 0}.info-box{border:1px solid #999;padding:6px}.info-box .label{font-size:8px;color:#555;text-transform:uppercase}.info-box .value{font-size:10px;font-weight:bold;margin-top:2px}.totals{margin-top:8px;text-align:right;font-weight:bold}.footer{margin-top:12px;font-size:8px;color:#666;text-align:center;border-top:1px solid #ccc;padding-top:6px}.badge{display:inline-block;background:#1565c0;color:#fff;padding:2px 6px;border-radius:2px;font-size:9px}</style></head><body>
<div class="header"><div class="header-left"><h1>${d.payerName}</h1><div>${d.payerAddress}</div><div style="margin-top:4px"><span class="badge">EXPLANATION OF BENEFITS</span></div></div><div class="header-right"><div><strong>Check #:</strong> ${d.checkNumber}</div><div><strong>Check Date:</strong> ${d.checkDate}</div><div><strong>Claim #:</strong> ${d.claimId}</div></div></div>
<div class="info-grid"><div class="info-box"><div class="label">Subscriber</div><div class="value">${d.subscriberName}</div><div>ID: ${d.subscriberId}</div></div><div class="info-box"><div class="label">Patient</div><div class="value">${d.patientName}</div><div>DOS: ${d.dateOfService}</div></div><div class="info-box"><div class="label">Provider</div><div class="value">${d.providerName}</div><div>NPI: ${d.providerNPI} &nbsp; TIN: ${d.providerTaxId}</div></div><div class="info-box"><div class="label">Payment</div><div class="value">Paid: ${fmt(totP)}</div><div>Patient: ${fmt(totPt)}</div></div></div>
<h2>Service Line Detail</h2><table><thead><tr><th>CPT</th><th>Description</th><th class="r">Charged</th><th class="r">Allowed</th><th class="r">Paid</th><th class="r">Patient</th><th>Adj Code</th><th class="r">Adj Amt</th></tr></thead><tbody>${rows}</tbody></table>
<div class="totals">Charged: ${fmt(totC)} | Paid: ${fmt(totP)} | Adjustments: ${fmt(totA)} | Patient: ${fmt(totPt)}</div>
<div class="footer">This is not a bill. This EOB is for informational purposes. Contact ${d.payerName} Member Services with questions. | Generated: ${new Date().toLocaleDateString('en-US')} | Demo only</div>
</body></html>`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (error: unknown) {
      logger.error('PdfGenerate.get \u2013 error', { error });
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}

export default PdfGenerate;
