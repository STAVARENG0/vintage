import bcrypt from 'bcryptjs';
import { pool } from '../db/pool.js';

export async function findUserByEmail(email) {
  const [rows] = await pool.query(
    'SELECT * FROM users WHERE email = :email LIMIT 1',
    { email }
  );
  return rows[0] || null;
}

export async function findUserByPhone(phone) {
  const [rows] = await pool.query(
    'SELECT * FROM users WHERE phone = :phone LIMIT 1',
    { phone }
  );
  return rows[0] || null;
}

export async function findUserByGoogleSub(google_sub) {
  const [rows] = await pool.query(
    'SELECT * FROM users WHERE google_sub = :google_sub LIMIT 1',
    { google_sub }
  );
  return rows[0] || null;
}

export async function createUser({ name, email = null, phone = null, password = null, google_sub = null, is_verified = 0 }) {
  const password_hash = password ? await bcrypt.hash(password, 10) : null;
  const [r] = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, google_sub, is_verified)
     VALUES (:name, :email, :phone, :password_hash, :google_sub, :is_verified)`,
    { name, email, phone, password_hash, google_sub, is_verified }
  );
  const id = r.insertId;
  const [rows] = await pool.query('SELECT * FROM users WHERE id = :id LIMIT 1', { id });
  return rows[0];
}

export async function setVerified(userId, verified = true) {
  await pool.query('UPDATE users SET is_verified = :v WHERE id = :id', { id: userId, v: verified ? 1 : 0 });
}

export async function verifyPassword(user, password) {
  if (!user?.password_hash) return false;
  return bcrypt.compare(password, user.password_hash);
}

export function sanitizeUser(user) {
  if (!user) return null;
  const { password_hash, ...rest } = user;
  return rest;
}
