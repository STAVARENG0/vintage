import jwt from 'jsonwebtoken';
import { pool } from '../db/pool.js';
import { getEnv } from '../utils/env.js';

const JWT_SECRET = getEnv('JWT_SECRET');

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers['authorization'] || '';
    const match = String(header).match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return res.status(401).json({ error: 'missing_token' });
    }

    let payload;
    try {
      payload = jwt.verify(match[1], JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'invalid_token' });
    }

    const userId = payload?.sub;
    if (!userId) return res.status(401).json({ error: 'invalid_token' });

    const [rows] = await pool.query(
      'SELECT id, name, email, phone, is_verified, created_at, updated_at FROM users WHERE id = :id LIMIT 1',
      { id: userId }
    );
    const user = rows?.[0];
    if (!user) return res.status(401).json({ error: 'user_not_found' });

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

export function issueJwt(user, { expiresIn } = {}) {
  const secret = JWT_SECRET;
  const jwtExpiresIn = expiresIn || (process.env.JWT_EXPIRES_IN || '7d');
  return jwt.sign(
    {
      sub: String(user.id),
      name: user.name,
      email: user.email || null,
      phone: user.phone || null
    },
    secret,
    { expiresIn: jwtExpiresIn }
  );
}
