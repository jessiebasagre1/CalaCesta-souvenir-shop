/* ═══════════════════════════════════════════════════════════════════════════
   TAX / SHIPPING / VOUCHER MANAGEMENT JS
   ═══════════════════════════════════════════════════════════════════════════ */
 
// ── Toast ────────────────────────────────────────────────────────────────────
 
(function setupToastContainer() {
  if (document.getElementById('tsvToastContainer')) return;
  const c = document.createElement('div');
  c.id = 'tsvToastContainer';
  c.className = 'tsv-toast-container';
  document.body.appendChild(c);
})();
 
function showToast(msg, type = 'success', duration = 3000) {
  const icons = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle' };
  const t = document.createElement('div');
  t.className = `tsv-toast ${type}`;
  t.innerHTML = `<i class="fas ${icons[type] || 'fa-info-circle'}"></i> ${msg}`;
  const c = document.getElementById('tsvToastContainer');
  c.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(10px)'; t.style.transition = '.3s'; setTimeout(() => t.remove(), 300); }, duration);
}
 
// ── Auth helper ───────────────────────────────────────────────────────────────
 
function authHeaders() {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}
 
// ──────────────────────────────────────────────────────────────────────────────
//  SHIPPING
// ──────────────────────────────────────────────────────────────────────────────
 
let shippingRules = [];
 
async function loadShippingRules() {
  try {
    const res = await fetch('/api/shipping');
    shippingRules = await res.json();
    renderShippingTable(shippingRules);
  } catch {
    showToast('Failed to load shipping rules.', 'error');
  }
}
 
function renderShippingTable(rules) {
  const tbody = document.getElementById('shippingTbody');
  if (!rules.length) {
    tbody.innerHTML = `<tr id="shippingEmpty"><td colspan="6" style="text-align:center;padding:48px 0;color:var(--ink-muted);">
      <i class="fas fa-truck" style="font-size:32px;display:block;margin-bottom:10px;color:#ddd;"></i>
      No shipping rules found.</td></tr>`;
    return;
  }
  tbody.innerHTML = rules.map(r => `
    <tr data-id="${r._id}">
      <td><strong>${r.region}</strong></td>
      <td>₱${Number(r.fee).toFixed(2)}</td>
      <td>${r.freeShippingMinSpend > 0 ? `₱${Number(r.freeShippingMinSpend).toFixed(2)}` : '<span style="color:#aaa">—</span>'}</td>
      <td>${r.estimatedDays}</td>
      <td>
        <label class="tsv-toggle" title="${r.isActive ? 'Active' : 'Inactive'}">
          <input type="checkbox" ${r.isActive ? 'checked' : ''} onchange="toggleShippingRule('${r._id}', this)">
          <span class="tsv-slider"></span>
        </label>
      </td>
      <td style="display:flex;gap:6px;align-items:center;">
        <button class="tsv-action-btn" onclick="openShippingModal('${r._id}')" title="Edit"><i class="fas fa-pen"></i></button>
        <button class="tsv-action-btn del" onclick="confirmDelete('shipping','${r._id}','Shipping rule for <strong>${r.region}</strong>')" title="Delete"><i class="fas fa-trash-alt"></i></button>
      </td>
    </tr>`).join('');
}
 
function filterShippingTable() {
  const q = document.getElementById('shippingSearch').value.toLowerCase();
  const s = document.getElementById('shippingStatusFilter').value;
  const filtered = shippingRules.filter(r => {
    const matchQ = r.region.toLowerCase().includes(q);
    const matchS = !s || (s === 'active' ? r.isActive : !r.isActive);
    return matchQ && matchS;
  });
  renderShippingTable(filtered);
}
 
