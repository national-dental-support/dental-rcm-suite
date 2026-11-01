import { Request, Response } from 'express';
import sql from 'mssql';
import logger from '../../../utils/logger';
import { DatabaseConnectionController } from '../../database-connection-controller';

export class Cms1500Controller extends DatabaseConnectionController {
  constructor() { super(); }

  /** GET /denial-iq/claim-detail/documents/cms1500?claimId= */
  public get = async (req: Request, res: Response): Promise<void> => {
    try {
      const claimId = req.query.claimId as string;
      if (!claimId) { res.status(400).json({ message: 'claimId is required' }); return; }

      const request = this.pool.request();
      request.input('ClaimID', sql.NVarChar(50), claimId);

      const result = await request.query(`
        SELECT TOP 1
          c.ClaimID,
          c.DateOfService,
          c.ClaimSubmittedDate,
          c.ChargeAmt,
          ISNULL(LTRIM(RTRIM(COALESCE(pt.FirstName,'') + ' ' + COALESCE(pt.LastName,''))), '') AS PatientName,
          CONVERT(nvarchar(10), pt.dob, 101) AS PatientDOB,
          '' AS PatientAddress,
          '' AS PatientCity,
          '' AS PatientState,
          '' AS PatientZip,
          ISNULL(py.InsuranceName,'') AS PayerName,
          ISNULL(rr.InsurancePolicyNumber,'') AS MemberID,
          '' AS GroupNum,
          ISNULL(LTRIM(RTRIM(COALESCE(rr.SubscriberFirstName,'') + ' ' + COALESCE(rr.SubscriberLastName,''))), '') AS SubscriberName,
          ISNULL(pv.Provider,'') AS ProviderName,
          ISNULL(CAST(pv.NPI AS nvarchar(20)),'') AS ProviderNPI,
          ISNULL(CAST(pv.TaxID AS nvarchar(20)),'') AS ProviderTaxID,
          ISNULL(pv.Location,'') AS PracticeAddress,
          ISNULL(lh.CARCCode,'') AS ProcCode,
          '' AS DiagCode,
          ISNULL(lh.CARCCode,'') AS DenialCode,
          ISNULL(CAST(rr.ChargeAmt AS nvarchar(20)),'') AS LineCharge,
          '' AS InsPayAmt,
          ISNULL(lh.ClaimStatus,'') AS ClaimStatus
        FROM dbo.claims c
        LEFT JOIN dbo.patient pt ON pt.PatientID = c.PatientID
        LEFT JOIN dbo.payer py ON py.PayerID = c.PayerID
        LEFT JOIN dbo.provider pv ON pv.ProviderID = c.ProviderID
        LEFT JOIN dbo.recon_report rr ON rr.ClaimID = c.ClaimID
        LEFT JOIN (
          SELECT ClaimID, CARCCode, ClaimStatus,
                 ROW_NUMBER() OVER (PARTITION BY ClaimID ORDER BY ClaimModifiedDate DESC) AS rn
          FROM dbo.claimhistory WHERE ClaimID = @ClaimID
        ) lh ON lh.ClaimID = c.ClaimID AND lh.rn = 1
        WHERE c.ClaimID = @ClaimID
      `);

      const row = result.recordset?.[0];
      if (!row) { res.status(404).json({ message: 'Claim not found' }); return; }

      const fmt = (v: string | null | undefined) => v || '';
      const fmtDate = (v: string | null | undefined) => {
        if (!v) return '';
        /* istanbul ignore next */
        try { return new Date(v).toLocaleDateString('en-US'); } catch { return String(v); }
      };
      const fmtMoney = (v: string | number | null | undefined) => {
        const n = parseFloat(String(v));
        return isNaN(n) ? '' : '$' + n.toFixed(2);
      };

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>CMS-1500 \u2014 ${fmt(row.ClaimID)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 9px; background: #fff; color: #000; padding: 10px; }
  .form-title { text-align: center; font-size: 13px; font-weight: bold; margin-bottom: 6px; letter-spacing: 1px; }
  .form-subtitle { text-align: center; font-size: 9px; margin-bottom: 10px; color: #444; }
  table { width: 100%; border-collapse: collapse; }
  td, th { border: 1px solid #333; padding: 2px 4px; vertical-align: top; }
  .label { font-size: 7.5px; color: #555; display: block; margin-bottom: 1px; }
  .value { font-size: 9px; font-weight: bold; }
  .section-header { background: #ddd; font-weight: bold; font-size: 8px; text-align: center; padding: 2px; }
  .box-num { font-size: 7px; color: #888; float: right; }
  .wide { width: 100%; }
  .half { width: 50%; }
  .third { width: 33.33%; }
  .quarter { width: 25%; }
  .service-table th { background: #eee; font-size: 7.5px; text-align: center; }
  .disclaimer { font-size: 7.5px; color: #666; margin-top: 8px; text-align: center; }
  .denied-badge { display: inline-block; background: #d32f2f; color: #fff; border-radius: 3px; padding: 1px 5px; font-size: 8px; margin-left: 6px; }
</style>
</head>
<body>
<div class="form-title">
  HEALTH INSURANCE CLAIM FORM
  <span style="font-size:9px; font-weight:normal;">(CMS-1500)</span>
  ${row.DenialCode ? `<span class="denied-badge">DENIED: ${fmt(row.DenialCode)}</span>` : ''}
</div>
<div class="form-subtitle">APPROVED BY NATIONAL UNIFORM CLAIM COMMITTEE (NUCC) 02/12 &nbsp;|&nbsp; Claim ID: <strong>${fmt(row.ClaimID)}</strong></div>

<table>
  <tr>
    <td class="third">
      <span class="label">1. INSURANCE TYPE <span class="box-num">1</span></span>
      <span class="value">&#9746; Other</span>
    </td>
    <td colspan="2">
      <span class="label">1a. INSURED'S I.D. NUMBER <span class="box-num">1a</span></span>
      <span class="value">${fmt(row.MemberID)}</span>
    </td>
  </tr>
  <tr>
    <td class="half">
      <span class="label">2. PATIENT'S NAME (Last, First, Middle) <span class="box-num">2</span></span>
      <span class="value">${fmt(row.PatientName)}</span>
    </td>
    <td>
      <span class="label">3. PATIENT BIRTH DATE <span class="box-num">3</span></span>
      <span class="value">${fmtDate(row.PatientDOB)}</span>
    </td>
    <td>
      <span class="label">4. INSURED'S NAME <span class="box-num">4</span></span>
      <span class="value">${fmt(row.SubscriberName) || fmt(row.PatientName)}</span>
    </td>
  </tr>
  <tr>
    <td>
      <span class="label">5. PATIENT'S ADDRESS <span class="box-num">5</span></span>
      <span class="value">${fmt(row.PatientAddress)}</span>
      <span class="value">${fmt(row.PatientCity)}${row.PatientCity && row.PatientState ? ', ' : ''}${fmt(row.PatientState)} ${fmt(row.PatientZip)}</span>
    </td>
    <td>
      <span class="label">6. PATIENT RELATIONSHIP TO INSURED <span class="box-num">6</span></span>
      <span class="value">&#9746; Self</span>
    </td>
    <td>
      <span class="label">7. INSURED'S ADDRESS <span class="box-num">7</span></span>
      <span class="value">${fmt(row.PracticeAddress)}</span>
    </td>
  </tr>
  <tr>
    <td colspan="2">
      <span class="label">9. OTHER INSURED'S NAME <span class="box-num">9</span></span>
      <span class="value">\u2014</span>
    </td>
    <td>
      <span class="label">10. IS PATIENT'S CONDITION RELATED TO: <span class="box-num">10</span></span>
      <span class="value">&#9744; Employment &nbsp; &#9744; Auto Accident &nbsp; &#9744; Other</span>
    </td>
  </tr>
  <tr>
    <td colspan="2">
      <span class="label">11. INSURED'S POLICY GROUP OR FECA NUMBER <span class="box-num">11</span></span>
      <span class="value">${fmt(row.GroupNum)}</span>
    </td>
    <td>
      <span class="label">11c. INSURANCE PLAN NAME OR PROGRAM NAME <span class="box-num">11c</span></span>
      <span class="value">${fmt(row.PayerName)}</span>
    </td>
  </tr>
  <tr>
    <td colspan="3">
      <span class="label">21. DIAGNOSIS OR NATURE OF ILLNESS/INJURY (ICD-10) <span class="box-num">21</span></span>
      <span class="value">A: ${fmt(row.DiagCode) || 'Z00.00'}</span>
    </td>
  </tr>
</table>

<br/>
<table class="service-table">
  <thead>
    <tr>
      <th>24A. DATE(S) OF SERVICE<br/>From / To</th>
      <th>24B.<br/>POS</th>
      <th>24C.<br/>EMG</th>
      <th>24D. PROCEDURES,<br/>SERVICES, OR SUPPLIES</th>
      <th>24E. DIAGNOSIS<br/>POINTER</th>
      <th>24F. $CHARGES</th>
      <th>24G. DAYS<br/>OR UNITS</th>
      <th>24J. RENDERING<br/>PROVIDER NPI</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="text-align:center">${fmtDate(row.DateOfService)}</td>
      <td style="text-align:center">11</td>
      <td style="text-align:center"></td>
      <td style="text-align:center">${fmt(row.ProcCode) || '99213'}</td>
      <td style="text-align:center">A</td>
      <td style="text-align:right">${fmtMoney(row.LineCharge || row.ChargeAmt)}</td>
      <td style="text-align:center">1</td>
      <td style="text-align:center">${fmt(row.ProviderNPI)}</td>
    </tr>
    <tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    <tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
  </tbody>
</table>
<br/>

<table>
  <tr>
    <td class="half">
      <span class="label">25. FEDERAL TAX I.D. NUMBER <span class="box-num">25</span></span>
      <span class="value">${fmt(row.ProviderTaxID)}</span>
    </td>
    <td class="quarter">
      <span class="label">28. TOTAL CHARGE <span class="box-num">28</span></span>
      <span class="value">${fmtMoney(row.ChargeAmt)}</span>
    </td>
    <td class="quarter">
      <span class="label">29. AMOUNT PAID <span class="box-num">29</span></span>
      <span class="value">${fmtMoney(row.InsPayAmt)}</span>
    </td>
  </tr>
  <tr>
    <td colspan="2">
      <span class="label">31. SIGNATURE OF PHYSICIAN OR SUPPLIER <span class="box-num">31</span></span>
      <span class="value"><em>Signature on File</em> &nbsp;&nbsp; ${fmtDate(row.ClaimSubmittedDate)}</span>
    </td>
    <td>
      <span class="label">32. SERVICE FACILITY LOCATION INFORMATION <span class="box-num">32</span></span>
      <span class="value">${fmt(row.PracticeAddress)}</span>
    </td>
  </tr>
  <tr>
    <td colspan="2">
      <span class="label">33. BILLING PROVIDER INFO &amp; PH # <span class="box-num">33</span></span>
      <span class="value">${fmt(row.ProviderName)}</span>
      <span class="value">NPI: ${fmt(row.ProviderNPI)}</span>
    </td>
    <td>
      <span class="label">33a. NPI <span class="box-num">33a</span></span>
      <span class="value">${fmt(row.ProviderNPI)}</span>
    </td>
  </tr>
</table>

<div class="disclaimer">
  NOTICE: Any person who knowingly files a statement of claim containing any misrepresentation or any false, incomplete or misleading information may be guilty of a criminal act punishable under law and may be subject to civil penalties.
  &nbsp;&nbsp;|&nbsp;&nbsp; Generated: ${new Date().toLocaleDateString('en-US')} &nbsp;&nbsp;|&nbsp;&nbsp; For demo purposes only
</div>
</body></html>`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (error: unknown) {
      logger.error('Cms1500.get \u2013 error', { error });
      res.status(500).json({ message: 'Internal server error' });
    }
  };
}
