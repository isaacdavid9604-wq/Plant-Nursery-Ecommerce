/**
 * Plant Nursery Store - Core Client-Side Logic & Cart Management
 * Tech Stack: Vanilla JavaScript (ES6+), LocalStorage
 * Authors: Naman Agrawal, Isaac David, Sara Ahmed (Ramdeobaba University)
 */

// ==========================================================================
// 0. API Client (talks to the Express/SQLite backend)
// ==========================================================================
// Same-origin by default (backend serves this frontend). To host the frontend
// separately, set window.API_BASE = "https://your-backend.example.com" before this script.
const API_BASE = (window.API_BASE || "").replace(/\/$/, "");
const ADMIN_TOKEN_KEY = "botanical_nursery_admin_token";

async function api(path, { method = "GET", body, auth = false } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = sessionStorage.getItem(ADMIN_TOKEN_KEY);
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  let res;
  try {
    res = await fetch(`${API_BASE}/api${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch (networkErr) {
    const err = new Error("Cannot reach the server. Is the backend running?");
    err.network = true;
    throw err;
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.details = data.details;
    throw err;
  }
  return data;
}

// ==========================================================================
// 1. Plant Nursery Catalog (loaded from GET /api/products)
// ==========================================================================
let PLANT_CATALOG = [];

async function loadCatalog() {
  PLANT_CATALOG = await api("/products");
  return PLANT_CATALOG;
}

// ==========================================================================
// 2. LocalStorage Cart Manager
// ==========================================================================
const CART_STORAGE_KEY = "botanical_nursery_cart_v1";

const Cart = {
  getCart() {
    try {
      const data = localStorage.getItem(CART_STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error("Error reading cart from localStorage", e);
      return [];
    }
  },

  saveCart(cart) {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
      this.updateNavbarBadges();
    } catch (e) {
      console.error("Error saving cart to localStorage", e);
    }
  },

  addItem(productId, quantity = 1, potSize = "Standard") {
    const product = PLANT_CATALOG.find(p => p.id === productId);
    if (!product) return false;
    if (!product.inStock) {
      showToast("Out of Stock", `${product.name} is currently out of stock.`, "danger");
      return false;
    }

    const cart = this.getCart();
    const existingIndex = cart.findIndex(item => item.id === productId && item.potSize === potSize);
    const inCart = cart.filter(i => i.id === productId).reduce((n, i) => n + i.quantity, 0);
    if (inCart + parseInt(quantity, 10) > product.stockCount) {
      showToast("Stock Limit", `Only ${product.stockCount} of ${product.name} available.`, "danger");
      return false;
    }

    if (existingIndex > -1) {
      cart[existingIndex].quantity += parseInt(quantity, 10);
    } else {
      cart.push({
        id: product.id,
        name: product.name,
        price: product.price,
        image: product.image,
        category: product.categoryLabel,
        potSize: potSize,
        quantity: parseInt(quantity, 10)
      });
    }

    this.saveCart(cart);
    showToast("Added to Cart! 🌿", `${quantity} × ${product.name} added to your basket.`, "success");
    return true;
  },

  updateQuantity(productId, potSize, newQty) {
    let cart = this.getCart();
    const qty = parseInt(newQty, 10);

    if (qty <= 0) {
      this.removeItem(productId, potSize);
      return;
    }

    const item = cart.find(i => i.id === productId && (i.potSize === potSize || !i.potSize));
    if (item) {
      item.quantity = qty;
      this.saveCart(cart);
    }
  },

  removeItem(productId, potSize) {
    let cart = this.getCart();
    cart = cart.filter(i => !(i.id === productId && (i.potSize === potSize || !potSize)));
    this.saveCart(cart);
    showToast("Item Removed", "The plant was removed from your cart.", "info");
  },

  clearCart() {
    localStorage.removeItem(CART_STORAGE_KEY);
    this.updateNavbarBadges();
  },

  getTotalCount() {
    const cart = this.getCart();
    return cart.reduce((total, item) => total + item.quantity, 0);
  },

  getSubtotal() {
    const cart = this.getCart();
    return cart.reduce((total, item) => total + (item.price * item.quantity), 0);
  },

  updateNavbarBadges() {
    const totalCount = this.getTotalCount();
    const badges = document.querySelectorAll(".cart-counter-badge");
    badges.forEach(badge => {
      badge.textContent = totalCount;
      if (totalCount > 0) {
        badge.classList.remove("d-none");
      } else {
        badge.textContent = "0";
      }
    });
  }
};

// ==========================================================================
// 3. UI Toast Notification Helper
// ==========================================================================
function showToast(title, message, type = "success") {
  let container = document.getElementById("toast-container-root");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container-root";
    container.className = "toast-container-custom";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `botanical-toast border-start border-4 ${
    type === "danger" ? "border-danger" : type === "info" ? "border-info" : "border-success"
  }`;
  
  const icon = type === "danger" ? "bi-exclamation-triangle-fill text-danger" :
               type === "info" ? "bi-info-circle-fill text-info" : "bi-check-circle-fill text-success";

  toast.innerHTML = `
    <i class="bi ${icon} fs-4"></i>
    <div class="flex-grow-1">
      <div class="fw-bold text-dark fs-6">${title}</div>
      <div class="small text-muted">${message}</div>
    </div>
    <button type="button" class="btn-close ms-2" aria-label="Close"></button>
  `;

  const closeBtn = toast.querySelector(".btn-close");
  closeBtn.addEventListener("click", () => {
    toast.remove();
  });

  container.appendChild(toast);

  setTimeout(() => {
    if (toast.parentElement) {
      toast.style.transition = "opacity 0.4s ease, transform 0.4s ease";
      toast.style.opacity = "0";
      toast.style.transform = "translateY(15px)";
      setTimeout(() => toast.remove(), 400);
    }
  }, 3800);
}

// ==========================================================================
// 4. Product Card Template Generator
// ==========================================================================
const FALLBACK_PLANT_IMG = "https://images.unsplash.com/photo-1545241047-6083a3684587?auto=format&fit=crop&w=800&q=80";

function createProductCardHTML(product) {
  const badgeHTML = product.inStock 
    ? (product.badge ? `<span class="badge-tag ${product.badgeType === 'sale' ? 'badge-sale' : 'badge-new'}">${product.badge}</span>` : '')
    : `<span class="badge-tag badge-out">Out of Stock</span>`;

  const oldPriceHTML = product.oldPrice 
    ? `<span class="product-price-old">$${product.oldPrice.toFixed(2)}</span>` 
    : '';

  const buttonActionHTML = product.inStock
    ? `<button class="btn btn-sm btn-botanical w-100 quick-add-btn" data-id="${product.id}">
         <i class="bi bi-cart-plus me-1"></i> Add to Cart
       </button>`
    : `<button class="btn btn-sm btn-secondary w-100 disabled" disabled>
         Out of Stock
       </button>`;

  return `
    <div class="col-12 col-sm-6 col-lg-3 mb-4">
      <div class="product-card h-100">
        <div class="product-img-wrapper">
          <a href="product-detail.html?id=${product.id}">
            <img src="${product.image}" alt="${product.name}" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK_PLANT_IMG}';">
          </a>
          <div class="product-badges">
            ${badgeHTML}
          </div>
          <div class="product-quick-actions">
            <button class="quick-action-btn quick-wishlist-btn" title="Add to Wishlist" data-id="${product.id}">
              <i class="bi bi-heart"></i>
            </button>
            <a href="product-detail.html?id=${product.id}" class="quick-action-btn" title="View Details">
              <i class="bi bi-eye"></i>
            </a>
          </div>
        </div>

        <div class="product-body">
          <div class="product-category-meta">${product.categoryLabel}</div>
          <h3 class="product-title">
            <a href="product-detail.html?id=${product.id}">${product.name}</a>
          </h3>
          <div class="rating-stars">
            ${'<i class="bi bi-star-fill"></i>'.repeat(Math.floor(product.rating))}
            ${product.rating % 1 !== 0 ? '<i class="bi bi-star-half"></i>' : ''}
            <span class="rating-count">(${product.reviews})</span>
          </div>
          <div class="product-footer">
            <div>
              <span class="product-price">$${product.price.toFixed(2)}</span>
              ${oldPriceHTML}
            </div>
          </div>
          <div class="mt-3">
            ${buttonActionHTML}
          </div>
        </div>
      </div>
    </div>
  `;
}

// ==========================================================================
// 5. Index Page Initialization
// ==========================================================================
function initIndexPage() {
  const featuredContainer = document.getElementById("featured-products-container");
  if (!featuredContainer) return;

  const featured = PLANT_CATALOG.filter(p => p.featured);
  featuredContainer.innerHTML = featured.map(createProductCardHTML).join("");
  attachCatalogEventListeners(featuredContainer);
}

// ==========================================================================
// 6. Shop Catalog Initialization & Live Filters
// ==========================================================================
function initShopPage() {
  const shopGrid = document.getElementById("shop-products-grid");
  if (!shopGrid) return;

  const searchInput = document.getElementById("shop-search-input");
  const categoryRadios = document.querySelectorAll("input[name='category-filter']");
  const inStockCheckbox = document.getElementById("filter-instock-only");
  const priceRange = document.getElementById("price-range-slider");
  const priceDisplay = document.getElementById("price-range-val");
  const sortSelect = document.getElementById("shop-sort-select");
  const resultsCount = document.getElementById("shop-results-count");
  const resetBtn = document.getElementById("reset-filters-btn");

  // Dynamically update category count badges
  function updateCategoryBadges() {
    const counts = { all: PLANT_CATALOG.length, indoor: 0, outdoor: 0, seeds: 0, accessories: 0 };
    PLANT_CATALOG.forEach(p => {
      if (counts[p.category] !== undefined) counts[p.category]++;
    });
    categoryRadios.forEach(radio => {
      const parentLabel = radio.closest(".custom-checkbox-item");
      if (parentLabel) {
        const badge = parentLabel.querySelector(".item-count-badge");
        if (badge && counts[radio.value] !== undefined) {
          badge.textContent = counts[radio.value];
        }
      }
    });
  }
  updateCategoryBadges();

  // Read URL Query Params (?category=accessories or ?search=...)
  const urlParams = new URLSearchParams(window.location.search);
  const catParam = urlParams.get("category");
  const searchParam = urlParams.get("search");

  if (catParam) {
    categoryRadios.forEach(r => {
      r.checked = (r.value === catParam);
    });
  }
  if (searchParam && searchInput) {
    searchInput.value = searchParam;
  }

  function filterAndRender() {
    let filtered = [...PLANT_CATALOG];

    // 1. Search Query
    if (searchInput && searchInput.value.trim() !== "") {
      const q = searchInput.value.trim().toLowerCase();
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(q) || 
        p.scientificName.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
      );
    }

    // 2. Category Filter
    let selectedCat = "all";
    categoryRadios.forEach(radio => {
      if (radio.checked) selectedCat = radio.value;
    });
    if (selectedCat !== "all") {
      filtered = filtered.filter(p => p.category === selectedCat);
    }

    // 3. In Stock Only
    if (inStockCheckbox && inStockCheckbox.checked) {
      filtered = filtered.filter(p => p.inStock);
    }

    // 4. Price Max Filter
    if (priceRange) {
      const maxPrice = parseFloat(priceRange.value);
      if (priceDisplay) priceDisplay.textContent = `$${maxPrice}`;
      filtered = filtered.filter(p => p.price <= maxPrice);
    }

    // 5. Sorting
    if (sortSelect) {
      const sortVal = sortSelect.value;
      if (sortVal === "price-asc") {
        filtered.sort((a, b) => a.price - b.price);
      } else if (sortVal === "price-desc") {
        filtered.sort((a, b) => b.price - a.price);
      } else if (sortVal === "rating-desc") {
        filtered.sort((a, b) => b.rating - a.rating);
      } else if (sortVal === "name-asc") {
        filtered.sort((a, b) => a.name.localeCompare(b.name));
      }
    }

    // Update Counter
    if (resultsCount) {
      resultsCount.textContent = `Showing ${filtered.length} plant${filtered.length === 1 ? '' : 's'}`;
    }

    // Render Grid
    if (filtered.length === 0) {
      shopGrid.innerHTML = `
        <div class="col-12 text-center py-5">
          <div class="mb-3">
            <i class="bi bi-flower2 text-muted" style="font-size: 3.5rem;"></i>
          </div>
          <h4 class="font-heading">No Items Found</h4>
          <p class="text-secondary">Try adjusting your filters, price range, or search keywords.</p>
          <button id="clear-all-filter-btn" class="btn btn-botanical-outline mt-2">Reset All Filters</button>
        </div>
      `;
      const clrBtn = document.getElementById("clear-all-filter-btn");
      if (clrBtn && resetBtn) clrBtn.addEventListener("click", () => resetBtn.click());
    } else {
      shopGrid.innerHTML = filtered.map(createProductCardHTML).join("");
      attachCatalogEventListeners(shopGrid);
    }
  }

  // Bind Event Listeners
  if (searchInput) searchInput.addEventListener("input", filterAndRender);
  categoryRadios.forEach(r => r.addEventListener("change", filterAndRender));
  if (inStockCheckbox) inStockCheckbox.addEventListener("change", filterAndRender);
  if (priceRange) priceRange.addEventListener("input", filterAndRender);
  if (sortSelect) sortSelect.addEventListener("change", filterAndRender);

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      categoryRadios.forEach(r => { if (r.value === "all") r.checked = true; });
      if (inStockCheckbox) inStockCheckbox.checked = false;
      if (priceRange) priceRange.value = 100;
      if (priceDisplay) priceDisplay.textContent = "$100";
      if (sortSelect) sortSelect.value = "featured";
      filterAndRender();
    });
  }

  // Initial Filter
  filterAndRender();
}

// ==========================================================================
// 7. Product Detail Initialization
// ==========================================================================
function initProductDetailPage() {
  const detailContainer = document.getElementById("product-detail-view");
  if (!detailContainer) return;

  const urlParams = new URLSearchParams(window.location.search);
  const productId = urlParams.get("id") || "monstera-deliciosa";
  const product = PLANT_CATALOG.find(p => p.id === productId) || PLANT_CATALOG[0];
  if (!product) return;

  // Set Document Title
  document.title = `${product.name} - Plant Nursery Store`;

  // Breadcrumbs
  const breadcrumbName = document.getElementById("detail-breadcrumb-name");
  if (breadcrumbName) breadcrumbName.textContent = product.name;

  // Title, Meta, and Rating
  const titleEl = document.getElementById("detail-title");
  const scientificEl = document.getElementById("detail-scientific");
  const categoryBadge = document.getElementById("detail-category-badge");
  const priceEl = document.getElementById("detail-price");
  const oldPriceEl = document.getElementById("detail-old-price");
  const ratingCountEl = document.getElementById("detail-rating-count");
  const descriptionEl = document.getElementById("detail-description");
  const stockBadgeEl = document.getElementById("detail-stock-badge");

  if (titleEl) titleEl.textContent = product.name;
  if (scientificEl) scientificEl.textContent = product.scientificName;
  if (categoryBadge) categoryBadge.textContent = product.categoryLabel;
  if (priceEl) priceEl.textContent = `$${product.price.toFixed(2)}`;
  if (oldPriceEl) {
    oldPriceEl.textContent = product.oldPrice ? `$${product.oldPrice.toFixed(2)}` : "";
  }
  if (ratingCountEl) ratingCountEl.textContent = `(${product.reviews} reviews)`;
  if (descriptionEl) descriptionEl.textContent = product.description;

  if (stockBadgeEl) {
    if (product.inStock) {
      stockBadgeEl.className = "badge bg-success-subtle text-success border border-success px-3 py-2 rounded-pill";
      stockBadgeEl.innerHTML = `<i class="bi bi-check-circle-fill me-1"></i> In Stock (${product.stockCount} available)`;
    } else {
      stockBadgeEl.className = "badge bg-danger-subtle text-danger border border-danger px-3 py-2 rounded-pill";
      stockBadgeEl.innerHTML = `<i class="bi bi-x-circle-fill me-1"></i> Out of Stock`;
    }
  }

  // Care Instructions Grid
  const careSun = document.getElementById("care-sunlight");
  const careWater = document.getElementById("care-watering");
  const careDiff = document.getElementById("care-difficulty");
  const carePet = document.getElementById("care-pets");
  const careTemp = document.getElementById("care-temp");

  if (careSun) careSun.textContent = product.care.sunlight;
  if (careWater) careWater.textContent = product.care.watering;
  if (careDiff) careDiff.textContent = product.care.difficulty;
  if (carePet) carePet.textContent = product.care.petFriendly;
  if (careTemp) careTemp.textContent = product.care.temperature;

  // Gallery Images
  const mainImage = document.getElementById("detail-main-img");
  const thumbsContainer = document.getElementById("detail-thumbs-container");

  if (mainImage) {
    mainImage.src = product.image;
    mainImage.onerror = () => { mainImage.src = FALLBACK_PLANT_IMG; };
  }
  if (thumbsContainer && product.gallery && product.gallery.length > 0) {
    thumbsContainer.innerHTML = product.gallery.map((imgUrl, index) => `
      <div class="thumb-item ${index === 0 ? 'active' : ''}" data-src="${imgUrl}">
        <img src="${imgUrl}" alt="${product.name} thumb ${index + 1}" onerror="this.onerror=null;this.src='${FALLBACK_PLANT_IMG}';">
      </div>
    `).join("");

    const thumbs = thumbsContainer.querySelectorAll(".thumb-item");
    thumbs.forEach(thumb => {
      thumb.addEventListener("click", () => {
        thumbs.forEach(t => t.classList.remove("active"));
        thumb.classList.add("active");
        if (mainImage) mainImage.src = thumb.getAttribute("data-src");
      });
    });
  }

  // Quantity Stepper
  const qtyInput = document.getElementById("detail-qty-input");
  const decBtn = document.getElementById("detail-qty-dec");
  const incBtn = document.getElementById("detail-qty-inc");

  if (decBtn && qtyInput) {
    decBtn.addEventListener("click", () => {
      let val = parseInt(qtyInput.value, 10) || 1;
      if (val > 1) qtyInput.value = val - 1;
    });
  }

  if (incBtn && qtyInput) {
    incBtn.addEventListener("click", () => {
      let val = parseInt(qtyInput.value, 10) || 1;
      if (val < (product.stockCount || 50)) qtyInput.value = val + 1;
    });
  }

  // Add to Cart Button
  const addToCartBtn = document.getElementById("detail-add-to-cart-btn");
  if (addToCartBtn) {
    if (!product.inStock) {
      addToCartBtn.classList.add("disabled");
      addToCartBtn.setAttribute("disabled", "true");
      addToCartBtn.innerHTML = `<i class="bi bi-x-circle me-2"></i> Out of Stock`;
    } else {
      addToCartBtn.addEventListener("click", () => {
        const qty = parseInt(qtyInput ? qtyInput.value : 1, 10);
        const potSizeRadio = document.querySelector("input[name='pot-size-option']:checked");
        const potSize = potSizeRadio ? potSizeRadio.value : "Standard Pot";
        Cart.addItem(product.id, qty, potSize);
      });
    }
  }

  // Related Products Grid
  const relatedContainer = document.getElementById("related-products-container");
  if (relatedContainer) {
    const related = PLANT_CATALOG
      .filter(p => p.id !== product.id && (p.category === product.category || p.featured))
      .slice(0, 4);
    relatedContainer.innerHTML = related.map(createProductCardHTML).join("");
    attachCatalogEventListeners(relatedContainer);
  }
}

// ==========================================================================
// 8. Cart Page Initialization & Calculations
// ==========================================================================
function getAppliedPromo() {
  try {
    return JSON.parse(sessionStorage.getItem("applied_promo") || "null");
  } catch (e) {
    return null;
  }
}

async function initCartPage() {
  const tableBody = document.getElementById("cart-items-tbody");
  const emptyCartState = document.getElementById("empty-cart-state");
  const cartLayout = document.getElementById("cart-layout-row");

  if (!tableBody || !emptyCartState || !cartLayout) return;

  // Refresh cart lines against the live catalog: current price, drop removed/out-of-stock items, cap quantity
  function syncCartWithCatalog() {
    const cart = Cart.getCart();
    let changed = false;
    const synced = [];
    cart.forEach(item => {
      const p = PLANT_CATALOG.find(x => x.id === item.id);
      if (!p || !p.inStock) { changed = true; return; }
      if (item.price !== p.price) { item.price = p.price; changed = true; }
      if (item.quantity > p.stockCount) { item.quantity = p.stockCount; changed = true; }
      synced.push(item);
    });
    if (changed) {
      Cart.saveCart(synced);
      showToast("Cart Updated", "Prices or availability changed for some items.", "info");
    }
  }
  syncCartWithCatalog();

  function renderCart() {
    const cart = Cart.getCart();

    if (cart.length === 0) {
      emptyCartState.classList.remove("d-none");
      cartLayout.classList.add("d-none");
      return;
    }

    emptyCartState.classList.add("d-none");
    cartLayout.classList.remove("d-none");

    tableBody.innerHTML = cart.map(item => {
      const lineTotal = (item.price * item.quantity).toFixed(2);
      return `
        <tr data-id="${item.id}" data-potsize="${item.potSize || ''}">
          <td>
            <div class="d-flex align-items-center gap-3">
              <img src="${item.image}" alt="${item.name}" class="cart-product-thumb">
              <div>
                <h5 class="mb-1 fs-6 fw-bold">
                  <a href="product-detail.html?id=${item.id}" class="text-dark">${item.name}</a>
                </h5>
                <span class="badge bg-light text-muted border">${item.category || 'Plant'}</span>
                ${item.potSize ? `<span class="badge bg-light text-secondary border ms-1">${item.potSize}</span>` : ''}
              </div>
            </div>
          </td>
          <td class="text-center fw-semibold text-secondary">$${item.price.toFixed(2)}</td>
          <td class="text-center">
            <div class="quantity-stepper d-inline-flex">
              <button class="stepper-btn cart-dec-btn" data-id="${item.id}" data-potsize="${item.potSize || ''}">-</button>
              <input type="text" class="stepper-input cart-qty-input" value="${item.quantity}" readonly>
              <button class="stepper-btn cart-inc-btn" data-id="${item.id}" data-potsize="${item.potSize || ''}">+</button>
            </div>
          </td>
          <td class="text-end fw-bold text-dark fs-6">$${lineTotal}</td>
          <td class="text-center">
            <button class="btn btn-sm btn-outline-danger border-0 cart-remove-btn" title="Remove item" data-id="${item.id}" data-potsize="${item.potSize || ''}">
              <i class="bi bi-trash3-fill"></i>
            </button>
          </td>
        </tr>
      `;
    }).join("");

    updateOrderSummary();
    bindCartRowEvents();
  }

  function updateOrderSummary() {
    const subtotal = Cart.getSubtotal();
    const shipping = subtotal > 50 || subtotal === 0 ? 0.00 : 8.50;
    const tax = subtotal * 0.08; // 8% Estimated Tax
    
    // Promo code (validated by the server when applied; re-validated again at checkout)
    let discount = 0.00;
    const promo = getAppliedPromo();
    if (promo) {
      discount = subtotal * (promo.percentOff / 100);
    }

    const total = Math.max(0, subtotal - discount + shipping + tax);

    const subtotalEl = document.getElementById("summary-subtotal");
    const shippingEl = document.getElementById("summary-shipping");
    const taxEl = document.getElementById("summary-tax");
    const discountEl = document.getElementById("summary-discount");
    const discountRow = document.getElementById("discount-summary-row");
    const totalEl = document.getElementById("summary-total");

    if (subtotalEl) subtotalEl.textContent = `$${subtotal.toFixed(2)}`;
    if (shippingEl) shippingEl.textContent = shipping === 0 ? "FREE" : `$${shipping.toFixed(2)}`;
    if (taxEl) taxEl.textContent = `$${tax.toFixed(2)}`;
    if (totalEl) totalEl.textContent = `$${total.toFixed(2)}`;

    if (discountRow && discountEl) {
      if (discount > 0) {
        discountRow.classList.remove("d-none");
        discountEl.textContent = `-$${discount.toFixed(2)}`;
      } else {
        discountRow.classList.add("d-none");
      }
    }
  }

  function bindCartRowEvents() {
    const decBtns = tableBody.querySelectorAll(".cart-dec-btn");
    const incBtns = tableBody.querySelectorAll(".cart-inc-btn");
    const removeBtns = tableBody.querySelectorAll(".cart-remove-btn");

    decBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        const potSize = btn.getAttribute("data-potsize");
        const cart = Cart.getCart();
        const item = cart.find(i => i.id === id && (i.potSize === potSize || !potSize));
        if (item) {
          Cart.updateQuantity(id, potSize, item.quantity - 1);
          renderCart();
        }
      });
    });

    incBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        const potSize = btn.getAttribute("data-potsize");
        const cart = Cart.getCart();
        const item = cart.find(i => i.id === id && (i.potSize === potSize || !potSize));
        if (item) {
          const p = PLANT_CATALOG.find(x => x.id === id);
          const totalForProduct = cart.filter(i => i.id === id).reduce((n, i) => n + i.quantity, 0);
          if (p && totalForProduct + 1 > p.stockCount) {
            showToast("Stock Limit", `Only ${p.stockCount} of ${p.name} available.`, "danger");
            return;
          }
          Cart.updateQuantity(id, potSize, item.quantity + 1);
          renderCart();
        }
      });
    });

    removeBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        const potSize = btn.getAttribute("data-potsize");
        Cart.removeItem(id, potSize);
        renderCart();
      });
    });
  }

  // Promo Code Handler (validated against the backend)
  const promoInput = document.getElementById("promo-code-input");
  const applyPromoBtn = document.getElementById("apply-promo-btn");
  if (applyPromoBtn && promoInput) {
    applyPromoBtn.addEventListener("click", async () => {
      const code = promoInput.value.trim().toUpperCase();
      if (!code) return;
      try {
        const promo = await api("/promo/validate", { method: "POST", body: { code } });
        sessionStorage.setItem("applied_promo", JSON.stringify(promo));
        showToast("Promo Code Applied! 🎉", `${promo.percentOff}% discount has been applied to your order.`, "success");
        updateOrderSummary();
      } catch (e) {
        showToast("Invalid Promo Code", e.network ? e.message : "Please enter a valid code (Try 'PLANT10').", "danger");
      }
    });
  }

  // Checkout Form Handler -> POST /api/orders
  const checkoutModalForm = document.getElementById("checkout-form");
  if (checkoutModalForm) {
    checkoutModalForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const cart = Cart.getCart();
      if (cart.length === 0) {
        showToast("Cart is Empty", "Add botanical items to your cart before checking out.", "danger");
        return;
      }

      const textInputs = Array.from(checkoutModalForm.querySelectorAll("input[type='text']"));
      const phoneInput = checkoutModalForm.querySelector("input[type='tel']");
      const payRadio = checkoutModalForm.querySelector("input[name='paymentMethod']:checked");
      const submitBtn = checkoutModalForm.querySelector("button[type='submit']");

      // text inputs in form order: name, street, city, state, postal code
      const [nameEl, ...addressEls] = textInputs;
      const payload = {
        customer: nameEl ? nameEl.value.trim() : "",
        phone: phoneInput ? phoneInput.value.trim() : "",
        address: addressEls.map(i => i.value.trim()).filter(Boolean).join(", "),
        paymentMethod: payRadio ? payRadio.value : "upi",
        promoCode: (getAppliedPromo() || {}).code || undefined,
        items: cart.map(i => ({ id: i.id, quantity: i.quantity, potSize: i.potSize }))
      };

      if (submitBtn) submitBtn.disabled = true;
      try {
        const newOrder = await OrderManager.createOrder(payload);

        Cart.clearCart();
        sessionStorage.removeItem("applied_promo");

        const modalEl = document.getElementById("checkoutModal");
        if (modalEl && window.bootstrap) {
          const modalInstance = bootstrap.Modal.getInstance(modalEl);
          if (modalInstance) modalInstance.hide();
        }

        showToast("Order Placed Successfully! 🌿", `Your tracking number is #${newOrder.id}. Loading tracking...`, "success");
        setTimeout(() => {
          window.location.href = `track-order.html?orderId=${newOrder.id}`;
        }, 1000);
      } catch (err) {
        const detail = err.details && err.details.length ? ` ${err.details.join("; ")}.` : "";
        showToast("Order Failed", `${err.message}.${detail}`.replace("..", "."), "danger");
        if (err.status === 409) {
          await loadCatalog().catch(() => {});
          syncCartWithCatalog();
          renderCart();
        }
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  renderCart();
}

// ==========================================================================
// 8. Order Manager (backed by the REST API)
// ==========================================================================
const OrderManager = {
  // Public: look up by order id or phone number
  async getOrder(query) {
    if (!query || !query.trim()) return null;
    try {
      return await api(`/orders/track/${encodeURIComponent(query.trim())}`);
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  },

  // Public: place an order. Prices/stock/promo are re-validated by the server.
  createOrder(payload) {
    return api("/orders", { method: "POST", body: payload });
  },

  // Admin only
  getOrders({ search = "", status = "all" } = {}) {
    const qs = new URLSearchParams();
    if (search) qs.set("search", search);
    if (status && status !== "all") qs.set("status", status);
    return api(`/orders?${qs.toString()}`, { auth: true });
  },

  updateStatus(orderId, newStatus) {
    return api(`/orders/${encodeURIComponent(orderId)}/status`, { method: "PATCH", body: { status: newStatus }, auth: true });
  }
};

// ==========================================================================
// 9. Order Tracking Page Controller (track-order.html)
// ==========================================================================
function initTrackOrderPage() {
  const trackForm = document.getElementById("track-order-form");
  const trackInput = document.getElementById("track-order-input");
  const orderCard = document.getElementById("track-order-card");
  const emptyState = document.getElementById("track-empty-state");
  const demoButtons = document.querySelectorAll(".demo-order-btn");

  if (!trackForm && !orderCard) return;

  const STAGE_CONFIG = [
    { key: "order-placed", label: "Order Placed", stepIndex: 0, percent: "10%" },
    { key: "ready-to-ship", label: "Ready to Ship", stepIndex: 1, percent: "35%" },
    { key: "shipped", label: "Shipped", stepIndex: 2, percent: "60%" },
    { key: "out-for-delivery", label: "Out for Delivery", stepIndex: 3, percent: "85%" },
    { key: "delivered", label: "Delivered", stepIndex: 4, percent: "100%" }
  ];

  function getStageIndex(statusKey) {
    const found = STAGE_CONFIG.findIndex(s => s.key === statusKey);
    return found > -1 ? found : 0;
  }

  function displayOrder(order) {
    if (!order) {
      if (orderCard) orderCard.classList.add("d-none");
      if (emptyState) emptyState.classList.remove("d-none");
      return;
    }

    if (emptyState) emptyState.classList.add("d-none");
    if (orderCard) orderCard.classList.remove("d-none");

    // Header info
    const idEl = document.getElementById("tracking-order-id");
    const dateEl = document.getElementById("tracking-order-date");
    const statusPill = document.getElementById("tracking-status-pill");
    const estDelivery = document.getElementById("tracking-est-delivery");
    const carrierEl = document.getElementById("tracking-carrier");
    const awbEl = document.getElementById("tracking-awb");
    const customerEl = document.getElementById("tracking-customer-name");
    const phoneEl = document.getElementById("tracking-customer-phone");
    const addressEl = document.getElementById("tracking-address");

    if (idEl) idEl.textContent = `#${order.id}`;
    if (dateEl) dateEl.textContent = order.date;
    if (estDelivery) estDelivery.textContent = order.estimatedDelivery || "In 2-3 Days";
    if (carrierEl) carrierEl.textContent = order.carrier || "EcoGreen Logistics";
    if (awbEl) awbEl.textContent = order.trackingNumber || "EGL-883192";
    if (customerEl) customerEl.textContent = order.customer;
    if (phoneEl) phoneEl.textContent = order.phone || "+91 98765 43210";
    if (addressEl) addressEl.textContent = order.address;

    // Status Pill
    if (statusPill) {
      const stageIdx = getStageIndex(order.status);
      const stageLabel = STAGE_CONFIG[stageIdx].label;
      statusPill.className = `status-pill status-${order.status}`;
      statusPill.innerHTML = `<i class="bi bi-circle-fill" style="font-size: 7px;"></i> ${stageLabel}`;
    }

    // Stepper Progress Line & Step Nodes
    const currentStageIdx = getStageIndex(order.status);
    const progressBar = document.getElementById("tracking-progress-line");
    if (progressBar) {
      progressBar.style.width = STAGE_CONFIG[currentStageIdx].percent;
    }

    const stepNodes = document.querySelectorAll(".track-step");
    stepNodes.forEach((node, idx) => {
      node.classList.remove("completed", "active", "pending");
      if (idx < currentStageIdx) {
        node.classList.add("completed");
      } else if (idx === currentStageIdx) {
        node.classList.add("active");
      } else {
        node.classList.add("pending");
      }

      // Update stage timestamp / description
      const timeSpan = node.querySelector(".track-step-time");
      if (timeSpan && order.stages) {
        const stageKeys = ["orderPlaced", "readyToShip", "shipped", "outForDelivery", "delivered"];
        const key = stageKeys[idx];
        if (order.stages[key]) {
          timeSpan.textContent = order.stages[key];
        }
      }
    });

    // Render Ordered Items Table
    const itemsTbody = document.getElementById("tracking-items-tbody");
    if (itemsTbody && order.items) {
      itemsTbody.innerHTML = order.items.map(item => `
        <tr>
          <td>
            <div class="d-flex align-items-center gap-3">
              <img src="${item.image}" alt="${item.name}" class="tracking-item-thumb" onerror="this.onerror=null;this.src='${FALLBACK_PLANT_IMG}';">
              <div>
                <strong class="text-dark d-block">${item.name}</strong>
                <small class="text-muted">${item.potSize || 'Standard Pot'}</small>
              </div>
            </div>
          </td>
          <td class="text-center text-muted">x${item.quantity}</td>
          <td class="text-end fw-semibold text-dark">$${(item.price * item.quantity).toFixed(2)}</td>
        </tr>
      `).join("");
    }

    const totalEl = document.getElementById("tracking-order-total");
    if (totalEl) totalEl.textContent = `$${order.amount.toFixed(2)}`;

    // Update active demo button
    demoButtons.forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute("data-id") === order.id);
    });
  }

  async function lookup(query, { silent = false } = {}) {
    try {
      const order = await OrderManager.getOrder(query);
      if (!order && !silent) {
        showToast("Order Not Found", `No order found matching "${query}". Try a demo order below.`, "danger");
      }
      displayOrder(order);
      return order;
    } catch (e) {
      showToast("Tracking Unavailable", e.message, "danger");
      displayOrder(null);
      return null;
    }
  }

  // Bind Form Search
  if (trackForm && trackInput) {
    trackForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const val = trackInput.value.trim();
      if (val) lookup(val);
    });
  }

  // Bind Demo Pill Buttons
  demoButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const orderId = btn.getAttribute("data-id");
      if (trackInput) trackInput.value = orderId;
      lookup(orderId);
    });
  });

  // URL parameter search (e.g. track-order.html?orderId=PNS-8920); otherwise show the first demo order
  const urlParams = new URLSearchParams(window.location.search);
  const orderIdParam = urlParams.get("orderId");
  const firstDemo = demoButtons.length ? demoButtons[0].getAttribute("data-id") : null;
  const initialId = orderIdParam || firstDemo;
  if (initialId) {
    if (trackInput) trackInput.value = initialId;
    lookup(initialId, { silent: !orderIdParam });
  }
}

