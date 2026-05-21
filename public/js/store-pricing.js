/**
 * store-pricing.js
 * Shared utility — fetches store settings and applies pricing rules.
 *
 * Usage (homepage / product cards):
 *   const settings = await StorePrice.load(businessId, token);
 *   const { finalPrice } = StorePrice.applyToProduct(basePrice, settings);
 *
 * Calculation order (matches business-dashboard Store Settings):
 *   1. Subtotal = sum of item prices × quantities
 *   2. Discount applied to subtotal
 *   3. Tax applied to discounted subtotal
 *   4. Shipping fee added last (per order, not per product)
 */

const StorePrice = (() => {

  // In-memory cache: businessId → settings
  const _cache = {};

  /**
   * Load store settings for a given businessId.
   * Falls back to { taxRate: 0, discount: 0, shippingFee: 0 } on any error.
   */
  async function load(businessId, token) {
    if (!businessId) return _defaults();
    if (_cache[businessId]) return _cache[businessId];

    try {
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`/api/store-settings?shopId=${businessId}`, { headers });
      if (!res.ok) throw new Error('not ok');
      const data = await res.json();

      const settings = {
        taxRate:     parseFloat(data.taxRate)     || 0,
        discount:    parseFloat(data.discount)    || 0,
        shippingFee: parseFloat(data.shippingFee) || 0,
      };
      _cache[businessId] = settings;
      return settings;
    } catch {
      return _defaults();
    }
  }

  function _defaults() {
    return { taxRate: 0, discount: 0, shippingFee: 0 };
  }

  /**
   * Apply discount + tax to a single product base price.
   * (Shipping is per-order; not applied here.)
   *
   * Returns:
   *   basePrice      — original price
   *   discountAmt    — amount saved
   *   afterDiscount  — price after discount
   *   taxAmt         — tax on discounted price
   *   finalPrice     — price customer sees (discount + tax, no shipping)
   */
  function applyToProduct(basePrice, settings) {
    const discountAmt   = basePrice * (settings.discount / 100);
    const afterDiscount = basePrice - discountAmt;
    const taxAmt        = afterDiscount * (settings.taxRate / 100);
    const finalPrice    = afterDiscount + taxAmt;
    return { basePrice, discountAmt, afterDiscount, taxAmt, finalPrice };
  }

  /**
   * Apply discount + tax + shipping to a full order subtotal.
   *
   * Returns:
   *   subtotal       — raw item total
   *   discountAmt    — savings
   *   afterDiscount  — subtotal after discount
   *   taxAmt         — tax on discounted subtotal
   *   shippingFee    — flat shipping
   *   grandTotal     — what customer pays
   */
  function applyToOrder(subtotal, settings) {
    const discountAmt   = subtotal * (settings.discount / 100);
    const afterDiscount = subtotal - discountAmt;
    const taxAmt        = afterDiscount * (settings.taxRate / 100);
    const shippingFee   = settings.shippingFee;
    const grandTotal    = afterDiscount + taxAmt + shippingFee;
    return { subtotal, discountAmt, afterDiscount, taxAmt, shippingFee, grandTotal };
  }

  /**
   * Format a price badge for product cards on the homepage.
   * Shows original price struck through if there's a discount.
   *
   * Returns an HTML string.
   */
  function priceHTML(basePrice, settings) {
    const { finalPrice, discountAmt } = applyToProduct(basePrice, settings);

    if (discountAmt > 0) {
      return `
        <span class="price-final">₱${finalPrice.toFixed(2)}</span>
        <span class="price-original" style="text-decoration:line-through;font-size:.8em;color:#aaa;margin-left:4px;">₱${basePrice.toFixed(2)}</span>
        <span class="price-badge-discount" style="font-size:.75em;background:#dcfce7;color:#166534;border-radius:4px;padding:1px 5px;margin-left:4px;">-${settings.discount}%</span>
      `;
    }
    return `<span class="price-final">₱${finalPrice.toFixed(2)}</span>`;
  }

  return { load, applyToProduct, applyToOrder, priceHTML };
})();