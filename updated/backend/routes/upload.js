const router = require('express').Router();
const jwt    = require('jsonwebtoken');
const upload = require('../config/upload');

// POST /api/upload
// Accepts up to 10 images, stores them on Cloudinary, returns their URLs
router.post('/', upload.array('images', 10), (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });
    jwt.verify(token, process.env.JWT_SECRET);

    // Cloudinary gives us the full URL in file.path (via multer-storage-cloudinary)
    const urls = req.files.map(f => f.path);
    res.json({ urls });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;