function openShippingModal(id = null) {
  document.getElementById('shippingModalTitle').textContent = id ? 'Edit Shipping Rule' : 'Add Shipping Rule';
  document.getElementById('shippingEditId').value = id || '';
  if (id) {
    const r = shippingRules.find(x => x._id === id);
    if (r) {
      document.getElementById('sRegion').value  = r.region;
      document.getElementById('sFee').value     = r.fee;
      document.getElementById('sFreeMin').value = r.freeShippingMinSpend || '';
      document.getElementById('sEstDays').value = r.estimatedDays;
      document.getElementById('sIsActive').checked = r.isActive;
    }
  } else {
    ['sRegion','sFee','sFreeMin','sEstDays'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('sIsActive').checked = true;
  }
  document.getElementById('shippingModal').classList.add('open');
}
 
function closeShippingModal(e) {
  if (e && e.target !== document.getElementById('shippingModal')) return;
  document.getElementById('shippingModal').classList.remove('open');
}
 
async function saveShippingRule() {
  const id     = document.getElementById('shippingEditId').value;
  const region = document.getElementById('sRegion').value.trim();
  const fee    = document.getElementById('sFee').value;
  const freeMin= document.getElementById('sFreeMin').value;
  const estDays= document.getElementById('sEstDays').value.trim();
  const active = document.getElementById('sIsActive').checked;
 
  if (!region) return showToast('Region is required.', 'error');
  if (fee === '' || isNaN(fee) || Number(fee) < 0) return showToast('Enter a valid shipping fee.', 'error');
  if (!estDays) return showToast('Estimated delivery days is required.', 'error');
 
  const btn = document.getElementById('saveShippingBtn');
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…';
 
  const body = { region, fee: Number(fee), freeShippingMinSpend: Number(freeMin) || 0, estimatedDays: estDays, isActive: active };
  const url    = id ? `/api/shipping/${id}` : '/api/shipping';
  const method = id ? 'PUT' : 'POST';
 
  try {
    const res = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    showToast(id ? 'Shipping rule updated!' : 'Shipping rule added!', 'success');
    document.getElementById('shippingModal').classList.remove('open');
    loadShippingRules();
  } catch (err) {
    showToast(err.message || 'Save failed.', 'error');
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Save Rule';
  }
}
 
async function toggleShippingRule(id, checkbox) {
  try {
    const res = await fetch(`/api/shipping/${id}/toggle`, { method: 'PATCH', headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    // Update local state
    const rule = shippingRules.find(r => r._id === id);
    if (rule) rule.isActive = data.rule.isActive;
    showToast(`Rule ${data.rule.isActive ? 'activated' : 'deactivated'}.`, 'info');
  } catch (err) {
    checkbox.checked = !checkbox.checked; // revert
    showToast(err.message || 'Toggle failed.', 'error');
  }
}
 
// ──────────────────────────────────────────────────────────────────────────────
//  TAX
// ──────────────────────────────────────────────────────────────────────────────
 
async function loadTaxSettings() {
  try {
    const res = await fetch('/api/tax');
    const data = await res.json();
    document.getElementById('taxRateInput').value = data.taxRate ?? 12;
    document.getElementById('taxEnabledToggle').checked = data.taxEnabled !== false;
    const modeEl = document.querySelector(`input[name="taxMode"][value="${data.taxMode || 'exclusive'}"]`);
    if (modeEl) modeEl.checked = true;
    updateTaxPreview();
  } catch {
    showToast('Could not load tax settings.', 'error');
  }
}
 
function updateTaxPreview() {
  const rate    = parseFloat(document.getElementById('taxRateInput').value) || 0;
  const enabled = document.getElementById('taxEnabledToggle').checked;
  const mode    = document.querySelector('input[name="taxMode"]:checked')?.value || 'exclusive';
  const base    = 1000;
 
  document.getElementById('previewRate').textContent = rate;
 
  const row  = document.getElementById('previewTaxRow');
  const note = document.getElementById('previewNote');
  let tax = 0, total = base;
 
  if (enabled) {
    if (mode === 'exclusive') {
      tax   = base * (rate / 100);
      total = base + tax;
      note.textContent = 'Tax is added on top of the listed price.';
    } else {
      tax   = base - (base / (1 + rate / 100));
      total = base;
      note.textContent = 'Tax is already included in the listed price.';
    }
    row.style.display = '';
    document.getElementById('previewTaxAmt').textContent = (mode === 'exclusive' ? '+' : '') + '₱' + tax.toFixed(2);
  } else {
    row.style.display = 'none';
    note.textContent  = 'Tax is currently disabled.';
  }
 
  document.getElementById('previewTotal').textContent = '₱' + total.toFixed(2);
}
 
async function saveTaxSettings() {
  const rate    = parseFloat(document.getElementById('taxRateInput').value);
  const enabled = document.getElementById('taxEnabledToggle').checked;
  const mode    = document.querySelector('input[name="taxMode"]:checked')?.value || 'exclusive';
 
  if (isNaN(rate) || rate < 0 || rate > 100) return showToast('Tax rate must be between 0 and 100.', 'error');
 
  const btn = document.getElementById('saveTaxBtn');
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…';
 
  try {
    const res = await fetch('/api/tax', {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ taxRate: rate, taxEnabled: enabled, taxMode: mode })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    showToast('Tax settings saved!', 'success');
  } catch (err) {
    showToast(err.message || 'Save failed.', 'error');
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Save Tax Settings';
  }
}
 
// ──────────────────────────────────────────────────────────────────────────────
//  VOUCHERS
// ──────────────────────────────────────────────────────────────────────────────
 
let allVouchers = [];
 
async function loadVouchers() {
  try {
    const res = await fetch('/api/vouchers', { headers: authHeaders() });
    allVouchers = await res.json();
    renderVoucherTable(allVouchers);
  } catch {
    showToast('Failed to load vouchers.', 'error');
  }
}
 
function voucherIsExpired(v) {
  return v.expiresAt && new Date() > new Date(v.expiresAt);
}
 
function renderVoucherTable(vouchers) {
  const tbody = document.getElementById('voucherTbody');
  if (!vouchers.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:48px 0;color:var(--ink-muted);">
      <i class="fas fa-ticket-alt" style="font-size:32px;display:block;margin-bottom:10px;color:#ddd;"></i>
      No vouchers found.</td></tr>`;
    return;
  }
 
  const typeLabels = { percentage: ['pct','%'], fixed: ['fixed','₱'], free_shipping: ['fs','Ship'] };
 
  tbody.innerHTML = vouchers.map(v => {
    const expired   = voucherIsExpired(v);
    const statusCls = expired ? 'expired' : (v.isActive ? 'active' : 'inactive');
    const statusTxt = expired ? 'Expired' : (v.isActive ? 'Active' : 'Inactive');
    const [tClass, tSymbol] = typeLabels[v.type] || ['pct','%'];
    const discountTxt = v.type === 'free_shipping' ? 'Free Shipping'
      : v.type === 'percentage' ? `${v.value}% off`
      : `₱${Number(v.value).toFixed(2)} off`;
    const expTxt = v.expiresAt
      ? `<span style="color:${expired ? 'var(--red)' : 'inherit'}">${new Date(v.expiresAt).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'})}</span>`
      : '<span style="color:#aaa">No expiry</span>';
    const usageTxt = v.usageLimit ? `${v.usageCount}/${v.usageLimit}` : `${v.usageCount} used`;
 
    return `<tr>
      <td>
        <button class="tsv-copy-btn" onclick="copyVoucherCode('${v.code}',this)" title="Click to copy">
          <i class="fas fa-copy" style="font-size:11px;"></i> ${v.code}
        </button>
      </td>
      <td><span class="tsv-badge ${tClass}">${v.type.replace('_',' ')}</span></td>
      <td style="font-weight:600;">${discountTxt}</td>
      <td>${v.minSpend > 0 ? `₱${Number(v.minSpend).toFixed(2)}` : '<span style="color:#aaa">—</span>'}</td>
      <td>${expTxt}</td>
      <td style="color:var(--ink-muted);font-size:13px;">${usageTxt}</td>
      <td><span class="tsv-badge ${statusCls}">${statusTxt}</span></td>
      <td style="display:flex;gap:6px;">
        <button class="tsv-action-btn" onclick="openVoucherModal('${v._id}')" title="Edit" ${expired ? 'disabled' : ''}><i class="fas fa-pen"></i></button>
        <button class="tsv-action-btn" onclick="toggleVoucher('${v._id}')" title="${v.isActive ? 'Deactivate' : 'Activate'}">
          <i class="fas ${v.isActive ? 'fa-pause' : 'fa-play'}"></i></button>
        <button class="tsv-action-btn del" onclick="confirmDelete('voucher','${v._id}','Voucher <strong>${v.code}</strong>')" title="Delete"><i class="fas fa-trash-alt"></i></button>
      </td>
    </tr>`;
  }).join('');
}
 
function filterVoucherTable() {
  const q    = document.getElementById('voucherSearch').value.toLowerCase();
  const type = document.getElementById('voucherTypeFilter').value;
  const stat = document.getElementById('voucherStatusFilter').value;
  const filtered = allVouchers.filter(v => {
    const expired = voucherIsExpired(v);
    const matchQ  = v.code.toLowerCase().includes(q);
    const matchT  = !type || v.type === type;
    const matchS  = !stat
      || (stat === 'active'   &&  v.isActive && !expired)
      || (stat === 'inactive' && !v.isActive && !expired)
      || (stat === 'expired'  &&  expired);
    return matchQ && matchT && matchS;
  });
  renderVoucherTable(filtered);
}
 
function openVoucherModal(id = null) {
  document.getElementById('voucherModalTitle').textContent = id ? 'Edit Voucher' : 'Create Voucher';
  document.getElementById('voucherEditId').value = id || '';
  onVoucherTypeChange(); // reset visibility
  if (id) {
    const v = allVouchers.find(x => x._id === id);
    if (v) {
      document.getElementById('vCode').value        = v.code;
      document.getElementById('vType').value        = v.type;
      document.getElementById('vValue').value       = v.value;
      document.getElementById('vMaxDiscount').value = v.maxDiscount ?? '';
      document.getElementById('vMinSpend').value    = v.minSpend   || '';
      document.getElementById('vExpiresAt').value   = v.expiresAt ? v.expiresAt.slice(0,10) : '';
      document.getElementById('vUsageLimit').value  = v.usageLimit ?? '';
      document.getElementById('vIsActive').checked  = v.isActive;
      onVoucherTypeChange();
    }
  } else {
    ['vCode','vValue','vMaxDiscount','vMinSpend','vExpiresAt','vUsageLimit'].forEach(i => document.getElementById(i).value = '');
    document.getElementById('vType').value = 'percentage';
    document.getElementById('vIsActive').checked = true;
    onVoucherTypeChange();
  }
  document.getElementById('voucherModal').classList.add('open');
}
 
function closeVoucherModal(e) {
  if (e && e.target !== document.getElementById('voucherModal')) return;
  document.getElementById('voucherModal').classList.remove('open');
}
 
function onVoucherTypeChange() {
  const type = document.getElementById('vType').value;
  const isFreeShip = type === 'free_shipping';
  document.getElementById('vValueRow').style.display    = isFreeShip ? 'none' : '';
  document.getElementById('vMaxDiscountField').style.display = type === 'percentage' ? '' : 'none';
  document.getElementById('vValueLabel').innerHTML      = type === 'percentage'
    ? 'Discount (%) <span class="tsv-req">*</span>'
    : 'Discount Amount (₱) <span class="tsv-req">*</span>';
}
 
function generateVoucherCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  document.getElementById('vCode').value = code;
}
 
function copyVoucherCode(code, btn) {
  navigator.clipboard.writeText(code).then(() => {
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
    setTimeout(() => btn.innerHTML = orig, 1800);
  });
}
 
async function saveVoucher() {
  const id   = document.getElementById('voucherEditId').value;
  const type = document.getElementById('vType').value;
  const code = document.getElementById('vCode').value.trim().toUpperCase();
  const val  = document.getElementById('vValue').value;
 
  if (!code) return showToast('Voucher code is required.', 'error');
  if (type !== 'free_shipping' && (val === '' || isNaN(val) || Number(val) < 0))
    return showToast('Enter a valid discount value.', 'error');
  if (type === 'percentage' && Number(val) > 100)
    return showToast('Percentage cannot exceed 100%.', 'error');
 
  const btn = document.getElementById('saveVoucherBtn');
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…';
 
  const body = {
    code, type,
    value:       type === 'free_shipping' ? 0 : Number(val),
    maxDiscount: document.getElementById('vMaxDiscount').value !== '' ? Number(document.getElementById('vMaxDiscount').value) : null,
    minSpend:    Number(document.getElementById('vMinSpend').value)   || 0,
    expiresAt:   document.getElementById('vExpiresAt').value          || null,
    usageLimit:  document.getElementById('vUsageLimit').value !== ''  ? Number(document.getElementById('vUsageLimit').value) : null,
    isActive:    document.getElementById('vIsActive').checked
  };
 
  const url    = id ? `/api/vouchers/${id}` : '/api/vouchers';
  const method = id ? 'PUT' : 'POST';
 
  try {
    const res  = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    showToast(id ? 'Voucher updated!' : 'Voucher created!', 'success');
    document.getElementById('voucherModal').classList.remove('open');
    loadVouchers();
  } catch (err) {
    showToast(err.message || 'Save failed.', 'error');
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Save Voucher';
  }
}
 
async function toggleVoucher(id) {
  try {
    const res  = await fetch(`/api/vouchers/${id}/toggle`, { method: 'PATCH', headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    showToast(data.message, 'info');
    loadVouchers();
  } catch (err) {
    showToast(err.message || 'Toggle failed.', 'error');
  }
}
 
// ──────────────────────────────────────────────────────────────────────────────
//  SHARED DELETE CONFIRM
// ──────────────────────────────────────────────────────────────────────────────
 
let _deleteTarget = null;
 
function confirmDelete(kind, id, label) {
  _deleteTarget = { kind, id };
  document.getElementById('deleteConfirmTitle').textContent = `Delete ${kind === 'shipping' ? 'Shipping Rule' : 'Voucher'}`;
  document.getElementById('deleteConfirmMsg').innerHTML = `Are you sure you want to delete ${label}? This action cannot be undone.`;
  const btn = document.getElementById('deleteConfirmBtn');
  btn.onclick = executeDelete;
  document.getElementById('deleteConfirmModal').classList.add('open');
}
 
function closeDeleteConfirm(e) {
  if (e && e.target !== document.getElementById('deleteConfirmModal')) return;
  document.getElementById('deleteConfirmModal').classList.remove('open');
  _deleteTarget = null;
}
 
async function executeDelete() {
  if (!_deleteTarget) return;
  const { kind, id } = _deleteTarget;
  const url = kind === 'shipping' ? `/api/shipping/${id}` : `/api/vouchers/${id}`;
  try {
    const res = await fetch(url, { method: 'DELETE', headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    showToast(data.message, 'success');
    document.getElementById('deleteConfirmModal').classList.remove('open');
    _deleteTarget = null;
    kind === 'shipping' ? loadShippingRules() : loadVouchers();
  } catch (err) {
    showToast(err.message || 'Delete failed.', 'error');
  }
}
 
// ──────────────────────────────────────────────────────────────────────────────
//  SECTION LOAD HOOK — integrate with existing showSection()
// ──────────────────────────────────────────────────────────────────────────────
// Patch the existing showSection function to lazy-load data for new sections.
// Place this AFTER the existing showSection definition in the file, or wrap it.
 
(function patchShowSection() {
  const _original = typeof showSection === 'function' ? showSection : null;
  window.showSection = function(name, btn) {
    if (_original) _original(name, btn);
    if (name === 'shipping') loadShippingRules();
    if (name === 'tax')      loadTaxSettings();
    if (name === 'vouchers') loadVouchers();
  };
})();