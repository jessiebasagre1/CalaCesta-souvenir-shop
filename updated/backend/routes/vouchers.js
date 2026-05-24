/**
 * routes/vouchers.js
 *
 * GET    /api/vouchers            — list all vouchers (admin)
 * POST   /api/vouchers            — create voucher (admin)
 * PUT    /api/vouchers/:id        — update voucher (admin)
 * DELETE /api/vouchers/:id        — delete voucher (admin)
 * PATCH  /api/vouchers/:id/toggle — toggle isActive (admin)
 *
 * POST   /api/vouchers/validate   — validate & apply a voucher code (public — used by checkout)
 */

const router       = require('express').Router();
const Voucher      = require('../models/Voucher');
const authMiddleware = require('../middleware/auth');

// ── helpers ───────────────────────────────────────────────────────────────────

function validateBody(body, res) {
  const { code, type, value } = body;
  if (!code || !code.trim())
    return res.status(400).json({ message: 'Voucher code is required.' });
  if (!['percentage', 'fixed', 'free_shipping'].includes(type))
    return res.status(400).json({ message: 'Invalid discount type.' });
  if (value == null || isNaN(value) || Number(value) < 0)
    return res.status(400).json({ message: 'Discount value must be a non-negative number.' });
  if (type === 'percentage' && Number(value) > 100)
    return res.status(400).json({ message: 'Percentage discount cannot exceed 100.' });
  return null;
}

// ── GET all ───────────────────────────────────────────────────────────────────

router.get('/', authMiddleware, async (req, res) => {
  try {
    const vouchers = await Voucher.find().sort({ createdAt: -1 });
    res.json(vouchers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST create ───────────────────────────────────────────────────────────────

router.post('/', authMiddleware, async (req, res) => {
  const errRes = validateBody(req.body, res);
  if (errRes) return;

  try {
    const data = {
      code:        req.body.code.trim().toUpperCase(),
      type:        req.body.type,
      value:       Number(req.body.value),
      minSpend:    Number(req.body.minSpend)    || 0,
      maxDiscount: req.body.maxDiscount != null ? Number(req.body.maxDiscount) : null,
      expiresAt:   req.body.expiresAt   || null,
      usageLimit:  req.body.usageLimit  != null ? Number(req.body.usageLimit)  : null,
      isActive:    req.body.isActive !== false
    };

    const voucher = await Voucher.create(data);
    res.status(201).json({ message: 'Voucher created.', voucher });
  } catch (err) {
    if (err.code === 11000)
      return res.status(409).json({ message: 'Voucher code already exists.' });
    res.status(500).json({ message: err.message });
  }
});

// ── PUT update ────────────────────────────────────────────────────────────────

router.put('/:id', authMiddleware, async (req, res) => {
  const errRes = validateBody(req.body, res);
  if (errRes) return;

  try {
    const update = {
      code:        req.body.code.trim().toUpperCase(),
      type:        req.body.type,
      value:       Number(req.body.value),
      minSpend:    Number(req.body.minSpend)    || 0,
      maxDiscount: req.body.maxDiscount != null ? Number(req.body.maxDiscount) : null,
      expiresAt:   req.body.expiresAt   || null,
      usageLimit:  req.body.usageLimit  != null ? Number(req.body.usageLimit)  : null,
      isActive:    req.body.isActive !== false
    };

    const voucher = await Voucher.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!voucher) return res.status(404).json({ message: 'Voucher not found.' });
    res.json({ message: 'Voucher updated.', voucher });
  } catch (err) {
    if (err.code === 11000)
      return res.status(409).json({ message: 'Voucher code already exists.' });
    res.status(500).json({ message: err.message });
  }
});

// ── PATCH toggle ──────────────────────────────────────────────────────────────

router.patch('/:id/toggle', authMiddleware, async (req, res) => {
  try {
    const voucher = await Voucher.findById(req.params.id);
    if (!voucher) return res.status(404).json({ message: 'Voucher not found.' });
    voucher.isActive = !voucher.isActive;
    await voucher.save();
    res.json({ message: `Voucher ${voucher.isActive ? 'activated' : 'deactivated'}.`, voucher });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE ────────────────────────────────────────────────────────────────────

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const voucher = await Voucher.findByIdAndDelete(req.params.id);
    if (!voucher) return res.status(404).json({ message: 'Voucher not found.' });
    res.json({ message: 'Voucher deleted.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST validate (public — used by checkout) ─────────────────────────────────

router.post('/validate', async (req, res) => {
  try {
    const { code, subtotal = 0 } = req.body;
    if (!code) return res.status(400).json({ message: 'Voucher code is required.' });

    const voucher = await Voucher.findOne({ code: code.trim().toUpperCase() });
    if (!voucher)           return res.status(404).json({ message: 'Voucher not found.' });
    if (!voucher.isActive)  return res.status(400).json({ message: 'This voucher is inactive.' });
    if (voucher.expiresAt && new Date() > voucher.expiresAt)
                            return res.status(400).json({ message: 'This voucher has expired.' });
    if (voucher.usageLimit !== null && voucher.usageCount >= voucher.usageLimit)
                            return res.status(400).json({ message: 'This voucher has reached its usage limit.' });
    if (subtotal < voucher.minSpend)
                            return res.status(400).json({ message: `Minimum spend of ₱${voucher.minSpend} required.` });

    // Calculate discount amount
    let discountAmount = 0;
    if (voucher.type === 'percentage') {
      discountAmount = (subtotal * voucher.value) / 100;
      if (voucher.maxDiscount !== null) discountAmount = Math.min(discountAmount, voucher.maxDiscount);
    } else if (voucher.type === 'fixed') {
      discountAmount = Math.min(voucher.value, subtotal);
    } else if (voucher.type === 'free_shipping') {
      discountAmount = 0; // shipping is zeroed at checkout level
    }

    res.json({
      valid:          true,
      voucher:        { id: voucher._id, code: voucher.code, type: voucher.type, value: voucher.value },
      discountAmount: parseFloat(discountAmount.toFixed(2)),
      freeShipping:   voucher.type === 'free_shipping'
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
