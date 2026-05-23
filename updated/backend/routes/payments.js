const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const Order   = require('../models/Order');

const PAYMONGO_AUTH = Buffer.from((process.env.PAYMONGO_SECRET_KEY || '') + ':').toString('base64');
const PAYMONGO_URL  = 'https://api.paymongo.com/v1';

function verifyToken(req) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) throw Object.assign(new Error('No token'), { status: 401 });
  return jwt.verify(token, process.env.JWT_SECRET);
}

// POST /api/payments/checkout
router.post('/checkout', async (req, res) => {
  try {
    const decoded = verifyToken(req);
    const { orderId } = req.body;

    if (!orderId) return res.status(400).json({ message: 'orderId is required.' });

    const order = await Order.findOne({ _id: orderId, customerId: decoded.userId });
    if (!order) return res.status(404).json({ message: 'Order not found.' });

    const lineItems = order.items.map(item => ({
      currency:    'PHP',
      amount:      Math.round((item.price || 0) * 100),
      description: item.productName || 'Product',
      name:        item.productName || 'Product',
      quantity:    item.quantity || 1,
    }));

    const successUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-success.html?order=${orderId}`;
    const cancelUrl  = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment-cancel.html?order=${orderId}`;

    const response = await fetch(`${PAYMONGO_URL}/checkout_sessions`, {
      method:  'POST',
      headers: {
        Authorization:  `Basic ${PAYMONGO_AUTH}`,
        'Content-Type': 'application/json',
        Accept:         'application/json',
      },
      body: JSON.stringify({
        data: {
          attributes: {
            send_email_receipt:   true,
            show_description:     true,
            show_line_items:      true,
            line_items:           lineItems,
            payment_method_types: ['gcash'],
            description:          `Cala-Cesta Order #${order.orderNumber || order._id.toString().slice(-6).toUpperCase()}`,
            success_url:          successUrl,
            cancel_url:           cancelUrl,
          },
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[PayMongo error]', JSON.stringify(data));
      return res.status(500).json({ message: data?.errors?.[0]?.detail || 'PayMongo error.' });
    }

    const session     = data.data;
    const checkoutUrl = session.attributes.checkout_url;

    order.paymongoSessionId = session.id;
    await order.save();

    res.json({ checkoutUrl, sessionId: session.id });
  } catch (err) {
    console.error('[checkout error]', err.message);
    res.status(err.status || 500).json({ message: 'Could not create payment session.' });
  }
});

// POST /api/payments/verify
router.post('/verify', async (req, res) => {
  try {
    const decoded = verifyToken(req);
    const { orderId } = req.body;

    const order = await Order.findOne({ _id: orderId, customerId: decoded.userId });
    if (!order) return res.status(404).json({ message: 'Order not found.' });
    if (!order.paymongoSessionId) return res.status(400).json({ message: 'No payment session found.' });

    const response = await fetch(`${PAYMONGO_URL}/checkout_sessions/${order.paymongoSessionId}`, {
      headers: {
        Authorization: `Basic ${PAYMONGO_AUTH}`,
        Accept:        'application/json',
      },
    });

    const data = await response.json();
    if (!response.ok) return res.status(500).json({ message: 'Could not verify payment.' });

    const payStatus = data.data?.attributes?.payment_intent?.attributes?.status;

    if (payStatus === 'succeeded') {
      order.paymentStatus = 'paid';
      order.status        = 'confirmed';
      order.paidAt        = new Date();
      await order.save();
      return res.json({ paid: true, message: 'Payment confirmed!' });
    }

    res.json({ paid: false, message: 'Payment not yet completed.' });
  } catch (err) {
    console.error('[verify error]', err.message);
    res.status(500).json({ message: 'Could not verify payment.' });
  }
});

module.exports = router;