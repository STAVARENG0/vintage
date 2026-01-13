const express = require("express");
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

// IMPORTANT: sua tabela no Railway se chama `User` (singular)
// e tem coluna `passwordHash` (camelCase)
const USER_TABLE = "`User`"; // usa crase por segurança

const pwSchema = z
  .string()
  .min(8)
  .max(72)
  .refine((v) => !/\s/.test(v), "Password cannot contain spaces.")
  .refine((v) => /[a-z]/.test(v), "Add at least 1 lowercase letter.")
  .refine((v) => /[A-Z]/.test(v), "Add at least 1 UPPERCASE letter.")
  .refine((v) => /\d/.test(v), "Add at least 1 number.");

function nowPlusMinutes(m) {
  const d = new Date();
  d.setMinutes(d.getMinutes() + m);
  return d.toISOString().slice(0, 19).replace("T", " ");
}

async function upsertOtp({ purpose, channel, contact, code, payload }) {
  const salt = genSalt();
  const codeHash = hashCode(code, salt);
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
  const [rows] = await pool.execute(
    `SELECT * FROM auth_otps WHERE purpose=? AND contact=? LIMIT 1`,
    [purpose, contact]
  );
  return rows[0] || null;
}

function isExpired(row) {
  const exp = new Date(String(row.expires_at).replace(" ", "T") + "Z");
  return exp.getTime() < Date.now();
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
  const got = hashCode(code, row.code_salt);

  if (got !== expected) {
    const res = await bumpAttemptsOrDelete(row);
    return {
      ok: false,
      message: res.deleted ? "Too many attempts. Request a new code." : "Invalid code.",
    };
  }

  return { ok: true, row };
}

// ---------- REGISTER (start) ----------
// Troquei purpose "register" -> "verify" (mais padrão) e channel "sms" -> "phone"
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

    // Check user exists (tabela `User`)
    const [uRows] = await pool.execute(
      `SELECT id FROM ${USER_TABLE} WHERE email=? LIMIT 1`,
      [email]
    );
    if (uRows.length) return res.status(409).json({ message: "This email is already registered." });

    const passwordHash = await bcrypt.hash(body.password, 12);
    const code = genCode();

    await upsertOtp({
      purpose: "verify",
      channel: "email",
      contact: email,
      code,
      payload: { name: body.name, email, passwordHash },
    });

    await sendOtpEmail({ to: email, code, purpose: "verify" });

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

    const [uRows] = await pool.execute(
      `SELECT id FROM ${USER_TABLE} WHERE phone=? LIMIT 1`,
      [phone]
    );
    if (uRows.length) return res.status(409).json({ message: "This phone is already registered." });

    const passwordHash = await bcrypt.hash(body.password, 12);
    const code = genCode();

    await upsertOtp({
      purpose: "verify",
      channel: "phone",
      contact: phone,
      code,
      payload: { name: body.name, phone, passwordHash },
    });

    await sendOtpSms({ to: phone, code, purpose: "verify" });

    return res.json({ ok: true });
  } catch (err) {
    return res.status(400).json({ message: err.message || "Bad request" });
  }
});

