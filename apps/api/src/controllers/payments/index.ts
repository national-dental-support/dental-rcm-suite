import { Request, Response } from 'express';
import sql from 'mssql';
import crypto from 'crypto';
import { DatabaseConnectionController } from '../database-connection-controller';
import logger from '../../utils/logger';
import { trackEvent } from '../../utils/telemetry';
import { logFeatureAction } from '../../utils/feature-audit';
import { encrypt, isEncryptionConfigured } from '../../utils/crypto';

interface ActorInfo {
  email: string;
  role: string;
  customer_id: number | null;
  user_id?: number;
}

/**
 * Payments Controller - Credit Card Processing
 *
 * Handles gateway configuration, payment methods (tokenized),
 * charge/refund transactions, and payment statistics.
 */
export class PaymentsController extends DatabaseConnectionController {
  constructor() {
    super();
  }

  // -- Helper: generate a pseudo-gateway token (production would call Stripe/Square SDK) --
  private generateToken(): string {
    return 'tok_' + crypto.randomBytes(16).toString('hex');
  }

  private generateTransactionId(): string {
    return 'txn_' + crypto.randomBytes(12).toString('hex');
  }

  private maskApiKey(key: string): string {
    if (!key || key.length < 8) return '****';
    return key.substring(0, 4) + '****' + key.substring(key.length - 4);
  }

  // =======================================================================
  // GATEWAY CONFIG
  // =======================================================================

