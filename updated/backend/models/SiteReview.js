const mongoose = require('mongoose');

const siteReviewSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userName: { type: String, required: true, trim: true },
  location: { type: String, trim: true, default: '' },
  rating:   { type: Number, required: true, min: 1, max: 5 },
  comment:  { type: String, required: true, trim: true, maxlength: 1000 },
  approved: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('SiteReview', siteReviewSchema);