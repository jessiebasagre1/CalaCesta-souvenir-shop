const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  customerId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  businessId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: [{
    productId:   String,
    productName: String,
    price:       Number,
    quantity:    Number,
    shopId:      String,
  }],
  total:           { type: Number, required: true },
  status:          { type: String, enum: ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'], default: 'pending' },
  shippingAddress: String,
  trackingNumber:  String,
  orderNumber:     String,
  paymentStatus:     { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },
  paymongoSessionId: { type: String },
  paidAt:            { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
