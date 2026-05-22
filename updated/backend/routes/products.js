const router = require('express').Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Product = require('../models/Product');
const Review = require('../models/Review');
const Order = require('../models/Order');
const User = require('../models/User');
const { refreshProductRating } = require('../utils/ratings');

// GET /api/products/related
router.get('/related', async (req, res) => {
  try {
    const { shopId, category, exclude } = req.query;
    const match = { status: 'active', stock: { $gt: 0 } };
    if (shopId && shopId !== 'undefined') match.businessId = shopId;
    if (category) match.category = category;
    if (exclude && mongoose.Types.ObjectId.isValid(exclude))
      match._id = { $ne: new mongoose.Types.ObjectId(exclude) };

    const products = await Product.find(match).limit(8).lean();
    res.json(products);
  } catch {
    res.status(500).json([]);
  }
});

// GET /api/products/:productId
router.get('/:productId', async (req, res) => {
  try {
    const product = await Product.findById(req.params.productId)
      .populate('businessId', 'businessName name')
      .lean();
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const ratingAgg = await Review.aggregate([
      { $match: { productId: product._id } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }
    ]);
    const avgRating   = ratingAgg[0]?.avg ? parseFloat(ratingAgg[0].avg.toFixed(1)) : 0;
    const reviewCount = ratingAgg[0]?.count || 0;

    res.json({
      ...product,
      shopName:    product.businessId?.businessName || product.businessId?.name,
      shopId:      product.businessId?._id,
      avgRating,
      reviewCount,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/products/:productId/sold-count
router.get('/:productId/sold-count', async (req, res) => {
  try {
    const { productId } = req.params;
    const result = await Order.aggregate([
      { $match: { status: 'delivered', 'items.productId': productId } },
      { $unwind: '$items' },
      { $match: { 'items.productId': productId } },
      { $group: { _id: null, soldCount: { $sum: '$items.quantity' } } }
    ]);
    res.json({ soldCount: result[0]?.soldCount || 0 });
  } catch (error) {
    res.status(500).json({ soldCount: 0, message: error.message });
  }
});

// GET /api/products/:productId/reviews
router.get('/:productId/reviews', async (req, res) => {
  try {
    const reviews = await Review.find({ productId: req.params.productId })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ reviews, count: reviews.length });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/products/:productId/reviews
router.post('/:productId/reviews', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Login required to review' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user || user.userType !== 'customer')
      return res.status(403).json({ message: 'Only customers can review products' });

    const { productId } = req.params;
    const { rating, title, comment } = req.body;

    if (!rating || rating < 1 || rating > 5)
      return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    if (!comment?.trim())
      return res.status(400).json({ message: 'Review comment is required' });
    if (await Review.findOne({ productId, userId: user._id }))
      return res.status(400).json({ message: 'You have already reviewed this product' });

    const deliveredOrder = await Order.findOne({
      customerId: user._id, status: 'delivered', 'items.productId': productId,
    });

    const review = new Review({
      productId,
      userId:   user._id,
      userName: user.name,
      rating:   parseInt(rating),
      title:    title?.trim() || '',
      comment:  comment.trim(),
      verified: !!deliveredOrder,
      orderId:  deliveredOrder?._id,
    });

    await review.save();
    await refreshProductRating(productId);
    res.status(201).json({ message: 'Review submitted!', review });
  } catch (error) {
    if (error.code === 11000)
      return res.status(400).json({ message: 'You have already reviewed this product' });
    res.status(500).json({ message: error.message });
  }
});

// GET /api/products/:productId/review-eligibility
router.get('/:productId/review-eligibility', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.json({ canReview: false, reason: 'not_logged_in' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user || user.userType !== 'customer')
      return res.json({ canReview: false, reason: 'not_customer' });

    const { productId } = req.params;
    const alreadyReviewed = await Review.findOne({ productId, userId: user._id });
    if (alreadyReviewed)
      return res.json({ canReview: false, reason: 'already_reviewed', review: alreadyReviewed });

    const deliveredOrder = await Order.findOne({
      customerId: user._id, status: 'delivered', 'items.productId': productId,
    });
    if (!deliveredOrder)
      return res.json({ canReview: false, reason: 'no_purchase' });

    res.json({ canReview: true, orderId: deliveredOrder._id });
  } catch {
    res.json({ canReview: false, reason: 'error' });
  }
});

module.exports = router;
