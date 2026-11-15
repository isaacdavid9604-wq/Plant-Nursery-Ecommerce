const db = require('./db');
const config = require('./config');
const { HttpError } = require('./middleware/errors');

const CATEGORY_LABELS = {
  indoor: 'Indoor Plant',
  outdoor: 'Outdoor Garden',
  seeds: 'Seeds & Germination',
  accessories: 'Tools & Accessories'
};

const STATUS_FLOW = ['order-placed', 'ready-to-ship', 'shipped', 'out-for-delivery', 'delivered'];
const STAGE_KEYS = ['orderPlaced', 'readyToShip', 'shipped', 'outForDelivery', 'delivered'];
const STAGE_MESSAGES = {
  orderPlaced: 'Order received and payment confirmed',
  readyToShip: 'Botanical health checked and packed in eco-box',
  shipped: 'Dispatched from Central Greenhouse Nursery Hub',
  outForDelivery: 'Out for delivery with courier agent',
  delivered: 'Delivered to customer (14-Day Guarantee active)'
};
const PENDING_MESSAGES = {
  orderPlaced: 'Pending',
  readyToShip: 'Pending nursery inspection and eco-box packing',
  shipped: 'Awaiting courier pickup from greenhouse',
  outForDelivery: 'Pending arrival at destination hub',
  delivered: 'Pending delivery'
};

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function formatStamp(date = new Date()) {
  const d = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  const t = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `${d}, ${t}`;
}

function productFromRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    scientificName: r.scientific_name,
    category: r.category,
    categoryLabel: r.category_label,
    price: r.price,
    oldPrice: r.old_price,
    rating: r.rating,
    reviews: r.reviews,
    badge: r.badge,
    badgeType: r.badge_type,
    inStock: r.stock_count > 0,
    stockCount: r.stock_count,
    image: r.image,
    gallery: JSON.parse(r.gallery || '[]'),
    description: r.description,
    care: JSON.parse(r.care || '{}'),
    featured: !!r.featured
  };
}

function orderFromRow(r) {
  if (!r) return null;
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(r.id).map((i) => ({
    id: i.product_id,
    name: i.name,
    image: i.image,
    price: i.price,
    quantity: i.quantity,
    potSize: i.pot_size
  }));
  return {
    id: r.id,
    customer: r.customer,
    phone: r.phone,
    address: r.address,
    plant: items.map((i) => `${i.name}${i.quantity > 1 ? ` (x${i.quantity})` : ''}`).join(', '),
    items,
    subtotal: r.subtotal,
    discount: r.discount,
    shipping: r.shipping,
    tax: r.tax,
    amount: r.amount,
    promoCode: r.promo_code,
    paymentMethod: r.payment_method,
    status: r.status,
    date: formatStamp(new Date(r.created_at.replace(' ', 'T') + 'Z')),
    createdAt: r.created_at,
    carrier: r.carrier,
    trackingNumber: r.tracking_number,
    estimatedDelivery: r.estimated_delivery,
    stages: JSON.parse(r.stages || '{}')
  };
}

/** Prices a cart entirely from DB values. Never trust client-sent prices. */
function priceCart(rawItems, promoCode) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new HttpError(400, 'Cart is empty');
  }
  const getProduct = db.prepare('SELECT * FROM products WHERE id = ?');
  const merged = new Map();
  for (const it of rawItems) {
    const qty = parseInt(it.quantity, 10);
    if (!it.id || !Number.isInteger(qty) || qty <= 0 || qty > 99) {
      throw new HttpError(400, 'Each cart item needs a valid id and quantity (1-99)');
    }
    const potSize = String(it.potSize || 'Standard Pot').slice(0, 60);
    const key = `${it.id}::${potSize}`;
    const prev = merged.get(key);
    merged.set(key, { id: it.id, potSize, quantity: (prev ? prev.quantity : 0) + qty });
  }

  const lines = [];
  const demand = new Map();
  for (const line of merged.values()) {
    const p = getProduct.get(line.id);
    if (!p) throw new HttpError(400, `Unknown product: ${line.id}`);
    demand.set(p.id, (demand.get(p.id) || 0) + line.quantity);
    lines.push({ product: p, ...line });
  }
  for (const [pid, qty] of demand) {
    const p = getProduct.get(pid);
    if (p.stock_count <= 0) throw new HttpError(409, `${p.name} is out of stock`);
    if (qty > p.stock_count) throw new HttpError(409, `Only ${p.stock_count} of ${p.name} available`);
  }

  const subtotal = round2(lines.reduce((s, l) => s + l.product.price * l.quantity, 0));
  let discount = 0;
  let appliedPromo = null;
  if (promoCode) {
    const promo = db.prepare('SELECT * FROM promo_codes WHERE code = ? AND active = 1').get(String(promoCode).trim().toUpperCase());
    if (!promo) throw new HttpError(400, 'Invalid or expired promo code');
    discount = round2(subtotal * (promo.percent_off / 100));
    appliedPromo = promo.code;
  }
  const shipping = subtotal > config.freeShippingOver || subtotal === 0 ? 0 : config.shippingFlat;
  const tax = round2(subtotal * config.taxRate);
  const total = round2(Math.max(0, subtotal - discount + shipping + tax));
  return { lines, subtotal, discount, shipping, tax, total, promoCode: appliedPromo };
}

