const router = require('express').Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Order = require('../models/Order');
const Review = require('../models/Review');
const transporter = require('../utils/mailer');

function verifyToken(req) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) throw Object.assign(new Error('No token'), { status: 401 });
  return jwt.verify(token, process.env.JWT_SECRET);
}

// GET /api/customer/orders
router.get('/orders', async (req, res) => {
  try {
    const decoded = verifyToken(req);
    const user = await User.findById(decoded.userId);
    if (!user || user.userType !== 'customer')
      return res.status(403).json({ message: 'Access denied' });

    const orders = await Order.find({ customerId: user._id }).sort({ createdAt: -1 }).lean();
    res.json(orders);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
});

// PUT /api/customer/orders/:id/cancel
router.put('/orders/:id/cancel', async (req, res) => {
  try {
    const decoded = verifyToken(req);
    const order = await Order.findOne({ _id: req.params.id, customerId: decoded.userId });
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.status !== 'pending')
      return res.status(400).json({ message: 'Only pending orders can be cancelled' });

    order.status = 'cancelled';
    await order.save();
    res.json({ message: 'Order cancelled successfully', order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PUT /api/customer/profile
router.put('/profile', async (req, res) => {
  try {
    const decoded = verifyToken(req);
    const user = await User.findByIdAndUpdate(
      decoded.userId,
      { name: req.body.name, phone: req.body.phone, address: req.body.address },
      { new: true, runValidators: true }
    ).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({
      message: 'Profile updated successfully!',
      user: { name: user.name, email: user.email, phone: user.phone, address: user.address, userType: user.userType },
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError') return res.status(401).json({ message: 'Invalid token' });
    if (error.code === 11000) return res.status(400).json({ message: 'Email already exists' });
    res.status(500).json({ message: 'Update failed: ' + error.message });
  }
});

// PUT /api/customer/change-password
router.put('/change-password', async (req, res) => {
  try {
    const decoded = verifyToken(req);
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ message: 'Both fields are required' });
    if (newPassword.length < 6)
      return res.status(400).json({ message: 'New password must be at least 6 characters' });
    if (!(await user.comparePassword(currentPassword)))
      return res.status(400).json({ message: 'Current password is incorrect' });

    user.password = newPassword; // pre-save hook hashes it
    await user.save();
    res.json({ message: 'Password changed successfully!' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/customer/send-verification
router.post('/send-verification', async (req, res) => {
  try {
    const decoded = verifyToken(req);
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.emailVerified)
      return res.status(400).json({ message: 'Email is already verified' });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    user.verificationCode   = code;
    user.verificationExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    await transporter.sendMail({
      from:    `"Cala-Cesta" <${process.env.EMAIL_USER}>`,
      to:      user.email,
      subject: 'Verify your Cala-Cesta email',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;
                    padding:32px 24px;background:#f7f8fc;border-radius:16px;">
          <h2 style="color:#1a1d2e;margin-bottom:8px;">Verify your email</h2>
          <p style="color:#6b7280;margin-bottom:24px;">
            Hi ${user.name}, use the code below to verify your Cala-Cesta account.
            It expires in <strong>10 minutes</strong>.
          </p>
          <div style="background:#fff;border:2px solid #c2612a;border-radius:12px;
                      padding:20px;text-align:center;margin-bottom:24px;">
            <span style="font-size:38px;font-weight:800;letter-spacing:10px;
                         color:#c2612a;">${code}</span>
          </div>
          <p style="color:#9ca3af;font-size:13px;">
            If you didn't request this, you can safely ignore this email.
          </p>
        </div>
      `,
    });

    res.json({
      message: 'Verification code sent to your email!',
      devCode: process.env.NODE_ENV !== 'production' ? code : undefined,
    });

  } catch (err) {
    console.error('[send-verification error]', err.message);
    res.status(500).json({ message: 'Could not send verification email. Please try again.' });
  }
});
// POST /api/customer/verify-email
router.post('/verify-email', async (req, res) => {
  try {
    const decoded = verifyToken(req);
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.emailVerified) return res.status(400).json({ message: 'Email already verified' });

    const { code } = req.body;
    if (!code) return res.status(400).json({ message: 'Code is required' });
    if (!user.verificationCode || !user.verificationExpiry)
      return res.status(400).json({ message: 'No verification code found. Please request a new one.' });
    if (new Date() > user.verificationExpiry)
      return res.status(400).json({ message: 'Code has expired. Please request a new one.' });
    if (user.verificationCode !== code.trim())
      return res.status(400).json({ message: 'Incorrect code. Please try again.' });

    user.emailVerified      = true;
    user.verificationCode   = undefined;
    user.verificationExpiry = undefined;
    await user.save();
    res.json({ message: 'Email verified successfully!' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/customer/reviewed-products
router.get('/reviewed-products', async (req, res) => {
  try {
    const decoded = verifyToken(req);
    const reviews = await Review.find({ userId: decoded.userId }).select('productId').lean();
    res.json({ productIds: reviews.map(r => r.productId.toString()) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
