const mysql = require("mysql2/promise");

let pool;

function getPool() {
  if (pool) return pool;

  const {
    MYSQL_HOST,
    MYSQL_PORT,
    MYSQL_USER,
    MYSQL_PASSWORD,
    MYSQL_DATABASE,
  } = process.env;

  if (!MYSQL_HOST || !MYSQL_USER || !MYSQL_DATABASE) {
    throw new Error(
      "Missing MySQL env vars. Set MYSQL_HOST, MYSQL_USER, MYSQL_DATABASE (and password/port)."
    );
  }

  pool = mysql.createPool({
    host: MYSQL_HOST,
    port: Number(MYSQL_PORT || 3306),
    user: MYSQL_USER,
    password: MYSQL_PASSWORD || "",
    database: MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: "Z",
  });

  return pool;
}

async function ensureDbReady() {
  const p = getPool();
  const conn = await p.getConnection();

  try {
    // 1️⃣ Testa conexão
    await conn.ping();

    // 2️⃣ Migration segura (roda só uma vez)
    try {
      await conn.query(`
        ALTER TABLE bonuses
        ADD COLUMN expires_at DATETIME NULL;
      `);
      console.log("✅ DB migration: expires_at criada");
    } catch (err) {
      if (
        err.message.includes("Duplicate") ||
        err.message.includes("exists")
      ) {
        console.log("ℹ️ DB migration: expires_at já existe");
      } else {
        console.error("❌ DB migration error:", err.message);
      }
    }
  } finally {
    conn.release();
  }
}

async function q(sql, params) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

async function tx(fn) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const out = await fn(conn);
    await conn.commit();
    return out;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = { getPool, ensureDbReady, q, tx };
