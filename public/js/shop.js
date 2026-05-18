let currentShop = null;
let shopProducts = [];
let categories = [];
let allProducts = [];

document.addEventListener('DOMContentLoaded', async () => {
  // Load auth FIRST
  await loadAuthState();
  
  const urlParams = new URLSearchParams(window.location.search);
  const shopId = urlParams.get('id');
  
  if (shopId) {
    await loadShop(shopId);
  } else {
    window.location.href = 'index.html';
  }
});

async function loadShop(shopId) {
  try {
    // Get shop details
    const shopResponse = await fetch(`/api/business/shop/${shopId}`);
    currentShop = await shopResponse.json();
    
    if (!currentShop) {
      document.body.innerHTML = '<h1>Shop not found</h1>';
      return;
    }
    
    // Populate shop header
    document.getElementById('shopTitle').textContent = `${currentShop.name} - Cala-Cesta`;
    document.getElementById('shopName').textContent = currentShop.name;
    document.getElementById('shopRating').innerHTML = `${currentShop.rating?.toFixed(1) || 4.5} <i class="fas fa-star" style="color: var(--orange);"></i>`;
    document.getElementById('shopProductsCount').textContent = `${currentShop.productCount || 0} Products`;
    document.getElementById('shopMemberSince').textContent = `Member since ${new Date(currentShop.createdAt).toLocaleDateString()}`;
    document.getElementById('shopOwner').innerHTML = `<i class="fas fa-user"></i> ${currentShop.ownerName}`;
    document.getElementById('shopEmail').innerHTML = `<i class="fas fa-envelope"></i> ${currentShop.email}`;
    if (currentShop.phone) {
      document.getElementById('shopPhone').innerHTML = `<i class="fas fa-phone"></i> ${currentShop.phone}`;
      document.getElementById('shopPhone').style.display = 'inline-block';
    }
    
    // Load products
    await loadShopProducts(shopId);
    
  } catch (error) {
    console.error('Load shop error:', error);
    showError('Shop not found');
  }
}

async function loadShopProducts(shopId) {
  try {
    const response = await fetch(`/api/business/shop/${shopId}/products`);
    shopProducts = await response.json();

    allProducts = [...shopProducts]; // SAVE ORIGINAL PRODUCTS

    // Extract categories
    categories = [...new Set(shopProducts.map(p => p.category).filter(Boolean))];

    populateCategories();

    renderProducts();
    updateProductsCount();

  } catch (error) {
    console.error('Load products error:', error);
    showEmptyState();
  }
}

function populateCategories() {
  const select = document.getElementById('categoryFilter');
  select.innerHTML = '<option value="">All Categories</option>' + 
    categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
}

function renderProducts() {
  const container = document.getElementById('shopProducts');
  
  if (shopProducts.length === 0) {
    document.getElementById('emptyState').style.display = 'block';
    document.getElementById('shopProducts').style.display = 'none';
    return;
  }
  
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('shopProducts').style.display = 'grid';
  
  container.innerHTML = shopProducts.map(product => {
    const addToCartBtn = product.stock > 0 
      ? `onclick="addToCart('${product._id}', '${product.name.replace(/'/g, "\\'")}', ${product.price}, '${product.image || ''}', '${currentShop._id}', '${currentShop.name.replace(/'/g, "\\'")}' )"`
      : 'disabled style="opacity: 0.5; cursor: not-allowed;"';
    
    return `
      <div class="card product-card">
        <div class="card-image" style="background-image: url('${product.image || 'https://images.unsplash.com/photo-1608043152266-119cb09fc56e?w=400'}');">
          ${product.stock <= 5 ? '<div class="low-stock-badge">Low Stock!</div>' : ''}
        </div>
        <div class="card-content">
          <h3>${product.name}</h3>
          ${product.description ? `<p style="color: #666; margin-bottom: 1rem;">${product.description}</p>` : ''}
          <div class="price">₱${product.price.toFixed(2)}</div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <span style="color: ${product.stock <= 5 ? '#dc3545' : '#28a745'}; font-weight: bold;">
              ${product.stock} in stock
            </span>
            ${product.category ? `<span style="background: #e9ecef; padding: 0.25rem 0.5rem; border-radius: 12px; font-size: 0.8rem;">${product.category}</span>` : ''}
          </div>
          <button class="btn btn-primary" ${addToCartBtn}>
            ${product.stock === 0 ? '<i class="fas fa-ban"></i> Sold Out' : '<i class="fas fa-shopping-cart"></i> Add to Cart'}
          </button>
          <a href="product.html?id=${product._id}" class="btn btn-primary" style="width: 100%; margin-top: 0.5rem; text-decoration: none;">
            <i class="fas fa-eye"></i> View Details
          </a>
        </div>
      </div>
    `;
  }).join('');
}

function filterProducts() {
  const category = document.getElementById('categoryFilter').value;
  const sort = document.getElementById('sortFilter').value;

  // START FROM ORIGINAL PRODUCTS
  let filtered = [...allProducts];

  // Filter by category
  if (category && category !== 'all') {
    filtered = filtered.filter(p => p.category === category);
  }

  // Sort
  switch(sort) {
    case 'price-low':
      filtered.sort((a, b) => a.price - b.price);
      break;

    case 'price-high':
      filtered.sort((a, b) => b.price - a.price);
      break;

    case 'name':
      filtered.sort((a, b) => a.name.localeCompare(b.name));
      break;

    default:
      filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      break;
  }

  // UPDATE DISPLAY PRODUCTS ONLY
  shopProducts = filtered;

  renderProducts();
  updateProductsCount();
}
function updateProductsCount() {
  document.getElementById('productsCount').textContent = `${shopProducts.length} Products`;
}

function showEmptyState() {
  document.getElementById('shopProducts').style.display = 'none';
  document.getElementById('emptyState').style.display = 'block';
}

function showError(message) {
  document.body.innerHTML = `
    <div style="text-align: center; padding: 4rem 2rem;">
      <i class="fas fa-exclamation-triangle" style="font-size: 4rem; color: var(--orange);"></i>
      <h2>${message}</h2>
      <a href="index.html" class="btn btn-primary">Back to Home</a>
    </div>
  `;
}

function toggleFollow() {
  const btn = document.getElementById('followBtn');
  const isFollowing = btn.innerHTML.includes('Following');
  
  if (isFollowing) {
    btn.innerHTML = '<i class="fas fa-heart"></i> Follow Shop';
    btn.style.background = 'var(--orange)';
  } else {
    btn.innerHTML = '<i class="fas fa-heart" style="color: #dc3545;"></i> Following';
    btn.style.background = '#dc3545';
  }
}

// Reuse addToCart from main.js
async function addToCart(productId, name, price, image, shopId, shopName) {
  const token = localStorage.getItem('token');
  
  if (!token) {
    sessionStorage.setItem('pendingCartItem', JSON.stringify({productId, name, price, image, shopId, shopName}));
    if (confirm('Login to add to cart?')) {
      window.location.href = 'login.html';
    }
    return;
  }

  try {
    const response = await fetch('/api/cart/add', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ productId, name, price, image, shopId, shopName })
    });

    if (response.ok) {
      const button = event.target;
      button.innerHTML = '<i class="fas fa-check"></i> Added!';
      button.style.background = '#28a745';
      setTimeout(() => {
        button.innerHTML = '<i class="fas fa-shopping-cart"></i> Add to Cart';
        button.style.background = '';
      }, 2000);
    }
  } catch (error) {
    alert('Failed to add to cart');
  }
}