const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { q, tx } = require("../services/db");

const router = express.Router();

// Shipping default (matches your checkout UI: €9)
const SHIPPING_DEFAULT = 9;

function round2(n){ return Math.round((n + Number.EPSILON) * 100) / 100; }

async function getCartWithItems(userId){
  const cart = await q("SELECT id FROM carts WHERE user_id=? LIMIT 1", [userId]);
  if(!cart.length) return { cartId: null, items: [] };
  const items = await q("SELECT id, product_id, title, price, qty, image_url FROM cart_items WHERE cart_id=?", [cart[0].id]);
  return { cartId: cart[0].id, items };
}

async function getBestBonus(userId, subtotal){
  // Pick the best available bonus for the current subtotal
  const bonuses = await q("SELECT id, type, value FROM bonuses WHERE user_id=? AND used=0 ORDER BY id DESC", [userId]);
  if(!bonuses.length) return null;

  let best = null;
  for(const b of bonuses){
    let discount = 0;
    if(b.type === "cashback"){
      discount = Math.min(Number(b.value || 0), subtotal);
    } else if(b.type === "percent"){
      discount = subtotal * (Number(b.value || 0)/100);
    } else if(b.type === "shipping"){
      // handled separately
      discount = 0;
    }
    if(!best || discount > best.discount){
      best = { ...b, discount };
    }
  }
  return best;
}

// GET /checkout/summary?fulfilment=delivery|pickup
router.get("/summary", requireAuth, async (req, res, next) => {
  try{
    const fulfilment = (req.query.fulfilment || "delivery").toString();
    const shippingBase = fulfilment === "pickup" ? 0 : SHIPPING_DEFAULT;

    const { items } = await getCartWithItems(req.user.id);

    const subtotal = round2(items.reduce((s, it) => s + Number(it.price || 0) * Number(it.qty || 1), 0));

    const best = await getBestBonus(req.user.id, subtotal);

    let shipping = shippingBase;
    let discount = 0;
    let appliedBonus = null;

    if(best){
      if(best.type === "shipping"){
        shipping = 0; // free shipping up to default
        appliedBonus = { id: best.id, type: best.type, value: best.value };
      } else {
        discount = round2(best.discount);
        appliedBonus = { id: best.id, type: best.type, value: best.value, discount };
      }
    }

    const total = round2(Math.max(0, subtotal - discount) + shipping);

    res.json({
      items,
      subtotal,
      shipping,
      discount,
      total,
      appliedBonus
    });
  }catch(e){ next(e); }
});

// Optional: "finalize" purchase — marks applied bonus as used
router.post("/finalize", requireAuth, async (req, res, next) => {
  try{
    const { appliedBonusId } = req.body || {};
    const id = Number(appliedBonusId);

    await tx(async (conn) => {
      if(id){
        await conn.execute("UPDATE bonuses SET used=1 WHERE id=? AND user_id=? AND used=0", [id, req.user.id]);
      }
    });

    res.json({ ok: true });
  }catch(e){ next(e); }
});

module.exports = router;
