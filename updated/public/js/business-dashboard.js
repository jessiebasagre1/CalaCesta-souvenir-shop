 let token = localStorage.getItem('token');
  let currentUser = null;
  let products = [];
  let orders = [];
  let analyticsData = null;
  let salesChart = null;
  let catChart = null;
  let statusChart = null;
  let currentChartPeriod = 'monthly';
  let notifications = [];

  const pageTitles = {
    overview: 'Overview', products: 'Products', orders: 'Orders',
    analytics: 'Analytics', inventory: 'Inventory', profile: 'Profile'
  };

  /* ─── SECTION NAV ─────────────────────────────────────── */
  function showSection(name, btn) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.getElementById(name + '-section').classList.add('active');
    if (btn) btn.classList.add('active');
    document.getElementById('pageTitle').textContent = pageTitles[name] || name;
    if (name === 'analytics') setTimeout(renderAnalytics, 50);
    if (name === 'inventory') renderInventoryTable();
  }

  /* ─── BOOT ────────────────────────────────────────────── */
  window.addEventListener('load', async () => {
    if (!token) { window.location.href = 'login.html'; return; }
    await loadDashboard();
  });

  document.addEventListener('click', e => {
    const panel = document.getElementById('notifPanel');
    const btn   = document.getElementById('notifBellBtn');
    if (panel.classList.contains('open') && !panel.contains(e.target) && !btn.contains(e.target)) {
      panel.classList.remove('open');
    }
  });

  async function loadDashboard() {
    try {
      const res = await fetch('/api/auth/profile', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error();
      currentUser = await res.json();

      document.getElementById('shopInfo').innerHTML = `
        <div style="display:grid;grid-template-columns:120px 1fr;gap:6px 12px;font-size:14px;">
          <span style="color:var(--ink-muted);">Business</span><span style="font-weight:500;">${currentUser.businessName || '—'}</span>
          <span style="color:var(--ink-muted);">Owner</span><span>${currentUser.name}</span>
          <span style="color:var(--ink-muted);">Email</span><span>${currentUser.email}</span>
          <span style="color:var(--ink-muted);">Phone</span><span>${currentUser.phone || '—'}</span>
          <span style="color:var(--ink-muted);">Member since</span><span>${new Date(currentUser.createdAt).toLocaleDateString('en-US',{year:'numeric',month:'long'})}</span>
        </div>`;

      initProfileForm();
      await Promise.all([loadStats(), loadProducts(), loadOrders(), loadAnalytics()]);
      setInterval(loadCancelledNotifications, 30 * 1000);
    } catch {
      localStorage.clear();
      window.location.href = 'login.html';
    }
  }

  /* ─── STATS ───────────────────────────────────────────── */
  async function loadStats() {
    try {
      const res = await fetch('/api/business/stats', { headers: { Authorization: `Bearer ${token}` } });
      const s = await res.json();
      document.getElementById('totalProducts').textContent = s.totalProducts;
      document.getElementById('monthlyOrders').textContent = s.monthlyOrders;
      document.getElementById('monthlyRevenue').textContent = s.monthlyRevenue.toFixed(2);
      document.getElementById('pendingOrdersStat').textContent = s.pendingOrders || 0;

      // Build overview alerts
      buildOverviewAlerts(s);
      // Build notifications
      buildNotifications(s);
    } catch {}
  }

  function buildOverviewAlerts(s) {
    const el = document.getElementById('overviewAlerts');
    const rows = [];
    if (s.outOfStock > 0) rows.push(`
      <div class="alert-row error">
        <i class="fas fa-times-circle"></i>
        <div class="alert-row-text">Products out of stock</div>
        <span class="alert-row-count">${s.outOfStock}</span>
      </div>`);
    if (s.lowStock > 0) rows.push(`
      <div class="alert-row warn">
        <i class="fas fa-exclamation-triangle"></i>
        <div class="alert-row-text">Products with low stock</div>
        <span class="alert-row-count">${s.lowStock}</span>
      </div>`);
    if (s.pendingOrders > 0) rows.push(`
      <div class="alert-row info">
        <i class="fas fa-clock"></i>
        <div class="alert-row-text">Orders awaiting confirmation</div>
        <span class="alert-row-count">${s.pendingOrders}</span>
      </div>`);
    el.innerHTML = rows.length
      ? `<div class="alert-strip">${rows.join('')}</div>`
      : `<div class="all-clear"><i class="fas fa-check-circle" style="margin-right:8px;"></i>Everything looks great!</div>`;
  }

function buildNotifications(s) {
  notifications = [];
  if (s.outOfStock > 0) notifications.push({
    type: 'error', icon: 'fas fa-times-circle',
    title: `${s.outOfStock} product(s) are out of stock`,
    sub: 'Update stock to keep selling', unread: true
  });
  if (s.lowStock > 0) notifications.push({
    type: 'warn', icon: 'fas fa-exclamation-triangle',
    title: `${s.lowStock} product(s) running low`,
    sub: 'Stock below 10 units', unread: true
  });
  if (s.pendingOrders > 0) notifications.push({
    type: 'info', icon: 'fas fa-clock',
    title: `${s.pendingOrders} order(s) need confirmation`,
    sub: 'Check the Orders tab', unread: true
  });
  if (s.monthlyRevenue > 0) notifications.push({
    type: 'ok', icon: 'fas fa-check-circle',
    title: `₱${s.monthlyRevenue.toFixed(2)} earned this month`,
    sub: 'Great work! Keep it up.', unread: false
  });
  // Fetch cancelled order notifications and merge
  loadCancelledNotifications();
}
//===========================Cancelled Notif=========================
let seenCancelledIds = new Set();

async function loadCancelledNotifications() {
  try {
    const res = await fetch('/api/business/notifications', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return;
    const data = await res.json();

    // Remove old cancelled notifications first
    notifications = notifications.filter(n => n.type !== 'cancelled');

    // Add one notification per cancelled order
    data.cancelledOrders.forEach(order => {
      const isNew = !seenCancelledIds.has(order._id);
      notifications.unshift({
        type: 'cancelled',
        icon: 'fas fa-ban',
        title: `Order #${order.orderNumber || order._id.slice(-6).toUpperCase()} was cancelled`,
        sub: `By ${order.customerId?.name || 'customer'} · ${new Date(order.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
        unread: isNew,
        orderId: order._id
      });
      seenCancelledIds.add(order._id);
    });

    renderNotifications();
  } catch {}
}
//===========================================================

  function renderNotifications() {
  const list = document.getElementById('notifList');
  const dot  = document.getElementById('notifDot');
  const unreadCount = notifications.filter(n => n.unread).length;
  dot.style.display = unreadCount > 0 ? 'block' : 'none';

  if (!notifications.length) {
    list.innerHTML = `<div class="notif-empty"><i class="fas fa-bell-slash" style="font-size:28px;display:block;margin-bottom:8px;color:#ddd;"></i>No notifications</div>`;
    return;
  }

  // Color map including cancelled
  const iconColorMap = {
    error:     'notif-icon error',
    warn:      'notif-icon warn',
    info:      'notif-icon info',
    ok:        'notif-icon ok',
    cancelled: 'notif-icon error'
  };

  list.innerHTML = notifications.map((n, i) => `
    <div class="notif-item ${n.unread ? 'unread' : ''}" onclick="markRead(${i})">
      <div class="${iconColorMap[n.type] || 'notif-icon info'}">
        <i class="${n.icon}"></i>
      </div>
      <div class="notif-text">
        <div class="notif-title">${n.title}</div>
        <div class="notif-sub">${n.sub}</div>
      </div>
    </div>`).join('');
}

  function toggleNotifPanel(e) {
    e.stopPropagation();
    document.getElementById('notifPanel').classList.toggle('open');
  }

  function markRead(i) {
    notifications[i].unread = false;
    renderNotifications();
  }

  function clearNotifications() {
    notifications.forEach(n => n.unread = false);
    renderNotifications();
  }

  /* ─── PRODUCTS ────────────────────────────────────────── */
  async function loadProducts() {
    try {
      const res = await fetch('/api/business/products', { headers: { Authorization: `Bearer ${token}` } });
      products = await res.json();
      renderProducts();
      renderInventoryTable();
    } catch {}
  }

  function renderProducts() {
  filterProducts();
}

function filterProducts() {
  const el      = document.getElementById('productsList');
  const count   = document.getElementById('prodResultCount');
  const search  = (document.getElementById('prodSearch')?.value || '').toLowerCase();
  const catF    = document.getElementById('prodCategoryFilter')?.value || '';
  const statusF = document.getElementById('prodStatusFilter')?.value || '';
  const sortF   = document.getElementById('prodSortFilter')?.value || '';

  let filtered = products.filter(p => {
    const matchName   = p.name.toLowerCase().includes(search) || (p.category || '').toLowerCase().includes(search) || (p.description || '').toLowerCase().includes(search);
    const matchCat    = !catF    || (p.category || '') === catF;
    const matchStatus = !statusF || p.status === statusF;
    return matchName && matchCat && matchStatus;
  });

  if (sortF === 'top-sales')       filtered.sort((a, b) => (b.soldCount || 0) - (a.soldCount || 0));
  else if (sortF === 'low-sales')  filtered.sort((a, b) => (a.soldCount || 0) - (b.soldCount || 0));
  else if (sortF === 'price-high') filtered.sort((a, b) => b.price - a.price);
  else if (sortF === 'price-low')  filtered.sort((a, b) => a.price - b.price);

  if (count) count.textContent = filtered.length !== products.length ? `Showing ${filtered.length} of ${products.length} products` : `${products.length} products`;

  if (!products.length) {
    el.innerHTML = `<div class="empty-state"><i class="fas fa-box-open"></i><p>No products yet. Add your first one!</p></div>`;
    return;
  }
  if (!filtered.length) {
    el.innerHTML = `<div class="empty-state"><i class="fas fa-search"></i><p>No products match your filters.</p></div>`;
    return;
  }
  el.innerHTML = filtered.map(p => `
    <div class="product-card" id="pcard-${p._id}">
      <div class="product-img">
        ${p.image ? `<img src="${p.image}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'">` : `<i class="fas fa-image" style="opacity:.3;"></i>`}
      </div>
      <div class="product-body">
        <div style="display:flex;align-items:start;justify-content:space-between;gap:8px;">
          <div class="product-name">${p.name}</div>
          <span class="badge ${p.status === 'active' ? 'badge-delivered' : 'badge-cancelled'}" style="flex-shrink:0;">${p.status}</span>
        </div>
        <div class="product-desc">${p.description || 'No description'}</div>
        <div class="product-footer">
          <div class="product-price">₱${p.price.toFixed(2)}</div>
          <span class="product-stock ${p.stock < 10 ? 'stock-low' : 'stock-ok'}">${p.stock} in stock</span>
        </div>
        ${p.soldCount ? `<div style="font-size:11px;color:#c2612a;margin-top:4px;font-weight:600;">★ ${p.soldCount} sold</div>` : ''}
        <div class="product-actions">
          <button class="icon-btn" onclick="editProduct('${p._id}')" title="Edit"><i class="fas fa-pencil-alt"></i></button>
          <button class="icon-btn danger" onclick="deleteProduct('${p._id}')" title="Delete"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    </div>`).join('');
}

  /* ─── INVENTORY TABLE ─────────────────────────────────── */
  function renderInventoryTable() {
    filterInventory();
  }

  function filterInventory() {
    const search = (document.getElementById('invSearch')?.value || '').toLowerCase();
    const statusF = document.getElementById('invStatus')?.value || '';
    const stockF  = document.getElementById('invStockFilter')?.value || '';

    let filtered = products.filter(p => {
      const matchName = p.name.toLowerCase().includes(search) || (p.category || '').toLowerCase().includes(search);
      const matchStatus = !statusF || p.status === statusF;
      let matchStock = true;
      if (stockF === 'zero') matchStock = p.stock === 0;
      else if (stockF === 'low') matchStock = p.stock > 0 && p.stock < 10;
      else if (stockF === 'ok') matchStock = p.stock >= 10;
      return matchName && matchStatus && matchStock;
    });

    const tbody = document.getElementById('invTableBody');
    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="inv-empty"><i class="fas fa-search"></i>No products match your filters</div></td></tr>`;
    } else {
      tbody.innerHTML = filtered.map(p => {
        const stockClass = p.stock === 0 ? 'zero' : p.stock < 10 ? 'low' : 'ok';
        const stockIcon  = p.stock === 0 ? 'fas fa-times-circle' : p.stock < 10 ? 'fas fa-exclamation-triangle' : 'fas fa-check-circle';
        const statusClass = p.status === 'active' ? 'sp-active' : p.status === 'inactive' ? 'sp-inactive' : 'sp-out';
        return `
          <tr id="invrow-${p._id}">
            <td>
            </td>
            <td>
              <div class="inv-name">${p.name}</div>
              <div class="inv-desc">${p.description || '—'}</div>
            </td>
            <td style="color:#888;font-size:12px;">${p.category || '—'}</td>
            <td style="font-weight:700;color:var(--orange,#c2612a);">₱${p.price.toFixed(2)}</td>
            <td>
              <span class="stock-pill ${stockClass}">
                <i class="${stockIcon}" style="font-size:11px;"></i> ${p.stock}
              </span>
            </td>
            <td><span class="status-pill ${statusClass}">${p.status}</span></td>
            <td>
              <div style="display:flex;align-items:center;gap:6px;">
                <input type="number" class="inline-qty" id="qty-${p._id}" value="${p.stock}" min="0" placeholder="0">
                <button class="btn-sm save" onclick="quickUpdateStock('${p._id}')">
                  <i class="fas fa-save"></i>
                </button>
              </div>
            </td>
            <td>
              <div style="display:flex;gap:6px;">
                <button class="btn-sm edit" onclick="editProduct('${p._id}')"><i class="fas fa-pencil-alt"></i> Edit</button>
                <button class="btn-sm del" onclick="deleteProduct('${p._id}')"><i class="fas fa-trash"></i></button>
              </div>
            </td>
          </tr>`;
      }).join('');
    }

    // Summary
    const lowCount  = products.filter(p => p.stock > 0 && p.stock < 10).length;
    const zeroCount = products.filter(p => p.stock === 0).length;
    document.getElementById('invSummaryTotal').textContent = `${filtered.length} of ${products.length} products`;
    document.getElementById('invSummaryLow').textContent   = lowCount  ? `⚠ ${lowCount} low stock` : '';
    document.getElementById('invSummaryZero').textContent  = zeroCount ? `✕ ${zeroCount} out of stock` : '';
  }

  async function quickUpdateStock(id) {
    const input = document.getElementById(`qty-${id}`);
    const newStock = parseInt(input.value);
    if (isNaN(newStock) || newStock < 0) { showToast('Invalid stock value', 'error'); return; }
    const p = products.find(x => x._id === id);
    if (!p) return;
    const status = newStock === 0 ? 'out-of-stock' : p.status === 'out-of-stock' ? 'active' : p.status;
    try {
      const res = await fetch(`/api/business/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...p, stock: newStock, status })
      });
      if (res.ok) {
        const idx = products.findIndex(x => x._id === id);
        if (idx !== -1) { products[idx].stock = newStock; products[idx].status = status; }
        patchProductCard(id, { ...p, stock: newStock, status });
        filterInventory();
        loadStats();
        showToast(`Stock updated to ${newStock}`, 'success');
      }
    } catch { showToast('Failed to update stock', 'error'); }
  }

  /* ─── ORDERS ──────────────────────────────────────────── */
  async function loadOrders() {
    try {
      const res = await fetch('/api/business/orders', { headers: { Authorization: `Bearer ${token}` } });
      orders = await res.json();
      renderOrders();
    } catch {}
  }

  function renderOrders() {
  const tbody = document.getElementById('ordersList');
  if (!orders.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--ink-muted);">No orders yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = orders.map(o => `
    <tr>
      <td style="font-weight:500;">#${o.orderNumber || o._id.slice(-6).toUpperCase()}</td>
      <td>${o.customerId?.name || '—'}</td>
      <td style="color:var(--ink-muted);">${new Date(o.createdAt).toLocaleDateString()}</td>
      <td style="font-weight:600;color:var(--orange);">₱${o.total.toFixed(2)}</td>
      <td><span class="badge badge-${o.status}">${o.status}</span></td>
      <td>
        ${o.status === 'cancelled'
          ? `<span style="font-size:12px;color:#c53030;font-weight:600;"><i class="fas fa-times-circle"></i> Cancelled by customer</span>`
          : `<select class="status-select" onchange="updateOrderStatus('${o._id}', this.value)">
              <option value="pending"   ${o.status==='pending'   ?'selected':''}>Pending</option>
              <option value="confirmed" ${o.status==='confirmed' ?'selected':''}>Confirmed</option>
              <option value="shipped"   ${o.status==='shipped'   ?'selected':''}>Shipped</option>
              <option value="delivered" ${o.status==='delivered' ?'selected':''}>Delivered</option>
              <option value="cancelled" ${o.status==='cancelled' ?'selected':''}>Cancelled</option>
            </select>`
        }
      </td>
    </tr>`).join('');
}
  /* ─── ANALYTICS (REAL DATA) ───────────────────────────── */
  async function loadAnalytics() {
    try {
      const res = await fetch('/api/business/analytics', { headers: { Authorization: `Bearer ${token}` } });
      analyticsData = await res.json();
    } catch { analyticsData = null; }
  }

  function renderAnalytics() {
    if (!analyticsData) return;
    const { monthlySales, dailySales, categoryRevenue, topProducts, orderStatusBreakdown, conversionStats } = analyticsData;

    // KPIs
    document.getElementById('aKpiRev').textContent    = conversionStats.totalRevenue.toFixed(2);
    document.getElementById('aKpiOrders').textContent = conversionStats.totalOrders;
    document.getElementById('aKpiAov').textContent    = conversionStats.avgOrderValue.toFixed(2);
    document.getElementById('aKpiCust').textContent   = conversionStats.uniqueCustomers;

    const growthEl = document.getElementById('aKpiGrowth');
    if (conversionStats.growth !== null) {
      const g = parseFloat(conversionStats.growth);
      growthEl.className = `kpi-growth ${g > 0 ? 'pos' : g < 0 ? 'neg' : 'neu'}`;
      growthEl.innerHTML = `<i class="fas fa-arrow-${g >= 0 ? 'up' : 'down'}"></i> ${Math.abs(g)}% vs last month`;
    } else {
      growthEl.textContent = 'No prior month data';
    }

    const delivPct = conversionStats.totalOrders > 0
      ? Math.round((conversionStats.deliveredOrders / conversionStats.totalOrders) * 100) : 0;
    document.getElementById('aKpiDelivered').textContent = `${delivPct}% delivery rate`;

    // Draw charts
    drawSalesChart(monthlySales, dailySales);
    drawCategoryChart(categoryRevenue);
    drawStatusChart(orderStatusBreakdown);
    renderTopProducts(topProducts);
  }

  function drawSalesChart(monthly, daily) {
    const ctx = document.getElementById('salesChart');
    if (!ctx) return;
    if (salesChart) salesChart.destroy();

    const data = currentChartPeriod === 'monthly' ? monthly : daily;
    const labels  = data.map(d => d.label);
    const revenue = data.map(d => d.revenue);
    const orderCount = data.map(d => d.orders);

    salesChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            type: 'bar',
            label: 'Revenue (₱)',
            data: revenue,
            backgroundColor: 'rgba(194,97,42,0.15)',
            borderColor: '#c2612a',
            borderWidth: 1.5,
            borderRadius: 6,
            yAxisID: 'y'
          },
          {
            type: 'line',
            label: 'Orders',
            data: orderCount,
            borderColor: '#2d6a4f',
            backgroundColor: 'transparent',
            borderWidth: 2,
            pointRadius: 4,
            pointBackgroundColor: '#2d6a4f',
            tension: 0.4,
            yAxisID: 'y2'
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: true, position: 'top', labels: { font: { size: 12 }, usePointStyle: true, boxWidth: 8 } },
          tooltip: {
            callbacks: {
              label: ctx => ctx.dataset.yAxisID === 'y'
                ? `Revenue: ₱${ctx.raw.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
                : `Orders: ${ctx.raw}`
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
          y: {
            beginAtZero: true, position: 'left',
            grid: { color: 'rgba(0,0,0,0.04)' },
            ticks: { callback: v => '₱' + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v) }
          },
          y2: {
            beginAtZero: true, position: 'right',
            grid: { display: false },
            ticks: { stepSize: 1, callback: v => Number.isInteger(v) ? v : '' }
          }
        }
      }
    });
  }

  function switchChartPeriod(period, btn) {
    currentChartPeriod = period;
    document.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    if (analyticsData) drawSalesChart(analyticsData.monthlySales, analyticsData.dailySales);
  }

  function drawCategoryChart(catRev) {
    const ctx = document.getElementById('categoryChart');
    if (!ctx) return;
    if (catChart) catChart.destroy();
    const colors = ['#c2612a','#2d6a4f','#1b4f8a','#9a6b00','#c0392b','#6b46c1','#2c7a7b','#78716c'];
    catChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: catRev.length ? catRev.map(c => c.name) : ['No data'],
        datasets: [{
          label: 'Revenue (₱)',
          data: catRev.length ? catRev.map(c => c.revenue) : [0],
          backgroundColor: catRev.length ? catRev.map((_, i) => colors[i % colors.length]) : ['#eee'],
          borderRadius: 8, borderSkipped: false
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => `₱${ctx.raw.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` } }
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' },
            ticks: { callback: v => '₱' + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v) }
          }
        }
      }
    });
  }

  function drawStatusChart(statusMap) {
    const ctx = document.getElementById('statusChart');
    if (!ctx) return;
    if (statusChart) statusChart.destroy();
    const labels = ['pending','confirmed','shipped','delivered','cancelled'];
    const colorMap = { pending:'#f6ad55', confirmed:'#63b3ed', shipped:'#76e4f7', delivered:'#68d391', cancelled:'#fc8181' };
    const data = labels.map(l => statusMap[l] || 0);
    const total = data.reduce((a,b) => a+b, 0);

    statusChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data, backgroundColor: labels.map(l => colorMap[l]), borderWidth: 3, borderColor: '#fff', hoverOffset: 6 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '70%',
        plugins: { legend: { display: false } }
      }
    });

    // Legend
    document.getElementById('statusLegend').innerHTML = labels.map((l, i) => `
      <div class="legend-item">
        <div class="legend-dot" style="background:${colorMap[l]}"></div>
        <span class="legend-label" style="text-transform:capitalize;">${l}</span>
        <span class="legend-count">${data[i]}</span>
        <span style="font-size:10px;color:#bbb;">${total > 0 ? Math.round((data[i]/total)*100) : 0}%</span>
      </div>`).join('');
  }

  function renderTopProducts(top) {
    const el = document.getElementById('topProdList');
    if (!top || !top.length) {
      el.innerHTML = `<li style="color:#aaa;font-size:13px;padding:20px 0;text-align:center;">No sales data yet</li>`;
      return;
    }
    const rankClass = i => i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
    el.innerHTML = top.map((p, i) => `
      <li class="top-prod-item">
        <span class="top-rank ${rankClass(i)}">${i + 1}</span>
        <div style="flex:1;min-width:0;">
          <div class="top-prod-name">${p.name}</div>
          <div class="top-prod-cat">${p.category || 'Uncategorized'} · ${p.units} units sold</div>
          <div class="top-bar"><div class="top-bar-fill" style="width:${p.pct}%"></div></div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div class="top-rev">₱${p.revenue.toFixed(2)}</div>
          <div class="top-units">${p.units} sold</div>
        </div>
      </li>`).join('');
  }

  /* ─── ADD PRODUCT ─────────────────────────────────────── */
  function openAddProduct()  { document.getElementById('addProductOverlay').classList.add('open'); }
  function closeAddProduct() {
  document.getElementById('addProductOverlay').classList.remove('open');
  ['productName','productPrice','productStock','productCategory','productImage','productDescription']
    .forEach(id => document.getElementById(id).value = '');
  addProductImages = [];
  document.getElementById('addImgPreviewGrid').innerHTML = '';
  const area = document.getElementById('addImgUploadArea');
  area.innerHTML = `<i class="fas fa-cloud-upload-alt" style="font-size:1.8rem;color:#bbb;margin-bottom:6px"></i><div style="font-size:13px;color:#888">Click to upload or drag & drop</div><div style="font-size:11px;color:#bbb;margin-top:2px">PNG, JPG, WEBP up to 5MB · Max 10 images</div>`;
}
  function handleOverlayClick(e) { if (e.target === document.getElementById('addProductOverlay')) closeAddProduct(); }

