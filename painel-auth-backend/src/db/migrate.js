import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  const schemaPath = path.resolve(__dirname, '../../sql/schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  // mysql2 não executa múltiplas statements por padrão. Vamos dividir por ';\n' com cuidado.
  const statements = sql
    .split(/;\s*\n/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  const conn = await pool.getConnection();
  try {
    for (const stmt of statements) {
      await conn.query(stmt);
    }
    console.log('Migration OK');
  } finally {
    conn.release();
    await pool.end();
  }
}

run().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
