const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const { requireAuth } = require("../middleware/auth");
const { q, tx } = require("../services/db");
const { ensureUploadDir, publicUrlFor } = require("../services/uploads");

const router = express.Router();

router.get("/me", requireAuth, async (req, res) => {
  res.json({
    id: req.user.id,
    name: req.user.name,
    email: req.user.email,
    phone: req.user.phone,
    avatar_url: req.user.avatar_url,
    is_verified: !!req.user.is_verified,
    created_at: req.user.created_at
  });
});

// Settings (JSON)
router.get("/settings", requireAuth, async (req, res, next) => {
  try{
    const rows = await q("SELECT settings_json FROM user_settings WHERE user_id=?", [req.user.id]);
    const settings = rows.length ? JSON.parse(rows[0].settings_json || "{}") : {};
    res.json(settings);
  }catch(e){ next(e); }
});

router.put("/settings", requireAuth, async (req, res, next) => {
  try{
    const settings = req.body || {};
    await tx(async (conn) => {
      const [rows] = await conn.execute("SELECT user_id FROM user_settings WHERE user_id=?", [req.user.id]);
      if(rows.length){
        await conn.execute("UPDATE user_settings SET settings_json=?, updated_at=NOW() WHERE user_id=?",
          [JSON.stringify(settings), req.user.id]
        );
      } else {
        await conn.execute("INSERT INTO user_settings (user_id, settings_json, updated_at) VALUES (?,?,NOW())",
          [req.user.id, JSON.stringify(settings)]
        );
      }
    });
    res.json({ ok: true });
  }catch(e){ next(e); }
});

// Avatar upload
const uploadRoot = ensureUploadDir();
const avatarDir = path.join(uploadRoot, "avatars");
if(!fs.existsSync(avatarDir)) fs.mkdirSync(avatarDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, avatarDir),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || "").toLowerCase() || ".jpg";
    cb(null, `u${req.user.id}_${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
  fileFilter: (req, file, cb) => {
    const ok = /image\/(png|jpe?g|webp|gif)/.test(file.mimetype);
    cb(ok ? null : new Error("Only image files allowed"), ok);
  }
});

router.post("/avatar", requireAuth, upload.single("avatar"), async (req, res, next) => {
  try{
    if(!req.file) return res.status(400).json({ error: "Missing file" });

    // public URL
    const rel = `${process.env.UPLOAD_DIR || "uploads"}/avatars/${req.file.filename}`;
    const url = publicUrlFor(rel);

    await q("UPDATE users SET avatar_url=? WHERE id=?", [url, req.user.id]);

    res.json({ ok: true, avatar_url: url });
  }catch(e){ next(e); }
});
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const auth = require("../middleware/auth");

// pasta de upload
const uploadDir = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// config do multer
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `avatar_${Date.now()}${ext}`);
  },
});

const upload = multer({ storage });

// ===== ROTA DE UPLOAD DE FOTO =====
router.post(
  "/me/avatar",
  auth,
  upload.single("avatar"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file sent" });
      }

      const avatarUrl = `${process.env.PUBLIC_BASE_URL}/uploads/${req.file.filename}`;

      await req.db.query(
        "UPDATE users SET avatar_url = ? WHERE id = ?",
        [avatarUrl, req.user.id]
      );

      res.json({ ok: true, avatar_url: avatarUrl });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Upload failed" });
    }
  }
);

module.exports = router;
