/**
 * Seeds the database with the original catalog + demo orders.
 *   node src/seed.js          -> seeds only if tables are empty
 *   node src/seed.js --reset  -> wipes products/orders/promos and reseeds
 */
const path = require('path');
const db = require('./db');

const products = require('../data/seed-products.json');
const orders = require('../data/seed-orders.json');

function seed({ reset = false } = {}) {
  if (reset) {
    db.exec('DELETE FROM order_items; DELETE FROM orders; DELETE FROM products; DELETE FROM promo_codes;');
  }

  const productCount = db.prepare('SELECT COUNT(*) c FROM products').get().c;
  if (productCount === 0) {
    const ins = db.prepare(`INSERT INTO products
      (id,name,scientific_name,category,category_label,price,old_price,rating,reviews,badge,badge_type,
       stock_count,image,gallery,description,care,featured)
      VALUES (@id,@name,@scientific_name,@category,@category_label,@price,@old_price,@rating,@reviews,@badge,
       @badge_type,@stock_count,@image,@gallery,@description,@care,@featured)`);
    db.transaction(() => {
      for (const p of products) {
        ins.run({
          id: p.id, name: p.name, scientific_name: p.scientificName, category: p.category,
          category_label: p.categoryLabel, price: p.price, old_price: p.oldPrice ?? null,
          rating: p.rating, reviews: p.reviews, badge: p.badge, badge_type: p.badgeType,
          stock_count: p.inStock ? p.stockCount : 0, image: p.image,
          gallery: JSON.stringify(p.gallery || []), description: p.description,
          care: JSON.stringify(p.care || {}), featured: p.featured ? 1 : 0
        });
      }
    })();
    console.log(`Seeded ${products.length} products`);
  }

  const promoCount = db.prepare('SELECT COUNT(*) c FROM promo_codes').get().c;
  if (promoCount === 0) {
    db.prepare('INSERT INTO promo_codes (code, percent_off) VALUES (?, ?)').run('PLANT10', 10);
    console.log('Seeded promo code PLANT10');
  }

  const orderCount = db.prepare('SELECT COUNT(*) c FROM orders').get().c;
  if (orderCount === 0) {
    const insO = db.prepare(`INSERT INTO orders
      (id,customer,phone,address,subtotal,discount,shipping,tax,amount,status,carrier,tracking_number,
       estimated_delivery,stages,created_at)
      VALUES (@id,@customer,@phone,@address,@subtotal,0,0,0,@amount,@status,@carrier,@tracking,@eta,@stages,@created_at)`);
    const insI = db.prepare(`INSERT INTO order_items (order_id,product_id,name,image,price,quantity,pot_size)
      VALUES (?,?,?,?,?,?,?)`);
    db.transaction(() => {
      orders.forEach((o, idx) => {
        const created = new Date(Date.now() - idx * 3 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
        insO.run({
          id: o.id, customer: o.customer, phone: o.phone, address: o.address,
          subtotal: o.amount, amount: o.amount, status: o.status, carrier: o.carrier,
          tracking: o.trackingNumber, eta: o.estimatedDelivery,
          stages: JSON.stringify(o.stages || {}), created_at: created
        });
        for (const it of o.items) insI.run(o.id, it.id, it.name, it.image, it.price, it.quantity, it.potSize || 'Standard Pot');
      });
    })();
    console.log(`Seeded ${orders.length} demo orders`);
  }
}

module.exports = seed;

if (require.main === module) {
  seed({ reset: process.argv.includes('--reset') });
  console.log('Done.');
}
