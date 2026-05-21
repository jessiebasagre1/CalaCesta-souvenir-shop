const router = require('express').Router();
const Review = require('../models/Review');

// POST /api/reviews/:reviewId/helpful
router.post('/:reviewId/helpful', async (req, res) => {
  try {
    const review = await Review.findByIdAndUpdate(
      req.params.reviewId,
      { $inc: { helpful: 1 } },
      { new: true }
    );
    if (!review) return res.status(404).json({ message: 'Review not found' });
    res.json({ helpful: review.helpful });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
