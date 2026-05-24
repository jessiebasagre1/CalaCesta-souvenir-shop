const mongoose = require('mongoose');

const voucherSchema = new mongoose.Schema({
  code:        { type: String, required: true, unique: true, uppercase: true, trim: true },
  // 'percentage' | 'fixed' | 'free_shipping'
  type:        { type: String, enum: ['percentage', 'fixed', 'free_shipping'], required: true },
  value:       { type: Number, required: true, min: 0 },
  minSpend:    { type: Number, default: 0, min: 0 },
  maxDiscount: { type: Number, default: null },   // cap for percentage discounts
  expiresAt:   { type: Date, default: null },
  usageLimit:  { type: Number, default: null },   // null = unlimited
  usageCount:  { type: Number, default: 0 },
  isActive:    { type: Boolean, default: true }
}, { timestamps: true });

// Virtual: is this voucher expired?
voucherSchema.virtual('isExpired').get(function () {
  return this.expiresAt && new Date() > this.expiresAt;
});

module.exports = mongoose.model('Voucher', voucherSchema);
