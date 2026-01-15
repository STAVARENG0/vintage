const mysql = require("mysql2/promise");
const { cfg } = require("./config");

/**
 * Cria pool a partir de DATABASE_URL (se existir)
 */
function poolFromUrl(urlStr) {
  const u = new URL(urlStr);
  const user = decodeURIComponent(u.username || "");
  const pass = decodeURIComponent(u.password || "");
  const host = u.hostname;
  const port = u.port ? Number(u.port) : 3306;
  const database = u.pathname?.replace(/^\//, "");

  return mysql.createPool({
    host,
    user,
    password: pass,
    port,
    database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: "Z",
    dateStrings: true,
  });
}

/**
 * Cria pool a partir de variáveis de ambiente
 * Aceita MYSQL_* ou DB_*
 */
function poolFromParts() {
  const host =
    process.env.MYSQL_HOST ||
    process.env.DB_HOST ||
    cfg.dbHost;

  const user =
    process.env.MYSQL_USER ||
    process.env.DB_USER ||
    cfg.dbUser;

  const password =
    process.env.MYSQL_PASSWORD ||
    process.env.DB_PASSWORD ||
    cfg.dbPassword;

  const database =
    process.env.MYSQL_DATABASE ||
    process.env.DB_NAME ||
    cfg.dbName;

  const port =
    process.env.MYSQL_PORT ||
    process.env.DB_PORT ||
    cfg.dbPort ||
    3306;

  if (!host || !user || !database) {
    throw new Error(
      "Missing MySQL env vars. Set MYSQL_* or DB_* variables."
    );
  }

  return mysql.createPool({
    host,
    user,
    password,
    port,
    database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: "Z",
    dateStrings: true,
  });
}

/**
 * Escolhe DATABASE_URL se existir, senão usa variáveis separadas
 */
const pool = cfg.databaseUrl
  ? poolFromUrl(cfg.databaseUrl)
  : poolFromParts();

/**
 * Teste de conexão
 */
async function ping() {
  const c = await pool.getConnection();
  try {
    await c.ping();
  } finally {
    c.release();
  }
}

module.exports = { pool, ping };
