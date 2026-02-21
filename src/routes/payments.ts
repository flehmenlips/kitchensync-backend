import { Hono } from 'hono';
import Stripe from 'stripe';
import { supabase } from '../supabase';
import type { AuthUser } from '../middleware/auth';

type Env = { Variables: { user: AuthUser } };
export const paymentsRouter = new Hono<Env>();

let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
    _stripe = new Stripe(key, { apiVersion: '2024-12-18.acacia' as any });
  }
  return _stripe;
}

// Create a payment intent for an order
paymentsRouter.post('/create-payment-intent', async (c) => {
  const user = c.get('user');
  const { amount, currency = 'usd', businessId, orderId, metadata } = await c.req.json();

    if (!amount || amount <= 0) {
      return c.json({ error: { message: 'Invalid amount', code: 'INVALID_AMOUNT' } }, 400);
    }

    try {
      const stripe = getStripe();
      let stripeCustomerId: string | undefined;

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('stripe_customer_id')
        .eq('user_id', user.id)
        .single();

      if (profile?.stripe_customer_id) {
        stripeCustomerId = profile.stripe_customer_id;
      } else {
        const { data: authUser } = await supabase.auth.admin.getUserById(user.id);
        const customer = await stripe.customers.create({
          email: authUser?.user?.email,
          metadata: { supabase_user_id: user.id },
        });
        stripeCustomerId = customer.id;

        await supabase
          .from('user_profiles')
          .update({ stripe_customer_id: customer.id })
          .eq('user_id', user.id);
      }

      const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency,
      customer: stripeCustomerId,
      metadata: {
        user_id: user.id,
        business_id: businessId || '',
        order_id: orderId || '',
        ...metadata,
      },
    });

    return c.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error('Error creating payment intent:', error);
    return c.json({ error: { message: 'Failed to create payment intent', code: 'STRIPE_ERROR' } }, 500);
  }
});

// Create a Stripe Connect account for a business
paymentsRouter.post('/connect/create-account', async (c) => {
  const user = c.get('user');
  const { businessId } = await c.req.json();

  if (!businessId) {
    return c.json({ error: { message: 'Business ID required', code: 'MISSING_BUSINESS_ID' } }, 400);
  }

  try {
    const stripe = getStripe();
    const { data: business } = await supabase
      .from('business_accounts')
      .select('id, business_name, email, owner_user_id, stripe_account_id')
      .eq('id', businessId)
      .single();

    if (!business || business.owner_user_id !== user.id) {
      return c.json({ error: { message: 'Not authorized', code: 'UNAUTHORIZED' } }, 403);
    }

    if (business.stripe_account_id) {
      const accountLink = await stripe.accountLinks.create({
        account: business.stripe_account_id,
        refresh_url: `${process.env.FRONTEND_URL || 'https://www.cookbook.farm'}/business/settings?stripe=refresh`,
        return_url: `${process.env.FRONTEND_URL || 'https://www.cookbook.farm'}/business/settings?stripe=success`,
        type: 'account_onboarding',
      });
      return c.json({ url: accountLink.url, accountId: business.stripe_account_id });
    }

    const account = await stripe.accounts.create({
      type: 'standard',
      business_type: 'company',
      company: { name: business.business_name },
      email: business.email || undefined,
      metadata: {
        business_id: businessId,
        owner_user_id: user.id,
      },
    });

    await supabase
      .from('business_accounts')
      .update({ stripe_account_id: account.id })
      .eq('id', businessId);

    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${process.env.FRONTEND_URL || 'https://www.cookbook.farm'}/business/settings?stripe=refresh`,
      return_url: `${process.env.FRONTEND_URL || 'https://www.cookbook.farm'}/business/settings?stripe=success`,
      type: 'account_onboarding',
    });

    return c.json({ url: accountLink.url, accountId: account.id });
  } catch (error) {
    console.error('Error creating connect account:', error);
    return c.json({ error: { message: 'Failed to create Stripe account', code: 'STRIPE_ERROR' } }, 500);
  }
});

// Get Stripe Connect account status
paymentsRouter.get('/connect/status/:businessId', async (c) => {
  const businessId = c.req.param('businessId');

  try {
    const stripe = getStripe();
    const { data: business } = await supabase
      .from('business_accounts')
      .select('stripe_account_id')
      .eq('id', businessId)
      .single();

    if (!business?.stripe_account_id) {
      return c.json({ connected: false, accountId: null });
    }

    const account = await stripe.accounts.retrieve(business.stripe_account_id);

    return c.json({
      connected: true,
      accountId: account.id,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
    });
  } catch (error) {
    console.error('Error checking connect status:', error);
    return c.json({ connected: false, accountId: null });
  }
});

// Get customer's saved payment methods
paymentsRouter.get('/payment-methods', async (c) => {
  const user = c.get('user');

  try {
    const stripe = getStripe();
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .single();

    if (!profile?.stripe_customer_id) {
      return c.json({ paymentMethods: [] });
    }

    const methods = await stripe.paymentMethods.list({
      customer: profile.stripe_customer_id,
      type: 'card',
    });

    return c.json({
      paymentMethods: methods.data.map(m => ({
        id: m.id,
        brand: m.card?.brand,
        last4: m.card?.last4,
        expMonth: m.card?.exp_month,
        expYear: m.card?.exp_year,
      })),
    });
  } catch (error) {
    console.error('Error fetching payment methods:', error);
    return c.json({ paymentMethods: [] });
  }
});
