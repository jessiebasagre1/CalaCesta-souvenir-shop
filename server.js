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
app.use(cors({
  origin: '*'
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    req.user = await User.findById(decoded.userId);

    if (!req.user) {
      return res.status(404).json({ message: 'User not found' });
    }

    next();

  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// User Schema
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

// MongoDB Connection with retry
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

// Test API
app.get('/api/test', async (req, res) => {
  try {
    const count = await User.countDocuments();
    res.json({ 
      message: 'Server + MongoDB working!', 
      users: count,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Customer Signup
app.post('/api/auth/customer-signup', async (req, res) => {
  try {
    console.log('🆕 Customer signup:', req.body.email);
    const { email, password, name, phone, address } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log('❌ User exists:', email);
      return res.status(400).json({ message: 'User already exists' });
    }

    const user = new User({
      email,
      password,
      name,
      userType: 'customer',
      phone,
      address
    });

    await user.save();
    console.log('✅ Customer created:', email);
    res.status(201).json({ message: 'Account created successfully! Please login.' });
  } catch (error) {
    console.error('💥 Signup error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Email already exists' });
    }
    res.status(500).json({ message: error.message });
  }
});

// Business Signup
app.post('/api/auth/business-signup', async (req, res) => {
  try {
    console.log('🏪 Business signup:', req.body.email);
    const { email, password, name, businessName, phone, address } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const user = new User({
      email,
      password,
      name,
      businessName,
      userType: 'business',
      phone,
      address
    });

    await user.save();
    console.log('✅ Business created:', email);
    res.status(201).json({ message: 'Business account created! Please login.' });
  } catch (error) {
    console.error('💥 Business signup error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('🔐 Login attempt for:', email);

    const user = await User.findOne({ email });
    if (!user) {
      console.log('❌ User not found:', email);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      console.log('❌ Wrong password for:', email);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email, userType: user.userType },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log('✅ LOGIN SUCCESS:', user.name, user.email, user.userType);

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        userType: user.userType,
        businessName: user.businessName
      }
    });
  } catch (error) {
    console.error('💥 Login error:', error);
    res.status(500).json({ message: 'Login server error' });
  }
});

// Profile
// ✅ BULLETPROOF Profile Endpoint
app.get('/api/auth/profile', async (req, res) => {
  try {
    console.log('🔍 Profile request - Auth header:', req.headers.authorization ? '✅ Present' : '❌ Missing');
    
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      console.log('❌ No token provided');
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('✅ Token decoded:', decoded.email);
    
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) {
      console.log('❌ User not found:', decoded.userId);
      return res.status(404).json({ message: 'User not found' });
    }

    console.log('✅ Profile served:', user.name, user.userType);
    res.json(user);
    
  } catch (error) {
    console.error('💥 Profile error:', error.message);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid/expired token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});
// Product Schema
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

// Order Schema
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
// Get featured business shops
// Get ONLY real business shops and their products - NO MOCK DATA
app.get('/api/featured', async (req, res) => {
  try {
    // Get businesses that have added products
    const businessesWithProducts = await User.aggregate([
      {
        $match: {
          userType: 'business',
          businessName: { $exists: true, $ne: null }
        }
      },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: 'businessId',
          as: 'products'
        }
      },
      {
        $match: {
          'products.0': { $exists: true } // Only businesses with products
        }
      },
      {
        $project: {
          name: '$businessName',
          ownerName: '$name',
          email: 1,
          phone: 1,
          address: 1,
          createdAt: 1,
          productCount: { $size: '$products' },
          rating: { $literal: 4.5 + (Math.random() * 0.5) } // Dynamic rating
        }
      },
      {
        $sort: { createdAt: -1 }
      },
      {
        $limit: 6
      }
    ]);

    // Get TOP 12 active, in-stock products from ALL businesses
    const activeProducts = await Product.find({
      status: 'active',
      stock: { $gt: 0 }
    })
    .populate('businessId', 'businessName name')
    .sort({ createdAt: -1 }) // Newest first
    .limit(12)
    .lean();

    // Format products exactly as business-dashboard creates them
    const formattedProducts = activeProducts.map(product => ({
      id: product._id.toString(),
      name: product.name,
      description: product.description || '',
      price: product.price,
      image: product.image || 'https://images.unsplash.com/photo-1608043152266-119cb09fc56e?w=400&fit=crop',
      shopId: product.businessId._id.toString(),
      shopName: product.businessId.businessName || product.businessId.name,
      stock: product.stock,
      category: product.category || ''
    }));

    // Format shops
    const formattedShops = businessesWithProducts.map(business => ({
      id: business._id.toString(),
      name: business.name,
      ownerName: business.ownerName,
      email: business.email,
      phone: business.phone,
      address: business.address,
      rating: business.rating,
      memberSince: new Date(business.createdAt).toISOString().split('T')[0],
      productCount: business.productCount
    }));

    console.log(`🌟 Featured: ${formattedShops.length} shops, ${formattedProducts.length} products`);

    res.json({
      shops: formattedShops,
      products: formattedProducts
    });

  } catch (error) {
    console.error('❌ Featured API error:', error);
    res.status(500).json({ 
      error: 'Failed to load featured content',
      shops: [],
      products: []
    });
  }
});

//===========================CART=========================================
// Add Cart Schema (add this after User model)
const cartSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: [{
    product: {
      id: String,
      name: String,
      price: Number,
      image: String,
      shopId: String
    },
    quantity: { type: Number, default: 1 }
  }],
  total: { type: Number, default: 0 }
}, { timestamps: true });

