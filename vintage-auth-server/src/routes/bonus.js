const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { q, tx } = require("../services/db");

const router = express.Router();

// Simple wheel prizes (you can tune)
const PRIZES = [
  { type: "cashback", value: 5 },   // €5 off
  { type: "cashback", value: 10 },  // €10 off
  { type: "percent", value: 5 },    // 5% off
  { type: "percent", value: 10 },   // 10% off
  { type: "shipping", value: 9 },   // free shipping up to €9
  { type: "none", value: 0 }
];

function pickPrize(){
  // Weighted: make "none" more common
  const bag = [
    PRIZES[0], PRIZES[0],
    PRIZES[1],
    PRIZES[2], PRIZES[2],
    PRIZES[3],
    PRIZES[4],
    PRIZES[5], PRIZES[5], PRIZES[5]
  ];
  return bag[Math.floor(Math.random() * bag.length)];
}

router.post("/spin", requireAuth, async (req, res, next) => {
  try{
    const prize = pickPrize();

    if(prize.type === "none"){
      return res.json({ ok: true, prize });
    }

    const out = await tx(async (conn) => {
      const [r] = await conn.execute(
        "INSERT INTO bonuses (user_id, type, value, used, created_at) VALUES (?,?,?,?,NOW())",
        [req.user.id, prize.type, prize.value, 0]
      );
      return { id: r.insertId, ...prize };
    });

    res.json({ ok: true, prize: out });
  }catch(e){ next(e); }
});

router.get("/balance", requireAuth, async (req, res, next) => {
  try{
    const rows = await q("SELECT id, type, value, used, created_at FROM bonuses WHERE user_id=? ORDER BY id DESC", [req.user.id]);
    const available = rows.filter(r => !r.used);
    res.json({ bonuses: rows, available });
  }catch(e){ next(e); }
});

// Optional: mark a bonus as used
router.post("/apply", requireAuth, async (req, res, next) => {
  try{
    const { bonusId } = req.body || {};
    const id = Number(bonusId);
    if(!id) return res.status(400).json({ error: "Missing bonusId" });

    await q("UPDATE bonuses SET used=1 WHERE id=? AND user_id=? AND used=0", [id, req.user.id]);
    res.json({ ok: true });
  }catch(e){ next(e); }
});

module.exports = router;
