const mongoose = require('mongoose');

const shippingRuleSchema = new mongoose.Schema({
  region:              { type: String, required: true, trim: true },
  fee:                 { type: Number, required: true, min: 0 },
  freeShippingMinSpend:{ type: Number, default: 0, min: 0 },
  estimatedDays:       { type: String, required: true, trim: true },
  isActive:            { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('ShippingRule', shippingRuleSchema);
