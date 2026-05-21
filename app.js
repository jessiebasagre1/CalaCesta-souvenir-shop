const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();

require('dotenv').config();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
//Product image upload
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `product-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'));
  }
});
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
  images: [String], 
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
  trackingNumber: String,
  orderNumber: { type: String }  
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

// ── REVIEW SCHEMA ─────────────────────────────────────────────────

const reviewSchema = new mongoose.Schema({
  productId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true },
  userName:   { type: String, required: true },
  rating:     { type: Number, required: true, min: 1, max: 5 },
  title:      { type: String, trim: true, maxlength: 120 },
  comment:    { type: String, required: true, trim: true, maxlength: 2000 },
  verified:   { type: Boolean, default: false },  // true = confirmed delivered purchase
  helpful:    { type: Number, default: 0 },
  orderId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Order' }
}, { timestamps: true });

// One review per user per product
reviewSchema.index({ productId: 1, userId: 1 }, { unique: true });
const Review = mongoose.model('Review', reviewSchema);

// ── HELPER: update product avg rating ────────────────────────────
async function refreshProductRating(productId) {
  const agg = await Review.aggregate([
    { $match: { productId: new mongoose.Types.ObjectId(productId) } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }
  ]);
  const avg = agg[0]?.avg || 0;
  await Product.findByIdAndUpdate(productId, { avgRating: parseFloat(avg.toFixed(2)), reviewCount: agg[0]?.count || 0 });
}
//----Product Image Overview Route----------------------
app.post('/api/upload', upload.array('images', 10), (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });
    jwt.verify(token, JWT_SECRET); // just verify, no user needed

    const urls = req.files.map(f => `/uploads/${f.filename}`);
    res.json({ urls });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
// ── GET REVIEWS FOR A PRODUCT ─────────────────────────────────────
// ── RELATED PRODUCTS ROUTE FIX ────────────────────────────────────
// Replace the existing /api/products/:shopId/related with:
app.get('/api/products/related', async (req, res) => {
  try {
    const { shopId, category, exclude } = req.query;
    const match = { status: 'active', stock: { $gt: 0 } };
    if (shopId && shopId !== 'undefined') match.businessId = shopId;
    if (category) match.category = category;
    if (exclude && mongoose.Types.ObjectId.isValid(exclude)) {
      match._id = { $ne: new mongoose.Types.ObjectId(exclude) };
    }
    const products = await Product.find(match).limit(8).lean();
    res.json(products);
  } catch (error) {
    res.status(500).json([]);
  }
});


app.get('/api/products/:productId/reviews', async (req, res) => {
  try {
    const { productId } = req.params;
    const reviews = await Review.find({ productId })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ reviews, count: reviews.length });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
//=============================
//Products Sold
//============================
app.get('/api/products/:productId/sold-count', async (req, res) => {
  try {
    const { productId } = req.params;
 
    const result = await Order.aggregate([
      {
        $match: {
          status: 'delivered',
          'items.productId': productId
        }
      },
      { $unwind: '$items' },
      {
        $match: {
          'items.productId': productId
        }
      },
      {
        $group: {
          _id: null,
          soldCount: { $sum: '$items.quantity' }
        }
      }
    ]);
 
    const soldCount = result[0]?.soldCount || 0;
    res.json({ soldCount });
  } catch (error) {
    res.status(500).json({ soldCount: 0, message: error.message });
  }
});

// ── POST A REVIEW ─────────────────────────────────────────────────
app.post('/api/products/:productId/reviews', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Login required to review' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user || user.userType !== 'customer') {
      return res.status(403).json({ message: 'Only customers can review products' });
    }

    const { productId } = req.params;
    const { rating, title, comment } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    }
    if (!comment?.trim()) {
      return res.status(400).json({ message: 'Review comment is required' });
    }

    // Check if user has a delivered order with this product
    const deliveredOrder = await Order.findOne({
      customerId: user._id,
      status: 'delivered',
      'items.productId': productId
    });

    // Check for duplicate review
    const existing = await Review.findOne({ productId, userId: user._id });
    if (existing) {
      return res.status(400).json({ message: 'You have already reviewed this product' });
    }

    const review = new Review({
      productId,
      userId: user._id,
      userName: user.name,
      rating: parseInt(rating),
      title: title?.trim() || '',
      comment: comment.trim(),
      verified: !!deliveredOrder,
      orderId: deliveredOrder?._id
    });

    await review.save();
    await refreshProductRating(productId);

    res.status(201).json({ message: 'Review submitted!', review });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'You have already reviewed this product' });
    }
    res.status(500).json({ message: error.message });
  }
});

// ── CHECK REVIEW ELIGIBILITY ──────────────────────────────────────
// Returns whether the current user can review a product and if they already have
app.get('/api/products/:productId/review-eligibility', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.json({ canReview: false, reason: 'not_logged_in' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user || user.userType !== 'customer') {
      return res.json({ canReview: false, reason: 'not_customer' });
    }

    const { productId } = req.params;

    const alreadyReviewed = await Review.findOne({ productId, userId: user._id });
    if (alreadyReviewed) {
      return res.json({ canReview: false, reason: 'already_reviewed', review: alreadyReviewed });
    }

    const deliveredOrder = await Order.findOne({
      customerId: user._id,
      status: 'delivered',
      'items.productId': productId
    });

    if (!deliveredOrder) {
      return res.json({ canReview: false, reason: 'no_purchase' });
    }

    res.json({ canReview: true, orderId: deliveredOrder._id });
  } catch (error) {
    res.json({ canReview: false, reason: 'error' });
  }
});

// ── MARK REVIEW AS HELPFUL ────────────────────────────────────────
app.post('/api/reviews/:reviewId/helpful', async (req, res) => {
  try {
    const review = await Review.findByIdAndUpdate(
      req.params.reviewId,
      { $inc: { helpful: 1 } },
      { new: true }
    );
    if (!review) return res.status(404).json({ message: 'Review not found' });
    res.json({ helpful: review.helpful });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── UPDATED: GET PRODUCT WITH RATING ─────────────────────────────
// Replace existing /api/products/:productId route with this version
// (or add avgRating/reviewCount to Product schema and update the populate)
app.get('/api/products/:productId', async (req, res) => {
  try {
    const product = await Product.findById(req.params.productId)
      .populate('businessId', 'businessName name')
      .lean();
    if (!product) return res.status(404).json({ message: 'Product not found' });

    // Fetch live rating
    const ratingAgg = await Review.aggregate([
      { $match: { productId: product._id } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }
    ]);
    const avgRating = ratingAgg[0]?.avg ? parseFloat(ratingAgg[0].avg.toFixed(1)) : 0;
    const reviewCount = ratingAgg[0]?.count || 0;

    res.json({
      ...product,
      shopName: product.businessId?.businessName || product.businessId?.name,
      shopId: product.businessId?._id,
      avgRating,
      reviewCount
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── UPDATED: /api/featured — include ratings ──────────────────────
// Upgrade the featured products to include ratings
// In the existing /api/featured route, update formattedProducts mapping:
/*
  const productIds = activeProducts.map(p => p._id);
  const ratingsAgg = await Review.aggregate([
    { $match: { productId: { $in: productIds } } },
    { $group: { _id: '$productId', avg: { $avg: '$rating' }, count: { $sum: 1 } } }
  ]);
  const ratingsMap = {};
  ratingsAgg.forEach(r => { ratingsMap[r._id.toString()] = { avg: parseFloat(r.avg.toFixed(1)), count: r.count }; });

  const formattedProducts = activeProducts.map(p => ({
    id: p._id.toString(), name: p.name, description: p.description || '',
    price: p.price, image: p.image || '...',
    shopId: p.businessId._id.toString(), shopName: p.businessId.businessName || p.businessId.name,
    stock: p.stock, category: p.category || '',
    rating: ratingsMap[p._id.toString()]?.avg || 0,
    reviewCount: ratingsMap[p._id.toString()]?.count || 0
  }));
*/


// ── RATE PRODUCT FROM PROFILE (after delivery) ────────────────────
// This is just the same POST /api/products/:productId/reviews route above
// The profile page calls it with the orderId context

// ── BUSINESS: Get reviews for business products ───────────────────
app.get('/api/business/reviews', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const business = await User.findById(decoded.userId);
    if (!business || business.userType !== 'business') return res.status(403).json({ message: 'Access denied' });

    const products = await Product.find({ businessId: business._id }).select('_id').lean();
    const productIds = products.map(p => p._id);

    const reviews = await Review.find({ productId: { $in: productIds } })
      .populate('productId', 'name')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json(reviews);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});



// GET list of product IDs already reviewed by the current customer
// Used by profile.html to show "Rated" vs "Rate" badge
app.get('/api/customer/reviewed-products', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });
    const decoded = jwt.verify(token, JWT_SECRET);

    const reviews = await Review.find({ userId: decoded.userId }).select('productId').lean();
    const productIds = reviews.map(r => r.productId.toString());

    res.json({ productIds });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


// ── ALSO UPDATE /api/featured to include ratings ──────────────────
// Replace the existing /api/featured route with this version:

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

    // Bulk-fetch ratings for all these products
    const productIds = activeProducts.map(p => p._id);
    const ratingsAgg = await Review.aggregate([
      { $match: { productId: { $in: productIds } } },
      { $group: { _id: '$productId', avg: { $avg: '$rating' }, count: { $sum: 1 } } }
    ]);
    const ratingsMap = {};
    ratingsAgg.forEach(r => {
      ratingsMap[r._id.toString()] = {
        avg: parseFloat(r.avg.toFixed(1)),
        count: r.count
      };
    });

    const formattedProducts = activeProducts.map(p => ({
      id: p._id.toString(),
      name: p.name,
      description: p.description || '',
      price: p.price,
      image: p.image || 'https://images.unsplash.com/photo-1608043152266-119cb09fc56e?w=400&fit=crop',
      shopId: p.businessId._id.toString(),
      shopName: p.businessId.businessName || p.businessId.name,
      stock: p.stock,
      category: p.category || '',
      rating: ratingsMap[p._id.toString()]?.avg || 0,
      reviewCount: ratingsMap[p._id.toString()]?.count || 0
    }));

    const formattedShops = businessesWithProducts.map(b => ({
      id: b._id.toString(), name: b.name, ownerName: b.ownerName, email: b.email,
      phone: b.phone, address: b.address, rating: b.rating,
      memberSince: new Date(b.createdAt).toISOString().split('T')[0],
      productCount: b.productCount
    }));

    res.json({ shops: formattedShops, products: formattedProducts });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load featured content', shops: [], products: [] });
  }
});


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

// ── BUSINESS NOTIFICATIONS ────────────────────────────────────────
app.get('/api/business/notifications', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const business = await User.findById(decoded.userId);
    if (!business || business.userType !== 'business')
      return res.status(403).json({ message: 'Access denied' });

    const businessId = new mongoose.Types.ObjectId(decoded.userId);

    // Cancelled orders in the last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const cancelledOrders = await Order.find({
      businessId,
      status: 'cancelled',
      updatedAt: { $gte: sevenDaysAgo }
    })
      .populate('customerId', 'name')
      .sort({ updatedAt: -1 })
      .lean();

    // Pending orders
    const pendingCount = await Order.countDocuments({ businessId, status: 'pending' });

    // Low/out of stock
    const lowStock  = await Product.countDocuments({ businessId, stock: { $gt: 0, $lt: 10 }, status: 'active' });
    const outOfStock = await Product.countDocuments({ businessId, stock: 0 });

    // Monthly revenue
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const revenueAgg = await Order.aggregate([
      { $match: { businessId, status: 'delivered', createdAt: { $gte: monthStart } } },
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]);
    const monthlyRevenue = revenueAgg[0]?.total || 0;

    res.json({ cancelledOrders, pendingCount, lowStock, outOfStock, monthlyRevenue });
  } catch (error) {
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

app.put('/api/customer/orders/:id/cancel', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });
    const decoded = jwt.verify(token, JWT_SECRET);

    const order = await Order.findOne({ 
      _id: req.params.id, 
      customerId: decoded.userId 
    });
    
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.status !== 'pending') return res.status(400).json({ message: 'Only pending orders can be cancelled' });

    order.status = 'cancelled';
    await order.save();

    res.json({ message: 'Order cancelled successfully', order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

//========================================================================
//                 CUSTOMER ACCOUNT SECURITY SETTINGS
//========================================================================
// ── CHANGE PASSWORD ───────────────────────────────────────────────
app.put('/api/customer/change-password', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ message: 'Both fields are required' });
    if (newPassword.length < 6)
      return res.status(400).json({ message: 'New password must be at least 6 characters' });

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch)
      return res.status(400).json({ message: 'Current password is incorrect' });

    user.password = newPassword; // pre-save hook will hash it
    await user.save();

    res.json({ message: 'Password changed successfully!' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── SEND EMAIL VERIFICATION CODE ──────────────────────────────────
app.post('/api/customer/send-verification', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.emailVerified)
      return res.status(400).json({ message: 'Email is already verified' });

    // Generate 6-digit code, expires in 10 minutes
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 10 * 60 * 1000);

    user.verificationCode = code;
    user.verificationExpiry = expiry;
    await user.save();

    // In production, send via nodemailer/sendgrid
    // For now, return code in response (remove in production)
    console.log(`Verification code for ${user.email}: ${code}`);

    res.json({ 
      message: 'Verification code sent to your email!',
      // Remove this in production:
      devCode: process.env.NODE_ENV !== 'production' ? code : undefined
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── VERIFY EMAIL CODE ─────────────────────────────────────────────
app.post('/api/customer/verify-email', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.emailVerified)
      return res.status(400).json({ message: 'Email already verified' });

    const { code } = req.body;
    if (!code) return res.status(400).json({ message: 'Code is required' });

    if (!user.verificationCode || !user.verificationExpiry)
      return res.status(400).json({ message: 'No verification code found. Please request a new one.' });

    if (new Date() > user.verificationExpiry)
      return res.status(400).json({ message: 'Code has expired. Please request a new one.' });

    if (user.verificationCode !== code.trim())
      return res.status(400).json({ message: 'Incorrect code. Please try again.' });

    user.emailVerified = true;
    user.verificationCode = undefined;
    user.verificationExpiry = undefined;
    await user.save();

    res.json({ message: 'Email verified successfully!' });
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
        orderNumber,
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
