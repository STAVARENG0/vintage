const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { q, tx } = require("../services/db");

const router = express.Router();

// 🎁 Prêmios da roleta
const PRIZES = [
  { type: "cashback", value: 5 },   // €5 de desconto
  { type: "cashback", value: 10 },  // €10 de desconto
  { type: "percent", value: 5 },    // 5% OFF
  { type: "percent", value: 10 },   // 10% OFF
  { type: "shipping", value: 9 },   // frete grátis até €9
  { type: "points", value: 50 },    // pontos (acumulativo)
  { type: "none", value: 0 }
];

function pickPrize() {
  const bag = [
    PRIZES[0], PRIZES[0],
    PRIZES[1],
    PRIZES[2], PRIZES[2],
    PRIZES[3],
    PRIZES[4],
    PRIZES[5], PRIZES[5],
    PRIZES[6], PRIZES[6]
  ];
  return bag[Math.floor(Math.random() * bag.length)];
}

// 🎡 GIRAR ROLETA
router.post("/spin", requireAuth, async (req, res, next) => {
  try {
    const prize = pickPrize();

    if (prize.type === "none") {
      return res.json({ ok: true, prize });
    }

    // ⏰ expiração: SOMENTE desconto e frete
    let expiresAt = null;
    if (
      prize.type === "shipping" ||
      prize.type === "percent" ||
      prize.type === "cashback"
    ) {
      expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    }

    const out = await tx(async (conn) => {
      const [r] = await conn.execute(
        `
        INSERT INTO bonuses
          (user_id, type, value, used, created_at, expires_at)
        VALUES
          (?,?,?,?,NOW(),?)
        `,
        [req.user.id, prize.type, prize.value, 0, expiresAt]
      );

      return {
        id: r.insertId,
        ...prize,
        expires_at: expiresAt
      };
    });

    res.json({ ok: true, prize: out });
  } catch (e) {
    next(e);
  }
});

// 🟡 TOTAL DE POINTS DISPONÍVEIS (USADO PELO CARRINHO)
router.get("/points", requireAuth, async (req, res, next) => {
  try {
    const rows = await q(
      `
      SELECT SUM(value) AS total
      FROM bonuses
      WHERE user_id = ?
        AND type = 'points'
        AND used = 0
      `,
      [req.user.id]
    );

    res.json({ points: Number(rows[0].total || 0) });
  } catch (e) {
    next(e);
  }
});

// 💰 LISTAR BÔNUS DO USUÁRIO
router.get("/balance", requireAuth, async (req, res, next) => {
  try {
    const rows = await q(
      `
      SELECT id, type, value, used, created_at, expires_at
      FROM bonuses
      WHERE user_id=?
      ORDER BY id DESC
      `,
      [req.user.id]
    );

    const available = rows.filter((r) => {
      if (r.type === "points") return !r.used;
      if (r.used) return false;
      if (!r.expires_at) return false;
      return new Date(r.expires_at) > new Date();
    });

    res.json({ bonuses: rows, available });
  } catch (e) {
    next(e);
  }
});

// ✅ MARCAR BÔNUS COMO USADO
router.post("/apply", requireAuth, async (req, res, next) => {
  try {
    const { bonusId } = req.body || {};
    const id = Number(bonusId);

    if (!id) {
      return res.status(400).json({ error: "Missing bonusId" });
    }

    await q(
      `
      UPDATE bonuses
      SET used=1
      WHERE id=? AND user_id=? AND used=0
      `,
      [id, req.user.id]
    );

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// 🧾 STATUS DE RECOMPENSAS (desconto / frete)
router.get("/status", requireAuth, async (req, res, next) => {
  try {
    const rows = await q(
      `
      SELECT id, type, value, used, expires_at
      FROM bonuses
      WHERE user_id=?
      `,
      [req.user.id]
    );

    const now = new Date();

    const activeDiscount = rows.find(
      r =>
        !r.used &&
        (r.type === "percent" || r.type === "cashback") &&
        r.expires_at &&
        new Date(r.expires_at) > now
    );

    const activeShipping = rows.find(
      r =>
        !r.used &&
        r.type === "shipping" &&
        r.expires_at &&
        new Date(r.expires_at) > now
    );

    res.json({
      hasReward: !!(activeDiscount || activeShipping),
      discount: activeDiscount || null,
      shipping: activeShipping || null
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
