const express = require("express");
const bcrypt = require("bcryptjs");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;

const { q, tx } = require("../services/db");
const { signJwt } = require("../services/jwt");
const { makeNumericCode, ttlMinutes, shouldReturnCode } = require("../services/codes");

const router = express.Router();

// ---------- Helpers ----------
function looksLikeEmail(v){ return (v || "").includes("@"); }
function normalizePhone(v){
  const raw = (v || "").trim();
  let out = raw.replace(/[^0-9+]/g, "");
  if(out.includes("+")) out = "+" + out.replace(/\+/g, "");
  return out;
}

async function issueJwtForUser(user){
  return signJwt({ sub: user.id, name: user.name });
}

async function createOrReplaceCode(conn, { userId, contact, purpose }){
  const code = makeNumericCode();
  const expiresAt = new Date(Date.now() + ttlMinutes() * 60 * 1000);

  // invalidate old codes
  await conn.execute(
    "UPDATE auth_codes SET used=1 WHERE (user_id=? OR contact=?) AND purpose=? AND used=0",
    [userId || null, contact || null, purpose]
  );
  await conn.execute(
    "INSERT INTO auth_codes (user_id, contact, code, purpose, expires_at, used) VALUES (?,?,?,?,?,0)",
    [userId || null, contact || null, code, purpose, expiresAt]
  );

  return { code, expiresAt };
}

// ---------- Login ----------
router.post("/login", async (req, res, next) => {
  try{
    const { email, password } = req.body || {};
    if(!email || !password) return res.status(400).json({ error: "Missing email/password" });

    const rows = await q("SELECT * FROM users WHERE email=?", [email.trim().toLowerCase()]);
    if(rows.length === 0) return res.status(401).json({ error: "Invalid credentials" });

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if(!ok) return res.status(401).json({ error: "Invalid credentials" });

    const token = await issueJwtForUser(user);
    res.json({ token });
  }catch(e){ next(e); }
});

router.post("/login/phone", async (req, res, next) => {
  try{
    const { phone, password } = req.body || {};
    if(!phone || !password) return res.status(400).json({ error: "Missing phone/password" });

    const p = normalizePhone(phone);
    const rows = await q("SELECT * FROM users WHERE phone=?", [p]);
    if(rows.length === 0) return res.status(401).json({ error: "Invalid credentials" });

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if(!ok) return res.status(401).json({ error: "Invalid credentials" });

    const token = await issueJwtForUser(user);
    res.json({ token });
  }catch(e){ next(e); }
});

// ---------- Register (email/phone) + send code ----------
router.post("/register/email", async (req, res, next) => {
  try{
    const { email, password, name } = req.body || {};
    if(!email || !password || !name) return res.status(400).json({ error: "Missing fields" });
    const em = email.trim().toLowerCase();

    const exists = await q("SELECT id FROM users WHERE email=?", [em]);
    if(exists.length) return res.status(409).json({ error: "Email already registered" });

    const hash = await bcrypt.hash(password, 10);

    const out = await tx(async (conn) => {
      const [r] = await conn.execute(
        "INSERT INTO users (name, email, phone, password_hash, is_verified, created_at) VALUES (?,?,?,?,0,NOW())",
        [name.trim(), em, null, hash]
      );
      const userId = r.insertId;

      const codeData = await createOrReplaceCode(conn, { userId, contact: em, purpose: "verify" });

      // TODO: enviar email de verdade aqui (nodemailer/Sendgrid). Por enquanto, opcionalmente devolvemos o código (modo dev).
      return { userId, ...codeData };
    });

    const payload = { ok: true, message: "Verification code sent." };
    if(shouldReturnCode()) payload.code = out.code;
    res.json(payload);
  }catch(e){ next(e); }
});

