require("dotenv").config();
const bcrypt = require("bcryptjs");
const { q, tx } = require("../services/db");

(async () => {
  const email = "demo@vintage.test";
  const pass = "Demo1234";
  const hash = await bcrypt.hash(pass, 10);

  await tx(async (conn) => {
    const [rows] = await conn.execute("SELECT id FROM users WHERE email=?", [email]);
    if(rows.length){
      console.log("Demo user already exists:", email);
      return;
    }
    const [r] = await conn.execute(
      "INSERT INTO users (name, email, phone, password_hash, is_verified, created_at) VALUES (?,?,?,?,1,NOW())",
      ["Demo User", email, null, hash]
    );
    const userId = r.insertId;
    await conn.execute("INSERT INTO user_settings (user_id, settings_json, updated_at) VALUES (?,?,NOW())", [userId, JSON.stringify({})]);
    await conn.execute("INSERT INTO carts (user_id, updated_at) VALUES (?,NOW())", [userId]);
    console.log("✅ Demo user created:", email, "password:", pass);
  });
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
