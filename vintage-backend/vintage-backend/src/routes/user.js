const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const { requireAuth } = require("../middleware/auth");
const { q } = require("../services/db");
const { ensureUploadDir, publicUrlFor } = require("../services/uploads");

const router = express.Router();

/* ===========================
   ME
=========================== */
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

/* ===========================
   PROFILE (name / email / phone)
=========================== */
router.post("/me/profile", requireAuth, async (req, res) => {
  try {
    const { name, email, phone } = req.body;

    await q(
      "UPDATE users SET name=?, email=?, phone=? WHERE id=?",
      [name, email, phone, req.user.id]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save profile" });
  }
});

/* ===========================
   ADDRESS (settings JSON)
=========================== */
router.post("/me/address", requireAuth, async (req, res) => {
  try {
    const settings = { address: req.body };

    await q(
      `
      INSERT INTO user_settings (user_id, settings_json, updated_at)
      VALUES (?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        settings_json = VALUES(settings_json),
        updated_at = NOW()
      `,
      [req.user.id, JSON.stringify(settings)]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save address" });
  }
});

/* ===========================
   AVATAR UPLOAD
=========================== */
const uploadRoot = ensureUploadDir();
const avatarDir = path.join(uploadRoot, "avatars");
if (!fs.existsSync(avatarDir)) {
  fs.mkdirSync(avatarDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, avatarDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `u${req.user.id}_${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const ok = /image\/(png|jpe?g|webp|gif)/.test(file.mimetype);
    cb(ok ? null : new Error("Only images allowed"), ok);
  }
});

router.post(
  "/me/avatar",
  requireAuth,
  upload.single("avatar"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file sent" });
      }

      const rel = `${process.env.UPLOAD_DIR || "uploads"}/avatars/${req.file.filename}`;
      const url = publicUrlFor(rel);

      await q(
        "UPDATE users SET avatar_url=? WHERE id=?",
        [url, req.user.id]
      );

      res.json({ ok: true, avatar_url: url });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Upload failed" });
    }
  }
);

module.exports = router;
