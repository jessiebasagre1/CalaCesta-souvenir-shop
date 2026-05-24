const mongoose = require('mongoose');

// Single-document config — one record for the whole platform (admin-level)
const taxSettingsSchema = new mongoose.Schema({
  taxRate:    { type: Number, required: true, min: 0, max: 100, default: 12 },
  taxEnabled: { type: Boolean, default: true },
  // 'inclusive' = tax included in price  |  'exclusive' = added at checkout
  taxMode:    { type: String, enum: ['inclusive', 'exclusive'], default: 'exclusive' }
}, { timestamps: true });

module.exports = mongoose.model('TaxSettings', taxSettingsSchema);
