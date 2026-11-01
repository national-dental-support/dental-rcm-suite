/**
 * Stripe payment processing client.
 *
 * Handles: card payments, refunds, recurring billing for payment plans.
 * Includes mock mode (MOCK_INTEGRATIONS=true) for local development.
 */

import logger from '../../utils/logger';

const MOCK_MODE = process.env.MOCK_INTEGRATIONS === 'true';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? '';
const STRIPE_API = 'https://api.stripe.com/v1';

export interface PaymentIntentResult {
  success: boolean;
  intentId?: string;
  chargeId?: string;
  status: 'succeeded' | 'pending' | 'failed' | 'requires_action';
  clientSecret?: string;
  receiptUrl?: string;
  cardBrand?: string;
  cardLast4?: string;
  errorMessage?: string;
}

export interface RefundResult {
  success: boolean;
  refundId?: string;
  amount: number;
  status: 'succeeded' | 'pending' | 'failed';
  errorMessage?: string;
}

export class StripeClient {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? STRIPE_SECRET_KEY;
  }

  /**
   * Create a PaymentIntent for a one-time card payment.
   */
  async createPaymentIntent(
    amountCents: number,
    currency: string = 'usd',
    metadata?: Record<string, string>,
  ): Promise<PaymentIntentResult> {
    if (MOCK_MODE) return this.mockPaymentIntent(amountCents, metadata);

    try {
      const body = new URLSearchParams({
        amount: String(amountCents),
        currency,
        'automatic_payment_methods[enabled]': 'true',
      });
      if (metadata) {
        for (const [k, v] of Object.entries(metadata)) {
          body.set(`metadata[${k}]`, v);
        }
      }

      const resp = await fetch(`${STRIPE_API}/payment_intents`, {
        method: 'POST',
        headers: this.headers(),
        body: body.toString(),
      });
      const data = await resp.json();

      if (!resp.ok) {
        return {
          success: false, status: 'failed',
          errorMessage: data.error?.message ?? 'Payment failed',
        };
      }

      return {
        success: data.status === 'succeeded',
        intentId: data.id,
        chargeId: data.latest_charge,
        status: data.status === 'succeeded' ? 'succeeded' : 'pending',
        clientSecret: data.client_secret,
        receiptUrl: data.charges?.data?.[0]?.receipt_url,
        cardBrand: data.charges?.data?.[0]?.payment_method_details?.card?.brand,
        cardLast4: data.charges?.data?.[0]?.payment_method_details?.card?.last4,
      };
    } catch (err: any) {
      logger.error('Stripe PaymentIntent failed:', err);
      return { success: false, status: 'failed', errorMessage: err.message };
    }
  }

  /**
   * Process a refund for a previous charge.
   */
  async refund(chargeId: string, amountCents?: number): Promise<RefundResult> {
    if (MOCK_MODE) return this.mockRefund(chargeId, amountCents);

    try {
      const body = new URLSearchParams({ charge: chargeId });
      if (amountCents) body.set('amount', String(amountCents));

      const resp = await fetch(`${STRIPE_API}/refunds`, {
        method: 'POST',
        headers: this.headers(),
        body: body.toString(),
      });
      const data = await resp.json();

      return {
        success: data.status === 'succeeded',
        refundId: data.id,
        amount: (data.amount ?? amountCents ?? 0) / 100,
        status: data.status ?? 'failed',
        errorMessage: data.error?.message,
      };
    } catch (err: any) {
      return { success: false, refundId: undefined, amount: 0, status: 'failed', errorMessage: err.message };
    }
  }

  /**
   * Create a Stripe Customer for recurring billing.
   */
  async createCustomer(
    email: string,
    name: string,
    metadata?: Record<string, string>,
  ): Promise<{ customerId?: string; error?: string }> {
    if (MOCK_MODE) {
      return { customerId: `cus_mock_${Date.now()}` };
    }

    const body = new URLSearchParams({ email, name });
    if (metadata) {
      for (const [k, v] of Object.entries(metadata)) body.set(`metadata[${k}]`, v);
    }

    const resp = await fetch(`${STRIPE_API}/customers`, {
      method: 'POST',
      headers: this.headers(),
      body: body.toString(),
    });
    const data = await resp.json();
    if (!resp.ok) return { error: data.error?.message };
    return { customerId: data.id };
  }

  /**
   * Create a SetupIntent for saving a card for future recurring charges.
   */
  async createSetupIntent(
    stripeCustomerId: string,
  ): Promise<{ clientSecret?: string; setupIntentId?: string; error?: string }> {
    if (MOCK_MODE) {
      return { clientSecret: `seti_mock_secret_${Date.now()}`, setupIntentId: `seti_mock_${Date.now()}` };
    }

    const body = new URLSearchParams({
      customer: stripeCustomerId,
      'automatic_payment_methods[enabled]': 'true',
    });

    const resp = await fetch(`${STRIPE_API}/setup_intents`, {
      method: 'POST',
      headers: this.headers(),
      body: body.toString(),
    });
    const data = await resp.json();
    if (!resp.ok) return { error: data.error?.message };
    return { clientSecret: data.client_secret, setupIntentId: data.id };
  }

  /**
   * Charge a saved payment method (for recurring payment plans).
   */
  async chargePaymentMethod(
    stripeCustomerId: string,
    paymentMethodId: string,
    amountCents: number,
    currency: string = 'usd',
  ): Promise<PaymentIntentResult> {
    if (MOCK_MODE) return this.mockPaymentIntent(amountCents);

    try {
      const body = new URLSearchParams({
        amount: String(amountCents),
        currency,
        customer: stripeCustomerId,
        payment_method: paymentMethodId,
        off_session: 'true',
        confirm: 'true',
      });

      const resp = await fetch(`${STRIPE_API}/payment_intents`, {
        method: 'POST',
        headers: this.headers(),
        body: body.toString(),
      });
      const data = await resp.json();

      return {
        success: data.status === 'succeeded',
        intentId: data.id,
        chargeId: data.latest_charge,
        status: data.status === 'succeeded' ? 'succeeded' : 'failed',
        errorMessage: data.error?.message,
      };
    } catch (err: any) {
      return { success: false, status: 'failed', errorMessage: err.message };
    }
  }

  // -- Mock Implementations --------------------------------------------------

  private mockPaymentIntent(amountCents: number, metadata?: Record<string, string>): PaymentIntentResult {
    const id = `pi_mock_${Date.now()}`;
    logger.info(`[MOCK] Stripe: PaymentIntent ${id} for $${(amountCents / 100).toFixed(2)}`);
    return {
      success: true,
      intentId: id,
      chargeId: `ch_mock_${Date.now()}`,
      status: 'succeeded',
      clientSecret: `${id}_secret_mock`,
      receiptUrl: `https://receipt.stripe.com/mock/${id}`,
      cardBrand: 'visa',
      cardLast4: '4242',
    };
  }

  private mockRefund(chargeId: string, amountCents?: number): RefundResult {
    logger.info(`[MOCK] Stripe: Refund for ${chargeId}`);
    return {
      success: true,
      refundId: `re_mock_${Date.now()}`,
      amount: (amountCents ?? 0) / 100,
      status: 'succeeded',
    };
  }

  private headers(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    };
  }
}
