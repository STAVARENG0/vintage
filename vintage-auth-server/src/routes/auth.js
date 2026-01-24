const express = require("express");
const passport = require("passport");
const bcrypt = require("bcryptjs");
const { z } = require("zod");
const { pool } = require("../db");
const { cfg } = require("../config");
const { looksLikeEmail, normalizeEmail, normalizePhone } = require("../utils/normalize");
const { genCode, genSalt, hashCode } = require("../utils/otp");
const { sendOtpEmail } = require("../utils/sendEmail");
const { sendOtpSms } = require("../utils/sendSms");
const { signToken } = require("../utils/jwt");

const router = express.Router();

const pwSchema = z
  .string()
  .min(8)
  .max(72)
  .refine((v) => !/\s/.test(v), "Password cannot contain spaces.")
  .refine((v) => /[a-z]/.test(v), "Add at least 1 lowercase letter.")
  .refine((v) => /[A-Z]/.test(v), "Add at least 1 UPPERCASE letter.")
  .refine((v) => /\d/.test(v), "Add at least 1 number.");

function nowPlusMinutes(m) {
  return new Date(Date.now() + m * 60 * 1000);
}

function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  const s = String(v);
  // "YYYY-MM-DD HH:MM:SS" -> "YYYY-MM-DDTHH:MM:SS"
  const iso = s.includes("T") ? s : s.replace(" ", "T");
  const d = new Date(iso);
  if (!Number.isNaN(d.getTime())) return d;
  // fallback
  const d2 = new Date(iso + "Z");
  return Number.isNaN(d2.getTime()) ? null : d2;
}

function setAuthCookie(res, token) {
  res.cookie("vw_token", token, {
    httpOnly: true,
    secure: true,
    sameSite: "None",
    path: "/",
    domain: ".vintage-clothes.ie",
  });
}





async function upsertOtp({ purpose, channel, contact, code, payload }) {
  const salt = genSalt();
  const codeHash = hashCode(String(code), salt);
  const expiresAt = nowPlusMinutes(cfg.otpTtlMinutes);

  const payloadVal = payload ? JSON.stringify(payload) : null;

  await pool.execute(
    `INSERT INTO auth_otps (purpose, channel, contact, code_salt, code_hash, payload_json, attempts, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)
     ON DUPLICATE KEY UPDATE
       channel=VALUES(channel),
       code_salt=VALUES(code_salt),
       code_hash=VALUES(code_hash),
       payload_json=VALUES(payload_json),
       attempts=0,
       expires_at=VALUES(expires_at)`,
    [purpose, channel, contact, salt, codeHash, payloadVal, expiresAt]
  );

  return { expiresAt };
}

async function getOtpRow(purpose, contact) {
  const [rows] = await pool.execute(`SELECT * FROM auth_otps WHERE purpose=? AND contact=? LIMIT 1`, [
    purpose,
    contact,
  ]);
  return rows[0] || null;
}

async function bumpAttemptsOrDelete(row) {
  const attempts = Number(row.attempts || 0) + 1;
  if (attempts >= cfg.otpMaxAttempts) {
    await pool.execute(`DELETE FROM auth_otps WHERE id=?`, [row.id]);
    return { deleted: true, attempts };
  }
  await pool.execute(`UPDATE auth_otps SET attempts=? WHERE id=?`, [attempts, row.id]);
  return { deleted: false, attempts };
}

async function verifyOtp({ purpose, contact, code }) {
  const row = await getOtpRow(purpose, contact);
  if (!row) return { ok: false, message: "Invalid or expired code." };

  if (isExpired(row)) {
    await pool.execute(`DELETE FROM auth_otps WHERE id=?`, [row.id]);
    return { ok: false, message: "Code expired. Please request a new one." };
  }

  const expected = String(row.code_hash);
  const got = hashCode(String(code), String(row.code_salt));

  if (got !== expected) {
    const res = await bumpAttemptsOrDelete(row);
    return {
      ok: false,
      message: res.deleted ? "Too many attempts. Request a new code." : "Invalid code.",
    };
  }

  return { ok: true, row };
}

// ---- REGISTER (start) ----
router.post("/register/email", async (req, res) => {
  try {
    const body = z
      .object({
        name: z.string().min(2).max(120),
        email: z.string().email(),
        password: pwSchema,
      })
      .parse(req.body);

    const email = normalizeEmail(body.email);

    const [uRows] = await pool.execute(`SELECT id FROM users WHERE email=? LIMIT 1`, [email]);
    if (uRows.length) return res.status(409).json({ message: "This email is already registered." });

    const passwordHash = await bcrypt.hash(body.password, 12);
    const code = genCode();

    await upsertOtp({
      purpose: "register",
      channel: "email",
      contact: email,
      code,
      payload: { name: body.name, email, password_hash: passwordHash },
    });

    await sendOtpEmail({ to: email, code, purpose: "register" });

    return res.json({ ok: true });
  } catch (err) {
    return res.status(400).json({ message: err.message || "Bad request" });
  }
});

