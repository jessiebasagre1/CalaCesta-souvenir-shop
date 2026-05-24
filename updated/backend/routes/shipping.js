/**
 * routes/shipping.js
 *
 * GET    /api/shipping          — list all rules (public)
 * POST   /api/shipping          — create rule (admin/business auth)
 * PUT    /api/shipping/:id      — update rule (admin/business auth)
 * DELETE /api/shipping/:id      — delete rule (admin/business auth)
 * PATCH  /api/shipping/:id/toggle — toggle isActive (admin/business auth)
 */

const router        = require('express').Router();
const ShippingRule  = require('../models/ShippingRule');
const authMiddleware = require('../middleware/auth');

// ── Helpers ──────────────────────────────────────────────────────────────────

function validateRule(body, res) {
  const { region, fee, estimatedDays } = body;
  if (!region || !region.trim())
    return res.status(400).json({ message: 'Region is required.' });
  if (fee == null || isNaN(fee) || Number(fee) < 0)
    return res.status(400).json({ message: 'Fee must be a non-negative number.' });
  if (!estimatedDays || !estimatedDays.trim())
    return res.status(400).json({ message: 'Estimated delivery days is required.' });
  return null; // no error
}

// ── GET all ──────────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const rules = await ShippingRule.find().sort({ createdAt: -1 });
    res.json(rules);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST create ──────────────────────────────────────────────────────────────

router.post('/', authMiddleware, async (req, res) => {
  const errRes = validateRule(req.body, res);
  if (errRes) return;

  try {
    const rule = await ShippingRule.create({
      region:               req.body.region.trim(),
      fee:                  Number(req.body.fee),
      freeShippingMinSpend: Number(req.body.freeShippingMinSpend) || 0,
      estimatedDays:        req.body.estimatedDays.trim(),
      isActive:             req.body.isActive !== false
    });
    res.status(201).json({ message: 'Shipping rule created.', rule });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT update ───────────────────────────────────────────────────────────────

router.put('/:id', authMiddleware, async (req, res) => {
  const errRes = validateRule(req.body, res);
  if (errRes) return;

  try {
    const rule = await ShippingRule.findByIdAndUpdate(
      req.params.id,
      {
        region:               req.body.region.trim(),
        fee:                  Number(req.body.fee),
        freeShippingMinSpend: Number(req.body.freeShippingMinSpend) || 0,
        estimatedDays:        req.body.estimatedDays.trim(),
        isActive:             req.body.isActive !== false
      },
      { new: true, runValidators: true }
    );
    if (!rule) return res.status(404).json({ message: 'Rule not found.' });
    res.json({ message: 'Shipping rule updated.', rule });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PATCH toggle ─────────────────────────────────────────────────────────────

router.patch('/:id/toggle', authMiddleware, async (req, res) => {
  try {
    const rule = await ShippingRule.findById(req.params.id);
    if (!rule) return res.status(404).json({ message: 'Rule not found.' });
    rule.isActive = !rule.isActive;
    await rule.save();
    res.json({ message: `Rule ${rule.isActive ? 'activated' : 'deactivated'}.`, rule });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE ───────────────────────────────────────────────────────────────────

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const rule = await ShippingRule.findByIdAndDelete(req.params.id);
    if (!rule) return res.status(404).json({ message: 'Rule not found.' });
    res.json({ message: 'Shipping rule deleted.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
