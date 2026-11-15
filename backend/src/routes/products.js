const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { HttpError, asyncHandler } = require('../middleware/errors');
const { productFromRow, CATEGORY_LABELS } = require('../services');

const router = express.Router();

const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// GET /api/products?category=&search=&inStock=true&maxPrice=&featured=true&sort=
router.get('/', asyncHandler((req, res) => {
  const { category, search, inStock, maxPrice, featured, sort } = req.query;
  const where = [];
  const params = [];
  if (category && category !== 'all') { where.push('category = ?'); params.push(category); }
  if (search) {
    where.push('(name LIKE ? OR scientific_name LIKE ? OR description LIKE ?)');
    const q = `%${search}%`;
    params.push(q, q, q);
  }
  if (inStock === 'true') where.push('stock_count > 0');
  if (featured === 'true') where.push('featured = 1');
  if (maxPrice && !Number.isNaN(parseFloat(maxPrice))) { where.push('price <= ?'); params.push(parseFloat(maxPrice)); }

  const orderBy = {
    'price-asc': 'price ASC',
    'price-desc': 'price DESC',
    'rating-desc': 'rating DESC',
    'name-asc': 'name COLLATE NOCASE ASC'
  }[sort] || 'featured DESC, created_at ASC, rowid ASC';

  const rows = db.prepare(`SELECT * FROM products ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${orderBy}`).all(...params);
  res.json(rows.map(productFromRow));
}));

router.get('/:id', asyncHandler((req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!row) throw new HttpError(404, 'Product not found');
  res.json(productFromRow(row));
}));

function validateProduct(body, partial = false) {
  const errors = [];
  const out = {};
  if (!partial || body.name !== undefined) {
    if (!body.name || !String(body.name).trim()) errors.push('name is required');
    else out.name = String(body.name).trim().slice(0, 120);
  }
  if (!partial || body.category !== undefined) {
    if (!CATEGORY_LABELS[body.category]) errors.push('category must be indoor, outdoor, seeds or accessories');
    else { out.category = body.category; out.category_label = CATEGORY_LABELS[body.category]; }
  }
  if (!partial || body.price !== undefined) {
    const p = parseFloat(body.price);
    if (Number.isNaN(p) || p < 0) errors.push('price must be a non-negative number');
    else out.price = p;
  }
  if (!partial || body.stockCount !== undefined) {
    const s = parseInt(body.stockCount, 10);
    if (Number.isNaN(s) || s < 0) errors.push('stockCount must be a non-negative integer');
    else out.stock_count = s;
  }
  if (body.oldPrice !== undefined) out.old_price = body.oldPrice === null || body.oldPrice === '' ? null : parseFloat(body.oldPrice);
  if (body.scientificName !== undefined) out.scientific_name = String(body.scientificName).slice(0, 160);
  if (body.description !== undefined) out.description = String(body.description).slice(0, 2000);
  if (body.image !== undefined) out.image = String(body.image).slice(0, 1000);
  if (body.badge !== undefined) out.badge = body.badge ? String(body.badge).slice(0, 40) : null;
  if (body.badgeType !== undefined) out.badge_type = body.badgeType === 'sale' ? 'sale' : 'new';
  if (body.featured !== undefined) out.featured = body.featured ? 1 : 0;
  if (body.gallery !== undefined && Array.isArray(body.gallery)) out.gallery = JSON.stringify(body.gallery.slice(0, 10));
  if (body.care !== undefined && typeof body.care === 'object') out.care = JSON.stringify(body.care);
  if (errors.length) throw new HttpError(400, 'Validation failed', errors);
  return out;
}

const DEFAULT_IMG = 'https://images.unsplash.com/photo-1545241047-6083a3684587?auto=format&fit=crop&w=800&q=80';

router.post('/', requireAdmin, asyncHandler((req, res) => {
  const data = validateProduct(req.body);
  let id = slugify(req.body.id || data.name);
  if (!id) throw new HttpError(400, 'Could not derive product id');
  if (db.prepare('SELECT 1 FROM products WHERE id = ?').get(id)) id = `${id}-${Date.now().toString(36)}`;

  data.id = id;
  data.image = data.image || DEFAULT_IMG;
  data.gallery = data.gallery || JSON.stringify([data.image]);
  data.care = data.care || JSON.stringify({
    sunlight: req.body.sunlight || 'Bright, Indirect',
    watering: req.body.watering || 'Every 7-10 Days',
    difficulty: 'Beginner Friendly', petFriendly: 'Check before pets', temperature: '18°C - 30°C'
  });
  const cols = Object.keys(data);
  db.prepare(`INSERT INTO products (${cols.join(',')}) VALUES (${cols.map((c) => '@' + c).join(',')})`).run(data);
  res.status(201).json(productFromRow(db.prepare('SELECT * FROM products WHERE id = ?').get(id)));
}));

router.put('/:id', requireAdmin, asyncHandler((req, res) => {
  const existing = db.prepare('SELECT 1 FROM products WHERE id = ?').get(req.params.id);
  if (!existing) throw new HttpError(404, 'Product not found');
  const data = validateProduct(req.body, true);
  const cols = Object.keys(data);
  if (!cols.length) throw new HttpError(400, 'No updatable fields supplied');
  db.prepare(`UPDATE products SET ${cols.map((c) => `${c} = @${c}`).join(', ')} WHERE id = @__id`).run({ ...data, __id: req.params.id });
  res.json(productFromRow(db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id)));
}));

// Quick restock: POST /api/products/:id/restock { quantity }
router.post('/:id/restock', requireAdmin, asyncHandler((req, res) => {
  const qty = parseInt(req.body.quantity, 10);
  if (!Number.isInteger(qty) || qty <= 0) throw new HttpError(400, 'quantity must be a positive integer');
  const r = db.prepare('UPDATE products SET stock_count = stock_count + ? WHERE id = ?').run(qty, req.params.id);
  if (!r.changes) throw new HttpError(404, 'Product not found');
  res.json(productFromRow(db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id)));
}));

router.delete('/:id', requireAdmin, asyncHandler((req, res) => {
  const r = db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  if (!r.changes) throw new HttpError(404, 'Product not found');
  res.status(204).end();
}));

module.exports = router;
