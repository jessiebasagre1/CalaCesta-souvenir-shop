// 🧠 SMART AUTH MANAGER - Auto-routes to correct dashboard
class SmartAuth {
  constructor() {
    this.init();
  }

  async init() {
    await this.loadAuthState();
    this.attachGlobalListeners();
  }

  async loadAuthState() {
    const token = localStorage.getItem('token');
    const authSection = document.getElementById('authSection');
    
    if (!authSection) return; // No auth section needed
    
    if (token) {
      try {
        const response = await fetch('/api/auth/profile', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
          const user = await response.json();
          this.renderUserMenu(user);
          localStorage.setItem('userType', user.userType);
          return user;
        } else {
          this.logout();
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        this.logout();
      }
    }
    
    this.renderLoginButtons();
  }

  renderUserMenu(user) {
    const authSection = document.getElementById('authSection');
    const profileLink = user.userType === 'business' ? 'business-dashboard.html' : 'profile.html';
    const profileText = user.userType === 'business' ? 'Dashboard' : 'Profile';
    
    authSection.innerHTML = `
      <div class="user-menu" style="display: flex; align-items: center; gap: 1rem;">
        <div style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;" onclick="smartAuth.toggleMenu()">
          <span style="font-weight: 500;">Hi, ${user.name}</span>
          <i class="fas fa-chevron-down" id="menuIcon"></i>
        </div>
        <div class="dropdown" id="userMenu" style="display: none;">
          <a href="${profileLink}">
            <i class="fas fa-${user.userType === 'business' ? 'tachometer-alt' : 'user'}"></i> 
            ${profileText}
          </a>
          <a href="cart.html"><i class="fas fa-shopping-cart"></i> Cart</a>
          <a href="#" onclick="smartAuth.logout()"><i class="fas fa-sign-out-alt"></i> Logout</a>
        </div>
      </div>
    `;
  }

  renderLoginButtons() {
    const authSection = document.getElementById('authSection');
    if (authSection) {
      authSection.innerHTML = `
        <div class="auth-buttons">
          <a href="login.html" class="btn btn-secondary">Login</a>
          <a href="signup.html" class="btn btn-primary">Sign Up</a>
        </div>
      `;
    }
  }

  toggleMenu() {
    const menu = document.getElementById('userMenu');
    const icon = document.getElementById('menuIcon');
    menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
    icon.style.transform = menu.style.display === 'block' ? 'rotate(180deg)' : 'rotate(0deg)';
  }

  async goToProfile() {
    const userType = localStorage.getItem('userType');
    if (userType === 'business') {
      window.location.href = 'business-dashboard.html';
    } else {
      window.location.href = 'profile.html';
    }
  }

  logout() {
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = 'index.html';
  }

  attachGlobalListeners() {
    document.addEventListener('click', (e) => {
      const userMenu = document.querySelector('.user-menu');
      const dropdown = document.getElementById('userMenu');
      if (userMenu && !userMenu.contains(e.target)) {
        dropdown.style.display = 'none';
      }
    });
  }
}

// 🌟 GLOBAL SMART ROUTER - Auto-redirects based on user type
document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('token');
  if (!token) return;
  
  try {
    const response = await fetch('/api/auth/profile', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.ok) {
      const user = await response.json();
      
      // 🧠 SMART REDIRECT
      const currentPage = window.location.pathname.split('/').pop();
      const isBusiness = user.userType === 'business';

      if (isBusiness && currentPage === 'profile.html') {
        window.location.href = 'business-dashboard.html';
        return;
      }

      if (!isBusiness && currentPage === 'business-dashboard.html') {
        window.location.href = 'profile.html';
        return;
      }
    }
  } catch (error) {
    localStorage.removeItem('token');
  }
  
  // Initialize auth manager
  window.smartAuth = new SmartAuth();
});

// Global functions
window.smartAuth = window.smartAuth || {};
window.smartAuth.toggleMenu = () => {};
window.smartAuth.logout = () => {};
window.smartAuth.goToProfile = () => {};
// At bottom of auth.js
window.loadAuthState = () => window.smartAuth?.loadAuthState();