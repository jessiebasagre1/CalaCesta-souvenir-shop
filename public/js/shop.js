let currentShop = null;
let shopProducts = [];
let allProducts  = [];
let categories   = [];
let shopIdGlobal = null;

// ── INIT ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await loadAuthState();

  const shopId = new URLSearchParams(window.location.search).get('id');
  if (!shopId) { window.location.href = 'index.html'; return; }

  await loadShop(shopId);
});

// ── SHOP ─────────────────────────────────────────────────────────────────────

async function loadShop(shopId) {
  shopIdGlobal = shopId;
  try {
    const res  = await fetch(`/api/business/shop/${shopId}`);
    currentShop = await res.json();
    if (!currentShop || currentShop.message) { showError('Shop not found'); return; }

    // Header
    document.title = `${currentShop.name} — Cala-Cesta`;
    document.getElementById('shopName').textContent       = currentShop.name;
    document.getElementById('shopRatingBadge').innerHTML  = `<i class="fas fa-star"></i> ${currentShop.rating?.toFixed(1) || '4.5'}`;
    document.getElementById('shopProductsCount').textContent = currentShop.productCount || 0;
    document.getElementById('shopMemberSince').textContent   = new Date(currentShop.createdAt).getFullYear();

    // Contact
    if (currentShop.ownerName) {
      document.getElementById('shopOwnerEl').innerHTML = `<i class="fas fa-user"></i> ${currentShop.ownerName}`;
    }
    if (currentShop.email) {
      document.getElementById('shopEmailEl').innerHTML = `<i class="fas fa-envelope"></i> ${currentShop.email}`;
    }
    if (currentShop.phone) {
      document.getElementById('shopPhoneEl').innerHTML = `<i class="fas fa-phone"></i> ${currentShop.phone}`;
    }

    // Load products + follow status in parallel
    await Promise.all([
      loadShopProducts(shopId),
      loadFollowStatus(shopId),
    ]);

  } catch (err) {
    console.error('Load shop error:', err);
    showError('Failed to load shop');
  }
}

// ── PRODUCTS ─────────────────────────────────────────────────────────────────

async function loadShopProducts(shopId) {
  try {
    const res   = await fetch(`/api/business/shop/${shopId}/products`);
    allProducts = await res.json();
    shopProducts = [...allProducts];

    categories = [...new Set(allProducts.map(p => p.category).filter(Boolean))];
    populateCategories();
    renderProducts();
  } catch (err) {
    console.error('Load products error:', err);
    showEmptyState();
  }
}

function populateCategories() {
  const select = document.getElementById('categoryFilter');
  select.innerHTML = '<option value="all">All Categories</option>' +
    categories.map(c => `<option value="${c}">${c}</option>`).join('');
}