router.post("/register/phone", async (req, res, next) => {
  try{
    const { phone, password, name } = req.body || {};
    if(!phone || !password || !name) return res.status(400).json({ error: "Missing fields" });

    const p = normalizePhone(phone);
    const exists = await q("SELECT id FROM users WHERE phone=?", [p]);
    if(exists.length) return res.status(409).json({ error: "Phone already registered" });

    const hash = await bcrypt.hash(password, 10);

    const out = await tx(async (conn) => {
      const [r] = await conn.execute(
        "INSERT INTO users (name, email, phone, password_hash, is_verified, created_at) VALUES (?,?,?,?,0,NOW())",
        [name.trim(), null, p, hash]
      );
      const userId = r.insertId;

      const codeData = await createOrReplaceCode(conn, { userId, contact: p, purpose: "verify" });

      // TODO: enviar SMS real (Twilio etc). Por enquanto, opcionalmente devolvemos o código (modo dev).
      return { userId, ...codeData };
    });

    const payload = { ok: true, message: "Verification code sent." };
    if(shouldReturnCode()) payload.code = out.code;
    res.json(payload);
  }catch(e){ next(e); }
});

// ---------- Verify ----------
router.post("/verify/email", async (req, res, next) => {
  try{
    const { email, code } = req.body || {};
    if(!email || !code) return res.status(400).json({ error: "Missing email/code" });
    const em = email.trim().toLowerCase();

    const rows = await q("SELECT * FROM auth_codes WHERE contact=? AND purpose='verify' AND used=0 ORDER BY id DESC LIMIT 1", [em]);
    if(!rows.length) return res.status(400).json({ error: "Code not found" });

    const rec = rows[0];
    if(rec.code !== String(code).trim()) return res.status(400).json({ error: "Invalid code" });
    if(new Date(rec.expires_at).getTime() < Date.now()) return res.status(400).json({ error: "Code expired" });

    const out = await tx(async (conn) => {
      await conn.execute("UPDATE auth_codes SET used=1 WHERE id=?", [rec.id]);
      await conn.execute("UPDATE users SET is_verified=1 WHERE id=?", [rec.user_id]);
      const [u] = await conn.execute("SELECT * FROM users WHERE id=?", [rec.user_id]);
      return u[0];
    });

    const token = await issueJwtForUser(out);
    res.json({ token });
  }catch(e){ next(e); }
});

router.post("/verify/phone", async (req, res, next) => {
  try{
    const { phone, code } = req.body || {};
    if(!phone || !code) return res.status(400).json({ error: "Missing phone/code" });
    const p = normalizePhone(phone);

    const rows = await q("SELECT * FROM auth_codes WHERE contact=? AND purpose='verify' AND used=0 ORDER BY id DESC LIMIT 1", [p]);
    if(!rows.length) return res.status(400).json({ error: "Code not found" });

    const rec = rows[0];
    if(rec.code !== String(code).trim()) return res.status(400).json({ error: "Invalid code" });
    if(new Date(rec.expires_at).getTime() < Date.now()) return res.status(400).json({ error: "Code expired" });

    const out = await tx(async (conn) => {
      await conn.execute("UPDATE auth_codes SET used=1 WHERE id=?", [rec.id]);
      await conn.execute("UPDATE users SET is_verified=1 WHERE id=?", [rec.user_id]);
      const [u] = await conn.execute("SELECT * FROM users WHERE id=?", [rec.user_id]);
      return u[0];
    });

    const token = await issueJwtForUser(out);
    res.json({ token });
  }catch(e){ next(e); }
});

// ---------- Password reset ----------
router.post("/password/reset/start", async (req, res, next) => {
  try{
    const { contact } = req.body || {};
    if(!contact) return res.status(400).json({ error: "Missing contact" });
    const c = looksLikeEmail(contact) ? contact.trim().toLowerCase() : normalizePhone(contact);

    const userRows = looksLikeEmail(c)
      ? await q("SELECT id FROM users WHERE email=?", [c])
      : await q("SELECT id FROM users WHERE phone=?", [c]);

    if(!userRows.length) return res.status(404).json({ error: "User not found" });

    const userId = userRows[0].id;

    const out = await tx(async (conn) => {
      const codeData = await createOrReplaceCode(conn, { userId, contact: c, purpose: "reset" });
      return codeData;
    });

    // TODO: enviar email/sms real.
    const payload = { ok: true, message: "Reset code sent." };
    if(shouldReturnCode()) payload.code = out.code;
    res.json(payload);
  }catch(e){ next(e); }
});

