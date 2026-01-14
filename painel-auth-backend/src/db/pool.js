import mysql from 'mysql2/promise';
import { getEnv, getEnvInt } from '../utils/env.js';

export const pool = mysql.createPool({
  host: getEnv('MYSQL_HOST'),
  port: getEnvInt('MYSQL_PORT', { defaultValue: 3306, required: false }),
  user: getEnv('MYSQL_USER'),
  password: getEnv('MYSQL_PASSWORD', { required: false, defaultValue: '' }),
  database: getEnv('MYSQL_DATABASE'),
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
  timezone: 'Z'
});

export async function pingDb() {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
  } finally {
    conn.release();
  }
}
