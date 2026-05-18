let currentProduct = null;
let reviews = [];
let relatedProducts = [];
// ✅ FIXED - Proper auth loading
document.addEventListener('DOMContentLoaded', async () => {
  // Load auth FIRST (wait for it)
  if (typeof loadAuthState === 'function') {
    await loadAuthState();
  }
  
  const urlParams = new URLSearchParams(window.location.search);
  const productId = urlParams.get('id');
  
  if (productId) {
    await loadProduct(productId);
  } else {
    showNotFound();
  }
});

async function loadProduct(productId) {
  try {
    showLoading();
    
    // Load product + shop + reviews
    const [productRes, reviewsRes] = await Promise.all([
      fetch(`/api/products/${productId}`),
      fetch(`/api/products/${productId}/reviews`)
    ]);
    
    if (!productRes.ok) throw new Error('Product not found');
    
    currentProduct = await productRes.json();
    reviews = await reviewsRes.json();
    
    document.getElementById('pageTitle').textContent = `${currentProduct.name} - Cala-Cesta`;
    renderProduct();
    loadRelatedProducts();
    initReviewForm();
    
  } catch (error) {
    console.error('Load product error:', error);
    showNotFound();
  }
}

function renderProduct() {
  document.getElementById('loadingState').style.display = 'none';
  document.getElementById('productSection').style.display = 'block';
  
  const avgRating = reviews.length > 0 
    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
    : 0;
  
  document.getElementById('mainImage').style.backgroundImage = 
    `url('${currentProduct.image || 'https://images.unsplash.com/photo-1608043152266-119cb09fc56e?w=600'}')`;
  
  document.getElementById('productInfo').innerHTML = `
    <h1 style="font-size: 2.5rem; margin-bottom: 0.5rem;">${currentProduct.name}</h1>
    <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem; color: var(--orange);">
      <i class="fas fa-star"></i>
      <span style="font-size: 1.5rem; font-weight: bold;">${avgRating}</span>
      <span style="color: #666; font-size: 0.9rem;">(${reviews.length} reviews)</span>
    </div>
    
    <div style="border-top: 2px solid var(--light-brown); padding-top: 1.5rem; margin-bottom: 2rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
        <div>
          <div class="price" style="font-size: 2.5rem; font-weight: bold; color: var(--orange); margin-bottom: 0.25rem;">
            ₱${currentProduct.price.toFixed(2)}
          </div>
          <div style="color: ${currentProduct.stock <= 5 ? '#dc3545' : '#28a745'}; font-weight: bold;">
            ${currentProduct.stock} in stock
          </div>
        </div>
        <div style="text-align: right;">
          <button class="btn btn-primary" id="addToCartBtn" onclick="addToCart()" 
                  ${currentProduct.stock === 0 ? 'disabled style="opacity: 0.5;"' : ''}>
            ${currentProduct.stock === 0 ? '❌ Sold Out' : '🛒 Add to Cart'}
          </button>
        </div>
      </div>
      
      <div style="background: #f8f9fa; padding: 1.5rem; border-radius: 12px; margin-bottom: 1.5rem;">
        <h4 style="margin-top: 0;"><i class="fas fa-store"></i> From Shop</h4>
        <p><strong>${currentProduct.shopName}</strong></p>
        <a href="shop.html?id=${currentProduct.shopId}" class="btn btn-secondary">
          <i class="fas fa-shop"></i> Visit Shop
        </a>
      </div>
      
      ${currentProduct.description ? `
        <div style="margin-bottom: 2rem;">
          <h4 style="margin-bottom: 1rem;">📝 Product Description</h4>
          <p style="line-height: 1.7; color: #555; font-size: 1.05rem;">${currentProduct.description}</p>
        </div>
      ` : ''}
      
      <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
        ${currentProduct.category ? `<span style="background: var(--light-brown); padding: 0.5rem 1rem; border-radius: 25px; font-weight: 500;">${currentProduct.category}</span>` : ''}
        <span style="background: #e9ecef; padding: 0.5rem 1rem; border-radius: 25px;">${currentProduct.stock} available</span>
      </div>
    </div>
  `;
  
  renderReviews();
}