router.post("/password/reset/finish", async (req, res, next) => {
  try{
    const { contact, code, newPassword } = req.body || {};
    if(!contact || !code || !newPassword) return res.status(400).json({ error: "Missing fields" });

    const c = looksLikeEmail(contact) ? contact.trim().toLowerCase() : normalizePhone(contact);

    const rows = await q("SELECT * FROM auth_codes WHERE contact=? AND purpose='reset' AND used=0 ORDER BY id DESC LIMIT 1", [c]);
    if(!rows.length) return res.status(400).json({ error: "Code not found" });

    const rec = rows[0];
    if(rec.code !== String(code).trim()) return res.status(400).json({ error: "Invalid code" });
    if(new Date(rec.expires_at).getTime() < Date.now()) return res.status(400).json({ error: "Code expired" });

    const hash = await bcrypt.hash(newPassword, 10);

    await tx(async (conn) => {
      await conn.execute("UPDATE auth_codes SET used=1 WHERE id=?", [rec.id]);
      await conn.execute("UPDATE users SET password_hash=? WHERE id=?", [rec.user_id, hash]);
    });

    res.json({ ok: true });
  }catch(e){ next(e); }
});

// ---------- Google OAuth ----------
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleCallbackUrl = process.env.GOOGLE_CALLBACK_URL;

if(googleClientId && googleClientSecret && googleCallbackUrl){
  passport.use(new GoogleStrategy({
      clientID: googleClientId,
      clientSecret: googleClientSecret,
      callbackURL: googleCallbackUrl
    },
    async (accessToken, refreshToken, profile, done) => {
      try{
        const email = (profile.emails && profile.emails[0] && profile.emails[0].value) ? profile.emails[0].value.toLowerCase() : null;
        const name = profile.displayName || "Customer";
        const googleId = profile.id;

        const user = await tx(async (conn) => {
          if(email){
            const [rows] = await conn.execute("SELECT * FROM users WHERE email=? LIMIT 1", [email]);
            if(rows.length){
              const u = rows[0];
              // attach google id if missing
              if(!u.google_id){
                await conn.execute("UPDATE users SET google_id=?, is_verified=1 WHERE id=?", [googleId, u.id]);
                u.google_id = googleId;
                u.is_verified = 1;
              }
              return u;
            }
          }

          const [r] = await conn.execute(
            "INSERT INTO users (name, email, phone, password_hash, google_id, is_verified, created_at) VALUES (?,?,?,?,?,1,NOW())",
            [name, email, null, null, googleId]
          );
          const [u2] = await conn.execute("SELECT * FROM users WHERE id=?", [r.insertId]);
          return u2[0];
        });

        return done(null, user);
      }catch(e){
        return done(e);
      }
    }
  ));

  router.use(passport.initialize());

  router.get("/google", passport.authenticate("google", { scope: ["profile", "email"], session: false }));

  router.get("/google/callback",
    passport.authenticate("google", { session: false, failureRedirect: "/auth/google/failure" }),
    async (req, res) => {
      const token = await issueJwtForUser(req.user);
      // manda para /auth/callback (HTML que salva no localStorage e redireciona para o front)
      res.redirect(`/auth/callback?token=${encodeURIComponent(token)}`);
    }
  );

  router.get("/google/failure", (req, res) => {
    res.status(400).send("Google login failed.");
  });
} else {
  router.get("/google", (req, res) => {
    res.status(400).json({ error: "Google OAuth not configured. Set GOOGLE_CLIENT_ID/SECRET/CALLBACK_URL" });
  });
}

// ---------- Auth callback helper page (stores vw_token and redirects to front/painel) ----------
router.get("/callback", (req, res) => {
  const token = req.query.token;
  if(!token) return res.status(400).send("Missing token.");

  const frontendBase = (process.env.FRONTEND_BASE_URL || "").replace(/\/$/, "");
  const after = process.env.FRONTEND_AFTER_LOGIN || "painel.html";

  const redirectUrl = frontendBase ? `${frontendBase}/${after}` : after;

  // IMPORTANT: front expects TOKEN_KEY = "vw_token"
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Logging in…</title></head>
<body>
<script>
  try{
    localStorage.setItem("vw_token", ${JSON.stringify(token)});
  }catch(e){}
  location.href = ${JSON.stringify(redirectUrl)};
</script>
Logging in…
</body></html>`);
});

module.exports = router;
