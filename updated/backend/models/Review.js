const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true },
  userName:  { type: String, required: true },
  rating:    { type: Number, required: true, min: 1, max: 5 },
  title:     { type: String, trim: true, maxlength: 120 },
  comment:   { type: String, required: true, trim: true, maxlength: 2000 },
  verified:  { type: Boolean, default: false }, // true = confirmed delivered purchase
  helpful:   { type: Number, default: 0 },
  orderId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
}, { timestamps: true });

// One review per user per product
reviewSchema.index({ productId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('Review', reviewSchema);
