const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { kv } = require('@vercel/kv');

// Vercel serverless: disable body parsing so we can verify the raw signature
module.exports.config = {
  api: {
    bodyParser: false,
  },
};

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ error: 'Webhook is not configured' });
  }

  const sig = req.headers['stripe-signature'];
  if (!sig) {
    return res.status(400).json({ error: 'Missing stripe-signature header' });
  }

  let event;

  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Idempotency check — skip already-processed events
  const eventId = event.id;
  try {
    const alreadyProcessed = await kv.get(`event:${eventId}`);
    if (alreadyProcessed) return res.json({ received: true });
  } catch (kvErr) {
    console.warn('[webhook] KV idempotency check failed, processing anyway:', kvErr.message);
  }

  // Safe KV JSON parser — handles both string and pre-parsed objects
  function safeParseKV(val) {
    if (!val) return {};
    if (typeof val === 'object') return val;
    try { return JSON.parse(val); } catch { return {}; }
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const customerEmail = session.customer_details?.email || session.customer_email;
        const subscriptionId = session.subscription;
        const customerId = session.customer;
        const tier = session.metadata?.tier || 'competitive';

        if (customerEmail) {
          await kv.set(`sub:${customerEmail}`, JSON.stringify({
            tier,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            status: 'active',
            current_period_end: null,
            updated_at: new Date().toISOString()
          }));
        }

        console.log('[Strive] Checkout completed:', {
          sessionId: session.id,
          customerId,
          subscriptionId,
          customerEmail,
          tier,
        });
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const email = subscription.metadata?.email;
        if (email) {
          const existing = await kv.get(`sub:${email}`);
          const record = safeParseKV(existing);
          await kv.set(`sub:${email}`, JSON.stringify({
            ...record,
            status: subscription.status,
            current_period_end: subscription.current_period_end,
            updated_at: new Date().toISOString()
          }));
        }
        console.log('[Strive] Subscription updated:', {
          subscriptionId: subscription.id,
          customerId: subscription.customer,
          status: subscription.status,
          currentPeriodEnd: subscription.current_period_end,
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const email = subscription.metadata?.email;
        if (email) {
          const existing = await kv.get(`sub:${email}`);
          const record = safeParseKV(existing);
          await kv.set(`sub:${email}`, JSON.stringify({
            ...record,
            tier: 'free',
            status: 'canceled',
            updated_at: new Date().toISOString()
          }));
        }
        console.log('[Strive] Subscription deleted:', {
          subscriptionId: subscription.id,
          customerId: subscription.customer,
          status: subscription.status,
        });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const email = invoice.customer_email;
        if (email) {
          const existing = await kv.get(`sub:${email}`);
          const record = safeParseKV(existing);
          await kv.set(`sub:${email}`, JSON.stringify({
            ...record,
            status: 'past_due',
            updated_at: new Date().toISOString()
          }));
        }
        console.error('STRIVE payment failed:', email, new Date().toISOString());
        break;
      }

      default:
        console.log(`[Strive] Unhandled event type: ${event.type}`);
    }

    // Mark event processed (7-day TTL for idempotency)
    await kv.set(`event:${eventId}`, '1', { ex: 86400 * 7 });
  } catch (err) {
    console.error('[webhook] Error processing event:', event.type, err.message);
    // Still return 200 to prevent Stripe from retrying — the event was received and authenticated
  }

  return res.status(200).json({ received: true });
};