// ==========================================================================
// 10. Admin Dashboard (JWT login + live data from the API)
// ==========================================================================
function escapeHTML(str) {
  return String(str ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function showAdminLogin() {
  return new Promise(resolve => {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(27,67,50,.92);z-index:3000;display:flex;align-items:center;justify-content:center;padding:1rem;";
    overlay.innerHTML = `
      <form class="bg-white p-4 rounded-4 shadow-lg" style="max-width:380px;width:100%;">
        <h4 class="font-heading mb-1"><i class="bi bi-shield-lock text-success me-2"></i>Admin Sign In</h4>
        <p class="text-muted small mb-3">Enter the nursery administrator credentials.</p>
        <div class="mb-3"><label class="form-label small fw-semibold">Username</label>
          <input class="form-control" name="username" autocomplete="username" required autofocus></div>
        <div class="mb-3"><label class="form-label small fw-semibold">Password</label>
          <input class="form-control" type="password" name="password" autocomplete="current-password" required></div>
        <div class="text-danger small mb-2 d-none" id="admin-login-error"></div>
        <button class="btn btn-botanical w-100" type="submit">Sign In</button>
        <a href="index.html" class="d-block text-center small mt-3 text-muted">&larr; Back to store</a>
      </form>`;
    document.body.appendChild(overlay);
    const form = overlay.querySelector("form");
    const errEl = overlay.querySelector("#admin-login-error");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errEl.classList.add("d-none");
      try {
        const { token } = await api("/admin/login", {
          method: "POST",
          body: {
            username: form.querySelector("[name='username']").value.trim(),
            password: form.querySelector("[name='password']").value
          }
        });
        sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
        overlay.remove();
        resolve();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove("d-none");
      }
    });
  });
}

