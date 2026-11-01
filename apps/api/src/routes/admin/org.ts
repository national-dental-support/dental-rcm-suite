import { Router } from 'express';
import sql from 'mssql';
import { requireRole } from '../../middleware/require-role';
import Database from '../../modules/db';
import logger from '../../utils/logger';

const router = Router();
function getPool() { return Database.getInstance().getPool(); }

/**
 * GET /api/admin/org/tree
 * Org tree with product activation status per node.
 * Returns nested JSON: PracticeGroup -> Practice -> OrgLocation, each with products array.
 */
router.get('/tree', requireRole('Admin'), async (req, res) => {
  try {
    const actor = (req as any).actor;
    const customerId = actor?.customer_id;

    if (!customerId) {
      return res.status(400).json({ message: 'Cannot determine customer context.' });
    }

    // Fetch all groups
    const groupsResult = await getPool().request()
      .input('customerId', sql.Int, customerId)
      .query(`
        SELECT id, name, ISNULL(is_active, 1) AS is_active
        FROM dbo.PracticeGroup
        WHERE customer_id = @customerId
        ORDER BY name
      `);

    const groups = groupsResult.recordset;

    // Fetch all practices for this customer's groups
    let practices: any[] = [];
    if (groups.length > 0) {
      const practicesResult = await getPool().request()
        .input('customerId', sql.Int, customerId)
        .query(`
          SELECT p.id, p.name, p.group_id, ISNULL(p.is_active, 1) AS is_active
          FROM dbo.OrgPractice p
          INNER JOIN dbo.PracticeGroup pg ON pg.id = p.group_id
          WHERE pg.customer_id = @customerId
          ORDER BY p.name
        `);
      practices = practicesResult.recordset;
    }

    // Fetch all locations for this customer's practices
    let locations: any[] = [];
    if (practices.length > 0) {
      const locationsResult = await getPool().request()
        .input('customerId', sql.Int, customerId)
        .query(`
          SELECT ol.id, ol.name, ol.city, ol.state, ol.practice_id, ISNULL(ol.is_active, 1) AS is_active
          FROM dbo.OrgLocation ol
          INNER JOIN dbo.OrgPractice p ON p.id = ol.practice_id
          INNER JOIN dbo.PracticeGroup pg ON pg.id = p.group_id
          WHERE pg.customer_id = @customerId
          ORDER BY ol.name
        `);
      locations = locationsResult.recordset;
    }

    // Fetch all product activations for this customer, joined with product names
    const productsResult = await getPool().request()
      .input('customerId', sql.Int, customerId)
      .query(`
        SELECT onp.node_type, onp.node_id, onp.product_id, onp.is_active,
               p.slug, p.name AS product_name, p.icon
        FROM dbo.OrgNodeProduct onp
        JOIN dbo.Products p ON p.id = onp.product_id
        WHERE onp.customer_id = @customerId
      `);
    const productActivations = productsResult.recordset;

    // Fetch full product catalog for building complete product list
    const catalogResult = await getPool().request().query(`
      SELECT id, slug, name, icon FROM dbo.Products WHERE is_active = 1 AND slug != 'superadmin' ORDER BY nav_order
    `);
    const allProducts = catalogResult.recordset;

    // Helper: get products for a node, with inheritance from parent
    const getNodeProducts = (nodeType: string, nodeId: number, parentProducts: any[]) => {
      const explicit = productActivations.filter(
        (p: any) => p.node_type === nodeType && p.node_id === nodeId
      );

      // Build map of explicit activations
      const explicitMap = new Map(explicit.map((p: any) => [p.product_id, p]));

      // For each product in catalog, check explicit -> parent -> default off
      return allProducts.map((prod: any) => {
        const exp = explicitMap.get(prod.id);
        if (exp) {
          return {
            product_id: prod.id,
            slug: prod.slug,
            name: prod.name,
            icon: prod.icon,
            is_active: !!exp.is_active,
            inherited: false,
          };
        }

        // Inherit from parent
        const parent = parentProducts.find((pp: any) => pp.product_id === prod.id);
        if (parent) {
          return { ...parent, inherited: true };
        }

        return {
          product_id: prod.id,
          slug: prod.slug,
          name: prod.name,
          icon: prod.icon,
          is_active: false,
          inherited: true,
        };
      });
    };

    // Build nested tree with products
    const tree = groups.map((group: any) => {
      const groupProducts = getNodeProducts('group', group.id, []);

      return {
        id: group.id,
        name: group.name,
        type: 'group',
        is_active: group.is_active,
        products: groupProducts,
        practices: practices
          .filter((p: any) => p.group_id === group.id)
          .map((practice: any) => {
            const practiceProducts = getNodeProducts('practice', practice.id, groupProducts);

            return {
              id: practice.id,
              name: practice.name,
              type: 'practice',
              is_active: practice.is_active,
              products: practiceProducts,
              locations: locations
                .filter((l: any) => l.practice_id === practice.id)
                .map((loc: any) => ({
                  id: loc.id,
                  name: loc.name,
                  city: loc.city,
                  state: loc.state,
                  type: 'location',
                  is_active: loc.is_active,
                  products: getNodeProducts('location', loc.id, practiceProducts),
                })),
            };
          }),
      };
    });

    return res.json({ data: tree });
  } catch (err: any) {
    logger.error(`GET /api/admin/org/tree error: ${err}`);
    return res.status(500).json({ message: 'Internal server error', detail: err?.message });
  }
});

