// server.js (ESM) - pronto
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const app = express();

// ====== ENV ======
const NODE_ENV = process.env.NODE_ENV || "development";
const ADMIN_USER = process.env.ADMIN_USER || "";
const ADMIN_PASS_HASH = process.env.ADMIN_PASS_HASH || "";
const JWT_SECRET = process.env.JWT_SECRET || "";
const FRONTEND_ORIGIN = (process.env.FRONTEND_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// ====== MIDDLEWARE ======
app.use(express.json());
app.use(cookieParser());

// CORS (obrigatório pro seu site chamar o Render)
app.use(
  cors({
    origin: (origin, cb) => {
      // permite chamadas sem Origin (ex.: abrir URL no navegador)
      if (!origin) return cb(null, true);

      // se FRONTEND_ORIGIN não estiver configurado, bloqueia por segurança
      if (FRONTEND_ORIGIN.length === 0) return cb(new Error("CORS: FRONTEND_ORIGIN vazio"));

      if (FRONTEND_ORIGIN.includes(origin)) return cb(null, true);
      return cb(new Error("CORS blocked: " + origin));
    },
    credentials: true,
  })
);

// Preflight
app.options("*", cors({ origin: true, credentials: true }));

// ====== HELPERS ======
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

function getTokenFromReq(req) {
  const cookieToken = req.cookies?.vw_admin;
  const auth = req.headers.authorization || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  return cookieToken || bearer;
}

function requireAuth(req, res, next) {
  const token = getTokenFromReq(req);
  if (!token) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ ok: false, error: "INVALID_TOKEN" });
  }
}

// ====== ROUTES ======
app.get("/", (req, res) => res.send("OK"));
app.get("/health", (req, res) => res.json({ ok: true, env: NODE_ENV }));

app.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ ok: false, error: "MISSING_FIELDS" });
    }
    if (!ADMIN_USER || !ADMIN_PASS_HASH || !JWT_SECRET) {
      return res.status(500).json({ ok: false, error: "SERVER_NOT_CONFIGURED" });
    }

    const userOk = username === ADMIN_USER;
    const passOk = await bcrypt.compare(password, ADMIN_PASS_HASH);

    if (!userOk || !passOk) {
      return res.status(401).json({ ok: false, error: "INVALID_CREDENTIALS" });
    }

    const token = signToken({ sub: ADMIN_USER, role: "admin" });

    // Cookie HttpOnly (recomendado)
    res.cookie("vw_admin", token, {
      httpOnly: true,
      secure: true,      // HTTPS
      sameSite: "none",  // cross-site (vintage-clothes.ie -> onrender.com)
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // fallback: também devolve o token no body (se cookie for bloqueado)
    return res.json({ ok: true, token });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "LOGIN_ERROR" });
  }
});

app.post("/auth/logout", (req, res) => {
  res.clearCookie("vw_admin", { httpOnly: true, secure: true, sameSite: "none" });
  res.json({ ok: true });
});

app.get("/auth/me", requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user });
});

// ====== START ======
const port = process.env.PORT || 10000;
app.listen(port, () => console.log("Server running on port", port));
