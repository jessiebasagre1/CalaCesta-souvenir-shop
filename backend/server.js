require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');

const connectDB = require('./config/db');

const authRoutes     = require('./routes/auth');
const productRoutes  = require('./routes/products');
const reviewRoutes   = require('./routes/reviews');
const cartRoutes     = require('./routes/cart');
const customerRoutes = require('./routes/customer');
const businessRoutes = require('./routes/business');
const shopRoutes     = require('./routes/shop');
const uploadRoutes   = require('./routes/upload');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',     authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/reviews',  reviewRoutes);
app.use('/api/cart',     cartRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/business', businessRoutes);
app.use('/api/upload',   uploadRoutes);
app.use('/api',          shopRoutes);   // /api/featured + /api/checkout

// Health check
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

// ── SPA catch-all ─────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🚀 Server: http://localhost:${PORT}`);
    console.log(`📱 Health: http://localhost:${PORT}/api/test`);
    console.log(`📊 Analytics: http://localhost:${PORT}/api/business/analytics`);
  });
});
