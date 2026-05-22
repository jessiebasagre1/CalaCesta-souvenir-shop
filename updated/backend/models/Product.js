const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  description: String,
  price:       { type: Number, required: true },
  stock:       { type: Number, default: 0 },
  image:       String,
  images:      [String],
  shopId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  businessId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  category:    String,
  status:      { type: String, enum: ['active', 'inactive', 'out-of-stock'], default: 'active' },
  avgRating:   { type: Number, default: 0 },
  reviewCount: { type: Number, default: 0 },
  isOnSale:    { type: Boolean, default: false },
  salePrice:   { type: Number, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);