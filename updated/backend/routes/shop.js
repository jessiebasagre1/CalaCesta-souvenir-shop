const router = require('express').Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Review = require('../models/Review');

// ── Shared helpers ────────────────────────────────────────────────────────────

// Attach live ratings to an array of lean product docs
async function attachRatings(products) {
  const ids = products.map(p => p._id);
  const agg = await Review.aggregate([
    { $match: { productId: { $in: ids } } },
    { $group: { _id: '$productId', avg: { $avg: '$rating' }, count: { $sum: 1 } } }
  ]);
  const map = Object.fromEntries(agg.map(r => [r._id.toString(), { avg: parseFloat(r.avg.toFixed(1)), count: r.count }]));
  return map;
}

function formatProduct(p, ratingsMap) {
  const r = ratingsMap[p._id.toString()] || {};
  return {
    id:          p._id.toString(),
    name:        p.name,
    description: p.description || '',
    price:       p.isOnSale && p.salePrice ? p.salePrice : p.price,
    originalPrice: p.price,
    isOnSale:    p.isOnSale || false,
    salePrice:   p.salePrice || null,
    image:       p.image || 'https://images.unsplash.com/photo-1608043152266-119cb09fc56e?w=400&fit=crop',
    shopId:      (p.businessId?._id || p.businessId || '').toString(),
    shopName:    p.businessId?.businessName || p.businessId?.name || 'Shop',
    stock:       p.stock,
    category:    p.category || '',
    rating:      r.avg || 0,
    reviewCount: r.count || 0,
  };
}

// GET /api/featured  – general featured products (all active, newest first)
router.get('/featured', async (req, res) => {
  try {
    const [businessesWithProducts, activeProducts] = await Promise.all([
      User.aggregate([
        { $match: { userType: 'business', businessName: { $exists: true, $ne: null } } },
        { $lookup: { from: 'products', localField: '_id', foreignField: 'businessId', as: 'products' } },
        { $match: { 'products.0': { $exists: true } } },
        { $project: { name: '$businessName', ownerName: '$name', email: 1, phone: 1, address: 1, createdAt: 1, productCount: { $size: '$products' }, rating: { $literal: 4.5 } } },
        { $sort: { createdAt: -1 } },
        { $limit: 6 }
      ]),
      Product.find({ status: 'active', stock: { $gt: 0 } })
        .populate('businessId', 'businessName name')
        .sort({ createdAt: -1 }).limit(12).lean(),
    ]);

    const ratingsMap = await attachRatings(activeProducts);
    const formattedProducts = activeProducts.map(p => formatProduct(p, ratingsMap));

    const formattedShops = businessesWithProducts.map(b => ({
      id: b._id.toString(), name: b.name, ownerName: b.ownerName, email: b.email,
      phone: b.phone, address: b.address, rating: b.rating,
      memberSince: new Date(b.createdAt).toISOString().split('T')[0],
      productCount: b.productCount,
    }));

    res.json({ shops: formattedShops, products: formattedProducts });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load featured content', shops: [], products: [] });
  }
});