router.post("/register/phone", async (req, res) => {
  try {
    const body = z
      .object({
        name: z.string().min(2).max(120),
        phone: z.string().min(6).max(40),
        password: pwSchema,
      })
      .parse(req.body);

    const phone = normalizePhone(body.phone);

    // ✅ TABELA CERTA: users (minúsculo)
    const [uRows] = await pool.execute(`SELECT id FROM users WHERE phone=? LIMIT 1`, [phone]);
    if (uRows.length) return res.status(409).json({ message: "This phone is already registered." });

    const passwordHash = await bcrypt.hash(body.password, 12);
    const code = genCode();

    await upsertOtp({
      purpose: "register",
      channel: "sms",
      contact: phone,
      code,
      payload: { name: body.name, phone, password_hash: passwordHash },
    });

    await sendOtpSms({ to: phone, code, purpose: "register" });

    return res.json({ ok: true });
  } catch (err) {
    return res.status(400).json({ message: err.message || "Bad request" });
  }
});

// ---- REGISTER (verify -> create user + login cookie) ----
router.post("/verify/email", async (req, res) => {
  try {
    const body = z
      .object({
        email: z.string().email(),
        code: z.string().min(4).max(12),
      })
      .parse(req.body);

    const email = normalizeEmail(body.email);

    const v = await verifyOtp({ purpose: "register", contact: email, code: body.code });
    if (!v.ok) return res.status(400).json({ message: v.message });

    const payloadRaw = v.row.payload_json;
    const payload = payloadRaw ? (typeof payloadRaw === "string" ? JSON.parse(payloadRaw) : payloadRaw) : null;

    if (!payload?.email || !payload?.password_hash || !payload?.name) {
      await pool.execute(`DELETE FROM auth_otps WHERE id=?`, [v.row.id]);
      return res.status(400).json({ message: "Invalid registration payload. Please register again." });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [existing] = await conn.execute(`SELECT id FROM users WHERE email=? LIMIT 1`, [email]);
      if (existing.length) {
        await conn.execute(`DELETE FROM auth_otps WHERE id=?`, [v.row.id]);
        await conn.commit();
        return res.status(409).json({ message: "This email is already registered." });
      }

      const [ins] = await conn.execute(
        `INSERT INTO users (name, email, phone, password_hash) VALUES (?, ?, NULL, ?)`,
        [payload.name, payload.email, payload.password_hash]
      );

      await conn.execute(`DELETE FROM auth_otps WHERE id=?`, [v.row.id]);
      await conn.commit();

      const user = { id: ins.insertId, name: payload.name, email: payload.email, phone: null };
      const token = signToken(user);

      setAuthCookie(res, token);
      return res.json({ token });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (err) {
    return res.status(400).json({ message: err.message || "Bad request" });
  }
});

router.post("/verify/phone", async (req, res) => {
  try {
    const body = z
      .object({
        phone: z.string().min(6).max(40),
        code: z.string().min(4).max(12),
      })
      .parse(req.body);

    const phone = normalizePhone(body.phone);

    const v = await verifyOtp({ purpose: "register", contact: phone, code: body.code });
    if (!v.ok) return res.status(400).json({ message: v.message });

    const payloadRaw = v.row.payload_json;
    const payload = payloadRaw ? (typeof payloadRaw === "string" ? JSON.parse(payloadRaw) : payloadRaw) : null;

    if (!payload?.phone || !payload?.password_hash || !payload?.name) {
      await pool.execute(`DELETE FROM auth_otps WHERE id=?`, [v.row.id]);
      return res.status(400).json({ message: "Invalid registration payload. Please register again." });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [existing] = await conn.execute(`SELECT id FROM users WHERE phone=? LIMIT 1`, [phone]);
      if (existing.length) {
        await conn.execute(`DELETE FROM auth_otps WHERE id=?`, [v.row.id]);
        await conn.commit();
        return res.status(409).json({ message: "This phone is already registered." });
      }

      const [ins] = await conn.execute(
        `INSERT INTO users (name, email, phone, password_hash) VALUES (?, NULL, ?, ?)`,
        [payload.name, payload.phone, payload.password_hash]
      );

      await conn.execute(`DELETE FROM auth_otps WHERE id=?`, [v.row.id]);
      await conn.commit();

      const user = { id: ins.insertId, name: payload.name, email: null, phone: payload.phone };
      const token = signToken(user);

      setAuthCookie(res, token);
      return res.json({ token });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (err) {
    return res.status(400).json({ message: err.message || "Bad request" });
  }
});

// ---- LOGIN ----
router.post("/login", async (req, res) => {
  try {
    const body = z
      .object({
        email: z.string().email(),
        password: z.string().min(1).max(72),
      })
      .parse(req.body);

    const email = normalizeEmail(body.email);
    const [rows] = await pool.execute(`SELECT * FROM users WHERE email=? LIMIT 1`, [email]);
    const user = rows[0];
    if (!user) return res.status(401).json({ message: "Invalid credentials." });

    const ok = await bcrypt.compare(body.password, user.password_hash);
    if (!ok) return res.status(401).json({ message: "Invalid credentials." });

    const token = signToken(user);
    setAuthCookie(res, token);
    return res.json({ token });
  } catch (err) {
    return res.status(400).json({ message: err.message || "Bad request" });
  }
});

router.post("/login/phone", async (req, res) => {
  try {
    const body = z
      .object({
        phone: z.string().min(6).max(40),
        password: z.string().min(1).max(72),
      })
      .parse(req.body);

    const phone = normalizePhone(body.phone);
    const [rows] = await pool.execute(`SELECT * FROM users WHERE phone=? LIMIT 1`, [phone]);
    const user = rows[0];
    if (!user) return res.status(401).json({ message: "Invalid credentials." });

    const ok = await bcrypt.compare(body.password, user.password_hash);
    if (!ok) return res.status(401).json({ message: "Invalid credentials." });

    const token = signToken(user);
    setAuthCookie(res, token);
    return res.json({ token });
  } catch (err) {
    return res.status(400).json({ message: err.message || "Bad request" });
  }
});

// ---- PASSWORD RESET ----
router.post("/password/reset/start", async (req, res) => {
  try {
    const body = z.object({ contact: z.string().min(3).max(190) }).parse(req.body);

    const raw = body.contact.trim();
    const isEmail = looksLikeEmail(raw);
    const contact = isEmail ? normalizeEmail(raw) : normalizePhone(raw);

    const [rows] = await pool.execute(
      isEmail ? `SELECT id,email FROM users WHERE email=? LIMIT 1` : `SELECT id,phone FROM users WHERE phone=? LIMIT 1`,
      [contact]
    );

    if (!rows.length) return res.json({ ok: true });

    const code = genCode();
    await upsertOtp({ purpose: "reset", channel: isEmail ? "email" : "sms", contact, code, payload: null });

    if (isEmail) await sendOtpEmail({ to: contact, code, purpose: "reset" });
    else await sendOtpSms({ to: contact, code, purpose: "reset" });

    return res.json({ ok: true });
  } catch (err) {
    return res.status(400).json({ message: err.message || "Bad request" });
  }
});

router.post("/password/reset/finish", async (req, res) => {
  try {
    const body = z
      .object({
        contact: z.string().min(3).max(190),
        code: z.string().min(4).max(12),
        newPassword: pwSchema,
      })
      .parse(req.body);

    const raw = body.contact.trim();
    const isEmail = looksLikeEmail(raw);
    const contact = isEmail ? normalizeEmail(raw) : normalizePhone(raw);

    const v = await verifyOtp({ purpose: "reset", contact, code: body.code });
    if (!v.ok) return res.status(400).json({ message: v.message });

    const passwordHash = await bcrypt.hash(body.newPassword, 12);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [rows] = await conn.execute(
        isEmail ? `SELECT id FROM users WHERE email=? LIMIT 1` : `SELECT id FROM users WHERE phone=? LIMIT 1`,
        [contact]
      );

      if (!rows.length) {
        await conn.execute(`DELETE FROM auth_otps WHERE id=?`, [v.row.id]);
        await conn.commit();
        return res.status(400).json({ message: "Account not found." });
      }

      const user = rows[0];
      await conn.execute(`UPDATE users SET password_hash=? WHERE id=?`, [passwordHash, user.id]);
      await conn.execute(`DELETE FROM auth_otps WHERE id=?`, [v.row.id]);

      await conn.commit();
      return res.json({ ok: true });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (err) {
    return res.status(400).json({ message: err.message || "Bad request" });
  }
});

// ---- GOOGLE LOGIN ----

// INICIAR LOGIN COM GOOGLE
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  })
);

// CALLBACK DO GOOGLE
router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: "/login",
  }),
  (req, res) => {
    const { token } = req.user;

    setAuthCookie(res, token);
    res.redirect(`${process.env.FRONTEND_URL}/painel.html`);
  }
);

module.exports = router;
