const mongoose = require('mongoose');
const Review = require('../models/Review');
const Product = require('../models/Product');

async function refreshProductRating(productId) {
  const agg = await Review.aggregate([
    { $match: { productId: new mongoose.Types.ObjectId(productId) } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }
  ]);
  const avg = agg[0]?.avg || 0;
  await Product.findByIdAndUpdate(productId, {
    avgRating:   parseFloat(avg.toFixed(2)),
    reviewCount: agg[0]?.count || 0,
  });
}

module.exports = { refreshProductRating };
