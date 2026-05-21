const router = require('express').Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Review = require('../models/Review');

// GET /api/featured
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

    // Bulk-fetch ratings
    const productIds = activeProducts.map(p => p._id);
    const ratingsAgg = await Review.aggregate([
      { $match: { productId: { $in: productIds } } },
      { $group: { _id: '$productId', avg: { $avg: '$rating' }, count: { $sum: 1 } } }
    ]);
    const ratingsMap = Object.fromEntries(ratingsAgg.map(r => [r._id.toString(), { avg: parseFloat(r.avg.toFixed(1)), count: r.count }]));

    const formattedProducts = activeProducts.map(p => ({
      id:          p._id.toString(),
      name:        p.name,
      description: p.description || '',
      price:       p.price,
      image:       p.image || 'https://images.unsplash.com/photo-1608043152266-119cb09fc56e?w=400&fit=crop',
      shopId:      p.businessId._id.toString(),
      shopName:    p.businessId.businessName || p.businessId.name,
      stock:       p.stock,
      category:    p.category || '',
      rating:      ratingsMap[p._id.toString()]?.avg || 0,
      reviewCount: ratingsMap[p._id.toString()]?.count || 0,
    }));

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

    // Group items by shop
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

module.exports = router;
