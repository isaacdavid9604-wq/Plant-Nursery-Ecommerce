require('dotenv').config();

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  frontendDir: process.env.FRONTEND_DIR || require('path').join(__dirname, '..', '..', 'frontend'),
  shippingFlat: 8.5,
  freeShippingOver: 50,
  taxRate: 0.08,
  lowStockThreshold: 15
};

module.exports = config;
