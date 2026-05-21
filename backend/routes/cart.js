const router = require('express').Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Cart = require('../models/Cart');

function calcTotal(items) {
  return items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
}

async function getCustomer(req, res) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) { res.status(401).json({ message: 'No token provided' }); return null; }
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const user = await User.findById(decoded.userId);
  if (!user || user.userType !== 'customer') { res.status(403).json({ message: 'Access denied' }); return null; }
  return user;
}

// GET /api/cart
router.get('/', async (req, res) => {
  try {
    const user = await getCustomer(req, res);
    if (!user) return;
    let cart = await Cart.findOne({ user: user._id });
    if (!cart) { cart = new Cart({ user: user._id, items: [], total: 0 }); await cart.save(); }
    res.json(cart);
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
});

// POST /api/cart/add
router.post('/add', async (req, res) => {
  try {
    const user = await getCustomer(req, res);
    if (!user) return;

    const { productId, name, price, image, shopId, quantity = 1 } = req.body;
    let cart = await Cart.findOne({ user: user._id });
    if (!cart) cart = new Cart({ user: user._id, items: [], total: 0 });

    const existingIndex = cart.items.findIndex(i => i.product.id === productId);
    if (existingIndex > -1) {
      cart.items[existingIndex].quantity += quantity;
    } else {
      cart.items.push({ product: { id: productId, name, price, image, shopId }, quantity });
    }
    cart.total = calcTotal(cart.items);
    await cart.save();
    res.json({ message: 'Item added to cart!', cart: cart.items.length, total: cart.total });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/cart/update/:productId
router.put('/update/:productId', async (req, res) => {
  try {
    const user = await getCustomer(req, res);
    if (!user) return;

    const { quantity } = req.body;
    const cart = await Cart.findOne({ user: user._id });
    if (!cart) return res.status(404).json({ message: 'Cart not found' });

    const itemIndex = cart.items.findIndex(i => i.product.id === req.params.productId);
    if (itemIndex === -1) return res.status(404).json({ message: 'Item not found' });

    if (quantity <= 0) cart.items.splice(itemIndex, 1);
    else cart.items[itemIndex].quantity = quantity;

    cart.total = calcTotal(cart.items);
    await cart.save();
    res.json({ message: 'Cart updated', total: cart.total });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/cart/clear
router.delete('/clear', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    await Cart.findOneAndDelete({ user: decoded.userId });
    res.json({ message: 'Cart cleared' });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
