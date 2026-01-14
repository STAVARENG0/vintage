const { verifyJwt } = require("../services/jwt");
const { q } = require("../services/db");

async function requireAuth(req, res, next){
  try{
    const hdr = req.headers.authorization || "";
    const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
    if(!token) return res.status(401).json({ error: "Missing token" });

    const decoded = verifyJwt(token);
    const userId = decoded && decoded.sub;
    if(!userId) return res.status(401).json({ error: "Invalid token" });

    const rows = await q("SELECT id, name, email, phone, avatar_url, is_verified, created_at FROM users WHERE id=?", [userId]);
    if(rows.length === 0) return res.status(401).json({ error: "User not found" });

    req.user = rows[0];
    next();
  }catch(e){
    return res.status(401).json({ error: "Unauthorized", message: e.message });
  }
}

module.exports = { requireAuth };
