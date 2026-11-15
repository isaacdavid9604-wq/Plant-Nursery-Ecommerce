const express = require('express');
const db = require('../db');
const { HttpError, asyncHandler } = require('../middleware/errors');

const router = express.Router();

router.post('/validate', asyncHandler((req, res) => {
  const code = String((req.body || {}).code || '').trim().toUpperCase();
  const promo = db.prepare('SELECT code, percent_off FROM promo_codes WHERE code = ? AND active = 1').get(code);
  if (!promo) throw new HttpError(404, 'Invalid promo code');
  res.json({ code: promo.code, percentOff: promo.percent_off });
}));

module.exports = router;
