const router = require('express').Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Review = require('../models/Review');

async function getBusiness(req, res) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) { res.status(401).json({ message: 'No token' }); return null; }
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const business = await User.findById(decoded.userId);
  if (!business || business.userType !== 'business') {
    res.status(403).json({ message: 'Access denied' }); return null;
  }
  return { business, decoded };
}

// ── Stats ────────────────────────────────────────────────────────────────────

// GET /api/business/stats
router.get('/stats', async (req, res) => {
  try {
    const ctx = await getBusiness(req, res);
    if (!ctx) return;
    const { business, decoded } = ctx;
    const businessId = new mongoose.Types.ObjectId(decoded.userId);
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const [products, orders, lowStock, outOfStock, pendingOrders, revenue] = await Promise.all([
      Product.countDocuments({ businessId: business._id }),
      Order.countDocuments({ businessId, status: { $in: ['confirmed', 'shipped', 'delivered'] }, createdAt: { $gte: monthStart } }),
      Product.countDocuments({ businessId: business._id, stock: { $lt: 10 }, status: 'active' }),
      Product.countDocuments({ businessId: business._id, stock: 0 }),
      Order.countDocuments({ businessId, status: 'pending' }),
      Order.aggregate([
        { $match: { businessId, status: 'delivered', createdAt: { $gte: monthStart } } },
        { $group: { _id: null, total: { $sum: '$total' } } }
      ]),
    ]);

    res.json({
      totalProducts: products,
      monthlyOrders: orders,
      monthlyRevenue: revenue[0]?.total || 0,
      lowStock,
      outOfStock,
      pendingOrders,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── Analytics ────────────────────────────────────────────────────────────────

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// GET /api/business/analytics
router.get('/analytics', async (req, res) => {
  try {
    const ctx = await getBusiness(req, res);
    if (!ctx) return;
    const businessId = new mongoose.Types.ObjectId(ctx.decoded.userId);

    // Monthly sales: last 12 months
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);

    const monthlySalesRaw = await Order.aggregate([
      { $match: { businessId, status: { $in: ['confirmed', 'shipped', 'delivered'] }, createdAt: { $gte: twelveMonthsAgo } } },
      { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, revenue: { $sum: '$total' }, orders: { $sum: 1 } } },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    const monthlySales = Array.from({ length: 12 }, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - (11 - i));
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const found = monthlySalesRaw.find(r => r._id.year === year && r._id.month === month);
      return { label: MONTH_NAMES[month - 1], year, month, revenue: found ? parseFloat(found.revenue.toFixed(2)) : 0, orders: found?.orders || 0 };
    });

    // Category revenue + top products
    const [products, allOrders] = await Promise.all([
      Product.find({ businessId }).lean(),
      Order.find({ businessId, status: { $in: ['confirmed', 'shipped', 'delivered'] } }).lean(),
    ]);
    const productMap = Object.fromEntries(products.map(p => [p._id.toString(), p]));

    const categoryRevMap = {};
    const productSalesMap = {};
    for (const order of allOrders) {
      for (const item of order.items) {
        const prod = productMap[item.productId];
        const cat  = prod?.category || 'Uncategorized';
        const rev  = item.price * item.quantity;
        categoryRevMap[cat] = (categoryRevMap[cat] || 0) + rev;
        if (!productSalesMap[item.productId])
          productSalesMap[item.productId] = { name: item.productName, revenue: 0, units: 0, category: cat };
        productSalesMap[item.productId].revenue += rev;
        productSalesMap[item.productId].units   += item.quantity;
      }
    }

    const categoryRevenue = Object.entries(categoryRevMap)
      .map(([name, revenue]) => ({ name, revenue: parseFloat(revenue.toFixed(2)) }))
      .sort((a, b) => b.revenue - a.revenue).slice(0, 8);

    const topProducts = Object.values(productSalesMap)
      .sort((a, b) => b.revenue - a.revenue).slice(0, 5)
      .map(p => ({ ...p, revenue: parseFloat(p.revenue.toFixed(2)) }));
    const maxRev = topProducts[0]?.revenue || 1;
    topProducts.forEach(p => { p.pct = Math.round((p.revenue / maxRev) * 100); });

    // Order status breakdown
    const statusAgg = await Order.aggregate([
      { $match: { businessId } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    const orderStatusBreakdown = Object.fromEntries(statusAgg.map(s => [s._id, s.count]));

    // Daily sales: last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const dailySalesRaw = await Order.aggregate([
      { $match: { businessId, status: { $in: ['confirmed', 'shipped', 'delivered'] }, createdAt: { $gte: thirtyDaysAgo } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, revenue: { $sum: '$total' }, orders: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    const dailySales = Array.from({ length: 30 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (29 - i));
      const dateStr = d.toISOString().split('T')[0];
      const found = dailySalesRaw.find(r => r._id === dateStr);
      return { date: dateStr, label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), revenue: found ? parseFloat(found.revenue.toFixed(2)) : 0, orders: found?.orders || 0 };
    });

    // Conversion stats
    const totalRevenue = monthlySales.reduce((s, m) => s + m.revenue, 0);
    const [totalOrdersAll, deliveredOrders, uniqueCustomers] = await Promise.all([
      Order.countDocuments({ businessId }),
      Order.countDocuments({ businessId, status: 'delivered' }),
      Order.distinct('customerId', { businessId }),
    ]);
    const avgOrderValue = totalOrdersAll > 0 ? (totalRevenue / totalOrdersAll).toFixed(2) : '0.00';
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
        growth,
      },
    });
  } catch (error) {
    console.error('❌ Analytics error:', error);
    res.status(500).json({ message: error.message });
  }
});

// ── Notifications ────────────────────────────────────────────────────────────

// GET /api/business/notifications
router.get('/notifications', async (req, res) => {
  try {
    const ctx = await getBusiness(req, res);
    if (!ctx) return;
    const businessId = new mongoose.Types.ObjectId(ctx.decoded.userId);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const [cancelledOrders, pendingCount, lowStock, outOfStock, revenueAgg] = await Promise.all([
      Order.find({ businessId, status: 'cancelled', updatedAt: { $gte: sevenDaysAgo } })
        .populate('customerId', 'name').sort({ updatedAt: -1 }).lean(),
      Order.countDocuments({ businessId, status: 'pending' }),
      Product.countDocuments({ businessId: ctx.business._id, stock: { $gt: 0, $lt: 10 }, status: 'active' }),
      Product.countDocuments({ businessId: ctx.business._id, stock: 0 }),
      Order.aggregate([
        { $match: { businessId, status: 'delivered', createdAt: { $gte: monthStart } } },
        { $group: { _id: null, total: { $sum: '$total' } } }
      ]),
    ]);

    res.json({ cancelledOrders, pendingCount, lowStock, outOfStock, monthlyRevenue: revenueAgg[0]?.total || 0 });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── Products ─────────────────────────────────────────────────────────────────

// GET /api/business/products
router.get('/products', async (req, res) => {
  try {
    const ctx = await getBusiness(req, res);
    if (!ctx) return;
    const products = await Product.find({ businessId: ctx.business._id }).sort({ createdAt: -1 }).lean();
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/business/add-product
router.post('/add-product', async (req, res) => {
  try {
    const ctx = await getBusiness(req, res);
    if (!ctx) return;
    const product = new Product({
      ...req.body,
      businessId: ctx.business._id,
      shopId:     ctx.business._id,
      image:      req.body.image || 'https://images.unsplash.com/photo-1608043152266-119cb09fc56e?w=300',
    });
    await product.save();
    res.json({ message: 'Product added successfully!', product });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PUT /api/business/products/:id
router.put('/products/:id', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, businessId: decoded.userId },
      req.body,
      { new: true }
    );
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json({ message: 'Product updated!', product });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// DELETE /api/business/products/:id
router.delete('/products/:id', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const product = await Product.findOneAndDelete({ _id: req.params.id, businessId: decoded.userId });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json({ message: 'Product deleted!' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/business/low-stock
router.get('/low-stock', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const products = await Product.find({ businessId: decoded.userId, stock: { $lt: 10 }, status: 'active' }).sort({ stock: 1 });
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── Orders ───────────────────────────────────────────────────────────────────

// GET /api/business/orders
router.get('/orders', async (req, res) => {
  try {
    const ctx = await getBusiness(req, res);
    if (!ctx) return;
    const businessId = new mongoose.Types.ObjectId(ctx.decoded.userId);
    const orders = await Order.find({ businessId })
      .populate('customerId', 'name email')
      .sort({ createdAt: -1 }).limit(50);
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PUT /api/business/orders/:id/status
router.put('/orders/:id/status', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const order = await Order.findOne({ _id: req.params.id, businessId: decoded.userId });
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const { status: newStatus } = req.body;
    const previousStatus = order.status;

    // Deduct stock on delivery
    if (newStatus === 'delivered' && previousStatus !== 'delivered') {
      for (const item of order.items) {
        await Product.findByIdAndUpdate(item.productId, [{
          $set: {
            stock:  { $max: [0, { $subtract: ['$stock', item.quantity] }] },
            status: { $cond: { if: { $lte: [{ $subtract: ['$stock', item.quantity] }, 0] }, then: 'out-of-stock', else: '$status' } }
          }
        }]);
      }
    }

    // Restore stock if delivered order is cancelled
    if (newStatus === 'cancelled' && previousStatus === 'delivered') {
      for (const item of order.items) {
        await Product.findByIdAndUpdate(item.productId, { $inc: { stock: item.quantity }, $set: { status: 'active' } });
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

// ── Profile & Shop ───────────────────────────────────────────────────────────

// PUT /api/business/profile
router.put('/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByIdAndUpdate(decoded.userId, req.body, { new: true }).select('-password');
    res.json({ message: 'Profile updated!', user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/business/shop/:shopId
router.get('/shop/:shopId', async (req, res) => {
  try {
    const shop = await User.findById(req.params.shopId)
      .select('name businessName email phone address createdAt').lean();
    if (!shop) return res.status(404).json({ message: 'Shop not found' });
    const productCount = await Product.countDocuments({ businessId: req.params.shopId });
    res.json({ ...shop, name: shop.businessName || shop.name, ownerName: shop.name, productCount, rating: 4.5 });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/business/shop/:shopId/products
router.get('/shop/:shopId/products', async (req, res) => {
  try {
    const products = await Product.find({ businessId: req.params.shopId, status: 'active' })
      .populate('businessId', 'businessName').sort({ createdAt: -1 }).lean();
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── Reviews ──────────────────────────────────────────────────────────────────

// GET /api/business/reviews
router.get('/reviews', async (req, res) => {
  try {
    const ctx = await getBusiness(req, res);
    if (!ctx) return;

    const products = await Product.find({ businessId: ctx.business._id }).select('_id').lean();
    const productIds = products.map(p => p._id);
    const reviews = await Review.find({ productId: { $in: productIds } })
      .populate('productId', 'name').sort({ createdAt: -1 }).limit(50).lean();
    res.json(reviews);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── FOLLOWERS ────────────────────────────────────────────────────────────────

// GET /api/business/shop/:shopId/follow-status
// Returns follower count + whether the current user follows this shop
router.get('/shop/:shopId/follow-status', async (req, res) => {
  try {
    const shop = await User.findById(req.params.shopId).select('followers').lean();
    if (!shop) return res.status(404).json({ message: 'Shop not found' });

    const followerCount = shop.followers?.length || 0;
    let isFollowing = false;

    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        isFollowing = shop.followers?.some(id => id.toString() === decoded.userId) || false;
      } catch { /* unauthenticated — isFollowing stays false */ }
    }

    res.json({ followerCount, isFollowing });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/business/shop/:shopId/follow
// Toggles follow/unfollow for the logged-in customer
router.post('/shop/:shopId/follow', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Login required to follow shops' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user || user.userType !== 'customer')
      return res.status(403).json({ message: 'Only customers can follow shops' });

    const shop = await User.findById(req.params.shopId);
    if (!shop || shop.userType !== 'business')
      return res.status(404).json({ message: 'Shop not found' });

    const alreadyFollowing = shop.followers?.some(id => id.toString() === user._id.toString());

    if (alreadyFollowing) {
      shop.followers = shop.followers.filter(id => id.toString() !== user._id.toString());
    } else {
      if (!shop.followers) shop.followers = [];
      shop.followers.push(user._id);
    }

    await shop.save();
    res.json({ isFollowing: !alreadyFollowing, followerCount: shop.followers.length });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
module.exports = router;
