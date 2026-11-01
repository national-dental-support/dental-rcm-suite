import { Request, Response } from 'express';
import { DatabaseConnectionController } from '../database-connection-controller';
import logger from '../../utils/logger';

export class MasterClaimController extends DatabaseConnectionController {
  constructor() {
    super();
  }

  /**
   * GET /api/claims/:id
   * Returns the master claim identity + enrichment availability flags
   * based on the caller's product subscriptions.
   */
  public get = async (req: Request, res: Response): Promise<Response> => {
    const claimId    = req.params.id;
    const actorEmail = (req.headers['x-actor-email'] as string | undefined)?.toLowerCase().trim();

    if (!actorEmail) {
      return res.status(400).json({ message: 'x-actor-email header is required.' });
    }

    try {
      const pool = this.pool;

      // 1. Fetch base claim
      const claimResult = await pool.request()
        .input('claimId', claimId)
        .query(`
          SELECT
            ClaimID          AS id,
            ClaimGUID        AS guid,
            PatientID        AS patientId,
            PayerID          AS payerId,
            ProviderID       AS providerId,
            DateOfService    AS dateOfService,
            ChargeAmt        AS chargeAmount,
            ClaimSubmittedDate AS submittedDate,
            InsuranceClaimID AS insuranceClaimId,
            customer_id      AS customerId
          FROM dbo.claims
          WHERE ClaimID = @claimId
        `);

      if (!claimResult.recordset.length) {
        return res.status(404).json({ message: 'Claim not found.' });
      }

      const claim = claimResult.recordset[0];

      // 2. Determine calling user's role + subscriptions
      const userResult = await pool.request()
        .input('email', actorEmail)
        .query(`
          SELECT TOP 1
            u.customer_id,
            u.Role
          FROM dbo.Users u
          WHERE LOWER(u.Email) = @email
        `);

      const user = userResult.recordset[0] ?? {};
      const isSuperAdmin = user.Role === 'Super Admin';
      // Super Admin can scope to a specific tenant via x-xen-customer-id header
      const xenCustId: number = (req as any).actor?.customer_id ?? 0;
      const customerId   = (isSuperAdmin && xenCustId) ? xenCustId : (user.customer_id ?? null);
      const shouldFilterTenant = (!isSuperAdmin && user.customer_id) || (isSuperAdmin && xenCustId);
      const locationId: null = null; // LocationAssignments not yet implemented

      // Tenant isolation: restrict claim access to the resolved tenant
      if (shouldFilterTenant && customerId && claim.customerId && claim.customerId !== customerId) {
        return res.status(404).json({ message: 'Claim not found.' });
      }

      // 3. Get subscribed product slugs
      let subscribedSlugs: string[] = [];
      if (isSuperAdmin) {
        // Super Admin sees all enrichments
        const allProducts = await pool.request().query(`
          SELECT slug FROM dbo.Products WHERE is_active = 1 AND slug <> 'superadmin'
        `);
        subscribedSlugs = allProducts.recordset.map((r: { slug: string }) => r.slug);
      } else if (customerId) {
        const subResult = await pool.request()
          .input('customerId', customerId)
          .input('locationId', locationId)
          .query(`
            SELECT DISTINCT p.slug
            FROM dbo.ProductSubscriptions ps
            JOIN dbo.Products p ON p.id = ps.product_id
            WHERE ps.is_active = 1 AND p.is_active = 1
              AND ps.customer_id = @customerId
              AND (ps.location_id IS NULL OR ps.location_id = @locationId)
          `);
        subscribedSlugs = subResult.recordset.map((r: { slug: string }) => r.slug);
      }

      // 4. For each subscribed product, check if data exists for this claim
      const enrichments: Record<string, { available: boolean }> = {};

      const checks: Array<{ slug: string; query: string }> = [
        {
          slug: 'denial-iq',
          query: `SELECT 1 WHERE EXISTS (
            SELECT 1 FROM dbo.claimhistory WHERE ClaimID = @claimId
          )`,
        },
        {
          slug: 'recon-iq',
          query: `SELECT 1 WHERE EXISTS (
            SELECT 1 FROM dbo.EOBERAClaim WHERE ClaimID = @claimId
          )`,
        },
        {
          slug: 'claim-vision',
          query: `SELECT 1 WHERE EXISTS (
            SELECT 1 FROM dbo.rejectedclaims WHERE ClaimID = @claimId
          )`,
        },
        {
          slug: 'insightflow',
          query: `SELECT 1 WHERE EXISTS (
            SELECT 1 FROM dbo.recon_report WHERE ClaimID = @claimId
          )`,
        },
        {
          slug: 'payer-iq',
          query: `SELECT 1 WHERE EXISTS (
            SELECT 1 FROM dbo.claims WHERE ClaimID = @claimId
          )`,
        },
      ];

      for (const check of checks) {
        if (!subscribedSlugs.includes(check.slug)) {
          enrichments[check.slug] = { available: false };
          continue;
        }
        try {
          const r = await pool.request().input('claimId', claimId).query(check.query);
          enrichments[check.slug] = { available: r.recordset.length > 0 };
        } catch (err) {
          logger.warn('[MasterClaim] enrichment check failed', { slug: check.slug, claimId, error: String(err) });
          enrichments[check.slug] = { available: false };
        }
      }

      return res.json({ claim, enrichments });
    } catch (err) {
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}