function renderReviews() {
  const container = document.getElementById('reviewsList');
  
  if (reviews.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 3rem; color: #666;">
        <i class="fas fa-star" style="font-size: 3rem; color: var(--light-brown); margin-bottom: 1rem;"></i>
        <h4>No reviews yet</h4>
        <p>Be the first to review this product!</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = reviews.map(review => `
    <div style="display: flex; gap: 1rem; padding: 1.5rem; background: white; border-radius: 12px; box-shadow: var(--shadow);">
      <div style="flex-shrink: 0;">
        <div style="width: 50px; height: 50px; border-radius: 50%; background: var(--light-brown); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;">
          ${review.userName.slice(0,1).toUpperCase()}
        </div>
      </div>
      <div style="flex: 1;">
        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
          ${'⭐'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}
          <span style="color: #666; font-size: 0.9rem;">${new Date(review.createdAt).toLocaleDateString()}</span>
        </div>
        <h5 style="margin: 0 0 0.5rem 0;">${review.userName}</h5>
        ${review.comment ? `<p style="margin: 0; color: #555; line-height: 1.6;">${review.comment}</p>` : ''}
      </div>
    </div>
  `).join('');
}

async function loadRelatedProducts() {
  try {
    const response = await fetch(`/api/products/${currentProduct.shopId}/related?category=${currentProduct.category || ''}&exclude=${currentProduct._id}`);
    relatedProducts = await response.json();
    renderRelatedProducts();
  } catch (error) {
    console.error('Related products error:', error);
  }
}

function renderRelatedProducts() {
  const container = document.getElementById('relatedProductsList');
  
  if (relatedProducts.length === 0) {
    document.getElementById('relatedProducts').innerHTML = '<p style="text-align: center; color: #666; grid-column: 1/-1;">No related products</p>';
    return;
  }
  
  container.innerHTML = relatedProducts.slice(0, 4).map(product => `
    <div class="card product-card" onclick="window.location.href='product.html?id=${product._id}'" style="cursor: pointer;">
      <div class="card-image" style="background-image: url('${product.image}'); height: 200px;"></div>
      <div class="card-content">
        <h4 style="font-size: 1.1rem; margin-bottom: 0.5rem;">${product.name}</h4>
        <div class="price">$${product.price.toFixed(2)}</div>
      </div>
    </div>
  `).join('');
}

function initReviewForm() {
  const form = document.getElementById('reviewForm');
  if (!form) return;
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const token = localStorage.getItem('token');
    if (!token) {
      alert('Please login to leave a review');
      return;
    }
    
    const reviewData = {
      productId: currentProduct._id,
      rating: parseInt(document.getElementById('reviewRating').value),
      comment: document.getElementById('reviewText').value.trim()
    };
    
    try {
      const response = await fetch(`/api/products/${currentProduct._id}/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(reviewData)
      });
      
      if (response.ok) {
        alert('✅ Review submitted!');
        form.reset();
        document.getElementById('addReviewForm').style.display = 'none';
        loadProduct(currentProduct._id); // Reload
      }
    } catch (error) {
      alert('Failed to submit review');
    }
  });
}

async function addToCart() {
  if (currentProduct.stock === 0) return;
  
  const token = localStorage.getItem('token');
  if (!token) {
    alert('Please login to add to cart');
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
        productId: currentProduct._id,
        name: currentProduct.name,
        price: currentProduct.price,
        image: currentProduct.image,
        shopId: currentProduct.shopId,
        shopName: currentProduct.shopName
      })
    });
    
    if (response.ok) {
      const btn = document.getElementById('addToCartBtn');
      const original = btn.innerHTML;
      btn.innerHTML = '<i class="fas fa-check"></i> Added!';
      btn.style.background = '#28a745';
      setTimeout(() => {
        btn.innerHTML = original;
        btn.style.background = '';
      }, 2000);
    }
  } catch (error) {
    alert('Failed to add to cart');
  }
}

function showLoading() {
  document.getElementById('loadingState').style.display = 'block';
  document.getElementById('productSection').style.display = 'none';
  document.getElementById('notFound').style.display = 'none';
}

function showNotFound() {
  document.getElementById('loadingState').style.display = 'none';
  document.getElementById('notFound').style.display = 'block';
}