/* ─── IMAGE UPLOAD HELPERS ────────────────────────────── */
let addProductImages = []; // array of URLs for new product
let editProductImages = []; // array of URLs for edit product

async function uploadImages(files) {
  const formData = new FormData();
  Array.from(files).forEach(f => formData.append('images', f));
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData
  });
  if (!res.ok) throw new Error('Upload failed');
  const data = await res.json();
  return data.urls;
}

function renderImgPreviewGrid(containerId, images, onRemove) {
  const grid = document.getElementById(containerId);
  if (!grid) return;
  grid.innerHTML = images.map((url, i) => `
    <div class="img-preview-thumb ${i === 0 ? 'primary' : ''}" id="thumb-${containerId}-${i}">
      <img src="${url}" onerror="this.src='https://images.unsplash.com/photo-1608043152266-119cb09fc56e?w=100&fit=crop'">
      ${i === 0 ? '<span class="primary-badge">Primary</span>' : ''}
      <button class="remove-img" onclick="${onRemove}(${i})" title="Remove">✕</button>
    </div>`).join('');
}

// ── ADD PRODUCT images ──
async function handleAddImgUpload(event) {
  const files = event.target.files;
  if (!files.length) return;
  const area = document.getElementById('addImgUploadArea');
  area.innerHTML = `<i class="fas fa-spinner fa-spin" style="font-size:1.4rem;color:#c2612a"></i><div style="font-size:12px;color:#888;margin-top:4px">Uploading ${files.length} image(s)…</div>`;
  try {
    const urls = await uploadImages(files);
    addProductImages = [...addProductImages, ...urls];
    renderImgPreviewGrid('addImgPreviewGrid', addProductImages, 'removeAddImg');
    area.innerHTML = `<i class="fas fa-cloud-upload-alt" style="font-size:1.8rem;color:#bbb;margin-bottom:6px"></i><div style="font-size:13px;color:#888">Click to add more images</div>`;
    showToast(`${urls.length} image(s) uploaded!`, 'success');
  } catch {
    area.innerHTML = `<i class="fas fa-cloud-upload-alt" style="font-size:1.8rem;color:#bbb;margin-bottom:6px"></i><div style="font-size:13px;color:#888">Click to upload or drag & drop</div>`;
    showToast('Upload failed — try again', 'error');
  }
  event.target.value = '';
}

