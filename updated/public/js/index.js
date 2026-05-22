/* ── AUTH STATE ── */
async function loadAuthState() {
  const token = localStorage.getItem('token');
  const authSection = document.getElementById('authSection');
  const cartCountEl = document.getElementById('cartCount');

  if (!token) {
    authSection.innerHTML = `
      <a href="login.html" class="btn btn-outline">Login</a>
      <a href="signup.html" class="btn btn-primary">Sign Up</a>`;
    return;
  }
  try {
    const res = await fetch('/api/auth/profile', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error();
    const user = await res.json();

    let cartCount = 0;
    try {
      const cRes = await fetch('/api/cart', { headers: { Authorization: `Bearer ${token}` } });
      const cart = await cRes.json();
      cartCount = cart.items?.length || 0;
    } catch {}

    if (cartCount > 0) {
      cartCountEl.textContent = cartCount;
      cartCountEl.style.display = 'flex';
    }

    authSection.innerHTML = `
      <div class="user-menu">
        <div class="user-avatar">${user.name.charAt(0).toUpperCase()}</div>
        <span style="font-size:.88rem;font-weight:600;color:var(--brown)">${user.name.split(' ')[0]}</span>
        <i class="fas fa-chevron-down" style="font-size:.7rem;color:var(--muted)"></i>
        <div class="dropdown">
          <a href="${user.userType==='business'?'business-dashboard.html':'profile.html'}">
            <i class="fas fa-user"></i> ${user.userType==='business'?'Dashboard':'Profile'}
          </a>
          <a href="cart.html"><i class="fas fa-shopping-cart"></i> Cart</a>
          <a href="#" onclick="logout();return false;"><i class="fas fa-sign-out-alt"></i> Logout</a>
        </div>
      </div>`;
  } catch {
    localStorage.removeItem('token');
    loadAuthState();
  }
}

function logout() { localStorage.clear(); window.location.reload(); }

/* ── CART ── */
async function addToCart(productId, name, price, image, shopId) {
  const token = localStorage.getItem('token');
  if (!token) { alert('Please login to add items to cart!'); window.location.href='login.html'; return; }
  try {
    const res = await fetch('/api/cart/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ productId, name, price, image, shopId: shopId||'Featured Shop' })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`${name} added to cart 🛒`);
      loadAuthState();
    } else { alert(data.message || 'Failed to add to cart'); }
  } catch { alert('Please login to add items to cart!'); }
}

/* ── TOAST ── */
function showToast(msg) {
  let t = document.getElementById('__toast');
  if (!t) {
    t = document.createElement('div');
    t.id = '__toast';
    t.style.cssText = `position:fixed;bottom:24px;right:24px;background:var(--brown);color:#fff;
      padding:.85rem 1.5rem;border-radius:12px;font-size:.88rem;font-weight:600;
      z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,.2);transition:all .3s;
      opacity:0;transform:translateY(16px);display:flex;align-items:center;gap:8px;`;
    document.body.appendChild(t);
  }
  t.innerHTML = `<i class="fas fa-check-circle" style="color:var(--sand)"></i>${msg}`;
  requestAnimationFrame(() => { t.style.opacity='1'; t.style.transform='translateY(0)'; });
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.opacity='0'; t.style.transform='translateY(16px)'; }, 3000);
}