async function adminCall(fn) {
  // Runs an authed API call; if the token expired, re-prompt for login and retry once.
  try {
    return await fn();
  } catch (e) {
    if (e.status === 401) {
      sessionStorage.removeItem(ADMIN_TOKEN_KEY);
      await showAdminLogin();
      return fn();
    }
    throw e;
  }
}

async function initAdminDashboard() {
  const sidebar = document.getElementById("admin-sidebar");
  const sidebarToggle = document.getElementById("admin-sidebar-toggle");
  const ordersTableBody = document.getElementById("admin-orders-tbody");
  if (!ordersTableBody) return; // not the admin page

  const orderSearchInput = document.getElementById("admin-order-search");
  const orderFilterSelect = document.getElementById("admin-order-filter");

  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener("click", () => sidebar.classList.toggle("show"));
  }

  if (!sessionStorage.getItem(ADMIN_TOKEN_KEY)) await showAdminLogin();

  const money = n => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };

  // ---- Metric cards, stock alerts, category sales ----
  async function loadStats() {
    const st = await adminCall(() => api("/admin/stats", { auth: true }));

    setText("stat-total-sales", money(st.totalSales));
    setText("stat-active-orders", st.activeOrders);
    setText("stat-new-today", `+${st.newOrdersToday} new today`);
    setText("stat-low-stock", `${st.lowStockCount} Plant${st.lowStockCount === 1 ? "" : "s"}`);
    setText("stat-low-stock-note", st.lowStock.slice(0, 2).map(p => p.name.split(" ").slice(0, 2).join(" ")).join(" & ") || "All stocked");
    setText("stat-customers", st.totalCustomers);

    const stockBody = document.getElementById("stock-alert-tbody");
    if (stockBody) {
      const lvl = {
        out: { cls: "bg-danger", text: "Out of Stock", num: "text-danger" },
        low: { cls: "bg-warning text-dark", text: "Low Stock", num: "text-warning" },
        moderate: { cls: "bg-warning text-dark", text: "Moderate", num: "text-warning" }
      };
      stockBody.innerHTML = st.lowStock.length ? st.lowStock.map(p => `
        <tr>
          <td><strong>${escapeHTML(p.name)}</strong></td>
          <td><span class="badge bg-light text-dark border text-capitalize">${escapeHTML(p.category)}</span></td>
          <td class="${lvl[p.level].num} fw-bold">${p.stockCount} left</td>
          <td><span class="badge ${lvl[p.level].cls}">${lvl[p.level].text}</span></td>
          <td class="text-end">
            <button class="btn btn-sm btn-botanical-light py-1 px-2 restock-btn" data-id="${escapeHTML(p.id)}" data-name="${escapeHTML(p.name)}">Restock +20</button>
          </td>
        </tr>`).join("") : `<tr><td colspan="5" class="text-center text-muted py-3">All plants are well stocked 🌿</td></tr>`;

      stockBody.querySelectorAll(".restock-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
          btn.disabled = true;
          try {
            await adminCall(() => api(`/products/${encodeURIComponent(btn.dataset.id)}/restock`, { method: "POST", body: { quantity: 20 }, auth: true }));
            showToast("Restocked", `Added 20 units of ${btn.dataset.name}.`, "success");
            loadStats();
          } catch (e) {
            showToast("Restock Failed", e.message, "danger");
            btn.disabled = false;
          }
        });
      });
    }

    const catBox = document.getElementById("category-sales-container");
    if (catBox) {
      const names = { indoor: "Indoor Foliage Plants", outdoor: "Outdoor Garden & Bonsai", seeds: "Organic Heirloom Seeds", accessories: "Brass Tools & Pots" };
      const colors = { indoor: "bg-success", outdoor: "bg-primary", seeds: "bg-warning", accessories: "bg-info" };
      catBox.innerHTML = st.salesByCategory.map(c => `
        <div class="mb-3">
          <div class="d-flex justify-content-between small mb-1">
            <span class="fw-semibold">${names[c.category]}</span>
            <span class="fw-bold">${c.percent}% (${money(c.revenue)})</span>
          </div>
          <div class="progress" style="height: 8px;"><div class="progress-bar ${colors[c.category]}" style="width: ${c.percent}%;"></div></div>
        </div>`).join("");
    }
    setText("top-product-note", st.topProduct ? `${st.topProduct.name} is the #1 revenue driver (${money(st.topProduct.revenue)}).` : "No sales yet.");
  }

  // ---- Orders table ----
  const statusLabels = {
    "order-placed": "Order Placed", "ready-to-ship": "Ready to Ship", "shipped": "Shipped",
    "out-for-delivery": "Out for Delivery", "delivered": "Delivered", "cancelled": "Cancelled"
  };

  function renderOrders(orders) {
    if (!orders.length) {
      ordersTableBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">No orders match your filters.</td></tr>`;
      return;
    }
    ordersTableBody.innerHTML = orders.map(order => {
      const options = Object.entries(statusLabels)
        .map(([v, l]) => `<option value="${v}" ${order.status === v ? "selected" : ""}>${l}</option>`).join("");
      const locked = order.status === "cancelled" ? "disabled" : "";
      return `
        <tr>
          <td><span class="fw-bold text-dark">#${escapeHTML(order.id)}</span></td>
          <td>
            <div class="fw-semibold text-dark">${escapeHTML(order.customer)}</div>
            <small class="text-muted">${escapeHTML(order.date)}</small>
          </td>
          <td>${escapeHTML(order.plant || "Botanical Items")}</td>
          <td class="fw-bold text-dark">${money(order.amount)}</td>
          <td>
            <select class="form-select form-select-sm status-pill status-${order.status} border-0 py-1 ps-2 pe-4 admin-status-select" data-id="${escapeHTML(order.id)}" ${locked}>${options}</select>
          </td>
          <td class="text-end">
            <a href="track-order.html?orderId=${encodeURIComponent(order.id)}" class="btn btn-sm btn-botanical-outline py-1 px-2" title="Track Live Status">
              <i class="bi bi-geo-alt me-1"></i> Track
            </a>
          </td>
        </tr>`;
    }).join("");

    ordersTableBody.querySelectorAll(".admin-status-select").forEach(sel => {
      sel.addEventListener("change", async () => {
        const orderId = sel.dataset.id;
        const label = sel.options[sel.selectedIndex].text;
        if (sel.value === "cancelled" && !confirm(`Cancel order #${orderId}? Stock will be returned to inventory.`)) {
          return loadOrders();
        }
        try {
          await adminCall(() => OrderManager.updateStatus(orderId, sel.value));
          showToast("Status Updated", `Order #${orderId} marked as ${label}.`, "success");
        } catch (e) {
          showToast("Update Failed", e.message, "danger");
        }
        loadOrders();
        loadStats();
      });
    });
  }

  async function loadOrders() {
    try {
      const orders = await adminCall(() => OrderManager.getOrders({
        search: orderSearchInput ? orderSearchInput.value.trim() : "",
        status: orderFilterSelect ? orderFilterSelect.value : "all"
      }));
      renderOrders(orders);
    } catch (e) {
      showToast("Could not load orders", e.message, "danger");
    }
  }

  let searchTimer;
  if (orderSearchInput) orderSearchInput.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(loadOrders, 250); });
  if (orderFilterSelect) orderFilterSelect.addEventListener("change", loadOrders);

  // ---- Add product -> POST /api/products ----
  const addProductForm = document.getElementById("admin-add-product-form");
  if (addProductForm) {
    addProductForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const textInputs = addProductForm.querySelectorAll("input[type='text']:not(#new-plant-name)");
      const body = {
        name: document.getElementById("new-plant-name").value,
        category: document.getElementById("new-plant-category").value,
        price: document.getElementById("new-plant-price").value,
        stockCount: document.getElementById("new-plant-stock").value,
        sunlight: textInputs[0] ? textInputs[0].value : undefined,
        watering: textInputs[1] ? textInputs[1].value : undefined
      };
      try {
        const created = await adminCall(() => api("/products", { method: "POST", body, auth: true }));
        showToast("Plant Added! 🌱", `${created.name} has been added to the store catalog.`, "success");
        addProductForm.reset();
        const modalEl = document.getElementById("addProductModal");
        if (modalEl && window.bootstrap) {
          const modalInstance = bootstrap.Modal.getInstance(modalEl);
          if (modalInstance) modalInstance.hide();
        }
        loadStats();
      } catch (err) {
        const detail = err.details && err.details.length ? ` (${err.details.join("; ")})` : "";
        showToast("Could not add plant", err.message + detail, "danger");
      }
    });
  }

  // Sign-out link (injected next to the page title area if present)
  const signOut = document.getElementById("admin-signout-btn");
  if (signOut) signOut.addEventListener("click", () => { sessionStorage.removeItem(ADMIN_TOKEN_KEY); location.reload(); });

  await Promise.all([loadStats(), loadOrders()]);
}

