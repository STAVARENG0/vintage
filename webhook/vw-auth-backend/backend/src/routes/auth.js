'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const router = express.Router();

const COOKIE_NAME = process.env.COOKIE_NAME || 'vw_admin';
const JWT_SECRET = process.env.JWT_SECRET;

const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS_HASH = process.env.ADMIN_PASS_HASH;

function cookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,            // em produção (HTTPS) deve ser true
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
  };
}

// POST /auth/login
router.post('/login', async (req, res) => {
  try {
    if (!JWT_SECRET) return res.status(500).json({ ok: false, error: 'JWT_SECRET_NOT_SET' });
    if (!ADMIN_USER || !ADMIN_PASS_HASH) return res.status(500).json({ ok: false, error: 'ADMIN_CREDENTIALS_NOT_SET' });

    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ ok: false, error: 'MISSING_FIELDS' });

    if (username !== ADMIN_USER) return res.status(401).json({ ok: false, error: 'INVALID_CREDENTIALS' });

    const ok = await bcrypt.compare(password, ADMIN_PASS_HASH);
    if (!ok) return res.status(401).json({ ok: false, error: 'INVALID_CREDENTIALS' });

    const token = jwt.sign(
      { sub: 'admin', username: ADMIN_USER, role: 'admin' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie(COOKIE_NAME, token, cookieOptions());
    return res.json({ ok: true, user: { username: ADMIN_USER, role: 'admin' } });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// POST /auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  return res.json({ ok: true });
});

// GET /auth/me
router.get('/me', (req, res) => {
  try {
    if (!JWT_SECRET) return res.status(500).json({ ok: false, error: 'JWT_SECRET_NOT_SET' });

    const token = req.cookies?.[COOKIE_NAME];
    if (!token) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

    const payload = jwt.verify(token, JWT_SECRET);
    return res.json({ ok: true, user: { username: payload.username, role: payload.role } });
  } catch (e) {
    return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
  }
});

module.exports = { authRouter: router };