/* ── RENDER PRODUCT CARD (with clickable link to product.html) ── */
function renderProductCard(product, badgeType = 'none') {
  const badges = {
    hot:  `<div class="badge badge-hot"><i class="fas fa-fire"></i> Hot</div>`,
    top:  `<div class="badge badge-top"><i class="fas fa-trophy"></i> Top</div>`,
    new:  `<div class="badge badge-new"><i class="fas fa-sparkles"></i> New</div>`,
    sale: `<div class="badge badge-sale"><i class="fas fa-tag"></i> Sale</div>`,
    none: ''
  };
  const stockHtml = product.stock <= 5 && product.stock > 0
    ? `<div class="stock-low"><i class="fas fa-exclamation-circle"></i>Only ${product.stock} left!</div>` : '';
  const oldPrice = badgeType === 'sale'
    ? `<span class="product-price-old">₱${(product.price * 1.2).toFixed(0)}</span>` : '';
  const outOfStock = product.stock === 0
    ? `<div class="out-of-stock-overlay"><span>OUT OF STOCK</span></div>` : '';
  const cartBtn = product.stock > 0
    ? `<button class="add-cart-btn" onclick="event.stopPropagation();addToCart('${product.id}','${(product.name||'').replace(/'/g,"\\'")}',${product.price},'${product.image}','${product.shopId}')" title="Add to cart"><i class="fas fa-cart-plus"></i></button>`
    : `<button class="add-cart-btn" disabled style="opacity:.4;cursor:not-allowed"><i class="fas fa-ban"></i></button>`;

  // Rating display
  const avg = product.rating || product.avgRating || 0;
  const count = product.reviewCount || 0;
  const starsHtml = avg > 0
    ? [1,2,3,4,5].map(i => `<i class="${avg >= i ? 'fas' : avg >= i-0.5 ? 'fas fa-star-half-alt' : 'far'} fa-star"></i>`).join('')
    : '★★★★★';
  const ratingLabel = avg > 0 ? `${avg.toFixed(1)} (${count})` : count > 0 ? `(${count})` : '';

  const pid = product.id || product._id;

  return `
    <div class="product-card" style="cursor:pointer" onclick="window.location.href='product.html?id=${pid}'">
      <div class="product-img-wrap">
        <img src="${product.image}" alt="${product.name}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1608043152266-119cb09fc56e?w=400&fit=crop'">
        ${badges[badgeType]}
        ${outOfStock}
        <button class="wishlist-btn" onclick="event.stopPropagation();toggleWishlist(this)" title="Add to wishlist"><i class="far fa-heart"></i></button>
      </div>
      <div class="product-body">
        <div class="product-shop"><i class="fas fa-store"></i> ${product.shopName}</div>
        <div class="product-name">${product.name}</div>
        <div class="product-stars" style="color:var(--sand-dark);font-size:.8rem">
          ${starsHtml} <span style="color:var(--muted);font-size:.75rem">${ratingLabel}</span>
        </div>
        ${stockHtml}
        <div class="product-footer">
          <div>
            <span class="product-price">₱${product.price.toFixed(2)}</span>
            ${oldPrice}
          </div>
          ${cartBtn}
        </div>
      </div>
    </div>`;
}

/* ── WISHLIST TOGGLE ── */
function toggleWishlist(btn) {
  const icon = btn.querySelector('i');
  icon.classList.toggle('far'); icon.classList.toggle('fas');
  btn.style.color = icon.classList.contains('fas') ? 'var(--terracotta)' : '';
}

/* ── LOAD FEATURED CONTENT ── */
async function loadFeaturedContent() {
  try {
    const res = await fetch('/api/featured');
    const data = await res.json();
    renderFeaturedProducts(data.products || []);
    renderHotProducts(data.products || []);
    renderShops(data.shops || []);
  } catch {
    renderFeaturedProducts([]);
    renderHotProducts([]);
    renderShops([]);
  }
}

function renderFeaturedProducts(products) {
  const el = document.getElementById('featuredProducts');
  if (!products.length) {
    el.innerHTML = `<div class="empty-state"><i class="fas fa-box-open"></i><h3>No Products Yet</h3><p>Businesses are adding amazing souvenirs. Check back soon!</p></div>`;
    return;
  }
  const badges = ['top','new','none','sale','none','none'];
  el.innerHTML = products.slice(0,6).map((p,i) => renderProductCard(p, badges[i % badges.length])).join('');
}

function renderHotProducts(products) {
  const el = document.getElementById('hotProducts');
  if (!products.length) {
    el.innerHTML = `<div class="empty-state"><i class="fas fa-fire"></i><h3>Hot Products Coming Soon</h3><p>Our bestsellers will appear here.</p></div>`;
    return;
  }
  const shuffled = [...products].sort(() => Math.random() - .5);
  el.innerHTML = shuffled.slice(0,4).map(p => renderProductCard(p, 'hot')).join('');
}

