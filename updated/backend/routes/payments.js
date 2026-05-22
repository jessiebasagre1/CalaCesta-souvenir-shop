// ============================================================
// backend/routes/payments.js
// PayMongo GCash / Maya checkout session creator
// ------------------------------------------------------------
// npm install axios  (if not already installed)
// ============================================================

const express = require('express');
const router  = express.Router();
const axios   = require('axios');
const Order   = require('../models/Order');
const authMiddleware = require('../middleware/auth');

// Your PayMongo SECRET key — store in .env, never hardcode!
// Sign up at https://dashboard.paymongo.com
const PAYMONGO_SECRET = process.env.PAYMONGO_SECRET_KEY;
const BASE64_SECRET   = Buffer.from(PAYMONGO_SECRET + ':').toString('base64');

// ── POST /api/payments/create-checkout ──────────────────────
// Creates a PayMongo Checkout Session and returns the redirect URL.
// Front-end redirects the user to that URL to complete GCash/Maya payment.
router.post('/create-checkout', /* authMiddleware (optional), */ async (req, res) => {
  try {
    const { items, shipping, method, totalAmount, discountApplied } = req.body;

    if (!items?.length)         return res.status(400).json({ message: 'Cart is empty.' });
    if (!['gcash','maya'].includes(method))
                                return res.status(400).json({ message: 'Unsupported payment method.' });
    if (!totalAmount || totalAmount < 10000) // PayMongo minimum: ₱100 = 10000 centavos
                                return res.status(400).json({ message: 'Minimum order amount is ₱100.' });

    // Map items to PayMongo line_items format
    const lineItems = items.map(item => ({
      currency:     'PHP',
      amount:       Math.round((item.price || 0) * 100),   // centavos
      description:  item.name || 'Product',
      name:         item.name || 'Product',
      quantity:     item.quantity || 1,
    }));

    // Add shipping as a line item if applicable
    const subtotal = items.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);
    if (subtotal < 1000) {
      lineItems.push({
        currency:    'PHP',
        amount:      10000,   // ₱100 shipping in centavos
        description: 'Shipping fee',
        name:        'Shipping',
        quantity:    1,
      });
    }

    // Map method → PayMongo payment method type
    const pmMethod = method === 'gcash' ? 'gcash' : 'paymaya';

    // Create a PayMongo Checkout Session
    // Docs: https://developers.paymongo.com/reference/checkout-session-resource
    const response = await axios.post(
      'https://api.paymongo.com/v1/checkout_sessions',
      {
        data: {
          attributes: {
            billing: {
              name:  `${shipping.firstName} ${shipping.lastName}`,
              email: shipping.email,
              phone: shipping.phone,
              address: {
                line1:       shipping.address,
                city:        shipping.city,
                state:       shipping.province,
                postal_code: shipping.zip,
                country:     'PH',
              },
            },
            send_email_receipt: true,
            show_description:   true,
            show_line_items:    true,
            line_items:         lineItems,
            payment_method_types: [pmMethod],
            description: `Order from YourStore`,
            // Redirect URLs — update to your real domain
            success_url: `${process.env.APP_URL || 'http://localhost:3000'}/orders.html?status=success`,
            cancel_url:  `${process.env.APP_URL || 'http://localhost:3000'}/checkout.html?status=cancelled`,
          },
        },
      },
      {
        headers: {
          Authorization:  `Basic ${BASE64_SECRET}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const session    = response.data.data;
    const checkoutUrl = session.attributes.checkout_url;
    const sessionId   = session.id;

    // Save a pending order in the DB so we can match it on webhook
    const order = await Order.create({
      items,
      shippingAddress: shipping,
      paymentMethod:   method,
      totalAmount:     totalAmount / 100,   // back to pesos for storage
      discountApplied: discountApplied || 0,
      status:          'pending',
      paymentStatus:   'pending',
      paymongoSessionId: sessionId,
      // userId: req.user?._id,  // uncomment if using auth middleware
    });

    res.json({ checkoutUrl, orderId: order._id, sessionId });
  } catch (err) {
    console.error('[PayMongo checkout error]', err?.response?.data || err.message);
    res.status(500).json({ message: err?.response?.data?.errors?.[0]?.detail || 'Payment setup failed.' });
  }
});


// ── POST /api/payments/webhook ───────────────────────────────
// PayMongo sends payment events here. MUST be publicly accessible.
// Set this URL in your PayMongo Dashboard → Webhooks:
//   https://yourdomain.com/api/payments/webhook
//
// Register your webhook:
//   POST https://api.paymongo.com/v1/webhooks
//   body: { data: { attributes: { url: "...", events: ["payment.paid","checkout_session.payment.paid"] } } }
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const rawBody = req.body.toString('utf8');
    const event   = JSON.parse(rawBody);

    // Verify webhook signature
    // Docs: https://developers.paymongo.com/docs/webhook-signature-verification
    const sigHeader  = req.headers['paymongo-signature'];
    const whSecretB64 = process.env.PAYMONGO_WEBHOOK_SECRET;
    if (whSecretB64 && sigHeader) {
      const crypto = require('crypto');
      const [tPart, v1Part] = sigHeader.split(',');
      const t  = tPart?.split('=')?.[1];
      const v1 = v1Part?.split('=')?.[1];
      const whSecret = Buffer.from(whSecretB64, 'base64').toString('utf8');
      const computed = crypto.createHmac('sha256', whSecret).update(`${t}.${rawBody}`).digest('hex');
      if (computed !== v1) {
        console.warn('[Webhook] Invalid signature');
        return res.status(400).json({ message: 'Invalid signature' });
      }
    }

    const eventType = event.data?.attributes?.type;
    const sessionId = event.data?.attributes?.data?.attributes?.checkout_session_id
                   || event.data?.attributes?.data?.id;

    if (['checkout_session.payment.paid', 'payment.paid'].includes(eventType)) {
      // Mark order as paid
      await Order.findOneAndUpdate(
        { paymongoSessionId: sessionId },
        { paymentStatus: 'paid', status: 'processing' }
      );
      console.log(`[Webhook] Order paid for session ${sessionId}`);
    }

    if (eventType === 'checkout_session.payment.expired') {
      await Order.findOneAndUpdate(
        { paymongoSessionId: sessionId },
        { paymentStatus: 'expired', status: 'cancelled' }
      );
    }

    res.json({ received: true });
  } catch (err) {
    console.error('[Webhook error]', err.message);
    res.status(400).json({ message: 'Webhook error' });
  }
});


// ── GET /api/payments/verify/:sessionId ─────────────────────
// Optional: Front-end can poll this to confirm payment after redirect
router.get('/verify/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const response = await axios.get(
      `https://api.paymongo.com/v1/checkout_sessions/${sessionId}`,
      { headers: { Authorization: `Basic ${BASE64_SECRET}` } }
    );
    const attrs = response.data.data.attributes;
    res.json({
      status:        attrs.status,            // 'active' | 'expired'
      paymentStatus: attrs.payment_intent?.attributes?.status || 'unknown',
    });
  } catch (err) {
    res.status(500).json({ message: 'Could not verify payment.' });
  }
});

module.exports = router;