  public getConfig = async (req: Request, res: Response): Promise<void> => {
    try {
      const actor = (req as any).actor as ActorInfo | undefined;
      const customerId = actor?.customer_id;

      const result = await this.pool.request()
        .input('CustomerId', sql.SmallInt, customerId)
        .query(`
          SELECT id, customer_id, gateway, api_key_encrypted, merchant_id,
                 is_active, is_sandbox, created_at, updated_at
          FROM dbo.PaymentGatewayConfig
          WHERE customer_id = @CustomerId
        `);

      const configs = result.recordset.map((c: any) => ({
        ...c,
        api_key_encrypted: this.maskApiKey(c.api_key_encrypted),
      }));

      res.json({ data: configs });
    } catch (err) {
      logger.error('Payments.getConfig error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  public updateConfig = async (req: Request, res: Response): Promise<void> => {
    try {
      const actor = (req as any).actor as ActorInfo | undefined;
      const customerId = actor?.customer_id;
      const { gateway, api_key, merchant_id, is_active, is_sandbox } = req.body;

      if (!gateway || !api_key) {
        res.status(400).json({ message: 'gateway and api_key are required' });
        return;
      }

      // Encrypt API key if configured
      let storedApiKey = api_key;
      if (isEncryptionConfigured()) {
        const enc = encrypt(api_key);
        storedApiKey = enc.encrypted;
      }

      // Check if config already exists for this customer+gateway
      const existing = await this.pool.request()
        .input('CustomerId', sql.SmallInt, customerId)
        .input('Gateway', sql.NVarChar(30), gateway)
        .query(`
          SELECT id FROM dbo.PaymentGatewayConfig
          WHERE customer_id = @CustomerId AND gateway = @Gateway
        `);

      if (existing.recordset.length > 0) {
        // Update
        await this.pool.request()
          .input('Id', sql.Int, existing.recordset[0].id)
          .input('CustomerId', sql.SmallInt, customerId)
          .input('Gateway', sql.NVarChar(30), gateway)
          .input('ApiKey', sql.NVarChar(500), storedApiKey)
          .input('MerchantId', sql.NVarChar(200), merchant_id || null)
          .input('IsActive', sql.Bit, is_active !== false ? 1 : 0)
          .input('IsSandbox', sql.Bit, is_sandbox !== false ? 1 : 0)
          .query(`
            UPDATE dbo.PaymentGatewayConfig
            SET api_key_encrypted = @ApiKey,
                merchant_id = @MerchantId,
                is_active = @IsActive,
                is_sandbox = @IsSandbox,
                updated_at = GETDATE()
            WHERE id = @Id AND customer_id = @CustomerId
          `);

        res.json({ message: 'Gateway config updated' });
      } else {
        // Insert
        const insertResult = await this.pool.request()
          .input('CustomerId', sql.SmallInt, customerId)
          .input('Gateway', sql.NVarChar(30), gateway)
          .input('ApiKey', sql.NVarChar(500), storedApiKey)
          .input('MerchantId', sql.NVarChar(200), merchant_id || null)
          .input('IsActive', sql.Bit, is_active !== false ? 1 : 0)
          .input('IsSandbox', sql.Bit, is_sandbox !== false ? 1 : 0)
          .query(`
            INSERT INTO dbo.PaymentGatewayConfig
              (customer_id, gateway, api_key_encrypted, merchant_id, is_active, is_sandbox)
            OUTPUT INSERTED.*
            VALUES (@CustomerId, @Gateway, @ApiKey, @MerchantId, @IsActive, @IsSandbox)
          `);

        const row = insertResult.recordset[0];
        row.api_key_encrypted = this.maskApiKey(row.api_key_encrypted);
        res.status(201).json({ data: row });
      }
    } catch (err) {
      logger.error('Payments.updateConfig error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  // =======================================================================
  // PAYMENT METHODS
  // =======================================================================

  public getMethods = async (req: Request, res: Response): Promise<void> => {
    try {
      const actor = (req as any).actor as ActorInfo | undefined;
      const customerId = actor?.customer_id;
      const patientId = parseInt(req.params.patientId, 10);

      const result = await this.pool.request()
        .input('CustomerId', sql.SmallInt, customerId)
        .input('PatientId', sql.Int, patientId)
        .query(`
          SELECT id, customer_id, patient_id, method_type, card_brand,
                 last_four, exp_month, exp_year, cardholder_name,
                 is_default, is_active, created_at
          FROM dbo.PaymentMethod
          WHERE customer_id = @CustomerId AND patient_id = @PatientId AND is_active = 1
          ORDER BY is_default DESC, created_at DESC
        `);

      res.json({ data: result.recordset });
    } catch (err) {
      logger.error('Payments.getMethods error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  public addMethod = async (req: Request, res: Response): Promise<void> => {
    try {
      const actor = (req as any).actor as ActorInfo | undefined;
      const customerId = actor?.customer_id;
      const {
        patient_id, method_type, card_brand, last_four,
        exp_month, exp_year, cardholder_name, is_default,
      } = req.body;

      if (!patient_id || !method_type || !last_four || !cardholder_name) {
        res.status(400).json({ message: 'patient_id, method_type, last_four, and cardholder_name are required' });
        return;
      }

      // Tokenize - in production this would call Stripe/Square API with the full card number
      const gatewayToken = this.generateToken();

      // If setting as default, clear other defaults
      if (is_default) {
        await this.pool.request()
          .input('CustomerId', sql.SmallInt, customerId)
          .input('PatientId', sql.Int, patient_id)
          .query(`
            UPDATE dbo.PaymentMethod
            SET is_default = 0
            WHERE customer_id = @CustomerId AND patient_id = @PatientId
          `);
      }

      const result = await this.pool.request()
        .input('CustomerId', sql.SmallInt, customerId)
        .input('PatientId', sql.Int, patient_id)
        .input('MethodType', sql.NVarChar(20), method_type)
        .input('CardBrand', sql.NVarChar(20), card_brand || null)
        .input('LastFour', sql.NVarChar(4), last_four)
        .input('ExpMonth', sql.Int, exp_month ?? null)
        .input('ExpYear', sql.Int, exp_year ?? null)
        .input('CardholderName', sql.NVarChar(200), cardholder_name)
        .input('GatewayToken', sql.NVarChar(500), gatewayToken)
        .input('IsDefault', sql.Bit, is_default ? 1 : 0)
        .query(`
          INSERT INTO dbo.PaymentMethod
            (customer_id, patient_id, method_type, card_brand, last_four,
             exp_month, exp_year, cardholder_name, gateway_token, is_default)
          OUTPUT INSERTED.id, INSERTED.customer_id, INSERTED.patient_id,
                 INSERTED.method_type, INSERTED.card_brand, INSERTED.last_four,
                 INSERTED.exp_month, INSERTED.exp_year, INSERTED.cardholder_name,
                 INSERTED.is_default, INSERTED.is_active, INSERTED.created_at
          VALUES (@CustomerId, @PatientId, @MethodType, @CardBrand, @LastFour,
                  @ExpMonth, @ExpYear, @CardholderName, @GatewayToken, @IsDefault)
        `);

      res.status(201).json({ data: result.recordset[0] });
    } catch (err) {
      logger.error('Payments.addMethod error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  public deactivateMethod = async (req: Request, res: Response): Promise<void> => {
    try {
      const actor = (req as any).actor as ActorInfo | undefined;
      const customerId = actor?.customer_id;
      const methodId = parseInt(req.params.id, 10);

      await this.pool.request()
        .input('Id', sql.Int, methodId)
        .input('CustomerId', sql.SmallInt, customerId)
        .query(`
          UPDATE dbo.PaymentMethod
          SET is_active = 0
          WHERE id = @Id AND customer_id = @CustomerId
        `);

      res.json({ message: 'Payment method deactivated' });
    } catch (err) {
      logger.error('Payments.deactivateMethod error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  // =======================================================================
  // TRANSACTIONS - CHARGE / REFUND
  // =======================================================================

  public charge = async (req: Request, res: Response): Promise<void> => {
    try {
      const actor = (req as any).actor as ActorInfo | undefined;
      const customerId = actor?.customer_id;
      const { patient_id, payment_method_id, amount, description, currency, invoice_id } = req.body;

      if (!patient_id || !amount || amount <= 0) {
        res.status(400).json({ message: 'patient_id and a positive amount are required' });
        return;
      }

      // In production: call gateway API with the stored token
      // Simulate successful charge
      const gatewayTxnId = this.generateTransactionId();
      const txnStatus = 'completed';

      const result = await this.pool.request()
        .input('CustomerId', sql.SmallInt, customerId)
        .input('PatientId', sql.Int, patient_id)
        .input('PaymentMethodId', sql.Int, payment_method_id || null)
        .input('Amount', sql.Decimal(10, 2), amount)
        .input('Currency', sql.NVarChar(3), currency || 'USD')
        .input('TxnType', sql.NVarChar(20), 'charge')
        .input('Status', sql.NVarChar(20), txnStatus)
        .input('GatewayTxnId', sql.NVarChar(200), gatewayTxnId)
        .input('GatewayResponse', sql.NVarChar(sql.MAX), JSON.stringify({ success: true, id: gatewayTxnId }))
        .input('Description', sql.NVarChar(500), description || null)
        .input('ProcessedBy', sql.Int, null)
        .query(`
          INSERT INTO dbo.PaymentTransaction
            (customer_id, patient_id, payment_method_id, amount, currency,
             transaction_type, status, gateway_transaction_id, gateway_response,
             description, processed_by, processed_at)
          OUTPUT INSERTED.*
          VALUES (@CustomerId, @PatientId, @PaymentMethodId, @Amount, @Currency,
                  @TxnType, @Status, @GatewayTxnId, @GatewayResponse,
                  @Description, @ProcessedBy, GETDATE())
        `);

      const txn = result.recordset[0];

      // -- Integration 2: Auto-apply payment to invoice --
      try {
        let targetInvoiceId = invoice_id ? parseInt(invoice_id, 10) : null;

        // If no invoice_id provided, find the oldest unpaid invoice for this patient
        if (!targetInvoiceId) {
          const invoiceLookup = await this.pool.request()
            .input('PidInv', sql.Int, patient_id)
            .input('CidInv', sql.SmallInt, customerId)
            .query(`
              SELECT TOP 1 id, balance_due FROM dbo.Invoice
              WHERE patient_id = @PidInv AND customer_id = @CidInv
                AND balance_due > 0 AND status IN ('sent','viewed','overdue')
              ORDER BY due_date ASC
            `);
          if (invoiceLookup.recordset.length > 0) {
            targetInvoiceId = invoiceLookup.recordset[0].id;
          }
        }

        if (targetInvoiceId) {
          // Link payment to invoice
          await this.pool.request()
            .input('InvId', sql.Int, targetInvoiceId)
            .input('TxnId', sql.Int, txn.id)
            .input('Amt', sql.Decimal(10, 2), amount)
            .query(`
              INSERT INTO dbo.InvoicePayment (invoice_id, transaction_id, amount, payment_method, payment_date)
              VALUES (@InvId, @TxnId, @Amt, 'card', GETDATE())
            `);

          // Update invoice totals
          await this.pool.request()
            .input('InvId2', sql.Int, targetInvoiceId)
            .input('Amt2', sql.Decimal(10, 2), amount)
            .query(`
              UPDATE dbo.Invoice
              SET amount_paid = amount_paid + @Amt2,
                  balance_due = balance_due - @Amt2,
                  status = CASE WHEN balance_due - @Amt2 <= 0 THEN 'paid' ELSE status END,
                  paid_at = CASE WHEN balance_due - @Amt2 <= 0 THEN GETDATE() ELSE paid_at END,
                  updated_at = GETDATE()
              WHERE id = @InvId2
            `);
        }
      } catch (invoiceErr) {
        logger.error('Payments.charge invoice auto-apply error (non-fatal)', invoiceErr);
      }

      res.status(201).json({ data: txn });

      // Fire-and-forget telemetry + audit
      trackEvent(this.pool, { event: 'payment_charged', feature: 'payments', actorId: actor?.user_id, customerId, metadata: { transactionId: txn.id, amount, patientId: patient_id } });
      logFeatureAction(this.pool, { feature: 'payments', action: 'charge', actorId: actor?.user_id, actorEmail: actor?.email, targetId: String(txn.id), targetType: 'PaymentTransaction', details: { amount, patientId: patient_id }, ip: req.ip });
    } catch (err) {
      logger.error('Payments.charge error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  public refund = async (req: Request, res: Response): Promise<void> => {
    try {
      const actor = (req as any).actor as ActorInfo | undefined;
      const customerId = actor?.customer_id;
      const transactionId = parseInt(req.params.transactionId, 10);
      const { amount, reason } = req.body;

      // Fetch original transaction
      const original = await this.pool.request()
        .input('Id', sql.Int, transactionId)
        .input('CustomerId', sql.SmallInt, customerId)
        .query(`
          SELECT * FROM dbo.PaymentTransaction
          WHERE id = @Id AND customer_id = @CustomerId
        `);

      if (!original.recordset.length) {
        res.status(404).json({ message: 'Transaction not found' });
        return;
      }

      const orig = original.recordset[0];
      if (orig.status !== 'completed') {
        res.status(400).json({ message: 'Only completed transactions can be refunded' });
        return;
      }

      const refundAmount = amount || orig.amount;
      if (refundAmount > orig.amount) {
        res.status(400).json({ message: 'Refund amount cannot exceed original charge' });
        return;
      }

      // In production: call gateway refund API
      const gatewayRefundId = this.generateTransactionId();

      // Mark original as refunded
      await this.pool.request()
        .input('Id', sql.Int, transactionId)
        .input('CustomerId', sql.SmallInt, customerId)
        .query(`
          UPDATE dbo.PaymentTransaction
          SET status = 'refunded'
          WHERE id = @Id AND customer_id = @CustomerId
        `);

      // Create refund transaction
      const result = await this.pool.request()
        .input('CustomerId', sql.SmallInt, customerId)
        .input('PatientId', sql.Int, orig.patient_id)
        .input('PaymentMethodId', sql.Int, orig.payment_method_id)
        .input('Amount', sql.Decimal(10, 2), refundAmount)
        .input('Currency', sql.NVarChar(3), orig.currency)
        .input('TxnType', sql.NVarChar(20), 'refund')
        .input('Status', sql.NVarChar(20), 'completed')
        .input('GatewayTxnId', sql.NVarChar(200), gatewayRefundId)
        .input('GatewayResponse', sql.NVarChar(sql.MAX), JSON.stringify({ success: true, refund_id: gatewayRefundId }))
        .input('Description', sql.NVarChar(500), reason || `Refund for transaction #${transactionId}`)
        .query(`
          INSERT INTO dbo.PaymentTransaction
            (customer_id, patient_id, payment_method_id, amount, currency,
             transaction_type, status, gateway_transaction_id, gateway_response,
             description, processed_at)
          OUTPUT INSERTED.*
          VALUES (@CustomerId, @PatientId, @PaymentMethodId, @Amount, @Currency,
                  @TxnType, @Status, @GatewayTxnId, @GatewayResponse,
                  @Description, GETDATE())
        `);

      const refundTxn = result.recordset[0];
      res.status(201).json({ data: refundTxn });

      // Fire-and-forget telemetry + audit
      trackEvent(this.pool, { event: 'payment_refunded', feature: 'payments', actorId: actor?.user_id, customerId, metadata: { refundTransactionId: refundTxn.id, originalTransactionId: transactionId, amount: refundAmount } });
      logFeatureAction(this.pool, { feature: 'payments', action: 'refund', actorId: actor?.user_id, actorEmail: actor?.email, targetId: String(refundTxn.id), targetType: 'PaymentTransaction', details: { originalTransactionId: transactionId, amount: refundAmount, reason }, ip: req.ip });
    } catch (err) {
      logger.error('Payments.refund error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  // =======================================================================
  // TRANSACTIONS - LISTING
  // =======================================================================

  public getTransactions = async (req: Request, res: Response): Promise<void> => {
    try {
      const actor = (req as any).actor as ActorInfo | undefined;
      const customerId = actor?.customer_id;
      const page = parseInt(req.query.page as string, 10) || 1;
      const pageSize = Math.min(parseInt(req.query.pageSize as string, 10) || 25, 100);
      const offset = (page - 1) * pageSize;

      const status = req.query.status as string | undefined;
      const txnType = req.query.type as string | undefined;
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;
      const patientId = req.query.patientId as string | undefined;

      const request = this.pool.request();
      request.input('CustomerId', sql.SmallInt, customerId);
      request.input('Offset', sql.Int, offset);
      request.input('PageSize', sql.Int, pageSize);

      let where = 'WHERE t.customer_id = @CustomerId';
      if (status) {
        request.input('Status', sql.NVarChar(20), status);
        where += ' AND t.status = @Status';
      }
      if (txnType) {
        request.input('TxnType', sql.NVarChar(20), txnType);
        where += ' AND t.transaction_type = @TxnType';
      }
      if (startDate) {
        request.input('StartDate', sql.Date, startDate);
        where += ' AND t.processed_at >= @StartDate';
      }
      if (endDate) {
        request.input('EndDate', sql.Date, endDate);
        where += ' AND t.processed_at < DATEADD(DAY, 1, @EndDate)';
      }
      if (patientId) {
        request.input('PatientId', sql.Int, parseInt(patientId, 10));
        where += ' AND t.patient_id = @PatientId';
      }

      const result = await request.query(`
        SELECT t.*, pm.last_four, pm.card_brand, pm.method_type AS pm_method_type,
               COUNT(*) OVER() AS total_count
        FROM dbo.PaymentTransaction t
        LEFT JOIN dbo.PaymentMethod pm ON pm.id = t.payment_method_id
        ${where}
        ORDER BY t.processed_at DESC
        OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
      `);

      const totalCount = result.recordset.length > 0 ? result.recordset[0].total_count : 0;
      res.json({
        data: result.recordset,
        pagination: { page, pageSize, totalCount, totalPages: Math.ceil(totalCount / pageSize) },
      });
    } catch (err) {
      logger.error('Payments.getTransactions error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  public getTransaction = async (req: Request, res: Response): Promise<void> => {
    try {
      const actor = (req as any).actor as ActorInfo | undefined;
      const customerId = actor?.customer_id;
      const txnId = parseInt(req.params.id, 10);

      const result = await this.pool.request()
        .input('Id', sql.Int, txnId)
        .input('CustomerId', sql.SmallInt, customerId)
        .query(`
          SELECT t.*, pm.last_four, pm.card_brand, pm.method_type AS pm_method_type,
                 pm.cardholder_name
          FROM dbo.PaymentTransaction t
          LEFT JOIN dbo.PaymentMethod pm ON pm.id = t.payment_method_id
          WHERE t.id = @Id AND t.customer_id = @CustomerId
        `);

      if (!result.recordset.length) {
        res.status(404).json({ message: 'Transaction not found' });
        return;
      }
      res.json({ data: result.recordset[0] });
    } catch (err) {
      logger.error('Payments.getTransaction error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  // =======================================================================
  // STATS
  // =======================================================================

  // =======================================================================
  // RECURRING PAYMENTS
  // =======================================================================

  public createRecurring = async (req: Request, res: Response): Promise<void> => {
    try {
      const actor = (req as any).actor as ActorInfo | undefined;
      const customerId = actor?.customer_id;
      const { patient_id, payment_method_id, amount, frequency, next_charge_date, end_date } = req.body;

      if (!patient_id || !payment_method_id || !amount || amount <= 0 || !frequency || !next_charge_date) {
        res.status(400).json({ message: 'patient_id, payment_method_id, amount, frequency, and next_charge_date are required' });
        return;
      }

      if (!['weekly', 'biweekly', 'monthly', 'quarterly'].includes(frequency)) {
        res.status(400).json({ message: 'frequency must be weekly, biweekly, monthly, or quarterly' });
        return;
      }

      const result = await this.pool.request()
        .input('CustomerId', sql.SmallInt, customerId)
        .input('PatientId', sql.Int, patient_id)
        .input('PaymentMethodId', sql.Int, payment_method_id)
        .input('Amount', sql.Decimal(10, 2), amount)
        .input('Frequency', sql.NVarChar(20), frequency)
        .input('NextChargeDate', sql.Date, next_charge_date)
        .input('EndDate', sql.Date, end_date || null)
        .query(`
          INSERT INTO dbo.RecurringPayment
            (customer_id, patient_id, payment_method_id, amount, frequency, next_charge_date, end_date)
          OUTPUT INSERTED.*
          VALUES (@CustomerId, @PatientId, @PaymentMethodId, @Amount, @Frequency, @NextChargeDate, @EndDate)
        `);

      res.status(201).json({ data: result.recordset[0] });
    } catch (err) {
      logger.error('Payments.createRecurring error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  public getRecurring = async (req: Request, res: Response): Promise<void> => {
    try {
      const actor = (req as any).actor as ActorInfo | undefined;
      const customerId = actor?.customer_id;

      const result = await this.pool.request()
        .input('CustomerId', sql.SmallInt, customerId)
        .query(`
          SELECT r.*, pm.last_four, pm.card_brand, pm.cardholder_name
          FROM dbo.RecurringPayment r
          LEFT JOIN dbo.PaymentMethod pm ON pm.id = r.payment_method_id
          WHERE r.customer_id = @CustomerId
          ORDER BY r.created_at DESC
        `);

      res.json({ data: result.recordset });
    } catch (err) {
      logger.error('Payments.getRecurring error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  public updateRecurring = async (req: Request, res: Response): Promise<void> => {
    try {
      const actor = (req as any).actor as ActorInfo | undefined;
      const customerId = actor?.customer_id;
      const id = parseInt(req.params.id, 10);
      const updates = req.body as Record<string, unknown>;

      const ALLOWED_FIELDS = ['amount', 'frequency', 'next_charge_date', 'end_date', 'status'];
      const sets: string[] = [];
      const request = this.pool.request();
      request.input('Id', sql.Int, id);
      request.input('CustomerId', sql.SmallInt, customerId);

      // Only allow whitelisted field names
      for (const [key, value] of Object.entries(updates)) {
        if (ALLOWED_FIELDS.includes(key)) {
          sets.push(`${key} = @${key}`);
          request.input(key, value);
        }
      }

      if (!sets.length) { res.status(400).json({ message: 'No fields to update' }); return; }

      const result = await request.query(`
        UPDATE dbo.RecurringPayment
        SET ${sets.join(', ')}
        OUTPUT INSERTED.*
        WHERE id = @Id AND customer_id = @CustomerId AND status = 'active'
      `);

      if (!result.recordset.length) {
        res.status(404).json({ message: 'Active recurring payment not found' });
        return;
      }
      res.json({ data: result.recordset[0] });
    } catch (err) {
      logger.error('Payments.updateRecurring error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  public cancelRecurring = async (req: Request, res: Response): Promise<void> => {
    try {
      const actor = (req as any).actor as ActorInfo | undefined;
      const customerId = actor?.customer_id;
      const id = parseInt(req.params.id, 10);

      const result = await this.pool.request()
        .input('Id', sql.Int, id)
        .input('CustomerId', sql.SmallInt, customerId)
        .query(`
          UPDATE dbo.RecurringPayment
          SET status = 'cancelled'
          OUTPUT INSERTED.*
          WHERE id = @Id AND customer_id = @CustomerId AND status IN ('active', 'paused')
        `);

      if (!result.recordset.length) {
        res.status(404).json({ message: 'Recurring payment not found or already cancelled' });
        return;
      }
      res.json({ data: result.recordset[0] });
    } catch (err) {
      logger.error('Payments.cancelRecurring error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  public pauseRecurring = async (req: Request, res: Response): Promise<void> => {
    try {
      const actor = (req as any).actor as ActorInfo | undefined;
      const customerId = actor?.customer_id;
      const id = parseInt(req.params.id, 10);

      const result = await this.pool.request()
        .input('Id', sql.Int, id)
        .input('CustomerId', sql.SmallInt, customerId)
        .query(`
          UPDATE dbo.RecurringPayment SET status = 'paused'
          OUTPUT INSERTED.*
          WHERE id = @Id AND customer_id = @CustomerId AND status = 'active'
        `);

      if (!result.recordset.length) {
        res.status(404).json({ message: 'Active recurring payment not found' });
        return;
      }
      res.json({ data: result.recordset[0] });
    } catch (err) {
      logger.error('Payments.pauseRecurring error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  public resumeRecurring = async (req: Request, res: Response): Promise<void> => {
    try {
      const actor = (req as any).actor as ActorInfo | undefined;
      const customerId = actor?.customer_id;
      const id = parseInt(req.params.id, 10);

      const result = await this.pool.request()
        .input('Id', sql.Int, id)
        .input('CustomerId', sql.SmallInt, customerId)
        .query(`
          UPDATE dbo.RecurringPayment SET status = 'active'
          OUTPUT INSERTED.*
          WHERE id = @Id AND customer_id = @CustomerId AND status = 'paused'
        `);

      if (!result.recordset.length) {
        res.status(404).json({ message: 'Paused recurring payment not found' });
        return;
      }
      res.json({ data: result.recordset[0] });
    } catch (err) {
      logger.error('Payments.resumeRecurring error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };

  // =======================================================================
  // STATS
  // =======================================================================

  public getStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const actor = (req as any).actor as ActorInfo | undefined;
      const customerId = actor?.customer_id;

      const result = await this.pool.request()
        .input('CustomerId', sql.SmallInt, customerId)
        .query(`
          SELECT
            ISNULL(SUM(CASE WHEN transaction_type = 'charge' AND status = 'completed' THEN amount END), 0) AS total_collected,
            ISNULL(AVG(CASE WHEN transaction_type = 'charge' AND status = 'completed' THEN amount END), 0) AS avg_transaction,
            ISNULL(SUM(CASE WHEN transaction_type = 'refund' AND status = 'completed' THEN amount END), 0) AS total_refunded,
            COUNT(CASE WHEN transaction_type = 'charge' AND status = 'completed' THEN 1 END) AS charge_count,
            COUNT(CASE WHEN transaction_type = 'refund' AND status = 'completed' THEN 1 END) AS refund_count,
            COUNT(CASE WHEN status = 'failed' THEN 1 END) AS failed_count,
            ISNULL(SUM(CASE WHEN transaction_type = 'charge' AND status = 'completed'
              AND processed_at >= DATEADD(MONTH, -1, GETDATE()) THEN amount END), 0) AS collected_this_month
          FROM dbo.PaymentTransaction
          WHERE customer_id = @CustomerId
        `);

      const row = result.recordset[0];
      const refundRate = row.charge_count > 0 ? (row.refund_count / row.charge_count) : 0;

      res.json({
        data: {
          total_collected: row.total_collected,
          avg_transaction: row.avg_transaction,
          total_refunded: row.total_refunded,
          charge_count: row.charge_count,
          refund_count: row.refund_count,
          failed_count: row.failed_count,
          refund_rate: Math.round(refundRate * 10000) / 100,
          collected_this_month: row.collected_this_month,
        },
      });
    } catch (err) {
      logger.error('Payments.getStats error', err);
      res.status(500).json({ message: 'Internal server error' });
    }
  };
}
