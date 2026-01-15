const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { q, tx } = require("../services/db");

const router = express.Router();

async function getOrCreateCartId(conn, userId){
  const [rows] = await conn.execute("SELECT id FROM carts WHERE user_id=? LIMIT 1", [userId]);
  if(rows.length) return rows[0].id;

  const [r] = await conn.execute("INSERT INTO carts (user_id, updated_at) VALUES (?, NOW())", [userId]);
  return r.insertId;
}

router.get("/", requireAuth, async (req, res, next) => {
  try{
    const cart = await q("SELECT id, updated_at FROM carts WHERE user_id=? LIMIT 1", [req.user.id]);
    if(!cart.length) return res.json({ items: [], updated_at: null });

    const items = await q("SELECT id, product_id, title, price, qty, image_url FROM cart_items WHERE cart_id=? ORDER BY id DESC",
      [cart[0].id]
    );
    res.json({ cart_id: cart[0].id, updated_at: cart[0].updated_at, items });
  }catch(e){ next(e); }
});

// Sync from localStorage (items: [{product_id,title,price,qty,image_url}])
router.post("/sync", requireAuth, async (req, res, next) => {
  try{
    const { items } = req.body || {};
    const list = Array.isArray(items) ? items : [];

    const out = await tx(async (conn) => {
      const cartId = await getOrCreateCartId(conn, req.user.id);

      // Upsert by product_id (string)
      for(const it of list){
        const productId = String(it.product_id || it.id || it.sku || "");
        if(!productId) continue;
        const title = String(it.title || it.name || "");
        const price = Number(it.price || 0);
        const qty = Math.max(1, Number(it.qty || it.quantity || 1));
        const imageUrl = it.image_url || it.image || null;

        const [rows] = await conn.execute("SELECT id, qty FROM cart_items WHERE cart_id=? AND product_id=? LIMIT 1",
          [cartId, productId]
        );
        if(rows.length){
          const newQty = qty; // overwrite
          await conn.execute("UPDATE cart_items SET title=?, price=?, qty=?, image_url=? WHERE id=?",
            [title, price, newQty, imageUrl, rows[0].id]
          );
        } else {
          await conn.execute("INSERT INTO cart_items (cart_id, product_id, title, price, qty, image_url) VALUES (?,?,?,?,?,?)",
            [cartId, productId, title, price, qty, imageUrl]
          );
        }
      }

      await conn.execute("UPDATE carts SET updated_at=NOW() WHERE id=?", [cartId]);
      const [items2] = await conn.execute("SELECT id, product_id, title, price, qty, image_url FROM cart_items WHERE cart_id=? ORDER BY id DESC", [cartId]);
      return items2;
    });

    res.json({ ok: true, items: out });
  }catch(e){ next(e); }
});

// Add or update an item
router.post("/items", requireAuth, async (req, res, next) => {
  try{
    const it = req.body || {};
    const productId = String(it.product_id || it.id || it.sku || "");
    if(!productId) return res.status(400).json({ error: "Missing product_id" });

    const title = String(it.title || it.name || "");
    const price = Number(it.price || 0);
    const qty = Math.max(1, Number(it.qty || it.quantity || 1));
    const imageUrl = it.image_url || it.image || null;

    const out = await tx(async (conn) => {
      const cartId = await getOrCreateCartId(conn, req.user.id);

      const [rows] = await conn.execute("SELECT id FROM cart_items WHERE cart_id=? AND product_id=? LIMIT 1", [cartId, productId]);
      if(rows.length){
        await conn.execute("UPDATE cart_items SET title=?, price=?, qty=?, image_url=? WHERE id=?",
          [title, price, qty, imageUrl, rows[0].id]
        );
      } else {
        await conn.execute("INSERT INTO cart_items (cart_id, product_id, title, price, qty, image_url) VALUES (?,?,?,?,?,?)",
          [cartId, productId, title, price, qty, imageUrl]
        );
      }
      await conn.execute("UPDATE carts SET updated_at=NOW() WHERE id=?", [cartId]);

      const [items2] = await conn.execute("SELECT id, product_id, title, price, qty, image_url FROM cart_items WHERE cart_id=? ORDER BY id DESC", [cartId]);
      return items2;
    });

    res.json({ ok: true, items: out });
  }catch(e){ next(e); }
});

router.delete("/items/:id", requireAuth, async (req, res, next) => {
  try{
    const id = Number(req.params.id);
    if(!id) return res.status(400).json({ error: "Bad id" });

    await tx(async (conn) => {
      const [cartRows] = await conn.execute("SELECT id FROM carts WHERE user_id=? LIMIT 1", [req.user.id]);
      if(!cartRows.length) return;

      await conn.execute("DELETE FROM cart_items WHERE id=? AND cart_id=?", [id, cartRows[0].id]);
      await conn.execute("UPDATE carts SET updated_at=NOW() WHERE id=?", [cartRows[0].id]);
    });

    res.json({ ok: true });
  }catch(e){ next(e); }
});

module.exports = router;
