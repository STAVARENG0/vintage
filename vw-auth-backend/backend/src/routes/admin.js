'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

// Exemplo de rota protegida
router.get('/ping', requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user });
});

module.exports = { adminRouter: router };
