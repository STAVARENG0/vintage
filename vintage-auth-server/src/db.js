const mysql = require("mysql2/promise");
const { cfg } = require("./config");

function poolFromUrl(urlStr){
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

function poolFromParts(){
  return mysql.createPool({
    host: cfg.dbHost,
    user: cfg.dbUser,
    password: cfg.dbPassword,
    port: cfg.dbPort,
    database: cfg.dbName,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: "Z",
    dateStrings: true,
  });
}

const pool = cfg.databaseUrl ? poolFromUrl(cfg.databaseUrl) : poolFromParts();

async function ping(){
  const c = await pool.getConnection();
  try{
    await c.ping();
  } finally {
    c.release();
  }
}

module.exports = { pool, ping };
