# 🌿 Plant Nursery Store — Full-Stack (Frontend + Backend)

Your original static storefront, now backed by a real **Node.js + Express + SQLite** API.
One server serves both the website and the API, so there is nothing else to configure.

```
Ecomm_Fullstack/
├── frontend/              # your original HTML/CSS/JS (js/main.js now calls the API)
└── backend/
    ├── src/
    │   ├── server.js      # Express app (API + serves ../frontend)
    │   ├── db.js          # SQLite schema
    │   ├── seed.js        # loads the original 13 products, 5 demo orders, PLANT10 promo
    │   ├── services.js    # pricing, stock, order lifecycle logic
    │   ├── routes/        # products, orders, promo, admin
    │   └── middleware/    # JWT auth, error handling
    ├── data/              # seed JSON (+ nursery.db is created here on first run)
    ├── .env.example
    └── package.json
```

## Run it

Requires **Node.js 18+**. You can run everything from the project root:

```bash
npm install     # also installs the backend automatically
npm start
```

(or `cd backend && npm install && npm start` — both work).

```bash
cd backend
npm install
cp .env.example .env      # (Windows: copy .env.example .env)  — optional but recommended
npm start
```

Open **http://localhost:3000**

| Page | URL |
|---|---|
| Store | http://localhost:3000/ |
| Admin dashboard | http://localhost:3000/admin-dashboard.html |
| Health check | http://localhost:3000/api/health |

**Admin login (default):** `admin` / `admin123` — change `ADMIN_USERNAME`, `ADMIN_PASSWORD`
and `JWT_SECRET` in `backend/.env` before putting this anywhere public.

The database (`backend/data/nursery.db`) is created and seeded automatically on first start.
To wipe it back to the original demo data: `npm run seed`.

## What moved from the browser to the server

| Before (localStorage) | Now |
|---|---|
| Hard-coded `PLANT_CATALOG` array | `GET /api/products` (SQLite) |
| Orders saved in the browser | `POST /api/orders` → persisted, visible to admin on any device |
| Client calculated totals | Server recalculates price, shipping, 8% tax and promo from DB prices (client prices are ignored) |
| Stock was display-only | Stock is checked and decremented in a transaction; oversells return `409` |
| Fake admin numbers | Live sales, active orders, low-stock list and category breakdown from real orders |
| Anyone could open admin | JWT login; all admin endpoints require a Bearer token |
| "Add plant" only showed a toast | Actually inserts the product |

The cart itself still lives in the browser's `localStorage` (standard for a guest cart); it is
re-synced against live prices/stock on the cart page and fully re-validated at checkout.

## API reference

Public
- `GET  /api/products` — query: `category`, `search`, `inStock=true`, `maxPrice`, `featured=true`, `sort=price-asc|price-desc|rating-desc|name-asc`
- `GET  /api/products/:id`
- `POST /api/promo/validate` `{ code }`
- `POST /api/orders/quote` `{ items:[{id,quantity,potSize}], promoCode }` → totals
- `POST /api/orders` `{ customer, phone, address, paymentMethod, promoCode, items }` → creates order
- `GET  /api/orders/track/:orderIdOrPhone`

Admin (header `Authorization: Bearer <token>`)
- `POST  /api/admin/login` `{ username, password }` → `{ token }`
- `GET   /api/admin/stats`
- `GET   /api/orders?status=&search=`
- `PATCH /api/orders/:id/status` `{ status }` (cancelling returns stock; cancelled orders can't be reopened)
- `POST  /api/products` · `PUT /api/products/:id` · `DELETE /api/products/:id`
- `POST  /api/products/:id/restock` `{ quantity }`

Order statuses: `order-placed → ready-to-ship → shipped → out-for-delivery → delivered` (or `cancelled`).

## Notes

- Promo code `PLANT10` = 10% off. More codes can be added in the `promo_codes` table.
- Shipping is free above $50 (else $8.50); tax is 8% — change in `backend/src/config.js`.
- Order tracking is public by order ID or phone number (same behaviour as the original demo).
  For a real shop you'd want to require both, or add customer accounts.
- Payment is recorded (UPI / card / COD) but **no payment gateway is integrated** — plug Razorpay/Stripe into `POST /api/orders` when you're ready.
- To host the frontend on a different domain (e.g. Netlify), set `window.API_BASE = "https://your-api"`
  in a `<script>` before `js/main.js` on each page; CORS is already enabled.

## Deploy (Render)

Make sure the repo's top level shows `backend/`, `frontend/` and `package.json` (not an extra wrapper folder).
Then in Render: **Build command** `npm install`, **Start command** `npm start`, leave *Root Directory* empty.
Add env vars `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `DB_PATH=/var/data/nursery.db`,
and attach a Disk mounted at `/var/data` so orders survive restarts. A `render.yaml` blueprint is included.
