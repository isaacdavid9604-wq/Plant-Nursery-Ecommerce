const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { HttpError, asyncHandler } = require('../middleware/errors');
const { orderFromRow, createOrder, updateOrderStatus, priceCart } = require('../services');

const router = express.Router();
const VALID_STATUSES = ['order-placed', 'ready-to-ship', 'shipped', 'out-for-delivery', 'delivered', 'cancelled'];

// POST /api/orders/quote  { items:[{id,quantity,potSize}], promoCode } -> totals computed server-side
router.post('/quote', asyncHandler((req, res) => {
  const p = priceCart(req.body.items, req.body.promoCode);
  res.json({ subtotal: p.subtotal, discount: p.discount, shipping: p.shipping, tax: p.tax, total: p.total, promoCode: p.promoCode });
}));

// POST /api/orders  (public checkout)
router.post('/', asyncHandler((req, res) => {
  const { customer, phone, address, items, promoCode, paymentMethod } = req.body || {};
  const errors = [];
  if (!customer || !String(customer).trim()) errors.push('customer name is required');
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) errors.push('a valid phone number is required');
  if (!address || String(address).trim().length < 5) errors.push('delivery address is required');
  if (paymentMethod && !['upi', 'card', 'cod'].includes(paymentMethod)) errors.push('invalid paymentMethod');
  if (errors.length) throw new HttpError(400, 'Validation failed', errors);

  const order = createOrder({
    customer: String(customer).trim().slice(0, 100),
    phone: String(phone).trim().slice(0, 20),
    address: String(address).trim().slice(0, 400),
    items, promoCode, paymentMethod
  });
  res.status(201).json(order);
}));

// GET /api/orders/track/:query  (public: by order id or phone number)
router.get('/track/:query', asyncHandler((req, res) => {
  const clean = req.params.query.trim().toUpperCase().replace('#', '');
  let row = db.prepare('SELECT * FROM orders WHERE UPPER(id) = ?').get(clean);
  if (!row) {
    const digits = clean.replace(/\D/g, '');
    if (digits.length >= 8) {
      row = db.prepare(`SELECT * FROM orders WHERE REPLACE(REPLACE(REPLACE(phone,' ',''),'+',''),'-','') LIKE ?
                        ORDER BY created_at DESC LIMIT 1`).get(`%${digits}`);
    }
  }
  if (!row) throw new HttpError(404, 'Order not found');
  res.json(orderFromRow(row));
}));

// ---- Admin ----
router.get('/', requireAdmin, asyncHandler((req, res) => {
  const { status, search } = req.query;
  const where = [];
  const params = [];
  if (status && status !== 'all') { where.push('o.status = ?'); params.push(status); }
  if (search) {
    where.push(`(o.id LIKE ? OR o.customer LIKE ? OR EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id AND i.name LIKE ?))`);
    const q = `%${search}%`;
    params.push(q, q, q);
  }
  const rows = db.prepare(`SELECT o.* FROM orders o ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                           ORDER BY o.created_at DESC, o.rowid DESC`).all(...params);
  res.json(rows.map(orderFromRow));
}));

router.patch('/:id/status', requireAdmin, asyncHandler((req, res) => {
  const { status } = req.body || {};
  if (!VALID_STATUSES.includes(status)) throw new HttpError(400, `status must be one of: ${VALID_STATUSES.join(', ')}`);
  res.json(updateOrderStatus(req.params.id, status));
}));

module.exports = router;
