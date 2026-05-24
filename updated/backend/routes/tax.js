/**
 * routes/tax.js
 *
 * GET  /api/tax   — read current tax settings (public — needed by checkout)
 * PUT  /api/tax   — update tax settings (admin/business auth)
 */

const router       = require('express').Router();
const TaxSettings  = require('../models/TaxSettings');
const authMiddleware = require('../middleware/auth');

// ── helper: get or create singleton ──────────────────────────────────────────

async function getSettings() {
  let settings = await TaxSettings.findOne();
  if (!settings) settings = await TaxSettings.create({});
  return settings;
}

// ── GET ───────────────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const settings = await getSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT ───────────────────────────────────────────────────────────────────────

router.put('/', authMiddleware, async (req, res) => {
  try {
    const { taxRate, taxEnabled, taxMode } = req.body;

    if (taxRate == null || isNaN(taxRate) || taxRate < 0 || taxRate > 100)
      return res.status(400).json({ message: 'Tax rate must be between 0 and 100.' });

    if (taxMode && !['inclusive', 'exclusive'].includes(taxMode))
      return res.status(400).json({ message: 'taxMode must be "inclusive" or "exclusive".' });

    const settings = await getSettings();
    settings.taxRate    = parseFloat(taxRate);
    settings.taxEnabled = taxEnabled !== false;
    if (taxMode) settings.taxMode = taxMode;
    await settings.save();

    res.json({ message: 'Tax settings saved.', settings });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
