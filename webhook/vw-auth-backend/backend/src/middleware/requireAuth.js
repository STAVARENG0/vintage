'use strict';

const jwt = require('jsonwebtoken');

const COOKIE_NAME = process.env.COOKIE_NAME || 'vw_admin';
const JWT_SECRET = process.env.JWT_SECRET;

function requireAuth(req, res, next) {
  try {
    if (!JWT_SECRET) {
      return res.status(500).json({ ok: false, error: 'JWT_SECRET_NOT_SET' });
    }

    const token = req.cookies?.[COOKIE_NAME];
    if (!token) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    return next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
  }
}

module.exports = { requireAuth };
