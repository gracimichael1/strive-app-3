const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

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

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      // TODO: Write subscription to database
      console.log('[Strive] Checkout completed:', {
        sessionId: session.id,
        customerId: session.customer,
        subscriptionId: session.subscription,
        customerEmail: session.customer_details?.email,
      });
      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object;
      // TODO: Update subscription status in database
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
      // TODO: Mark subscription as cancelled in database
      console.log('[Strive] Subscription deleted:', {
        subscriptionId: subscription.id,
        customerId: subscription.customer,
        status: subscription.status,
      });
      break;
    }

    default:
      console.log(`[Strive] Unhandled event type: ${event.type}`);
  }

  return res.status(200).json({ received: true });
};
