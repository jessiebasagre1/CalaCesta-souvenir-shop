const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email:        { type: String, required: true, unique: true, lowercase: true },
  password:     { type: String, required: true },
  name:         { type: String, required: true },
  userType:     { type: String, enum: ['customer', 'business'], required: true },
  businessName: String,
  phone:        String,
  address:      String,
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  // Email verification
  emailVerified:      { type: Boolean, default: false },
  verificationCode:   String,
  verificationExpiry: Date,
}, { timestamps: true });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