// GET /api/products-top-selling  – sorted by total units sold (delivered orders)
router.get('/products-top-selling', async (req, res) => {
  try {
    // Aggregate sold quantity per productId from delivered orders
    const soldAgg = await Order.aggregate([
      { $match: { status: 'delivered' } },
      { $unwind: '$items' },
      { $group: { _id: '$items.productId', soldCount: { $sum: '$items.quantity' } } },
      { $sort: { soldCount: -1 } },
      { $limit: 20 }
    ]);

    if (!soldAgg.length) {
      // Fall back to newest if no orders yet
      const fallback = await Product.find({ status: 'active', stock: { $gt: 0 } })
        .populate('businessId', 'businessName name')
        .sort({ createdAt: -1 }).limit(8).lean();
      const map = await attachRatings(fallback);
      return res.json(fallback.map(p => ({ ...formatProduct(p, map), soldCount: 0 })));
    }

    // Build ordered list of ObjectIds
    const orderedIds = soldAgg.map(s => s._id).filter(id => mongoose.Types.ObjectId.isValid(id));
    const soldMap = Object.fromEntries(soldAgg.map(s => [s._id, s.soldCount]));

    const products = await Product.find({
      _id: { $in: orderedIds.map(id => new mongoose.Types.ObjectId(id)) },
      status: 'active',
      stock: { $gt: 0 }
    }).populate('businessId', 'businessName name').lean();

    // Re-sort by soldCount
    products.sort((a, b) => (soldMap[b._id.toString()] || 0) - (soldMap[a._id.toString()] || 0));

    const map = await attachRatings(products);
    res.json(products.slice(0, 8).map(p => ({ ...formatProduct(p, map), soldCount: soldMap[p._id.toString()] || 0 })));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/products-new-arrivals  – newest products first
router.get('/products-new-arrivals', async (req, res) => {
  try {
    const products = await Product.find({ status: 'active', stock: { $gt: 0 } })
      .populate('businessId', 'businessName name')
      .sort({ createdAt: -1 })
      .limit(8).lean();

    const map = await attachRatings(products);
    res.json(products.map(p => formatProduct(p, map)));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/products-on-sale  – products marked isOnSale = true
router.get('/products-on-sale', async (req, res) => {
  try {
    const products = await Product.find({ status: 'active', isOnSale: true })
      .populate('businessId', 'businessName name')
      .sort({ createdAt: -1 })
      .limit(8).lean();

    const map = await attachRatings(products);
    res.json(products.map(p => formatProduct(p, map)));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/products-by-category?category=crafts  – filter by category
router.get('/products-by-category', async (req, res) => {
  try {
    const { category } = req.query;
    if (!category || category === 'all') {
      // Return featured (active, newest first)
      const products = await Product.find({ status: 'active', stock: { $gt: 0 } })
        .populate('businessId', 'businessName name')
        .sort({ createdAt: -1 }).limit(8).lean();
      const map = await attachRatings(products);
      return res.json(products.map(p => formatProduct(p, map)));
    }

    const products = await Product.find({
      status: 'active',
      stock: { $gt: 0 },
      category: { $regex: new RegExp(category, 'i') }
    })
      .populate('businessId', 'businessName name')
      .sort({ createdAt: -1 })
      .limit(8).lean();

    const map = await attachRatings(products);
    res.json(products.map(p => formatProduct(p, map)));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/checkout
router.post('/checkout', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user || user.userType !== 'customer')
      return res.status(403).json({ message: 'Access denied' });

    const { shippingAddress, phone, email, paymentMethod, notes, items, total } = req.body;
    if (!items?.length) return res.status(400).json({ message: 'No items in order' });

    const shopGroups = items.reduce((groups, item) => {
      const key = item.product.shopId || 'null';
      (groups[key] = groups[key] || []).push(item);
      return groups;
    }, {});

    const orderNumber = 'CC' + Date.now().toString(36).toUpperCase();
    const createdOrders = [];

    for (const [shopId, shopItems] of Object.entries(shopGroups)) {
      const shopTotal = shopItems.reduce((sum, i) => sum + i.product.price * i.quantity, 0);
      const shopTax   = shopTotal * 0.12;
      const order = new Order({
        customerId:      user._id,
        businessId:      shopId !== 'null' ? shopId : decoded.userId,
        items:           shopItems.map(i => ({ productId: i.product.id, productName: i.product.name, price: i.product.price, quantity: i.quantity, shopId: i.product.shopId })),
        total:           parseFloat((shopTotal + shopTax).toFixed(2)),
        status:          'pending',
        shippingAddress,
        orderNumber,
        trackingNumber:  JSON.stringify({ paymentMethod, phone, email, notes, orderNumber }),
      });
      await order.save();
      createdOrders.push(order._id.toString());
    }

    await Cart.findOneAndDelete({ user: user._id });
    res.json({ message: 'Order placed successfully!', orderNumber, orderId: createdOrders[0], orders: createdOrders, total });
  } catch (error) {
    if (error.name === 'JsonWebTokenError')
      return res.status(401).json({ message: 'Invalid token' });
    res.status(500).json({ message: 'Failed to place order: ' + error.message });
  }
});

// GET /api/categories  – distinct categories from active products with counts
router.get('/categories', async (req, res) => {
  try {
    const agg = await Product.aggregate([
      { $match: { status: 'active', stock: { $gt: 0 }, category: { $exists: true, $ne: null, $ne: '' } } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    const categories = agg.map(c => ({ name: c._id, count: c.count }));
    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: error.message, categories: [] });
  }
});

// GET /api/products-search?q=...&category=...&sort=...&page=...
router.get('/products-search', async (req, res) => {
  try {
    const { q, category, sort = 'newest', page = 1, limit = 24 } = req.query;
    const match = { status: 'active', stock: { $gt: 0 } };

    if (q && q.trim()) {
      match.$or = [
        { name: { $regex: q.trim(), $options: 'i' } },
        { description: { $regex: q.trim(), $options: 'i' } },
        { category: { $regex: q.trim(), $options: 'i' } },
      ];
    }
    if (category && category !== 'all') {
      match.category = { $regex: new RegExp(`^${category}$`, 'i') };
    }

    const sortMap = {
      newest:     { createdAt: -1 },
      'price-low':  { price: 1 },
      'price-high': { price: -1 },
      name:       { name: 1 },
      rating:     { avgRating: -1 },
    };
    const sortObj = sortMap[sort] || { createdAt: -1 };
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [products, total] = await Promise.all([
      Product.find(match).populate('businessId', 'businessName name').sort(sortObj).skip(skip).limit(parseInt(limit)).lean(),
      Product.countDocuments(match),
    ]);

    const ratingsMap = await attachRatings(products);
    res.json({
      products: products.map(p => formatProduct(p, ratingsMap)),
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    res.status(500).json({ message: error.message, products: [], total: 0 });
  }
});

module.exports = router;