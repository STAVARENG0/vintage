// vintage-auth-server/src/routes/user.js
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const { requireAuth } = require("../middleware/auth"); // <- confere se esse caminho existe
const { q, tx } = require("../services/db");           // <- confere se esse caminho existe

const router = express.Router();

/**
 * GET /user/me
 * Dados básicos do usuário logado (usados no painel)
 */
router.get("/me", requireAuth, async (req, res) => {
  res.json({
    id: req.user.id,
    name: req.user.name,
    email: req.user.email,
    phone: req.user.phone,
    avatar_url: req.user.avatar_url,
    is_verified: !!req.user.is_verified,
    created_at: req.user.created_at,
  });
});

/**
 * GET /user/settings
 * Lê o JSON de configurações (address, etc.)
 */
router.get("/settings", requireAuth, async (req, res, next) => {
  try {
    const rows = await q(
      "SELECT settings_json FROM user_settings WHERE user_id = ?",
      [req.user.id]
    );
    const settings = rows.length
      ? JSON.parse(rows[0].settings_json || "{}")
      : {};
    res.json(settings);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /user/settings
 * Salva o JSON inteiro (opcional)
 */
router.put("/settings", requireAuth, async (req, res, next) => {
  try {
    const settings = req.body || {};

    await tx(async (conn) => {
      const [rows] = await conn.execute(
        "SELECT user_id FROM user_settings WHERE user_id = ?",
        [req.user.id]
      );

      if (rows.length) {
        await conn.execute(
          "UPDATE user_settings SET settings_json = ?, updated_at = NOW() WHERE user_id = ?",
          [JSON.stringify(settings), req.user.id]
        );
      } else {
        await conn.execute(
          "INSERT INTO user_settings (user_id, settings_json, updated_at) VALUES (?,?,NOW())",
          [req.user.id, JSON.stringify(settings)]
        );
      }
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /user/me/profile
 * Atualiza nome / email / telefone
 */
router.post("/me/profile", requireAuth, async (req, res, next) => {
  try {
    const { name, email, phone } = req.body || {};

    await q(
      "UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?",
      [name || null, email || null, phone || null, req.user.id]
    );

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /user/me/address
 * Atualiza o endereço dentro de user_settings.settings_json.address
 */
router.post("/me/address", requireAuth, async (req, res, next) => {
  try {
    const address = {
      eircode: (req.body && req.body.eircode) || "",
      county: (req.body && req.body.county) || "",
      city: (req.body && req.body.city) || "",
      street: (req.body && req.body.street) || "",
      country: (req.body && req.body.country) || "Ireland",
    };

    await tx(async (conn) => {
      const [rows] = await conn.execute(
        "SELECT settings_json FROM user_settings WHERE user_id = ?",
        [req.user.id]
      );

      let settings = {};
      if (rows.length && rows[0].settings_json) {
        try {
          settings = JSON.parse(rows[0].settings_json);
        } catch (_) {
          settings = {};
        }
      }

      settings.address = address;
      const json = JSON.stringify(settings);

      if (rows.length) {
        await conn.execute(
          "UPDATE user_settings SET settings_json = ?, updated_at = NOW() WHERE user_id = ?",
          [json, req.user.id]
        );
      } else {
        await conn.execute(
          "INSERT INTO user_settings (user_id, settings_json, updated_at) VALUES (?,?,NOW())",
          [req.user.id, json]
        );
      }
    });

    res.json({ ok: true, address });
  } catch (err) {
    next(err);
  }
});

/**
 * UPLOAD de avatar
 * POST /user/me/avatar
 */

// garante pasta uploads/avatars
const uploadsRoot = process.env.UPLOAD_DIR || "uploads";
const avatarsDir = path.join(process.cwd(), uploadsRoot, "avatars");
if (!fs.existsSync(avatarsDir)) {
  fs.mkdirSync(avatarsDir, { recursive: true });
}

// configuração do multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, avatarsDir),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || ".jpg").toLowerCase();
    cb(null, `u${req.user.id}_${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
  fileFilter: (req, file, cb) => {
    const ok = /image\/(png|jpe?g|webp|gif)/.test(file.mimetype);
    cb(ok ? null : new Error("Only image files allowed"), ok);
  },
});

router.post(
  "/me/avatar",
  requireAuth,
  upload.single("avatar"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file sent" });
      }

      // URL pública via /uploads (configure no src/index.js)
      const avatarUrl = `${
        process.env.PUBLIC_BASE_URL || ""
      }/uploads/avatars/${req.file.filename}`;

      await q("UPDATE users SET avatar_url = ? WHERE id = ?", [
        avatarUrl,
        req.user.id,
      ]);

      res.json({ ok: true, avatar_url: avatarUrl });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