function renderShops(shops) {
  const el = document.getElementById('featuredShops');
  if (!shops.length) {
    el.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-store-slash"></i><h3>No Shops Yet</h3><p>Be the first to <a href="business-signup.html" style="color:var(--terracotta)">open your shop!</a></p></div>`;
    return;
  }
  const tagSets = [
    ['Handcrafts','Decor','Gifts'],['Jewelry','Accessories'],
    ['Food','Local Treats'],['Art','Paintings','Prints'],
    ['Clothing','Weaves'],['Collectibles','Antiques'],
  ];
  el.innerHTML = shops.map((shop, i) => {
    const tags = tagSets[i % tagSets.length];
    return `
    <div class="shop-card">
      <div class="shop-header">
        <div class="shop-icon"><i class="fas fa-store"></i></div>
        <div>
          <div class="shop-name">${shop.name}</div>
          <div class="shop-owner">by ${shop.ownerName}</div>
        </div>
      </div>
      <div class="shop-meta">
        <div class="shop-meta-item"><strong>${shop.productCount}</strong> Products</div>
        <div class="shop-rating"><i class="fas fa-star"></i> ${shop.rating.toFixed(1)}</div>
        <div class="shop-meta-item"><i class="fas fa-calendar"></i> ${shop.memberSince}</div>
      </div>
      <div class="shop-tags">${tags.map(t=>`<span class="shop-tag">${t}</span>`).join('')}</div>
      <button class="shop-btn" onclick="window.location.href='shop.html?id=${shop.id}'">
        <i class="fas fa-store"></i> Visit Shop
      </button>
    </div>`;
  }).join('');
}

/* ── NEWSLETTER ── */
function subscribeNewsletter() {
  const email = document.getElementById('emailInput').value.trim();
  if (!email || !email.includes('@')) { showToast('Please enter a valid email ✉️'); return; }
  showToast('Thanks for subscribing! 🎉');
  document.getElementById('emailInput').value = '';
}

/* ── TABS ── */
const TAB_CONFIG = {
  featured:      { url: '/api/featured',               key: 'products', badges: ['top','new','none','sale','none','none'] },
  'top-selling': { url: '/api/products-top-selling',   key: null,       badges: ['top','top','top','top','top','top'] },
  'new-arrivals':{ url: '/api/products-new-arrivals',  key: null,       badges: ['new','new','new','new','new','new'] },
  sale:          { url: '/api/products-on-sale',       key: null,       badges: ['sale','sale','sale','sale','sale','sale'] },
};

async function loadTab(tab) {
  const el = document.getElementById('featuredProducts');
  el.innerHTML = `<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Loading…</p></div>`;

  try {
    const cfg = TAB_CONFIG[tab] || TAB_CONFIG.featured;
    const res  = await fetch(cfg.url);
    const data = await res.json();
    const products = cfg.key ? (data[cfg.key] || []) : (Array.isArray(data) ? data : []);

    if (!products.length) {
      el.innerHTML = `<div class="empty-state"><i class="fas fa-box-open"></i><h3>Nothing here yet</h3><p>Check back soon!</p></div>`;
      return;
    }
    el.innerHTML = products.slice(0, 6).map((p, i) =>
      renderProductCard(p, cfg.badges[i % cfg.badges.length])
    ).join('');
  } catch {
    el.innerHTML = `<div class="empty-state"><i class="fas fa-box-open"></i><h3>Failed to load</h3><p>Please refresh.</p></div>`;
  }
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', function () {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    loadTab(this.dataset.tab);
  });
});

