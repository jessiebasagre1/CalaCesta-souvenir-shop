const router = require('express').Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// ============================================================
// backend/routes/auth.js  — ADD these routes to your existing file
// Forgot password / OTP reset flow
// ------------------------------------------------------------
// npm install nodemailer crypto  (crypto is built-in)
// ============================================================
const crypto   = require('crypto');
const bcrypt   = require('bcryptjs');
const nodemailer = require('nodemailer');

// ── Email transporter (configure for your provider) ──────────
// For production: use SendGrid, Mailgun, Resend, etc.
// For testing:   use https://ethereal.email (generates fake credentials)
const transporter = nodemailer.createTransport({
  // Example: Gmail (use App Password, not your real password)
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,   // Gmail App Password
  },
  // OR use a generic SMTP:
  // host: 'smtp.sendgrid.net',
  // port: 587,
  // auth: { user: 'apikey', pass: process.env.SENDGRID_API_KEY }
});

// In-memory OTP store (use Redis in production for scalability)
// Format: { email: { otp, expiresAt, attempts } }
const otpStore = new Map();

// ── POST /api/auth/forgot-password ───────────────────────────
// Generates a 6-digit OTP and emails it to the user
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required.' });

    const user = await User.findOne({ email: email.toLowerCase() });
    // Always return 200 to prevent email enumeration attacks
    if (!user) return res.json({ message: 'If that email exists, a code was sent.' });

    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    otpStore.set(email.toLowerCase(), { otp, expiresAt, attempts: 0 });

    // Send OTP email
    await transporter.sendMail({
      from:    `"YourStore" <${process.env.EMAIL_USER}>`,
      to:      email,
      subject: 'Your Password Recovery Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #f7f8fc; border-radius: 16px;">
          <h2 style="color: #1a1d2e; margin-bottom: 8px;">Password Recovery</h2>
          <p style="color: #6b7280; margin-bottom: 24px;">Use the code below to reset your YourStore password. It expires in <strong>10 minutes</strong>.</p>
          <div style="background: #fff; border: 2px solid #0070e0; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
            <span style="font-size: 38px; font-weight: 800; letter-spacing: 10px; color: #0070e0;">${otp}</span>
          </div>
          <p style="color: #9ca3af; font-size: 13px;">If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    });

    res.json({ message: 'If that email exists, a code was sent.' });
  } catch (err) {
    console.error('[forgot-password error]', err.message);
    res.status(500).json({ message: 'Could not send recovery email. Please try again.' });
  }
});

// ── POST /api/auth/verify-otp ─────────────────────────────────
// Verifies the OTP and returns a short-lived reset token
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ message: 'Email and OTP are required.' });

    const record = otpStore.get(email.toLowerCase());

    if (!record)                        return res.status(400).json({ message: 'No OTP was requested for this email.' });
    if (Date.now() > record.expiresAt)  { otpStore.delete(email.toLowerCase()); return res.status(400).json({ message: 'Code has expired. Please request a new one.' }); }
    if (record.attempts >= 5)           return res.status(429).json({ message: 'Too many attempts. Please request a new code.' });

    if (record.otp !== otp.toString()) {
      record.attempts++;
      return res.status(400).json({ message: `Invalid code. ${5 - record.attempts} attempt(s) remaining.` });
    }

    // OTP matched — generate a one-time reset token (valid 15 min)
    const resetToken = jwt.sign(
      { email: email.toLowerCase(), purpose: 'password-reset' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    otpStore.delete(email.toLowerCase());
    res.json({ message: 'OTP verified.', resetToken });
  } catch (err) {
    console.error('[verify-otp error]', err.message);
    res.status(500).json({ message: 'Verification failed.' });
  }
});

// ── POST /api/auth/reset-password ────────────────────────────
// Resets the password using the reset token from verify-otp
router.post('/reset-password', async (req, res) => {
  try {
    const { email, token, newPassword } = req.body;
    if (!email || !token || !newPassword) return res.status(400).json({ message: 'All fields are required.' });
    if (newPassword.length < 8)           return res.status(400).json({ message: 'Password must be at least 8 characters.' });

    // Verify reset token
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(400).json({ message: 'Reset link has expired. Please start over.' });
    }

    if (payload.purpose !== 'password-reset' || payload.email !== email.toLowerCase()) {
      return res.status(400).json({ message: 'Invalid reset token.' });
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    const user = await User.findOneAndUpdate(
      { email: email.toLowerCase() },
      { password: hashed },
      { new: true }
    );

    if (!user) return res.status(404).json({ message: 'Account not found.' });

    // Optional: send confirmation email
    await transporter.sendMail({
      from:    `"YourStore" <${process.env.EMAIL_USER}>`,
      to:      email,
      subject: 'Your password was changed',
      html:    `<p>Hi ${user.name || 'there'},<br/><br/>Your YourStore password was successfully changed. If this wasn't you, please contact us immediately.</p>`,
    }).catch(() => {}); // non-blocking

    res.json({ message: 'Password reset successfully.' });
  } catch (err) {
    console.error('[reset-password error]', err.message);
    res.status(500).json({ message: 'Could not reset password.' });
  }
});

// POST /api/auth/customer-signup
router.post('/customer-signup', async (req, res) => {
  try {
    const { email, password, name, phone, address } = req.body;
    if (await User.findOne({ email }))
      return res.status(400).json({ message: 'User already exists' });

    const user = new User({ email, password, name, userType: 'customer', phone, address });
    await user.save();
    res.status(201).json({ message: 'Account created successfully! Please login.' });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ message: 'Email already exists' });
    res.status(500).json({ message: error.message });
  }
});

// POST /api/auth/business-signup
router.post('/business-signup', async (req, res) => {
  try {
    const { email, password, name, businessName, phone, address } = req.body;
    if (await User.findOne({ email }))
      return res.status(400).json({ message: 'User already exists' });

    const user = new User({ email, password, name, businessName, userType: 'business', phone, address });
    await user.save();
    res.status(201).json({ message: 'Business account created! Please login.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ message: 'Invalid credentials' });

    const token = jwt.sign(
      { userId: user._id, email: user.email, userType: user.userType },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({
      token,
      user: { id: user._id, email: user.email, name: user.name, userType: user.userType, businessName: user.businessName },
    });
  } catch {
    res.status(500).json({ message: 'Login server error' });
  }
});

// GET /api/auth/profile
router.get('/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) {
    if (error.name === 'JsonWebTokenError') return res.status(401).json({ message: 'Invalid/expired token' });
    if (error.name === 'TokenExpiredError') return res.status(401).json({ message: 'Token expired' });
    res.status(500).json({ message: 'Server error' });
  }
});


module.exports = router;
