// ============================================================
// CHECKOUT ENDPOINT — paste this BEFORE the app.listen() line
// ============================================================

app.post('/api/checkout', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user || user.userType !== 'customer') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const {
      shippingAddress,
      phone,
      email,
      paymentMethod,
      notes,
      items,
      subtotal,
      tax,
      total
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'No items in order' });
    }

    // Group cart items by businessId so each shop gets its own Order document
    const shopGroups = {};
    for (const item of items) {
      const bid = item.product.shopId || null;
      if (!shopGroups[bid]) shopGroups[bid] = [];
      shopGroups[bid].push(item);
    }

    const createdOrders = [];
    const orderNumber = 'CC' + Date.now().toString(36).toUpperCase();

    for (const [shopId, shopItems] of Object.entries(shopGroups)) {
      const shopTotal = shopItems.reduce(
        (sum, i) => sum + i.product.price * i.quantity, 0
      );
      const shopTax = shopTotal * 0.12;

      const order = new Order({
        customerId: user._id,
        businessId: shopId !== 'null' ? shopId : decoded.userId, // fallback
        items: shopItems.map(i => ({
          productId: i.product.id,
          productName: i.product.name,
          price: i.product.price,
          quantity: i.quantity,
          shopId: i.product.shopId
        })),
        total: parseFloat((shopTotal + shopTax).toFixed(2)),
        status: 'pending',
        shippingAddress,
        // store extra info in trackingNumber field until you extend the schema
        trackingNumber: JSON.stringify({
          paymentMethod,
          phone,
          email,
          notes,
          orderNumber
        })
      });

      await order.save();
      createdOrders.push(order._id.toString());
    }

    // Clear the customer's cart after successful order
    await Cart.findOneAndDelete({ user: user._id });

    console.log(`✅ Checkout success: ${orderNumber} — ${createdOrders.length} order(s) for ${user.email}`);

    res.json({
      message: 'Order placed successfully!',
      orderNumber,
      orderId: createdOrders[0],
      orders: createdOrders,
      total
    });

  } catch (error) {
    console.error('💥 Checkout error:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    res.status(500).json({ message: 'Failed to place order: ' + error.message });
  }
});
