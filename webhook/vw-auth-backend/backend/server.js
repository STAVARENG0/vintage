'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const { authRouter } = require('./src/routes/auth');
const { adminRouter } = require('./src/routes/admin');
const { productsRouter } = require('./src/routes/products');

const app = express();

// -------------------- Config --------------------
const PORT = process.env.PORT || 3000;

// CORS: para cookie funcionar, o front precisa chamar com credentials:'include' e o backend precisa permitir credenciais.
// Em produção, DEFINA FRONTEND_ORIGIN com o domínio do seu site (ex.: https://seuusuario.github.io)
const FRONTEND_ORIGIN = (process.env.FRONTEND_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);

// Se FRONTEND_ORIGIN não for definido, este modo "permissivo" aceita qualquer origem (não recomendado).
const corsOptions = {
  origin: function(origin, cb) {
    if (!origin) return cb(null, true); // ferramentas/health checks sem origin
    if (FRONTEND_ORIGIN.length === 0) return cb(null, true);
    if (FRONTEND_ORIGIN.includes(origin)) return cb(null, true);
    return cb(new Error('CORS: Origin não permitida'));
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
};

// -------------------- Middlewares --------------------
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// Rate limit básico para /auth/login (evita brute force simples)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// -------------------- Routes --------------------
app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/auth', loginLimiter, authRouter);
app.use('/admin', adminRouter);
app.use('/products', productsRouter);

// -------------------- Error handler --------------------
app.use((err, req, res, next) => {
  console.error(err);
  // CORS errors & others
  res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
