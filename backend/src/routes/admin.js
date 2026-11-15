const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const config = require('../config');
const { signAdminToken, requireAdmin } = require('../middleware/auth');
const { HttpError, asyncHandler } = require('../middleware/errors');
const { round2 } = require('../services');

const router = express.Router();

const safeEqual = (a, b) => {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};

router.post('/login', asyncHandler((req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password || !safeEqual(username, config.adminUsername) || !safeEqual(password, config.adminPassword)) {
    throw new HttpError(401, 'Invalid username or password');
  }
  res.json({ token: signAdminToken(username), expiresIn: '8h' });
}));

router.get('/stats', requireAdmin, asyncHandler((req, res) => {
  const live = "status != 'cancelled'";
  const totalSales = db.prepare(`SELECT COALESCE(SUM(amount),0) v FROM orders WHERE ${live}`).get().v;
  const activeOrders = db.prepare("SELECT COUNT(*) c FROM orders WHERE status NOT IN ('delivered','cancelled')").get().c;
  const newToday = db.prepare("SELECT COUNT(*) c FROM orders WHERE date(created_at) = date('now')").get().c;
  const customers = db.prepare(`SELECT COUNT(DISTINCT REPLACE(REPLACE(REPLACE(phone,' ',''),'+',''),'-','')) c FROM orders WHERE ${live}`).get().c;

  const lowStock = db.prepare(`SELECT id,name,category,stock_count FROM products WHERE stock_count <= ?
                               ORDER BY stock_count ASC, name`).all(config.lowStockThreshold)
    .map((p) => ({ id: p.id, name: p.name, category: p.category, stockCount: p.stock_count,
                   level: p.stock_count === 0 ? 'out' : p.stock_count <= 10 ? 'low' : 'moderate' }));

  const catRows = db.prepare(`SELECT p.category, COALESCE(SUM(i.price * i.quantity),0) revenue
      FROM order_items i JOIN orders o ON o.id = i.order_id
      LEFT JOIN products p ON p.id = i.product_id WHERE o.${live} GROUP BY p.category`).all();
  const catTotal = catRows.reduce((s, r) => s + r.revenue, 0) || 1;
  const salesByCategory = ['indoor', 'outdoor', 'seeds', 'accessories'].map((c) => {
    const r = catRows.find((x) => x.category === c);
    const revenue = r ? r.revenue : 0;
    return { category: c, revenue: round2(revenue), percent: Math.round((revenue / catTotal) * 100) };
  });

  const top = db.prepare(`SELECT i.name, SUM(i.price * i.quantity) revenue FROM order_items i
      JOIN orders o ON o.id = i.order_id WHERE o.${live} GROUP BY i.product_id ORDER BY revenue DESC LIMIT 1`).get();

  res.json({
    totalSales: round2(totalSales),
    activeOrders,
    newOrdersToday: newToday,
    lowStockCount: lowStock.length,
    totalCustomers: customers,
    lowStock,
    salesByCategory,
    topProduct: top ? { name: top.name, revenue: round2(top.revenue) } : null
  });
}));

module.exports = router;