function generateOrderId() {
  const exists = db.prepare('SELECT 1 FROM orders WHERE id = ?');
  for (let i = 0; i < 10; i++) {
    const id = `PNS-${Math.floor(10000 + Math.random() * 90000)}`;
    if (!exists.get(id)) return id;
  }
  throw new HttpError(500, 'Could not generate order id');
}

function createOrder({ customer, phone, address, items, promoCode, paymentMethod }) {
  const tx = db.transaction(() => {
    const priced = priceCart(items, promoCode);
    const id = generateOrderId();
    const stamp = formatStamp();
    const stages = {};
    STAGE_KEYS.forEach((k) => { stages[k] = PENDING_MESSAGES[k]; });
    stages.orderPlaced = `${stamp} - ${STAGE_MESSAGES.orderPlaced}`;

    db.prepare(`INSERT INTO orders
      (id,customer,phone,address,subtotal,discount,shipping,tax,amount,promo_code,payment_method,status,
       carrier,tracking_number,estimated_delivery,stages)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,'order-placed',?,?,?,?)`).run(
      id, customer, phone, address, priced.subtotal, priced.discount, priced.shipping, priced.tax, priced.total,
      priced.promoCode, paymentMethod || 'upi', 'EcoGreen Climate Logistics',
      `EGL-${Math.floor(1000000 + Math.random() * 9000000)}`, 'In 3 to 4 Business Days', JSON.stringify(stages)
    );

    const insItem = db.prepare(`INSERT INTO order_items (order_id,product_id,name,image,price,quantity,pot_size)
      VALUES (?,?,?,?,?,?,?)`);
    const dec = db.prepare('UPDATE products SET stock_count = stock_count - ? WHERE id = ? AND stock_count >= ?');
    for (const l of priced.lines) {
      const r = dec.run(l.quantity, l.product.id, l.quantity);
      if (r.changes === 0) throw new HttpError(409, `${l.product.name} just went out of stock`);
      insItem.run(id, l.product.id, l.product.name, l.product.image, l.product.price, l.quantity, l.potSize);
    }
    return id;
  });
  const id = tx();
  return orderFromRow(db.prepare('SELECT * FROM orders WHERE id = ?').get(id));
}

function updateOrderStatus(orderId, newStatus) {
  const tx = db.transaction(() => {
    const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!row) throw new HttpError(404, 'Order not found');
    if (row.status === newStatus) return;

    const stages = JSON.parse(row.stages || '{}');
    const idx = STATUS_FLOW.indexOf(newStatus);
    if (idx > -1) {
      const stamp = formatStamp();
      STAGE_KEYS.forEach((k, i) => {
        if (i < idx && /^Pending/.test(stages[k] || 'Pending')) stages[k] = `${stamp} - ${STAGE_MESSAGES[k]}`;
        if (i === idx) stages[k] = `${stamp} - ${STAGE_MESSAGES[k]}`;
        if (i > idx) stages[k] = PENDING_MESSAGES[k];
      });
    }

    // Cancelling returns stock; un-cancelling is not supported.
    if (newStatus === 'cancelled' && row.status !== 'cancelled') {
      const items = db.prepare('SELECT product_id, quantity FROM order_items WHERE order_id = ?').all(orderId);
      const restock = db.prepare('UPDATE products SET stock_count = stock_count + ? WHERE id = ?');
      items.forEach((i) => restock.run(i.quantity, i.product_id));
    } else if (row.status === 'cancelled') {
      throw new HttpError(409, 'Cancelled orders cannot be reopened');
    }

    db.prepare('UPDATE orders SET status = ?, stages = ? WHERE id = ?').run(newStatus, JSON.stringify(stages), orderId);
  });
  tx();
  return orderFromRow(db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId));
}

module.exports = {
  CATEGORY_LABELS, productFromRow, orderFromRow, priceCart, createOrder, updateOrderStatus, round2
};
