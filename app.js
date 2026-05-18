const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();

require('dotenv').config();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = await User.findById(decoded.userId);
    if (!req.user) return res.status(404).json({ message: 'User not found' });
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// ── SCHEMAS ──────────────────────────────────────────────────────────────────

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  userType: { type: String, enum: ['customer', 'business'], required: true },
  businessName: String,
  phone: String,
  address: String
}, { timestamps: true });

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};
const User = mongoose.model('User', userSchema);

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  price: { type: Number, required: true },
  stock: { type: Number, default: 0 },
  image: String,
  shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  category: String,
  status: { type: String, enum: ['active', 'inactive', 'out-of-stock'], default: 'active' }
}, { timestamps: true });
const Product = mongoose.model('Product', productSchema);

const orderSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: [{
    productId: String,
    productName: String,
    price: Number,
    quantity: Number,
    shopId: String
  }],
  total: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'], default: 'pending' },
  shippingAddress: String,
  trackingNumber: String
}, { timestamps: true });
const Order = mongoose.model('Order', orderSchema);

const cartSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: [{
    product: { id: String, name: String, price: Number, image: String, shopId: String },
    quantity: { type: Number, default: 1 }
  }],
  total: { type: Number, default: 0 }
}, { timestamps: true });
const Cart = mongoose.model('Cart', cartSchema);

// ── DB ────────────────────────────────────────────────────────────────────────

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB connected successfully!');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    console.log('🔄 Retrying in 3 seconds...');
    setTimeout(connectDB, 3000);
  }
}
connectDB();

// ── HELPER ────────────────────────────────────────────────────────────────────

function getBusinessId(req) {
  return new mongoose.Types.ObjectId(req.headers.authorization
    ? jwt.verify(req.headers.authorization.split(' ')[1], JWT_SECRET).userId
    : null);
}

// ── AUTH ──────────────────────────────────────────────────────────────────────

app.get('/api/test', async (req, res) => {
  try {
    const count = await User.countDocuments();
    res.json({ message: 'Server + MongoDB working!', users: count, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/customer-signup', async (req, res) => {
  try {
    const { email, password, name, phone, address } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: 'User already exists' });
    const user = new User({ email, password, name, userType: 'customer', phone, address });
    await user.save();
    res.status(201).json({ message: 'Account created successfully! Please login.' });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ message: 'Email already exists' });
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/auth/business-signup', async (req, res) => {
  try {
    const { email, password, name, businessName, phone, address } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: 'User already exists' });
    const user = new User({ email, password, name, businessName, userType: 'business', phone, address });
    await user.save();
    res.status(201).json({ message: 'Business account created! Please login.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });
    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });
    const token = jwt.sign(
      { userId: user._id, email: user.email, userType: user.userType },
      JWT_SECRET, { expiresIn: '7d' }
    );
    res.json({
      token,
      user: { id: user._id, email: user.email, name: user.name, userType: user.userType, businessName: user.businessName }
    });
  } catch (error) {
    res.status(500).json({ message: 'Login server error' });
  }
});

app.get('/api/auth/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) {
    if (error.name === 'JsonWebTokenError') return res.status(401).json({ message: 'Invalid/expired token' });
    if (error.name === 'TokenExpiredError') return res.status(401).json({ message: 'Token expired' });
    res.status(500).json({ message: 'Server error' });
  }
});

// ── FEATURED ─────────────────────────────────────────────────────────────────

app.get('/api/featured', async (req, res) => {
  try {
    const businessesWithProducts = await User.aggregate([
      { $match: { userType: 'business', businessName: { $exists: true, $ne: null } } },
      { $lookup: { from: 'products', localField: '_id', foreignField: 'businessId', as: 'products' } },
      { $match: { 'products.0': { $exists: true } } },
      { $project: {
          name: '$businessName', ownerName: '$name', email: 1, phone: 1, address: 1, createdAt: 1,
          productCount: { $size: '$products' }, rating: { $literal: 4.5 }
      }},
      { $sort: { createdAt: -1 } },
      { $limit: 6 }
    ]);

    const activeProducts = await Product.find({ status: 'active', stock: { $gt: 0 } })
      .populate('businessId', 'businessName name')
      .sort({ createdAt: -1 }).limit(12).lean();

    const formattedProducts = activeProducts.map(p => ({
      id: p._id.toString(), name: p.name, description: p.description || '',
      price: p.price, image: p.image || 'https://images.unsplash.com/photo-1608043152266-119cb09fc56e?w=400&fit=crop',
      shopId: p.businessId._id.toString(), shopName: p.businessId.businessName || p.businessId.name,
      stock: p.stock, category: p.category || ''
    }));

    const formattedShops = businessesWithProducts.map(b => ({
      id: b._id.toString(), name: b.name, ownerName: b.ownerName, email: b.email,
      phone: b.phone, address: b.address, rating: b.rating,
      memberSince: new Date(b.createdAt).toISOString().split('T')[0], productCount: b.productCount
    }));

    res.json({ shops: formattedShops, products: formattedProducts });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load featured content', shops: [], products: [] });
  }
});