const Cart = mongoose.model('Cart', cartSchema);

// Add these new API endpoints (add after profile endpoint)

// Get cart
app.get('/api/cart', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (!user || user.userType !== 'customer') {
      return res.status(403).json({ message: 'Access denied' });
    }

    let cart = await Cart.findOne({ user: user._id });
    if (!cart) {
      cart = new Cart({ user: user._id, items: [], total: 0 });
      await cart.save();
    }

    res.json(cart);
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
});

// Add to cart
app.post('/api/cart/add', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (!user || user.userType !== 'customer') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { productId, name, price, image, shopId, quantity = 1 } = req.body;

    let cart = await Cart.findOne({ user: user._id });
    if (!cart) {
      cart = new Cart({ user: user._id, items: [], total: 0 });
    }

    const existingItemIndex = cart.items.findIndex(item => item.product.id === productId);
    
    if (existingItemIndex > -1) {
      cart.items[existingItemIndex].quantity += quantity;
    } else {
      cart.items.push({
        product: { id: productId, name, price, image, shopId },
        quantity
      });
    }

    cart.total = cart.items.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
    await cart.save();

    res.json({ 
      message: 'Item added to cart!', 
      cart: cart.items.length,
      total: cart.total 
    });
  } catch (error) {
    console.error('Cart error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update cart item
app.put('/api/cart/update/:productId', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (!user || user.userType !== 'customer') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { quantity } = req.body;
    const productId = req.params.productId;

    const cart = await Cart.findOne({ user: user._id });
    if (!cart) return res.status(404).json({ message: 'Cart not found' });

    const itemIndex = cart.items.findIndex(item => item.product.id === productId);
    if (itemIndex === -1) return res.status(404).json({ message: 'Item not found' });

    if (quantity <= 0) {
      cart.items.splice(itemIndex, 1);
    } else {
      cart.items[itemIndex].quantity = quantity;
    }

    cart.total = cart.items.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
    await cart.save();

    res.json({ message: 'Cart updated', total: cart.total });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Clear cart
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

// ── 3. BUSINESS STATS ENDPOINT (/api/business/stats) ─────────
app.get('/api/business/stats', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });
 
    const decoded = jwt.verify(token, JWT_SECRET);
    const business = await User.findById(decoded.userId);
    if (!business || business.userType !== 'business') {
      return res.status(403).json({ message: 'Access denied' });
    }
 
    const businessId = new mongoose.Types.ObjectId(decoded.userId); // ✅ cast
 
    const products = await Product.countDocuments({ businessId: business._id });
 
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
 
    const orders = await Order.countDocuments({
      businessId,
      status:    { $in: ['confirmed', 'shipped', 'delivered'] },
      createdAt: { $gte: monthStart }
    });
 
    const revenue = await Order.aggregate([
      { $match: {
          businessId,
          status:    'delivered',
          createdAt: { $gte: monthStart }
      }},
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]);
 
    const lowStock = await Product.countDocuments({
      businessId: business._id,
      stock:      { $lt: 10 },
      status:     'active'
    });
 
    res.json({
      totalProducts:   products,
      monthlyOrders:   orders,
      monthlyRevenue:  revenue[0]?.total || 0,
      lowStock
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
 

// Get Business Products
app.get('/api/business/products', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const business = await User.findById(decoded.userId);
    
    if (!business || business.userType !== 'business') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const products = await Product.find({ businessId: business._id })
      .sort({ createdAt: -1 })
      .lean();

    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Add Product (Updated)
app.post('/api/business/add-product', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const business = await User.findById(decoded.userId);
    
    if (!business || business.userType !== 'business') {
      return res.status(403).json({ message: 'Access denied' });
    }

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

// Update Product
app.put('/api/business/products/:id', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    
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

// Delete Product
app.delete('/api/business/products/:id', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const product = await Product.findOneAndDelete({
      _id: req.params.id,
      businessId: decoded.userId
    });

    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json({ message: 'Product deleted!' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
// ── 2. BUSINESS ORDERS ENDPOINT (/api/business/orders) ───────
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

// ================= CUSTOMER ORDERS =================
app.get('/api/customer/orders', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await User.findById(decoded.userId);

    if (!user || user.userType !== 'customer') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const orders = await Order.find({
      customerId: user._id
    })
    .sort({ createdAt: -1 })
    .lean();

    console.log(`📦 Loaded ${orders.length} customer orders`);

    res.json(orders);

  } catch (error) {
    console.error('❌ Customer orders error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Update Order Status
app.put('/api/business/orders/:id/status', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, businessId: decoded.userId },
      { status: req.body.status, trackingNumber: req.body.trackingNumber },
      { new: true }
    );

    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json({ message: 'Order status updated!', order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get Low Stock Products
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

// Update Profile
app.put('/api/business/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const user = await User.findByIdAndUpdate(
      decoded.userId,
      req.body,
      { new: true }
    ).select('-password');

    res.json({ message: 'Profile updated!', user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

//===================SHOP API Endpoints==============================
// Get single shop details
app.get('/api/business/shop/:shopId', async (req, res) => {
  try {
    const shop = await User.findById(req.params.shopId)
      .select('name businessName ownerName email phone address createdAt')
      .lean();
    
    if (!shop) return res.status(404).json({ message: 'Shop not found' });
    
    // Count products
    const productCount = await Product.countDocuments({ businessId: req.params.shopId });
    
    res.json({
      ...shop,
      name: shop.businessName || shop.name,
      ownerName: shop.name,
      productCount,
      rating: 4.5 + Math.random() * 0.5
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get shop products
app.get('/api/business/shop/:shopId/products', async (req, res) => {
  try {
    const products = await Product.find({ 
      businessId: req.params.shopId,
      status: 'active'
    })
    .populate('businessId', 'businessName')
    .sort({ createdAt: -1 })
    .lean();
    
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

//===================================================================

// Customer Profile Update - Works for BOTH customer & business
app.put('/api/customer/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Allow BOTH customer AND business users
    const user = await User.findByIdAndUpdate(
      decoded.userId,
      { 
        name: req.body.name,
        phone: req.body.phone,
        address: req.body.address 
      },
      { 
        new: true, 
        runValidators: true 
      }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    console.log('✅ Profile updated:', user.email);
    res.json({ 
      message: 'Profile updated successfully!', 
      user: {
        name: user.name,
        email: user.email,
        phone: user.phone,
        address: user.address,
        userType: user.userType
      }
    });
  } catch (error) {
    console.error('Profile update error:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Email already exists' });
    }
    res.status(500).json({ message: 'Update failed: ' + error.message });
  }
});
//====================Product Page Endpoints=========================
// Single Product
app.get('/api/products/:productId', async (req, res) => {
  try {
    const product = await Product.findById(req.params.productId)
      .populate('businessId', 'businessName name')
      .lean();
    
    if (!product) return res.status(404).json({ message: 'Product not found' });
    
    res.json({
      ...product,
      shopName: product.businessId.businessName || product.businessId.name,
      shopId: product.businessId._id
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Product Reviews (mock for now)
app.get('/api/products/:productId/reviews', async (req, res) => {
  // Mock reviews - replace with real Review model later
  res.json([
    { userName: 'Maria S.', rating: 5, comment: 'Absolutely beautiful! Perfect souvenir!', createdAt: new Date(Date.now() - 86400000) },
    { userName: 'John D.', rating: 4, comment: 'Great quality, fast shipping.', createdAt: new Date(Date.now() - 2 * 86400000) }
  ]);
});

// Add Review
app.post('/api/products/:productId/reviews', async (req, res) => {
  // Mock - save to real Review model later
  res.json({ message: 'Review added!' });
});

// Related Products
app.get('/api/products/:shopId/related', async (req, res) => {
  try {
    const { shopId, category, exclude } = req.query;
    
    const match = { 
      businessId: shopId, 
      status: 'active', 
      stock: { $gt: 0 },
      _id: { $ne: exclude }
    };
    
    if (category) match.category = category;
    
    const products = await Product.find(match)
      .limit(8)
      .lean();
    
    res.json(products);
  } catch (error) {
    res.status(500).json([]);
  }
});
//===================================================================
//==================CART CHECKOUT==================================
app.post('/api/checkout', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user || user.userType !== 'customer') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const {
      shippingAddress,
      phone,
      email,
      paymentMethod,
      notes,
      items,
      subtotal,
      tax,
      total
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'No items in order' });
    }

    const shopGroups = {};
    for (const item of items) {
      const bid = item.product.shopId || null;
      if (!shopGroups[bid]) shopGroups[bid] = [];
      shopGroups[bid].push(item);
    }

    const createdOrders = [];
    const orderNumber = 'CC' + Date.now().toString(36).toUpperCase();

    for (const [shopId, shopItems] of Object.entries(shopGroups)) {
      const shopTotal = shopItems.reduce(
        (sum, i) => sum + i.product.price * i.quantity, 0
      );
      const shopTax = shopTotal * 0.12;

      const order = new Order({
        customerId: user._id,
        businessId: shopId !== 'null' ? shopId : decoded.userId, // fallback
        items: shopItems.map(i => ({
          productId: i.product.id,
          productName: i.product.name,
          price: i.product.price,
          quantity: i.quantity,
          shopId: i.product.shopId
        })),
        total: parseFloat((shopTotal + shopTax).toFixed(2)),
        status: 'pending',
        shippingAddress,
        // store extra info in trackingNumber field until you extend the schema
        trackingNumber: JSON.stringify({
          paymentMethod,
          phone,
          email,
          notes,
          orderNumber
        })
      });

      await order.save();
      createdOrders.push(order._id.toString());
    }

    // Clear the customer's cart after successful order
    await Cart.findOneAndDelete({ user: user._id });

    console.log(`✅ Checkout success: ${orderNumber} — ${createdOrders.length} order(s) for ${user.email}`);

    res.json({
      message: 'Order placed successfully!',
      orderNumber,
      orderId: createdOrders[0],
      orders: createdOrders,
      total
    });

  } catch (error) {
    console.error('💥 Checkout error:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    res.status(500).json({ message: 'Failed to place order: ' + error.message });
  }
});

//====================================================================
// Catch-all for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


app.listen(PORT, () => {
  console.log(`\n🚀 Server: http://localhost:${PORT}`);
  console.log(`📱 Test DB: http://localhost:${PORT}/api/test`);
  console.log(`👤 Database: souvenirshop`);
});