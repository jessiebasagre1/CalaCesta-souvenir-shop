// ✅ UPDATED CHECKOUT — replace the old placeholder checkout() in cart.html
async function checkout() {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = 'login.html';
    return;
  }

  // Verify cart isn't empty before redirecting
  try {
    const res = await fetch('/api/cart', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const cart = await res.json();

    if (!cart.items || cart.items.length === 0) {
      alert('Your cart is empty!');
      return;
    }

    window.location.href = 'checkout.html';
  } catch {
    window.location.href = 'checkout.html';
  }
}