// ── CART ──────────────────────────────────────────────────────────────────────

app.get('/api/cart', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user || user.userType !== 'customer') return res.status(403).json({ message: 'Access denied' });
    let cart = await Cart.findOne({ user: user._id });
    if (!cart) { cart = new Cart({ user: user._id, items: [], total: 0 }); await cart.save(); }
    res.json(cart);
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
});

app.post('/api/cart/add', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user || user.userType !== 'customer') return res.status(403).json({ message: 'Access denied' });
    const { productId, name, price, image, shopId, quantity = 1 } = req.body;
    let cart = await Cart.findOne({ user: user._id });
    if (!cart) cart = new Cart({ user: user._id, items: [], total: 0 });
    const existingItemIndex = cart.items.findIndex(item => item.product.id === productId);
    if (existingItemIndex > -1) {
      cart.items[existingItemIndex].quantity += quantity;
    } else {
      cart.items.push({ product: { id: productId, name, price, image, shopId }, quantity });
    }
    cart.total = cart.items.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
    await cart.save();
    res.json({ message: 'Item added to cart!', cart: cart.items.length, total: cart.total });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

app.put('/api/cart/update/:productId', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user || user.userType !== 'customer') return res.status(403).json({ message: 'Access denied' });
    const { quantity } = req.body;
    const cart = await Cart.findOne({ user: user._id });
    if (!cart) return res.status(404).json({ message: 'Cart not found' });
    const itemIndex = cart.items.findIndex(item => item.product.id === req.params.productId);
    if (itemIndex === -1) return res.status(404).json({ message: 'Item not found' });
    if (quantity <= 0) { cart.items.splice(itemIndex, 1); } else { cart.items[itemIndex].quantity = quantity; }
    cart.total = cart.items.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
    await cart.save();
    res.json({ message: 'Cart updated', total: cart.total });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

