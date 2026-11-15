const jwt = require('jsonwebtoken');
const config = require('../config');

function signAdminToken(username) {
  return jwt.sign({ sub: username, role: 'admin' }, config.jwtSecret, { expiresIn: '8h' });
}

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (payload.role !== 'admin') throw new Error('not admin');
    req.admin = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { signAdminToken, requireAdmin };
