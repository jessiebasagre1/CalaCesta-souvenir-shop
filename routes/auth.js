const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'souvenir-shop-super-secret-key-2024';

console.log('🔐 Auth routes loaded with JWT_SECRET:', JWT_SECRET ? 'SET' : 'NOT SET');

// Customer Signup
router.post('/customer-signup', async (req, res) => {
  try {
    console.log('📝 Customer signup attempt:', req.body.email);
    
    const { email, password, name, phone, address } = req.body;
    
    if (!email || !password || !name) {
      return res.status(400).json({ message: 'Email, password, and name are required' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log('❌ User already exists:', email);
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    const user = new User({
      email: email.toLowerCase(),
      password,
      name,
      userType: 'customer',
      phone,
      address
    });

    await user.save();
    console.log('✅ Customer created:', user.email);
    
    res.status(201).json({ 
      message: 'Customer account created successfully! Please login.' 
    });
  } catch (error) {
    console.error('💥 Customer signup error:', error);
    res.status(500).json({ message: 'Server error during signup: ' + error.message });
  }
});

// Business Signup
router.post('/business-signup', async (req, res) => {
  try {
    console.log('🏪 Business signup attempt:', req.body.email);
    
    const { email, password, name, businessName, phone, address } = req.body;
    
    if (!email || !password || !name || !businessName) {
      return res.status(400).json({ message: 'All fields are required for business account' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    const user = new User({
      email: email.toLowerCase(),
      password,
      name,
      businessName,
      userType: 'business',
      phone,
      address
    });

    await user.save();
    console.log('✅ Business created:', user.email);
    
    res.status(201).json({ 
      message: 'Business account created successfully! Please login.' 
    });
  } catch (error) {
    console.error('💥 Business signup error:', error);
    res.status(500).json({ message: 'Server error during signup: ' + error.message });
  }
});

// Login - FIXED
router.post('/login', async (req, res) => {
  try {
    console.log('🔑 Login attempt:', req.body.email);
    
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      console.log('❌ No user found:', email);
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      console.log('❌ Password mismatch for:', email);
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { 
        userId: user._id, 
        email: user.email,
        userType: user.userType 
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log('✅ Login successful:', user.email, user.userType);

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
    res.status(500).json({ message: 'Login failed: ' + error.message });
  }
});

// Get user profile
router.get('/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      console.log('❌ No token provided');
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    console.error('💥 Profile error:', error.message);
    res.status(401).json({ message: 'Invalid token' });
  }
});

module.exports = router;