app.delete('/api/cart/clear', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });
    const decoded = jwt.verify(token, JWT_SECRET);
    await Cart.findOneAndDelete({ user: decoded.userId });
    res.json({ message: 'Cart cleared' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── BUSINESS STATS ────────────────────────────────────────────────────────────

app.get('/api/business/stats', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const business = await User.findById(decoded.userId);
    if (!business || business.userType !== 'business') return res.status(403).json({ message: 'Access denied' });
    const businessId = new mongoose.Types.ObjectId(decoded.userId);
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const products = await Product.countDocuments({ businessId: business._id });
    const orders = await Order.countDocuments({
      businessId, status: { $in: ['confirmed', 'shipped', 'delivered'] }, createdAt: { $gte: monthStart }
    });
    const revenue = await Order.aggregate([
      { $match: { businessId, status: 'delivered', createdAt: { $gte: monthStart } } },
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]);
    const lowStock = await Product.countDocuments({ businessId: business._id, stock: { $lt: 10 }, status: 'active' });
    const outOfStock = await Product.countDocuments({ businessId: business._id, stock: 0 });
    const pendingOrders = await Order.countDocuments({ businessId, status: 'pending' });
    res.json({
      totalProducts: products,
      monthlyOrders: orders,
      monthlyRevenue: revenue[0]?.total || 0,
      lowStock,
      outOfStock,
      pendingOrders
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── ANALYTICS — REAL DATA ─────────────────────────────────────────────────────

/**
 * GET /api/business/analytics
 * Returns:
 *  - monthlySales: last 12 months of revenue + order counts
 *  - categoryRevenue: revenue grouped by product category
 *  - topProducts: top 5 products by units sold
 *  - orderStatusBreakdown: counts per status
 *  - dailySales: last 30 days revenue (for sparkline)
 *  - conversionStats: avg order value, total customers
 */
app.get('/api/business/analytics', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const business = await User.findById(decoded.userId);
    if (!business || business.userType !== 'business') return res.status(403).json({ message: 'Access denied' });
    const businessId = new mongoose.Types.ObjectId(decoded.userId);

    // ── Monthly sales: last 12 months ───────────────────────────────────────
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);

    const monthlySalesRaw = await Order.aggregate([
      {
        $match: {
          businessId,
          status: { $in: ['confirmed', 'shipped', 'delivered'] },
          createdAt: { $gte: twelveMonthsAgo }
        }
      },
      {
        $group: {
          _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
          revenue: { $sum: '$total' },
          orders: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    // Build full 12-month array with zeros for missing months
    const monthlySales = [];
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const found = monthlySalesRaw.find(r => r._id.year === year && r._id.month === month);
      monthlySales.push({
        label: monthNames[month - 1],
        year,
        month,
        revenue: found ? parseFloat(found.revenue.toFixed(2)) : 0,
        orders: found ? found.orders : 0
      });
    }

    // ── Category revenue ─────────────────────────────────────────────────────
    // Join orders -> items -> products to get category
    const products = await Product.find({ businessId }).lean();
    const productMap = {};
    products.forEach(p => { productMap[p._id.toString()] = p; });

    const allOrders = await Order.find({
      businessId,
      status: { $in: ['confirmed', 'shipped', 'delivered'] }
    }).lean();

    const categoryRevMap = {};
    const productSalesMap = {};

    for (const order of allOrders) {
      for (const item of order.items) {
        const prod = productMap[item.productId];
        const cat = prod?.category || 'Uncategorized';
        const rev = item.price * item.quantity;
        categoryRevMap[cat] = (categoryRevMap[cat] || 0) + rev;

        // top products by revenue
        const key = item.productId;
        if (!productSalesMap[key]) {
          productSalesMap[key] = { name: item.productName, revenue: 0, units: 0, category: cat };
        }
        productSalesMap[key].revenue += rev;
        productSalesMap[key].units += item.quantity;
      }
    }

    const categoryRevenue = Object.entries(categoryRevMap)
      .map(([name, revenue]) => ({ name, revenue: parseFloat(revenue.toFixed(2)) }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);

    // ── Top products ─────────────────────────────────────────────────────────
    const topProducts = Object.values(productSalesMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
      .map(p => ({ ...p, revenue: parseFloat(p.revenue.toFixed(2)) }));

    const maxRev = topProducts[0]?.revenue || 1;
    topProducts.forEach(p => { p.pct = Math.round((p.revenue / maxRev) * 100); });

    // ── Order status breakdown ────────────────────────────────────────────────
    const statusAgg = await Order.aggregate([
      { $match: { businessId } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    const orderStatusBreakdown = {};
    statusAgg.forEach(s => { orderStatusBreakdown[s._id] = s.count; });

    // ── Daily sales: last 30 days ─────────────────────────────────────────────
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const dailySalesRaw = await Order.aggregate([
      {
        $match: {
          businessId,
          status: { $in: ['confirmed', 'shipped', 'delivered'] },
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: '$total' },
          orders: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const dailySales = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const found = dailySalesRaw.find(r => r._id === dateStr);
      dailySales.push({
        date: dateStr,
        label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        revenue: found ? parseFloat(found.revenue.toFixed(2)) : 0,
        orders: found ? found.orders : 0
      });
    }

    // ── Conversion stats ──────────────────────────────────────────────────────
    const totalRevenue = monthlySales.reduce((s, m) => s + m.revenue, 0);
    const totalOrdersAll = await Order.countDocuments({ businessId });
    const deliveredOrders = await Order.countDocuments({ businessId, status: 'delivered' });
    const uniqueCustomers = await Order.distinct('customerId', { businessId });
    const avgOrderValue = totalOrdersAll > 0 ? (totalRevenue / totalOrdersAll).toFixed(2) : '0.00';

    // ── Month-over-month growth ───────────────────────────────────────────────
    const thisMonth = monthlySales[11]?.revenue || 0;
    const lastMonth = monthlySales[10]?.revenue || 0;
    const growth = lastMonth > 0 ? (((thisMonth - lastMonth) / lastMonth) * 100).toFixed(1) : null;

    res.json({
      monthlySales,
      dailySales,
      categoryRevenue,
      topProducts,
      orderStatusBreakdown,
      conversionStats: {
        totalRevenue: parseFloat(totalRevenue.toFixed(2)),
        totalOrders: totalOrdersAll,
        deliveredOrders,
        uniqueCustomers: uniqueCustomers.length,
        avgOrderValue: parseFloat(avgOrderValue),
        growth
      }
    });

  } catch (error) {
    console.error('❌ Analytics error:', error);
    res.status(500).json({ message: error.message });
  }
});

// ── BUSINESS PRODUCTS ─────────────────────────────────────────────────────────

app.get('/api/business/products', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const business = await User.findById(decoded.userId);
    if (!business || business.userType !== 'business') return res.status(403).json({ message: 'Access denied' });
    const products = await Product.find({ businessId: business._id }).sort({ createdAt: -1 }).lean();
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/business/add-product', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const business = await User.findById(decoded.userId);
    if (!business || business.userType !== 'business') return res.status(403).json({ message: 'Access denied' });
    const product = new Product({
      ...req.body,
      businessId: business._id,
      shopId: business._id,
      image: req.body.image || 'https://images.unsplash.com/photo-1608043152266-119cb09fc56e?w=300'
    });
    await product.save();
    res.json({ message: 'Product added successfully!', product });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.put('/api/business/products/:id', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, businessId: decoded.userId }, req.body, { new: true }
    );
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json({ message: 'Product updated!', product });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.delete('/api/business/products/:id', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const product = await Product.findOneAndDelete({ _id: req.params.id, businessId: decoded.userId });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json({ message: 'Product deleted!' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── BUSINESS ORDERS ───────────────────────────────────────────────────────────

app.get('/api/business/orders', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const businessId = new mongoose.Types.ObjectId(decoded.userId);
    const orders = await Order.find({ businessId })
      .populate('customerId', 'name email')
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.put('/api/business/orders/:id/status', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const order = await Order.findOne({ _id: req.params.id, businessId: decoded.userId });
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const previousStatus = order.status;
    const newStatus = req.body.status;

    // Deduct stock when order is marked delivered (only once)
    if (newStatus === 'delivered' && previousStatus !== 'delivered') {
      for (const item of order.items) {
        await Product.findByIdAndUpdate(
          item.productId,
          [
            {
              $set: {
                stock: { $max: [0, { $subtract: ['$stock', item.quantity] }] },
                status: {
                  $cond: {
                    if: { $lte: [{ $subtract: ['$stock', item.quantity] }, 0] },
                    then: 'out-of-stock',
                    else: '$status'
                  }
                }
              }
            }
          ]
        );
      }
    }

    // Restore stock if a delivered order is cancelled
    if (newStatus === 'cancelled' && previousStatus === 'delivered') {
      for (const item of order.items) {
        await Product.findByIdAndUpdate(
          item.productId,
          {
            $inc: { stock: item.quantity },
            $set: { status: 'active' }
          }
        );
      }
    }

    order.status = newStatus;
    if (req.body.trackingNumber) order.trackingNumber = req.body.trackingNumber;
    await order.save();

    res.json({ message: 'Order status updated!', order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── LOW STOCK ─────────────────────────────────────────────────────────────────

app.get('/api/business/low-stock', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const products = await Product.find({
      businessId: decoded.userId,
      stock: { $lt: 10 },
      status: 'active'
    }).sort({ stock: 1 });
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── PROFILE ───────────────────────────────────────────────────────────────────

app.put('/api/business/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findByIdAndUpdate(decoded.userId, req.body, { new: true }).select('-password');
    res.json({ message: 'Profile updated!', user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.put('/api/customer/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findByIdAndUpdate(
      decoded.userId,
      { name: req.body.name, phone: req.body.phone, address: req.body.address },
      { new: true, runValidators: true }
    ).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'Profile updated successfully!', user: { name: user.name, email: user.email, phone: user.phone, address: user.address, userType: user.userType } });
  } catch (error) {
    if (error.name === 'JsonWebTokenError') return res.status(401).json({ message: 'Invalid token' });
    if (error.code === 11000) return res.status(400).json({ message: 'Email already exists' });
    res.status(500).json({ message: 'Update failed: ' + error.message });
  }
});

// ── SHOP / PRODUCT PUBLIC ROUTES ──────────────────────────────────────────────

app.get('/api/business/shop/:shopId', async (req, res) => {
  try {
    const shop = await User.findById(req.params.shopId).select('name businessName ownerName email phone address createdAt').lean();
    if (!shop) return res.status(404).json({ message: 'Shop not found' });
    const productCount = await Product.countDocuments({ businessId: req.params.shopId });
    res.json({ ...shop, name: shop.businessName || shop.name, ownerName: shop.name, productCount, rating: 4.5 });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/business/shop/:shopId/products', async (req, res) => {
  try {
    const products = await Product.find({ businessId: req.params.shopId, status: 'active' })
      .populate('businessId', 'businessName').sort({ createdAt: -1 }).lean();
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/products/:productId', async (req, res) => {
  try {
    const product = await Product.findById(req.params.productId).populate('businessId', 'businessName name').lean();
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json({ ...product, shopName: product.businessId.businessName || product.businessId.name, shopId: product.businessId._id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/products/:productId/reviews', async (req, res) => {
  res.json([
    { userName: 'Maria S.', rating: 5, comment: 'Absolutely beautiful! Perfect souvenir!', createdAt: new Date(Date.now() - 86400000) },
    { userName: 'John D.', rating: 4, comment: 'Great quality, fast shipping.', createdAt: new Date(Date.now() - 2 * 86400000) }
  ]);
});

app.post('/api/products/:productId/reviews', async (req, res) => {
  res.json({ message: 'Review added!' });
});

app.get('/api/products/:shopId/related', async (req, res) => {
  try {
    const { shopId, category, exclude } = req.query;
    const match = { businessId: shopId, status: 'active', stock: { $gt: 0 }, _id: { $ne: exclude } };
    if (category) match.category = category;
    const products = await Product.find(match).limit(8).lean();
    res.json(products);
  } catch (error) {
    res.status(500).json([]);
  }
});

// ── CUSTOMER ORDERS ───────────────────────────────────────────────────────────

app.get('/api/customer/orders', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user || user.userType !== 'customer') return res.status(403).json({ message: 'Access denied' });
    const orders = await Order.find({ customerId: user._id }).sort({ createdAt: -1 }).lean();
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── CHECKOUT ──────────────────────────────────────────────────────────────────

app.post('/api/checkout', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user || user.userType !== 'customer') return res.status(403).json({ message: 'Access denied' });

    const { shippingAddress, phone, email, paymentMethod, notes, items, subtotal, tax, total } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ message: 'No items in order' });

    const shopGroups = {};
    for (const item of items) {
      const bid = item.product.shopId || null;
      if (!shopGroups[bid]) shopGroups[bid] = [];
      shopGroups[bid].push(item);
    }

    const createdOrders = [];
    const orderNumber = 'CC' + Date.now().toString(36).toUpperCase();

    for (const [shopId, shopItems] of Object.entries(shopGroups)) {
      const shopTotal = shopItems.reduce((sum, i) => sum + i.product.price * i.quantity, 0);
      const shopTax = shopTotal * 0.12;
      const order = new Order({
        customerId: user._id,
        businessId: shopId !== 'null' ? shopId : decoded.userId,
        items: shopItems.map(i => ({
          productId: i.product.id, productName: i.product.name,
          price: i.product.price, quantity: i.quantity, shopId: i.product.shopId
        })),
        total: parseFloat((shopTotal + shopTax).toFixed(2)),
        status: 'pending',
        shippingAddress,
        trackingNumber: JSON.stringify({ paymentMethod, phone, email, notes, orderNumber })
      });
      await order.save();
      createdOrders.push(order._id.toString());
    }

    await Cart.findOneAndDelete({ user: user._id });
    res.json({ message: 'Order placed successfully!', orderNumber, orderId: createdOrders[0], orders: createdOrders, total });
  } catch (error) {
    if (error.name === 'JsonWebTokenError') return res.status(401).json({ message: 'Invalid token' });
    res.status(500).json({ message: 'Failed to place order: ' + error.message });
  }
});

// ── SPA CATCH-ALL ─────────────────────────────────────────────────────────────

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🚀 Server: http://localhost:${PORT}`);
  console.log(`📱 Test DB: http://localhost:${PORT}/api/test`);
  console.log(`📊 Analytics: http://localhost:${PORT}/api/business/analytics`);
});
