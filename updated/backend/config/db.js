const mongoose = require('mongoose');

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected successfully!');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    console.log('🔄 Retrying in 3 seconds...');
    setTimeout(connectDB, 3000);
  }
}

module.exports = connectDB;
