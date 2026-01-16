require('dotenv').config();
const db = require('../config/db');

async function run() {
  try {
    await db.query(`
      ALTER TABLE bonuses
      ADD COLUMN expires_at DATETIME NULL;
    `);

    console.log('✅ Coluna expires_at criada com sucesso');
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  }
}

run();