/* ── CATEGORIES ── */
const CATEGORY_ICONS = {
  default: 'fa-tag',
  food: 'fa-cookie', fruits: 'fa-apple-alt', vegetables: 'fa-carrot',
  clothing: 'fa-tshirt', clothes: 'fa-tshirt', fashion: 'fa-tshirt',
  jewelry: 'fa-gem', jewellery: 'fa-gem', accessories: 'fa-ring',
  crafts: 'fa-hands', handcraft: 'fa-hands', handicraft: 'fa-hands',
  art: 'fa-palette', artwork: 'fa-palette', painting: 'fa-paint-brush',
  decor: 'fa-home', decoration: 'fa-home', furniture: 'fa-couch',
  collectibles: 'fa-trophy', antiques: 'fa-history',
  toys: 'fa-gamepad', games: 'fa-gamepad',
  beauty: 'fa-spa', wellness: 'fa-spa', skincare: 'fa-spa',
  electronics: 'fa-microchip', gadgets: 'fa-microchip',
  books: 'fa-book', stationery: 'fa-pencil-alt',
  bags: 'fa-shopping-bag', shoes: 'fa-shoe-prints',
  plants: 'fa-seedling', garden: 'fa-leaf',
  souvenirs: 'fa-gift', gifts: 'fa-gift',
};

function getCategoryIcon(name) {
  const key = (name || '').toLowerCase().trim();
  for (const [k, icon] of Object.entries(CATEGORY_ICONS)) {
    if (key.includes(k)) return icon;
  }
  return CATEGORY_ICONS.default;
}

async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
    const categories = await res.json();
    const grid = document.getElementById('categoriesGrid');
    if (!grid) return;

    const allPill = `<a href="products.html" class="category-pill active" data-cat="all">
        <i class="fas fa-th-large"></i>
        <span>All Products</span>
      </a>`;

    const pills = categories.map(c => {
      const icon = getCategoryIcon(c.name);
      const encoded = encodeURIComponent(c.name);
      return `<a href="products.html?category=${encoded}" class="category-pill" data-cat="${c.name}">
        <i class="fas ${icon}"></i>
        <span>${c.name}</span>
        <em style="font-style:normal;font-size:.72rem;opacity:.65;display:block;margin-top:2px">${c.count}</em>
      </a>`;
    });

    if (pills.length === 0) {
      // Fallback: show default categories linking to products page
      const defaults = [
        { cat: 'Handcrafts', icon: 'fa-hands' },
        { cat: 'Clothing', icon: 'fa-tshirt' },
        { cat: 'Jewelry', icon: 'fa-gem' },
        { cat: 'Food', icon: 'fa-cookie' },
        { cat: 'Art', icon: 'fa-palette' },
        { cat: 'Home Decor', icon: 'fa-home' },
        { cat: 'Collectibles', icon: 'fa-trophy' },
        { cat: 'Souvenirs', icon: 'fa-gift' },
      ];
      grid.innerHTML = allPill + defaults.map(d =>
        `<a href="products.html?category=${encodeURIComponent(d.cat)}" class="category-pill" data-cat="${d.cat}">
          <i class="fas ${d.icon}"></i><span>${d.cat}</span></a>`
      ).join('');
    } else {
      grid.innerHTML = allPill + pills.join('');
    }

    // Category pills just navigate to products page
    grid.querySelectorAll('.category-pill').forEach(pill => {
      pill.addEventListener('click', e => {
        // Let navigation happen naturally (they are <a> tags)
      });
    });
  } catch {
    // silently fail — fallback HTML already in place
  }
}

document.querySelectorAll('.category-pill').forEach(pill => {
  pill.addEventListener('click', e => {
    // These are now navigation links — no need to preventDefault
  });
});

/* ── MOBILE MENU ── */
document.getElementById('menuToggle').addEventListener('click', () => {
  document.getElementById('navLinks').classList.toggle('open');
});

/* ── SCROLL REVEAL ── */
const observer = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); } });
}, { threshold: .1 });
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', async () => {
  await loadAuthState();
  await Promise.all([loadFeaturedContent(), loadCategories()]);
  setTimeout(() => {
    document.querySelectorAll('.reveal:not(.visible)').forEach(el => observer.observe(el));
  }, 500);
});