/**
 * PUT /api/admin/org/nodes/:nodeType/:nodeId/products
 * Set product activation for an org node.
 * Body: { product_id: number, is_active: boolean }
 */
router.put('/nodes/:nodeType/:nodeId/products', requireRole('Admin'), async (req, res) => {
  try {
    const { nodeType, nodeId } = req.params;
    const nodeIdNum = parseInt(nodeId, 10);
    if (isNaN(nodeIdNum)) return res.status(400).json({ message: 'Invalid node id.' });

    const validNodeTypes = ['group', 'practice', 'location'];
    if (!validNodeTypes.includes(nodeType)) {
      return res.status(400).json({ message: `Invalid node type. Must be one of: ${validNodeTypes.join(', ')}` });
    }

    const { product_id, is_active } = req.body;
    if (product_id === undefined || is_active === undefined) {
      return res.status(400).json({ message: 'product_id and is_active are required.' });
    }

    const actor = (req as any).actor;
    const customerId = actor?.customer_id;

    if (!customerId) {
      return res.status(400).json({ message: 'Cannot determine customer context.' });
    }

    // MERGE - upsert the product activation
    await getPool().request()
      .input('customerId', sql.Int, customerId)
      .input('nodeType', sql.NVarChar(50), nodeType)
      .input('nodeId', sql.Int, nodeIdNum)
      .input('productId', sql.Int, Number(product_id))
      .input('isActive', sql.Bit, is_active ? 1 : 0)
      .input('activatedBy', sql.NVarChar(255), actor?.email || 'system')
      .query(`
        MERGE dbo.OrgNodeProduct AS target
        USING (SELECT @customerId AS customer_id, @nodeType AS node_type, @nodeId AS node_id, @productId AS product_id) AS source
        ON target.customer_id = source.customer_id
          AND target.node_type = source.node_type
          AND target.node_id = source.node_id
          AND target.product_id = source.product_id
        WHEN MATCHED THEN
          UPDATE SET is_active = @isActive, activated_by = @activatedBy, activated_at = GETUTCDATE()
        WHEN NOT MATCHED THEN
          INSERT (customer_id, node_type, node_id, product_id, is_active, activated_by, activated_at)
          VALUES (@customerId, @nodeType, @nodeId, @productId, @isActive, @activatedBy, GETUTCDATE());
      `);

    return res.json({ message: 'Product activation updated.' });
  } catch (err) {
    logger.error(`PUT /api/admin/org/nodes/:nodeType/:nodeId/products error: ${err}`);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * DELETE /api/admin/org/nodes/:nodeType/:nodeId/products/:productId
 * Reset product activation to inherit from parent.
 */
router.delete('/nodes/:nodeType/:nodeId/products/:productId', requireRole('Admin'), async (req, res) => {
  try {
    const { nodeType, nodeId, productId } = req.params;
    const nodeIdNum = parseInt(nodeId, 10);
    const productIdNum = parseInt(productId, 10);
    if (isNaN(nodeIdNum) || isNaN(productIdNum)) {
      return res.status(400).json({ message: 'Invalid node or product id.' });
    }

    const validNodeTypes = ['group', 'practice', 'location'];
    if (!validNodeTypes.includes(nodeType)) {
      return res.status(400).json({ message: `Invalid node type. Must be one of: ${validNodeTypes.join(', ')}` });
    }

    const actor = (req as any).actor;
    const customerId = actor?.customer_id;

    if (!customerId) {
      return res.status(400).json({ message: 'Cannot determine customer context.' });
    }

    await getPool().request()
      .input('customerId', sql.Int, customerId)
      .input('nodeType', sql.NVarChar(50), nodeType)
      .input('nodeId', sql.Int, nodeIdNum)
      .input('productId', sql.Int, productIdNum)
      .query(`
        DELETE FROM dbo.OrgNodeProduct
        WHERE customer_id = @customerId
          AND node_type = @nodeType
          AND node_id = @nodeId
          AND product_id = @productId
      `);

    return res.json({ message: 'Product activation reset to inherit from parent.' });
  } catch (err) {
    logger.error(`DELETE /api/admin/org/nodes/:nodeType/:nodeId/products/:productId error: ${err}`);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