function handleAddImgUrl(url) {
  if (!url || !url.startsWith('http')) return;
  if (!addProductImages.includes(url)) {
    addProductImages = [url, ...addProductImages.filter(u => u !== url)];
    renderImgPreviewGrid('addImgPreviewGrid', addProductImages, 'removeAddImg');
  }
}

function removeAddImg(i) {
  addProductImages.splice(i, 1);
  renderImgPreviewGrid('addImgPreviewGrid', addProductImages, 'removeAddImg');
}

// ── EDIT PRODUCT images ──
async function handleEpImgUpload(event) {
  const files = event.target.files;
  if (!files.length) return;
  const area = document.getElementById('epImgUploadArea');
  area.innerHTML = `<i class="fas fa-spinner fa-spin" style="font-size:1.4rem;color:#c2612a"></i><div style="font-size:12px;color:#888;margin-top:4px">Uploading…</div>`;
  try {
    const urls = await uploadImages(files);
    editProductImages = [...editProductImages, ...urls];
    renderImgPreviewGrid('epImgPreviewGrid', editProductImages, 'removeEpImg');
    // Set primary image in URL field and preview
    if (editProductImages.length > 0) {
      document.getElementById('epImage').value = editProductImages[0];
      updateImagePreview();
    }
    area.innerHTML = `<i class="fas fa-cloud-upload-alt" style="font-size:1.6rem;color:#bbb;margin-bottom:4px"></i><div style="font-size:12px;color:#888">Click to add more images</div>`;
    showToast(`${urls.length} image(s) uploaded!`, 'success');
  } catch {
    area.innerHTML = `<i class="fas fa-cloud-upload-alt" style="font-size:1.6rem;color:#bbb;margin-bottom:4px"></i><div style="font-size:12px;color:#888">Click to upload · Max 10 images</div>`;
    showToast('Upload failed — try again', 'error');
  }
  event.target.value = '';
}
//===========PRIMARY VIEW IMAGE UPLOAD==========
async function handleEpPrimaryUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const area = document.getElementById('epPrimaryUploadArea');
  area.innerHTML = `<i class="fas fa-spinner fa-spin" style="font-size:1.2rem;color:#c2612a"></i>
    <div style="font-size:12px;color:#888;margin-top:4px">Uploading…</div>`;

  try {
    const formData = new FormData();
    formData.append('images', file);
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });
    if (!res.ok) throw new Error('Upload failed');
    const data = await res.json();
    const url = data.urls[0];

    // Set hidden field (used by saveEditProduct)
    document.getElementById('epImage').value = url;

    // Update preview
    const preview = document.getElementById('epImgPreview');
    const placeholder = document.getElementById('epImgPlaceholder');
    preview.src = url;
    preview.style.display = 'block';
    placeholder.style.display = 'none';
    document.getElementById('epPrimaryFileName').textContent = file.name;

    // Also push to top of editProductImages so it stays primary
    editProductImages = [url, ...editProductImages.filter(u => u !== url)];
    renderImgPreviewGrid('epImgPreviewGrid', editProductImages, 'removeEpImg');

    // Reset upload area
    area.innerHTML = `<i class="fas fa-cloud-upload-alt" style="font-size:1.4rem;color:#bbb;margin-bottom:4px;display:block;"></i>
      <div style="font-size:12px;color:#888;">Click to replace primary image</div>
      <div style="font-size:10px;color:#bbb;margin-top:2px;">PNG, JPG, WEBP up to 5MB</div>`;

    showToast('Primary image uploaded!', 'success');
  } catch {
    area.innerHTML = `<i class="fas fa-cloud-upload-alt" style="font-size:1.4rem;color:#bbb;margin-bottom:4px;display:block;"></i>
      <div style="font-size:12px;color:#888;">Click to upload primary image</div>
      <div style="font-size:10px;color:#bbb;margin-top:2px;">PNG, JPG, WEBP up to 5MB</div>`;
    showToast('Upload failed — try again', 'error');
  }
  event.target.value = '';
}

  function handleEpImgUrl(url) {
    if (!url || !url.startsWith('http')) return;
    if (!editProductImages.includes(url)) {
      editProductImages = [url, ...editProductImages.filter(u => u !== url)];
      renderImgPreviewGrid('epImgPreviewGrid', editProductImages, 'removeEpImg');
    }
  }

  function removeEpImg(i) {
    editProductImages.splice(i, 1);
    renderImgPreviewGrid('epImgPreviewGrid', editProductImages, 'removeEpImg');
    if (editProductImages.length > 0) {
      document.getElementById('epImage').value = editProductImages[0];
      updateImagePreview();
    } else {
      document.getElementById('epImage').value = '';
      updateImagePreview();
    }
  }

  async function addProduct() {
  const name  = document.getElementById('productName').value;
  const price = parseFloat(document.getElementById('productPrice').value);
  if (!name || !price) { showToast('Name and price are required', 'error'); return; }

  // Primary image: first uploaded, or URL field
  const urlField = document.getElementById('productImage').value;
  const primaryImage = addProductImages[0] || urlField || '';

  const data = {
    name,
    price,
    stock:       parseInt(document.getElementById('productStock').value) || 0,
    category:    document.getElementById('productCategory').value,
    description: document.getElementById('productDescription').value,
    image:       primaryImage,
    images:      addProductImages.length ? addProductImages : (urlField ? [urlField] : [])
  };

  try {
    const res = await fetch('/api/business/add-product', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data)
    });
    const json = await res.json();
    if (res.ok) {
      closeAddProduct();
      showToast('Product added!', 'success');
      await loadProducts();
      await loadStats();
      await loadAnalytics();
    } else {
      showToast(json.message || 'Failed to add', 'error');
    }
  } catch { showToast('Failed to add product', 'error'); }
}

  /* ─── EDIT PRODUCT ────────────────────────────────────── */
 function editProduct(id) {
  const p = products.find(x => x._id === id);
  if (!p) { showToast('Product not found', 'error'); return; }

  // Load existing images
  editProductImages = p.images?.length ? [...p.images] : (p.image ? [p.image] : []);

  document.getElementById('editProductId').value  = p._id;
  document.getElementById('epName').value         = p.name || '';
  document.getElementById('epPrice').value        = p.price ?? '';
  document.getElementById('epStock').value        = p.stock ?? '';
  document.getElementById('epCategory').value     = p.category || '';
  document.getElementById('epStatus').value       = p.status || 'active';
  // Set hidden field
  document.getElementById('epImage').value = editProductImages[0] || p.image || '';

  // Show existing primary image in the new preview area
  const existingPrimary = editProductImages[0] || p.image || '';
  const preview = document.getElementById('epImgPreview');
  const placeholder = document.getElementById('epImgPlaceholder');
  if (existingPrimary) {
    preview.src = existingPrimary;
    preview.style.display = 'block';
    placeholder.style.display = 'none';
    document.getElementById('epPrimaryFileName').textContent = 'Current image';
  } else {
    preview.style.display = 'none';
    placeholder.style.display = 'flex';
    document.getElementById('epPrimaryFileName').textContent = '';
  }
  document.getElementById('epDescription').value  = p.description || '';

  renderImgPreviewGrid('epImgPreviewGrid', editProductImages, 'removeEpImg');
  updateImagePreview(); updateStockIndicator(); updatePricePreview();
  document.getElementById('editProductOverlay').classList.add('open');
}

  function closeEditProduct() { document.getElementById('editProductOverlay').classList.remove('open'); }
  function handleEditOverlayClick(e) { if (e.target === document.getElementById('editProductOverlay')) closeEditProduct(); }

  function updateImagePreview() {
    const url = document.getElementById('epImage').value.trim();
    const img = document.getElementById('epImgPreview');
    const ph  = document.getElementById('epImgPlaceholder');
    if (url) { img.src = url; img.style.display = 'block'; ph.style.display = 'none'; }
    else { img.style.display = 'none'; ph.style.display = 'flex'; }
  }
  function imgError() {
    document.getElementById('epImgPreview').style.display = 'none';
    document.getElementById('epImgPlaceholder').style.display = 'flex';
  }
  function updateStockIndicator() {
    const val = parseInt(document.getElementById('epStock').value) || 0;
    const el  = document.getElementById('stockIndicator');
    el.style.display = 'flex';
    if (val === 0) { el.className = 'stock-indicator zero'; el.innerHTML = '<i class="fas fa-times-circle"></i> Out of stock'; }
    else if (val < 10) { el.className = 'stock-indicator low'; el.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Low stock — only ${val} left`; }
    else { el.className = 'stock-indicator ok'; el.innerHTML = `<i class="fas fa-check-circle"></i> ${val} units in stock`; }
  }
  function updatePricePreview() {
    const val = parseFloat(document.getElementById('epPrice').value);
    document.getElementById('pricePreview').textContent = !isNaN(val) && val > 0 ? `→ ₱${val.toFixed(2)} per unit` : '';
  }

  async function saveEditProduct() {
    const id  = document.getElementById('editProductId').value;
    const btn = document.getElementById('saveEditBtn');
    const updated = {
      name:        document.getElementById('epName').value.trim(),
      price:       parseFloat(document.getElementById('epPrice').value),
      stock:       parseInt(document.getElementById('epStock').value) || 0,
      category:    document.getElementById('epCategory').value.trim(),
      status:      document.getElementById('epStatus').value,
      image:       editProductImages[0] || document.getElementById('epImage').value.trim(),
      images:      editProductImages.length ? editProductImages : [],
      description: document.getElementById('epDescription').value.trim()
    };
    if (!updated.name) { showToast('Product name is required','error'); return; }
    if (isNaN(updated.price) || updated.price <= 0) { showToast('Enter a valid price','error'); return; }
    btn.disabled = true;
    btn.innerHTML = '<span class="saving-spin"></span> Saving…';
    try {
      const res = await fetch(`/api/business/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(updated)
      });
      const json = await res.json();
      if (res.ok) {
        const idx = products.findIndex(p => p._id === id);
        if (idx !== -1) products[idx] = { ...products[idx], ...updated };
        patchProductCard(id, updated);
        filterInventory();
        closeEditProduct();
        showToast('Product updated!', 'success');
        loadStats();
      } else {
        showToast(json.message || 'Failed to save','error');
      }
    } catch {
      showToast('Save failed — check your connection','error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
    }
  }

  function patchProductCard(id, p) {
    const card = document.getElementById(`pcard-${id}`);
    if (!card) { renderProducts(); return; }
    const imgWrap = card.querySelector('.product-img');
    imgWrap.innerHTML = p.image
      ? `<img src="${p.image}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'">`
      : `<i class="fas fa-image" style="opacity:.3;"></i>`;
    card.querySelector('.product-name').textContent = p.name;
    card.querySelector('.product-desc').textContent = p.description || 'No description';
    card.querySelector('.product-price').textContent = `₱${p.price.toFixed(2)}`;
    const stockEl = card.querySelector('.product-stock');
    stockEl.textContent = `${p.stock} in stock`;
    stockEl.className = `product-stock ${p.stock < 10 ? 'stock-low' : 'stock-ok'}`;
    const badge = card.querySelector('.badge');
    badge.textContent = p.status;
    badge.className = `badge ${p.status === 'active' ? 'badge-delivered' : 'badge-cancelled'}`;
  }

  /* ─── DELETE PRODUCT ──────────────────────────────────── */
  async function deleteProduct(id) {
    if (!confirm('Delete this product? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/business/products/${id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        products = products.filter(p => p._id !== id);
        renderProducts();
        filterInventory();
        await loadStats();
        showToast('Product deleted','success');
      }
    } catch { showToast('Failed to delete','error'); }
  }

  /* ─── ORDER STATUS ────────────────────────────────────── */
  async function updateOrderStatus(id, status) {
    try {
      const res = await fetch(`/api/business/orders/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        showToast('Order status updated', 'success');
        await loadOrders();
        await loadStats();
        await loadAnalytics();
        if (document.getElementById('analytics-section').classList.contains('active')) renderAnalytics();
      }
    } catch { showToast('Failed to update order','error'); }
  }

  /* ─── PROFILE ─────────────────────────────────────────── */
  function initProfileForm() {
  document.getElementById('editBusinessName').value = currentUser.businessName || '';
  document.getElementById('editName').value         = currentUser.name || '';
  document.getElementById('editPhone').value        = currentUser.phone || '';
  document.getElementById('editAddress').value      = currentUser.address || '';
  document.getElementById('editEmail').value        = currentUser.email || '';

  // Render email verification state
  renderBVerifySection();

  document.getElementById('profileForm').addEventListener('submit', async e => {
    e.preventDefault();
    const update = {
      businessName: document.getElementById('editBusinessName').value,
      name:         document.getElementById('editName').value,
      phone:        document.getElementById('editPhone').value,
      address:      document.getElementById('editAddress').value
    };
    try {
      const res = await fetch('/api/business/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(update)
      });
      if (res.ok) {
        currentUser = { ...currentUser, ...update };
        document.getElementById('sidebarShopName').textContent = currentUser.businessName || 'Your Shop';
        showToast('Profile updated!', 'success');
      } else {
        showToast('Failed to update profile', 'error');
      }
    } catch { showToast('Update failed', 'error'); }
  });
}

function renderBVerifySection() {
  const el = document.getElementById('bVerifySection');
  if (!el) return;

  if (currentUser.emailVerified) {
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:.6rem;padding:.75rem 1rem;background:#f0fff4;border-radius:10px;border:1px solid #c6f6d5">
        <i class="fas fa-check-circle" style="color:#276749;font-size:1.1rem"></i>
        <div>
          <div style="font-weight:600;font-size:.9rem;color:#276749">Email Verified</div>
          <div style="font-size:.78rem;color:#68d391">${currentUser.email}</div>
        </div>
      </div>`;
  } else {
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:.6rem;padding:.75rem 1rem;background:#fffbeb;border-radius:10px;border:1px solid #fde68a;margin-bottom:1rem">
        <i class="fas fa-exclamation-triangle" style="color:#d97706;font-size:1.1rem"></i>
        <div>
          <div style="font-weight:600;font-size:.9rem;color:#d97706">Email Not Verified</div>
          <div style="font-size:.78rem;color:#b7791f">${currentUser.email}</div>
        </div>
      </div>
      <div id="bVerifyStep1">
        <button class="btn btn-primary" style="width:100%" onclick="bSendVerificationCode()">
          <i class="fas fa-paper-plane"></i> Send Verification Code
        </button>
      </div>
      <div id="bVerifyStep2" style="display:none;margin-top:.75rem">
        <label style="font-size:.82rem;color:#888;font-weight:600;display:block;margin-bottom:.4rem">
          Enter the 6-digit code sent to your email
        </label>
        <div style="display:flex;gap:.5rem">
          <input type="text" id="bVerifyCodeInput" maxlength="6" placeholder="000000"
            class="form-input" style="flex:1;letter-spacing:.2em;text-align:center;font-size:1rem">
          <button class="btn btn-primary" onclick="bVerifyEmailCode()" style="white-space:nowrap">
            <i class="fas fa-check"></i> Verify
          </button>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:.5rem">
          <span style="font-size:.75rem;color:#aaa" id="bCodeExpiry">Code expires in 10:00</span>
          <button style="font-size:.75rem;color:#c2612a;background:none;border:none;cursor:pointer;font-weight:600"
            onclick="bSendVerificationCode()">Resend code</button>
        </div>
      </div>`;
  }
}

  /* ─── TOAST ───────────────────────────────────────────── */
  function showToast(msg, type = 'success') {
    const t = document.getElementById('dashToast');
    const i = t.querySelector('i');
    i.className = type === 'success' ? 'fas fa-check-circle' : 'fas fa-exclamation-circle';
    t.className = `dash-toast ${type}`;
    document.getElementById('dashToastMsg').textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3200);
  }

  /* ─── CHANGE PASSWORD (BUSINESS) ──────────────────────── */
function bTogglePw(inputId, iconId) {
  const input = document.getElementById(inputId);
  const icon  = document.getElementById(iconId);
  if (!input) return;
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  icon.className = isHidden ? 'fas fa-eye-slash' : 'fas fa-eye';
}

function bCheckStrength(val) {
  const bar  = document.getElementById('bPwStrengthBar');
  const fill = document.getElementById('bPwStrengthFill');
  const lbl  = document.getElementById('bPwStrengthLabel');
  if (!bar) return;
  if (!val) { bar.style.display = 'none'; return; }
  bar.style.display = 'block';

  let score = 0;
  if (val.length >= 6)  score++;
  if (val.length >= 10) score++;
  if (/[A-Z]/.test(val)) score++;
  if (/[0-9]/.test(val)) score++;
  if (/[^A-Za-z0-9]/.test(val)) score++;

  const levels = [
    { label: 'Very weak',   color: '#e53e3e', width: '20%' },
    { label: 'Weak',        color: '#dd6b20', width: '40%' },
    { label: 'Fair',        color: '#d69e2e', width: '60%' },
    { label: 'Strong',      color: '#38a169', width: '80%' },
    { label: 'Very strong', color: '#276749', width: '100%' },
  ];
  const lvl = levels[Math.min(score, 4)];
  fill.style.width = lvl.width;
  fill.style.background = lvl.color;
  lbl.textContent = lvl.label;
  lbl.style.color = lvl.color;
}

async function bChangePassword() {
  const currentPassword = document.getElementById('bCurrentPassword')?.value.trim();
  const newPassword     = document.getElementById('bNewPassword')?.value.trim();
  const confirmPassword = document.getElementById('bConfirmPassword')?.value.trim();

  if (!currentPassword) return showToast('Enter your current password', 'error');
  if (!newPassword)     return showToast('Enter a new password', 'error');
  if (newPassword.length < 6) return showToast('New password must be at least 6 characters', 'error');
  if (newPassword !== confirmPassword) return showToast('Passwords do not match', 'error');
  if (currentPassword === newPassword) return showToast('New password must be different from current', 'error');

  try {
    const res = await fetch('/api/customer/change-password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const data = await res.json();
    if (res.ok) {
      showToast('Password changed successfully!');
      ['bCurrentPassword', 'bNewPassword', 'bConfirmPassword'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      const bar = document.getElementById('bPwStrengthBar');
      if (bar) bar.style.display = 'none';
    } else {
      showToast(data.message || 'Failed to change password', 'error');
    }
  } catch {
    showToast('Network error — please try again', 'error');
  }
}

/* ─── EMAIL VERIFICATION (BUSINESS) ───────────────────── */
let bVerifyCountdown = null;

async function bSendVerificationCode() {
  try {
    const res = await fetch('/api/customer/send-verification', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (res.ok) {
      showToast('Verification code sent to your email!');
      const step1 = document.getElementById('bVerifyStep1');
      const step2 = document.getElementById('bVerifyStep2');
      if (step1) step1.style.display = 'none';
      if (step2) step2.style.display = 'block';
      bStartCountdown(10 * 60);
    } else {
      showToast(data.message || 'Failed to send code', 'error');
    }
  } catch {
    showToast('Network error — please try again', 'error');
  }
}

function bStartCountdown(seconds) {
  if (bVerifyCountdown) clearInterval(bVerifyCountdown);
  let remaining = seconds;
  bVerifyCountdown = setInterval(() => {
    remaining--;
    const el = document.getElementById('bCodeExpiry');
    if (!el) { clearInterval(bVerifyCountdown); return; }
    const m = Math.floor(remaining / 60).toString().padStart(2, '0');
    const s = (remaining % 60).toString().padStart(2, '0');
    el.textContent = `Code expires in ${m}:${s}`;
    if (remaining <= 0) {
      clearInterval(bVerifyCountdown);
      el.textContent = 'Code expired — please resend';
      el.style.color = '#e53e3e';
    }
  }, 1000);
}

async function bVerifyEmailCode() {
  const code = document.getElementById('bVerifyCodeInput')?.value.trim();
  if (!code || code.length !== 6) return showToast('Enter the 6-digit code', 'error');

  try {
    const res = await fetch('/api/customer/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ code })
    });
    const data = await res.json();
    if (res.ok) {
      if (bVerifyCountdown) clearInterval(bVerifyCountdown);
      showToast('Email verified successfully! 🎉');
      currentUser.emailVerified = true;
      renderBVerifySection();
    } else {
      showToast(data.message || 'Invalid code', 'error');
    }
  } catch {
    showToast('Network error — please try again', 'error');
  }
}

/* ═══════════════════════════════════════════════════════════════
   CALA-CESTA — MOBILE SIDEBAR TOGGLE
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── Create hamburger button ── */
  const hamburger = document.createElement('button');
  hamburger.className = 'sidebar-hamburger';
  hamburger.id = 'sidebarHamburger';
  hamburger.setAttribute('aria-label', 'Open menu');
  hamburger.setAttribute('aria-expanded', 'false');
  hamburger.innerHTML = '<i class="fas fa-bars"></i>';
  document.body.appendChild(hamburger);

  /* ── Create backdrop ── */
  const backdrop = document.createElement('div');
  backdrop.className = 'sidebar-backdrop';
  backdrop.id = 'sidebarBackdrop';
  document.body.appendChild(backdrop);

  const sidebar = document.querySelector('.sidebar');

  function openSidebar() {
    sidebar.classList.add('open');
    backdrop.classList.add('open');
    hamburger.setAttribute('aria-expanded', 'true');
    hamburger.innerHTML = '<i class="fas fa-times"></i>';
    document.body.style.overflow = 'hidden'; /* prevent body scroll while drawer open */
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    backdrop.classList.remove('open');
    hamburger.setAttribute('aria-expanded', 'false');
    hamburger.innerHTML = '<i class="fas fa-bars"></i>';
    document.body.style.overflow = '';
  }

  hamburger.addEventListener('click', function (e) {
    e.stopPropagation();
    sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
  });

  /* Close on backdrop tap */
  backdrop.addEventListener('click', closeSidebar);

  /* Close when a nav item is tapped (auto-navigate UX) */
  if (sidebar) {
    sidebar.querySelectorAll('.nav-item').forEach(function (btn) {
      btn.addEventListener('click', function () {
        /* Only close on mobile widths */
        if (window.innerWidth <= 768) {
          closeSidebar();
        }
      });
    });
  }

  /* Close on Escape key */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeSidebar();
  });

  /* On resize above 768px, reset sidebar to normal (non-overlay) state */
  window.addEventListener('resize', function () {
    if (window.innerWidth > 768) {
      sidebar.classList.remove('open');
      backdrop.classList.remove('open');
      document.body.style.overflow = '';
      hamburger.innerHTML = '<i class="fas fa-bars"></i>';
    }
  });

})();

(function patchShowSection() {
  const _original = typeof showSection === 'function' ? showSection : null;
  const tsvSections = ['shipping', 'tax', 'vouchers'];

  window.showSection = function(name, btn) {
    if (_original) _original(name, btn);

    const topbar = document.querySelector('.topbar');
    if (topbar) {
      topbar.style.display = tsvSections.includes(name) ? 'none' : '';
    }

    if (name === 'shipping') loadShippingRules();
    if (name === 'tax')      loadTaxSettings();
    if (name === 'vouchers') loadVouchers();
  };
})();

  /* ─── LOGOUT ──────────────────────────────────────────── */
  function logout() { localStorage.clear(); window.location.href = 'index.html'; }