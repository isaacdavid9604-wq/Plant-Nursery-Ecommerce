const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const config = require('./config');
const db = require('./db');
const seed = require('./seed');
const { notFound, errorHandler } = require('./middleware/errors');

seed(); // seeds only when tables are empty

const app = express();
app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false })); // frontend loads Bootstrap/fonts/images from CDNs
app.use(cors());
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (req, res) => {
  const products = db.prepare('SELECT COUNT(*) c FROM products').get().c;
  res.json({ status: 'ok', products, time: new Date().toISOString() });
});

app.use('/api/admin/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again later.' } }));
app.use('/api/orders', rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false }));

app.use('/api/products', require('./routes/products'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/promo', require('./routes/promo'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api', notFound);

// ---- Frontend (static) ----
if (fs.existsSync(config.frontendDir)) {
  app.use(express.static(config.frontendDir, { extensions: ['html'] }));
  // Pretty URLs from the original _redirects file: /shop -> shop.html etc. handled by extensions: ['html']
}

app.use(errorHandler);

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`\n🌿 Plant Nursery server running at http://localhost:${config.port}`);
    console.log(`   Store:  http://localhost:${config.port}/`);
    console.log(`   Admin:  http://localhost:${config.port}/admin-dashboard.html  (user: ${config.adminUsername})`);
    console.log(`   API:    http://localhost:${config.port}/api/health\n`);
  });
}

module.exports = app;
