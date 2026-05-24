const router = require('express').Router();
const SiteReview = require('../models/SiteReview');
const authMiddleware = require('../middleware/auth');

// GET /api/site-reviews
router.get('/', async (req, res) => {
  try {
    const reviews = await SiteReview.find({ approved: true })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/site-reviews  (requires login)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { rating, comment, location } = req.body;
    if (!rating || !comment)
      return res.status(400).json({ message: 'Rating and comment are required.' });

    const review = await SiteReview.create({
      userId:   req.user._id,
      userName: req.user.name,
      location: location || '',
      rating:   Number(rating),
      comment,
    });
    res.status(201).json(review);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;