require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { getPool } = require("../services/db");

(async () => {
  const sqlPath = path.join(process.cwd(), "sql", "schema.sql");
  const sql = fs.readFileSync(sqlPath, "utf-8");

  const pool = getPool();
  const conn = await pool.getConnection();
  try{
    console.log("Running migrations...");
    // Split by ; but keep simple – schema is idempotent
    const statements = sql
      .split(/;\s*\n/)
      .map(s => s.trim())
      .filter(Boolean);

    for(const st of statements){
      await conn.query(st);
    }
    console.log("✅ Done.");
  }finally{
    conn.release();
    await pool.end();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