// ---------- REGISTER (verify -> create user) ----------
router.post("/verify/email", async (req, res) => {
  try {
    const body = z
      .object({
        email: z.string().email(),
        code: z.string().min(4).max(12),
      })
      .parse(req.body);

    const email = normalizeEmail(body.email);

    const v = await verifyOtp({ purpose: "verify", contact: email, code: body.code });
    if (!v.ok) return res.status(400).json({ message: v.message });

    const payloadRaw = v.row.payload_json;
    const payload = payloadRaw
      ? typeof payloadRaw === "string"
        ? JSON.parse(payloadRaw)
        : payloadRaw
      : null;

    if (!payload?.email || !payload?.passwordHash || !payload?.name) {
      await pool.execute(`DELETE FROM auth_otps WHERE id=?`, [v.row.id]);
      return res.status(400).json({ message: "Invalid registration payload. Please register again." });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [existing] = await conn.execute(
        `SELECT id FROM ${USER_TABLE} WHERE email=? LIMIT 1`,
        [email]
      );
      if (existing.length) {
        await conn.execute(`DELETE FROM auth_otps WHERE id=?`, [v.row.id]);
        await conn.commit();
        return res.status(409).json({ message: "This email is already registered." });
      }

      const [ins] = await conn.execute(
        `INSERT INTO ${USER_TABLE} (name, email, phone, passwordHash, emailVerified, phoneVerified)
         VALUES (?, ?, NULL, ?, 1, 0)`,
        [payload.name, payload.email, payload.passwordHash]
      );

      await conn.execute(`DELETE FROM auth_otps WHERE id=?`, [v.row.id]);
      await conn.commit();

      const user = { id: ins.insertId, name: payload.name, email: payload.email, phone: null };
      const token = signToken(user);
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

    const v = await verifyOtp({ purpose: "verify", contact: phone, code: body.code });
    if (!v.ok) return res.status(400).json({ message: v.message });

    const payloadRaw = v.row.payload_json;
    const payload = payloadRaw
      ? typeof payloadRaw === "string"
        ? JSON.parse(payloadRaw)
        : payloadRaw
      : null;

    if (!payload?.phone || !payload?.passwordHash || !payload?.name) {
      await pool.execute(`DELETE FROM auth_otps WHERE id=?`, [v.row.id]);
      return res.status(400).json({ message: "Invalid registration payload. Please register again." });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [existing] = await conn.execute(
        `SELECT id FROM ${USER_TABLE} WHERE phone=? LIMIT 1`,
        [phone]
      );
      if (existing.length) {
        await conn.execute(`DELETE FROM auth_otps WHERE id=?`, [v.row.id]);
        await conn.commit();
        return res.status(409).json({ message: "This phone is already registered." });
      }

      const [ins] = await conn.execute(
        `INSERT INTO ${USER_TABLE} (name, email, phone, passwordHash, emailVerified, phoneVerified)
         VALUES (?, NULL, ?, ?, 0, 1)`,
        [payload.name, payload.phone, payload.passwordHash]
      );

      await conn.execute(`DELETE FROM auth_otps WHERE id=?`, [v.row.id]);
      await conn.commit();

      const user = { id: ins.insertId, name: payload.name, email: null, phone: payload.phone };
      const token = signToken(user);
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

// ---------- LOGIN ----------
router.post("/login", async (req, res) => {
  try {
    const body = z
      .object({
        email: z.string().email(),
        password: z.string().min(1).max(72),
      })
      .parse(req.body);

    const email = normalizeEmail(body.email);

    const [rows] = await pool.execute(
      `SELECT id,name,email,phone,passwordHash FROM ${USER_TABLE} WHERE email=? LIMIT 1`,
      [email]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ message: "Invalid credentials." });

    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) return res.status(401).json({ message: "Invalid credentials." });

    const token = signToken({ id: user.id, name: user.name, email: user.email, phone: user.phone });
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

    const [rows] = await pool.execute(
      `SELECT id,name,email,phone,passwordHash FROM ${USER_TABLE} WHERE phone=? LIMIT 1`,
      [phone]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ message: "Invalid credentials." });

    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) return res.status(401).json({ message: "Invalid credentials." });

    const token = signToken({ id: user.id, name: user.name, email: user.email, phone: user.phone });
    return res.json({ token });
  } catch (err) {
    return res.status(400).json({ message: err.message || "Bad request" });
  }
});

// ---------- PASSWORD RESET ----------
router.post("/password/reset/start", async (req, res) => {
  try {
    const body = z
      .object({
        contact: z.string().min(3).max(190),
      })
      .parse(req.body);

    const raw = body.contact.trim();
    const isEmail = looksLikeEmail(raw);
    const contact = isEmail ? normalizeEmail(raw) : normalizePhone(raw);

    const [rows] = await pool.execute(
      isEmail
        ? `SELECT id,email FROM ${USER_TABLE} WHERE email=? LIMIT 1`
        : `SELECT id,phone FROM ${USER_TABLE} WHERE phone=? LIMIT 1`,
      [contact]
    );

    if (!rows.length) {
      return res.json({ ok: true }); // não vaza se existe ou não
    }

    const code = genCode();

    await upsertOtp({
      purpose: "reset",
      channel: isEmail ? "email" : "phone",
      contact,
      code,
      payload: null,
    });

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
        isEmail
          ? `SELECT id,name,email,phone FROM ${USER_TABLE} WHERE email=? LIMIT 1`
          : `SELECT id,name,email,phone FROM ${USER_TABLE} WHERE phone=? LIMIT 1`,
        [contact]
      );

      if (!rows.length) {
        await conn.execute(`DELETE FROM auth_otps WHERE id=?`, [v.row.id]);
        await conn.commit();
        return res.status(400).json({ message: "Account not found." });
      }

      const user = rows[0];

      await conn.execute(
        `UPDATE ${USER_TABLE} SET passwordHash=? WHERE id=?`,
        [passwordHash, user.id]
      );

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

module.exports = router;
