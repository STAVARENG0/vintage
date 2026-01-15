const jwt = require("jsonwebtoken");
const { q } = require("../services/db");

function extractToken(req) {
  const h =
    req.headers["authorization"] ||
    req.headers["Authorization"] ||
    "";

  if (h && h.startsWith("Bearer ")) {
    return h.slice(7).trim();
  }

  if (req.cookies && req.cookies.token) {
    return req.cookies.token;
  }

  if (req.query && req.query.token) {
    return req.query.token;
  }

  return null;
}

async function loadUser(userId) {
  const rows = await q("SELECT * FROM users WHERE id = ?", [userId]);
  return rows[0] || null;
}

async function requireAuth(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ error: "Missing token" });
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      console.error("JWT verify error:", err.message);
      return res.status(401).json({ error: "Invalid token" });
    }

    // ✅ AQUI ESTÁ A CORREÇÃO
    const userId =
      payload.sub ||
      payload.userId ||
      payload.id;

    if (!userId) {
      return res.status(401).json({ error: "Invalid token payload" });
    }

    const user = await loadUser(userId);
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("AUTH middleware error:", err);
    return res.status(401).json({ error: "Unauthorized" });
  }
}

module.exports = { requireAuth };