// ==========================================================================
// 11. Shared Event Listeners & Bootstrapper
// ==========================================================================
function attachCatalogEventListeners(container) {
  if (!container) return;

  // Quick Add To Cart buttons
  const addButtons = container.querySelectorAll(".quick-add-btn");
  addButtons.forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const id = btn.getAttribute("data-id");
      Cart.addItem(id, 1, "Standard Pot");
    });
  });

  // Wishlist buttons
  const wishlistButtons = container.querySelectorAll(".quick-wishlist-btn");
  wishlistButtons.forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const icon = btn.querySelector("i");
      if (icon) {
        if (icon.classList.contains("bi-heart")) {
          icon.classList.remove("bi-heart");
          icon.classList.add("bi-heart-fill", "text-danger");
          showToast("Added to Wishlist ❤️", "Saved to your plant wishlist.", "info");
        } else {
          icon.classList.remove("bi-heart-fill", "text-danger");
          icon.classList.add("bi-heart");
          showToast("Removed from Wishlist", "Item removed from wishlist.", "info");
        }
      }
    });
  });
}

// Auto-initialize on DOM ready
document.addEventListener("DOMContentLoaded", async () => {
  // Update badge on every page load
  Cart.updateNavbarBadges();

  // Pages that render products/cart need the catalog from the API first
  const needsCatalog = document.getElementById("featured-products-container") ||
    document.getElementById("shop-products-grid") ||
    document.getElementById("product-detail-view") ||
    document.getElementById("cart-items-tbody");
  if (needsCatalog) {
    try {
      await loadCatalog();
    } catch (e) {
      showToast("Store Unavailable", e.message, "danger");
    }
  }

  // Route-based view initialization
  initIndexPage();
  initShopPage();
  initProductDetailPage();
  await initCartPage();
  initTrackOrderPage();
  initAdminDashboard();

  // Global search input in navbar (if present)
  const navSearchForm = document.getElementById("navbar-search-form");
  if (navSearchForm) {
    navSearchForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = navSearchForm.querySelector("input");
      if (input && input.value.trim()) {
        window.location.href = `shop.html?search=${encodeURIComponent(input.value.trim())}`;
      }
    });
  }
});

