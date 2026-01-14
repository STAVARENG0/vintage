import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import { pingDb } from './db/pool.js';
import { getCorsOrigins, getEnvInt } from './utils/env.js';

import authRoutes from './routes/auth.js';
import meRoutes from './routes/me.js';

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit: '200kb' }));

const origins = getCorsOrigins();
app.use(cors({
  origin: function (origin, callback) {
    // permite chamadas server-to-server ou curl sem origin
    if (!origin) return callback(null, true);
    if (origins.length === 0) return callback(null, true);
    if (origins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS']
}));

app.get('/health', async (req, res) => {
  try {
    await pingDb();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'db' });
  }
});

app.use('/auth', authRoutes);
app.use('/me', meRoutes);

// 404
app.use((req, res) => res.status(404).json({ error: 'not_found' }));

// error handler
app.use((err, req, res, next) => {
  if (err?.name === 'ZodError') {
    return res.status(400).json({ error: 'validation_error', details: err.issues });
  }
  if (String(err?.message || '').includes('Not allowed by CORS')) {
    return res.status(403).json({ error: 'cors_blocked' });
  }
  console.error(err);
  res.status(500).json({ error: 'server_error' });
});

const port = getEnvInt('PORT', { required: false, defaultValue: 3000 });
app.listen(port, () => {
  console.log(`painel-auth-backend listening on :${port}`);
});
