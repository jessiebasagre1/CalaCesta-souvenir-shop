/**
 * routes/storeSettings.js
 *
 * GET  /api/store-settings           — business reads their own settings (auth required)
 * GET  /api/store-settings?shopId=X  — anyone can read a shop's public settings (no auth)
 * PUT  /api/store-settings           — business saves their settings (auth required)
 */

const router = require('express').Router();
const jwt    = require('jsonwebtoken');
const User   = require('../models/User');

// ── Helpers ───────────────────────────────────────────────────────────────────

function decodeToken(req) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return null;
  try { return jwt.verify(token, process.env.JWT_SECRET); }
  catch { return null; }
}

// Default settings returned when a shop hasn't saved any yet
const DEFAULTS = { taxRate: 12, discount: 0, shippingFee: 50 };

// ── GET ───────────────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const { shopId } = req.query;

    let targetUserId;

    if (shopId) {
      // Public read — anyone can fetch any shop's pricing settings
      targetUserId = shopId;
    } else {
      // Authenticated read — business fetches their own settings
      const decoded = decodeToken(req);
      if (!decoded) return res.status(401).json({ message: 'Authentication required' });
      targetUserId = decoded.userId;
    }

    const user = await User.findById(targetUserId).select('storeSettings').lean();
    if (!user) return res.status(404).json({ message: 'Shop not found' });

    res.json(user.storeSettings || DEFAULTS);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ── PUT ───────────────────────────────────────────────────────────────────────

router.put('/', async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) return res.status(401).json({ message: 'Authentication required' });

    const business = await User.findById(decoded.userId);
    if (!business || business.userType !== 'business')
      return res.status(403).json({ message: 'Only business accounts can update store settings' });

    const { taxRate, discount, shippingFee } = req.body;

    // Validate
    if (taxRate < 0 || taxRate > 100)
      return res.status(400).json({ message: 'Tax rate must be between 0 and 100' });
    if (discount < 0 || discount > 100)
      return res.status(400).json({ message: 'Discount must be between 0 and 100' });
    if (shippingFee < 0)
      return res.status(400).json({ message: 'Shipping fee cannot be negative' });

    business.storeSettings = {
      taxRate:     parseFloat(taxRate)     || 0,
      discount:    parseFloat(discount)    || 0,
      shippingFee: parseFloat(shippingFee) || 0,
    };
    await business.save();

    res.json({ message: 'Store settings saved!', storeSettings: business.storeSettings });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;