function renderProducts() {
  const container = document.getElementById('shopProducts');
  const emptyState = document.getElementById('emptyState');

  if (shopProducts.length === 0) {
    container.innerHTML = '';
    emptyState.style.display = 'block';
    updateProductsCount();
    return;
  }

  emptyState.style.display = 'none';

  container.innerHTML = shopProducts.map(p => {
    const outOfStock = p.stock === 0;
    const lowStock   = p.stock > 0 && p.stock <= 5;
    const stars      = p.avgRating ? renderStars(p.avgRating) : '';
    const shopName   = (currentShop.name || '').replace(/'/g, "\\'");
    const prodName   = p.name.replace(/'/g, "\\'");
    const img        = p.image || 'https://images.unsplash.com/photo-1608043152266-119cb09fc56e?w=400&fit=crop';

    return `
      <div class="product-card">
        <div class="product-img-wrap">
          <img src="${img}" alt="${p.name}" loading="lazy"
               onerror="this.src='https://images.unsplash.com/photo-1608043152266-119cb09fc56e?w=400&fit=crop'">
          ${lowStock   ? '<span class="badge badge-hot">Low Stock</span>' : ''}
          ${p.category ? `<span class="badge badge-top" style="top:auto;bottom:12px">${p.category}</span>` : ''}
          ${outOfStock ? `<div class="out-of-stock-overlay"><span>Sold Out</span></div>` : ''}
          <button class="wishlist-btn" aria-label="Wishlist"><i class="far fa-heart"></i></button>
        </div>
        <div class="product-body">
          <div class="product-shop"><i class="fas fa-store" style="font-size:.7rem"></i> ${currentShop.name}</div>
          <div class="product-name">${p.name}</div>
          ${p.description ? `<div class="product-shop" style="margin-top:.2rem;line-height:1.4">${p.description.slice(0, 60)}${p.description.length > 60 ? '…' : ''}</div>` : ''}
          <div class="product-footer">
            <div>
              <div class="product-price">₱${p.price.toFixed(2)}</div>
              ${stars ? `<div class="product-stars">${stars} <span>(${p.reviewCount || 0})</span></div>` : ''}
              ${lowStock ? `<div class="stock-low"><i class="fas fa-exclamation-circle"></i> Only ${p.stock} left</div>` : ''}
            </div>
            <div style="display:flex;flex-direction:column;gap:.4rem;align-items:center">
              <button class="add-cart-btn" title="Add to cart"
                ${outOfStock ? 'disabled style="opacity:.45;cursor:not-allowed;background:var(--muted)"' : ''}
                onclick="addToCart('${p._id}','${prodName}',${p.price},'${img}','${currentShop._id}','${shopName}')">
                <i class="fas fa-shopping-cart"></i>
              </button>
              <a href="product.html?id=${p._id}"
                 style="width:36px;height:36px;background:var(--sand-light);border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--brown);font-size:.85rem;"
                 title="View details">
                <i class="fas fa-eye"></i>
              </a>
            </div>
          </div>
        </div>
      </div>`;
  }).join('');

  updateProductsCount();
}

function renderStars(avg) {
  let s = '';
  for (let i = 1; i <= 5; i++) {
    if (avg >= i)       s += '<i class="fas fa-star"></i>';
    else if (avg > i-1) s += '<i class="fas fa-star-half-alt"></i>';
    else                s += '<i class="far fa-star"></i>';
  }
  return s;
}

function filterProducts() {
  const cat    = document.getElementById('categoryFilter').value;
  const sort   = document.getElementById('sortFilter').value;
  const query  = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();

  let filtered = [...allProducts];

  // Search across name, description, and category
  if (query) {
    filtered = filtered.filter(p =>
      p.name.toLowerCase().includes(query) ||
      (p.description || '').toLowerCase().includes(query) ||
      (p.category    || '').toLowerCase().includes(query)
    );
  }

  if (cat && cat !== 'all') filtered = filtered.filter(p => p.category === cat);

  switch (sort) {
    case 'price-low':  filtered.sort((a, b) => a.price - b.price); break;
    case 'price-high': filtered.sort((a, b) => b.price - a.price); break;
    case 'name':       filtered.sort((a, b) => a.name.localeCompare(b.name)); break;
    default:           filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  shopProducts = filtered;
  renderProducts();
}

function updateProductsCount() {
  document.getElementById('productsCount').textContent = `${shopProducts.length} Product${shopProducts.length !== 1 ? 's' : ''}`;
}

// ── FOLLOW ────────────────────────────────────────────────────────────────────

async function loadFollowStatus(shopId) {
  const token = localStorage.getItem('token');
  try {
    const res  = await fetch(`/api/business/shop/${shopId}/follow-status`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    const data = await res.json();
    updateFollowUI(data.isFollowing, data.followerCount);
  } catch (err) {
    console.error('Follow status error:', err);
  }
}

function updateFollowUI(isFollowing, count) {
  const btn    = document.getElementById('followBtn');
  const label  = document.getElementById('followBtnText');
  const countEl = document.getElementById('followCountLabel');
  const statEl  = document.getElementById('shopFollowersCount');

  if (isFollowing) {
    btn.classList.add('following');
    label.textContent = 'Following';
    btn.querySelector('i').className = 'fas fa-heart';
  } else {
    btn.classList.remove('following');
    label.textContent = 'Follow';
    btn.querySelector('i').className = 'far fa-heart';
  }

  const fmt = count >= 1000 ? (count / 1000).toFixed(1) + 'k' : count;
  if (statEl)  statEl.textContent  = fmt;
  if (countEl) countEl.textContent = count === 1 ? '1 follower' : `${fmt} followers`;
}

async function toggleFollow() {
  const token = localStorage.getItem('token');
  if (!token) {
    if (confirm('Log in to follow this shop?')) window.location.href = 'login.html';
    return;
  }
  if (!shopIdGlobal) return;

  // Optimistic UI update
  const btn = document.getElementById('followBtn');
  btn.disabled = true;

  try {
    const res  = await fetch(`/api/business/shop/${shopIdGlobal}/follow`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.status === 403) { alert('Only customers can follow shops.'); return; }
    const data = await res.json();
    updateFollowUI(data.isFollowing, data.followerCount);
  } catch (err) {
    console.error('Follow toggle error:', err);
  } finally {
    btn.disabled = false;
  }
}

// ── CART ──────────────────────────────────────────────────────────────────────

async function updateCartBadge() {
  const token = localStorage.getItem('token');
  if (!token) return;
  try {
    const res  = await fetch('/api/cart', { headers: { Authorization: `Bearer ${token}` } });
    const cart = await res.json();
    const count = cart.items?.length || 0;
    const badge = document.getElementById('cartCount');
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  } catch (err) {
    console.error('Cart badge error:', err);
  }
}

async function addToCart(productId, name, price, image, shopId, shopName) {
  const token = localStorage.getItem('token');
  if (!token) {
    sessionStorage.setItem('pendingCartItem', JSON.stringify({ productId, name, price, image, shopId, shopName }));
    if (confirm('Log in to add items to your cart?')) window.location.href = 'login.html';
    return;
  }

  // Grab the button that was clicked
  const btn = event?.target?.closest('.add-cart-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  }

  try {
    const res = await fetch('/api/cart/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ productId, name, price, image, shopId })
    });

    const data = await res.json();

    if (res.ok) {
      // Success flash on button
      if (btn) {
        btn.innerHTML = '<i class="fas fa-check"></i>';
        btn.style.background = 'var(--success)';
        setTimeout(() => {
          btn.innerHTML = '<i class="fas fa-shopping-cart"></i>';
          btn.style.background = '';
          btn.disabled = false;
        }, 1800);
      }
      // Update the nav cart badge
      await updateCartBadge();
    } else {
      if (btn) {
        btn.innerHTML = '<i class="fas fa-shopping-cart"></i>';
        btn.disabled = false;
      }
      alert(data.message || 'Failed to add to cart');
    }
  } catch (err) {
    console.error('Add to cart error:', err);
    if (btn) {
      btn.innerHTML = '<i class="fas fa-shopping-cart"></i>';
      btn.disabled = false;
    }
    alert('Failed to add to cart');
  }
}
// ── HELPERS ───────────────────────────────────────────────────────────────────

function showEmptyState() {
  document.getElementById('shopProducts').innerHTML = '';
  document.getElementById('emptyState').style.display = 'block';
  document.getElementById('productsCount').textContent = '0 Products';
}

function showError(message) {
  document.body.innerHTML = `
    <div style="min-height:60vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;padding:2rem;text-align:center">
      <i class="fas fa-exclamation-triangle" style="font-size:3.5rem;color:var(--terracotta)"></i>
      <h2 style="font-family:'Playfair Display',serif;color:var(--brown)">${message}</h2>
      <a href="index.html" class="btn btn-primary">Back to Home</a>
    </div>`;
}