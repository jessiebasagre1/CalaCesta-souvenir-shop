// Load featured content when page loads
document.addEventListener('DOMContentLoaded', async () => {
  await loadAuthState(); // Load auth state first
  await loadFeaturedContent();
  initDropdown(); // Initialize dropdown
});

function initDropdown() {
  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    const dropdowns = document.querySelectorAll('.dropdown');
    dropdowns.forEach(dropdown => {
      if (!e.target.closest('.user-menu')) {
        dropdown.classList.remove('active');
      }
    });
  });
}

async function loadAuthState() {
  const token = localStorage.getItem('token');
  const authSection = document.getElementById('authSection');
  
  if (token) {
    try {
      const response = await fetch('/api/auth/profile', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const user = await response.json();
        // Load cart count
        try {
          const cartResponse = await fetch('/api/cart', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const cart = await cartResponse.json();
          const cartCount = cart.items?.length || 0;
          
          authSection.innerHTML = `
            <div class="user-menu">
              <a href="cart.html" class="cart-link" title="Shopping Cart">
                <i class="fas fa-shopping-cart"></i>
                ${cartCount > 0 ? `<span class="cart-count">${cartCount}</span>` : ''}
              </a>
              <div class="user-info">
                <span>${user.name}</span>
                <i class="fas fa-chevron-down"></i>
              </div>
              <div class="dropdown">
                <a href="${user.userType === 'business' ? 'business-dashboard.html' : 'profile.html'}">
                  <i class="fas fa-user"></i>
                  ${user.userType === 'business' ? 'Dashboard' : 'Profile'}
                </a>
                <a href="cart.html"><i class="fas fa-shopping-cart"></i> Cart</a>
                <a href="#" onclick="logout(); return false;"><i class="fas fa-sign-out-alt"></i> Logout</a>
              </div>
            </div>
          `;
        } catch (cartError) {
          // Fallback if cart fails
          authSection.innerHTML = `
            <div class="user-menu">
              <a href="cart.html" class="cart-link" title="Shopping Cart">
                <i class="fas fa-shopping-cart"></i>
              </a>
              <div class="user-info">
                <span>${user.name}</span>
                <i class="fas fa-chevron-down"></i>
              </div>
              <div class="dropdown">
                <a href="profile.html"><i class="fas fa-user"></i> Profile</a>
                <a href="cart.html"><i class="fas fa-shopping-cart"></i> Cart</a>
                <a href="#" onclick="logout(); return false;"><i class="fas fa-sign-out-alt"></i> Logout</a>
              </div>
            </div>
          `;
        }
        return;
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    }
    localStorage.removeItem('token');
  }
  
  authSection.innerHTML = `
    <div class="auth-buttons">
      <a href="login.html" class="btn btn-secondary">Login</a>
      <a href="signup.html" class="btn btn-primary">Sign Up</a>
    </div>
  `;
}

// Add click toggle for dropdown (mobile-friendly)
document.addEventListener('click', function(e) {
  if (e.target.closest('.user-info')) {
    const dropdown = e.target.closest('.user-menu')?.querySelector('.dropdown');
    if (dropdown) {
      dropdown.classList.toggle('active');
    }
  }
});

// Rest of your functions remain the same...
async function addToCart(productId, name, price, image, shopId) {
  const token = localStorage.getItem('token');
  
  if (!token) {
    alert('Please login to add items to cart!');
    window.location.href = 'login.html';
    return;
  }

  try {
    const response = await fetch('/api/cart/add', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ 
        productId, 
        name, 
        price, 
        image, 
        shopId: shopId || 'Featured Shop' 
      })
    });

    const data = await response.json();
    
    if (response.ok) {
      alert(`${name} added to cart! 🛒 (Total items: ${data.cart})`);
      loadAuthState(); // Refresh cart count
    } else {
      alert(data.message || 'Failed to add to cart');
    }
  } catch (error) {
    alert('Please login to add items to cart!');
  }
}

async function loadFeaturedContent() {
  try {
    const response = await fetch('/api/featured');
    const data = await response.json();

    console.log('📦 Loaded featured:', data.shops.length, 'shops,', data.products.length, 'products');

    renderShops(data.shops);
    renderProducts(data.products);
    
    // Update shop now button
    if (data.products.length > 0) {
      document.getElementById('shopNowBtn').textContent = 'Start Shopping';
      document.getElementById('shopNowBtn').style.display = 'inline-block';
    }
  } catch (error) {
    console.error('Failed to load featured content:', error);
    showEmptyState();
  }
}

