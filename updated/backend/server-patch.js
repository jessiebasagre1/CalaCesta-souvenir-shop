// ══════════════════════════════════════════════════════
// server.js — ADD these 3 lines to your existing server.js
// ══════════════════════════════════════════════════════

// 1. Import the new route files (add near your other requires):
const shippingRoutes = require('./routes/shipping');
const taxRoutes      = require('./routes/tax');
const voucherRoutes  = require('./routes/vouchers');

// 2. Register the routes (add after your existing app.use() route lines):
app.use('/api/shipping', shippingRoutes);
app.use('/api/tax',      taxRoutes);
app.use('/api/vouchers', voucherRoutes);

// ══════════════════════════════════════════════════════
// Your complete server.js will look like this:
// ══════════════════════════════════════════════════════

/*
require('dotenv').config();
const express = require('express');
const path    = require('path');
const cors    = require('cors');

const connectDB = require('./config/db');

const authRoutes          = require('./routes/auth');
const productRoutes       = require('./routes/products');
const reviewRoutes        = require('./routes/reviews');
const cartRoutes          = require('./routes/cart');
const customerRoutes      = require('./routes/customer');
const businessRoutes      = require('./routes/business');
const shopRoutes          = require('./routes/shop');
const uploadRoutes        = require('./routes/upload');
const storeSettingsRoutes = require('./routes/storeSettings');
const paymentRoutes       = require('./routes/payments');

// ── NEW ──────────────────────────────────────────────
const shippingRoutes = require('./routes/shipping');
const taxRoutes      = require('./routes/tax');
const voucherRoutes  = require('./routes/vouchers');
// ────────────────────────────────────────────────────

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

app.use('/api/auth',           authRoutes);
app.use('/api/products',       productRoutes);
app.use('/api/reviews',        reviewRoutes);
app.use('/api/cart',           cartRoutes);
app.use('/api/customer',       customerRoutes);
app.use('/api/business',       businessRoutes);
app.use('/api/upload',         uploadRoutes);
app.use('/api/store-settings', storeSettingsRoutes);
app.use('/api/payments',       paymentRoutes);

// ── NEW ──────────────────────────────────────────────
app.use('/api/shipping', shippingRoutes);
app.use('/api/tax',      taxRoutes);
app.use('/api/vouchers', voucherRoutes);
// ────────────────────────────────────────────────────

app.use('/api', shopRoutes);

app.get('/api/test', async (req, res) => {
  const { default: mongoose } = await import('mongoose');
  try {
    const User = require('./models/User');
    const count = await User.countDocuments();
    res.json({ message: 'Server + MongoDB working!', users: count, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🚀 Server: http://localhost:${PORT}`);
  });
});
*/
