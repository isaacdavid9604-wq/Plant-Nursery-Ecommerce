const path = require('path');
const fs = require('fs');
require('dotenv').config();
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'nursery.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  scientific_name TEXT DEFAULT '',
  category        TEXT NOT NULL CHECK (category IN ('indoor','outdoor','seeds','accessories')),
  category_label  TEXT NOT NULL,
  price           REAL NOT NULL CHECK (price >= 0),
  old_price       REAL,
  rating          REAL DEFAULT 0,
  reviews         INTEGER DEFAULT 0,
  badge           TEXT,
  badge_type      TEXT DEFAULT 'new',
  stock_count     INTEGER NOT NULL DEFAULT 0 CHECK (stock_count >= 0),
  image           TEXT,
  gallery         TEXT DEFAULT '[]',
  description     TEXT DEFAULT '',
  care            TEXT DEFAULT '{}',
  featured        INTEGER DEFAULT 0,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id                 TEXT PRIMARY KEY,
  customer           TEXT NOT NULL,
  phone              TEXT NOT NULL,
  address            TEXT NOT NULL,
  subtotal           REAL NOT NULL,
  discount           REAL NOT NULL DEFAULT 0,
  shipping           REAL NOT NULL DEFAULT 0,
  tax                REAL NOT NULL DEFAULT 0,
  amount             REAL NOT NULL,
  promo_code         TEXT,
  payment_method     TEXT DEFAULT 'upi',
  status             TEXT NOT NULL DEFAULT 'order-placed'
                     CHECK (status IN ('order-placed','ready-to-ship','shipped','out-for-delivery','delivered','cancelled')),
  carrier            TEXT,
  tracking_number    TEXT,
  estimated_delivery TEXT,
  stages             TEXT DEFAULT '{}',
  created_at         TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  name       TEXT NOT NULL,
  image      TEXT,
  price      REAL NOT NULL,
  quantity   INTEGER NOT NULL CHECK (quantity > 0),
  pot_size   TEXT DEFAULT 'Standard Pot'
);

CREATE TABLE IF NOT EXISTS promo_codes (
  code        TEXT PRIMARY KEY,
  percent_off REAL NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(phone);
CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);
`);

module.exports = db;