function renderProducts(products) {
  const container = document.getElementById('featuredProducts');
  
  if (!products || products.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 2rem; color: var(--dark-brown);">
        <i class="fas fa-store-slash" style="font-size: 4rem; color: var(--light-brown); margin-bottom: 1rem;"></i>
        <h3>No Products Yet</h3>
        <p>Businesses are adding amazing souvenirs. <strong>Be the first to shop!</strong></p>
        <div style="margin-top: 2rem;">
          <a href="#featured-shops" class="btn btn-primary">Browse Shops</a>
          <a href="business-signup.html" class="btn btn-secondary" style="margin-left: 1rem;">Start Your Shop</a>
        </div>
      </div>
    `;
    return;
  }

  // Show REAL products from businesses
  container.innerHTML = products.map(product => {
    const addToCartBtn = product.stock > 0 
      ? `onclick="addToCart('${product.id}', '${product.name.replace(/'/g, "\\'")}', ${product.price}, '${product.image}', '${product.shopId}', '${product.shopName.replace(/'/g, "\\'")}' )"`
      : 'disabled style="opacity: 0.5; cursor: not-allowed;"';
    
    const stockText = product.stock > 0 ? `${product.stock} left` : 'Out of stock';
    const stockColor = product.stock <= 5 ? '#dc3545' : '#28a745';

    return `
      <div class="card product-card">
        <div class="card-image" style="background-image: url('${product.image}');">
          ${product.stock <= 5 ? '<div class="low-stock-badge">Low Stock!</div>' : ''}
        </div>
        <div class="card-content">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
            <h3 style="margin: 0; font-size: 1.2rem;">${product.name}</h3>
            <div class="shop-badge" style="font-size: 0.75rem; background: var(--light-brown); color: var(--dark-brown); padding: 0.25rem 0.5rem;">
              ${product.shopName}
            </div>
          </div>
          ${product.description ? `<p style="color: #666; font-size: 0.9rem; margin-bottom: 1rem; line-height: 1.4;">${product.description}</p>` : ''}
          <div class="price" style="font-size: 1.8rem; font-weight: bold; color: var(--orange); margin-bottom: 0.75rem;">
            ₱${product.price.toFixed(2)}
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; margin-bottom: 1rem;">
            <span style="color: ${stockColor}; font-weight: 600;">
              <i class="fas fa-warehouse"></i> ${stockText}
            </span>
            ${product.category ? `<span style="background: #e9ecef; padding: 0.2rem 0.5rem; border-radius: 12px; font-size: 0.75rem;">${product.category}</span>` : ''}
          </div>
          <button class="btn btn-primary" ${addToCartBtn}>
          
            ${product.stock === 0 
              ? '<i class="fas fa-ban"></i> Out of Stock' 
              : `<i class="fas fa-shopping-cart"></i> Add to Cart`
            }
          </button>
          <a href="product.html?id=${product.id}" class="btn btn-primary" style="width: 100%; margin-top: 0.5rem; text-decoration: none;">
            <i class="fas fa-eye"></i> View Details
          </a>
        </div>
      </div>
    `;
  }).join('');
}

//Quick add to cart

async function quickAddToCart(productId, name, price, image, shopId) {
  const token = localStorage.getItem('token');
  if (!token) {
    alert('Please login to add to cart!');
    return false;
  }
  
  try {
    const response = await fetch('/api/cart/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ productId, name, price, image, shopId })
    });
    
    if (response.ok) {
      alert(`${name} added to cart! 🛒`);
      loadAuthState(); // Update cart count
      return true;
    }
  } catch (e) {
    alert('Failed to add to cart');
  }
  return false;
}

function renderShops(shops) {
  const container = document.getElementById('featuredShops');
  
  if (!shops || shops.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 2rem;">
        <i class="fas fa-users" style="font-size: 4rem; color: var(--light-brown); margin-bottom: 1rem;"></i>
        <h3>No Shops Yet</h3>
        <p>Join as a business owner and start selling your souvenirs!</p>
        <a href="business-signup.html" class="btn btn-primary" style="margin-top: 1rem;">Start Your Shop</a>
      </div>
    `;
    return;
  }

  container.innerHTML = shops.map(shop => `
    <div class="card">
      <div class="card-image" style="background-image: linear-gradient(45deg, rgba(244,162,97,0.8), rgba(210,180,140,0.8)), url('https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&fit=crop');">
        <div class="shop-badge">
          <i class="fas fa-star"></i> ${shop.productCount} Products
        </div>
      </div>
      <div class="card-content">
        <h3>${shop.name}</h3>
        <div class="shop-meta">
          <span class="rating">${shop.rating.toFixed(1)} <i class="fas fa-star" style="color: var(--orange);"></i></span>
          <span class="member-since">Since ${shop.memberSince}</span>
        </div>
        <p class="owner">by ${shop.ownerName}</p>
        <div class="shop-contact">
          <i class="fas fa-envelope"></i> ${shop.email}
        </div>
        ${shop.phone ? `<div class="shop-contact"><i class="fas fa-phone"></i> ${shop.phone}</div>` : ''}
        <button class="btn btn-primary" onclick="visitShop('${shop.id}')">
          <i class="fas fa-store"></i> Shop Now (${shop.productCount} items)
        </button>
      </div>
    </div>
  `).join('');
}

function showEmptyState() {
  const shopsContainer = document.getElementById('featuredShops');
  const productsContainer = document.getElementById('featuredProducts');
  
  shopsContainer.innerHTML = '<p>Loading shops...</p>';
  productsContainer.innerHTML = '<p>Loading products...</p>';
}
function visitShop(shopId) {
  window.location.href = `shop.html?id=${shopId}`;
}

function logout() {
  localStorage.clear();
  window.location.reload();
}