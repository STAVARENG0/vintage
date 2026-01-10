// server.js
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
const JWT_SECRET = process.env.JWT_SECRET || "change-me";
const FRONTEND_ORIGIN = (process.env.FRONTEND_ORIGIN || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

// ====== CORS ======
app.use(
  cors({
    origin: function (origin, cb) {
      // permite chamadas sem origin (ex.: curl / healthchecks)
      if (!origin) return cb(null, true);
      if (FRONTEND_ORIGIN.includes(origin)) return cb(null, true);
      return cb(new Error("CORS blocked: " + origin));
    },
    credentials: true,
  })
);

// Preflight
app.options("*", cors({ origin: true, credentials: true }));

app.use(express.json());
app.use(cookieParser());

// ====== HELPERS ======
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

function requireAuth(req, res, next) {
  const cookieToken = req.cookies?.vw_admin;
  const header = req.headers.authorization || "";
  const bearerToken = header.startsWith("Bearer ") ? header.slice(7) : null;

  const token = cookieToken || bearerToken;
  if (!token) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ ok: false, error: "INVALID_TOKEN" });
  }
}

// ====== ROUTES ======
app.get("/", (req, res) => res.send("OK"));
app.get("/health", (req, res) => res.json({ ok: true, env: NODE_ENV }));

app.post("/auth/login", async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ ok: false, error: "MISSING_FIELDS" });
  }

  if (!ADMIN_USER || !ADMIN_PASS_HASH) {
    return res.status(500).json({ ok: false, error: "SERVER_NOT_CONFIGURED" });
  }

  const userOk = username === ADMIN_USER;
  const passOk = await bcrypt.compare(password, ADMIN_PASS_HASH);

  if (!userOk || !passOk) {
    return res.status(401).json({ ok: false, error: "INVALID_CREDENTIALS" });
  }

  const token = signToken({ sub: ADMIN_USER, role: "admin" });

  // Cookie para o navegador (HttpOnly)
  res.cookie("vw_admin", token, {
    httpOnly: true,
    secure: true,        // obrigatório em HTTPS
    sameSite: "none",    // necessário porque site e backend são domínios diferentes
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  // Também devolvo o token no JSON como fallback (caso o browser bloqueie cookie third-party)
  return res.json({ ok: true, token });
});

app.post("/auth/logout", (req, res) => {
  res.clearCookie("vw_admin", { httpOnly: true, secure: true, sameSite: "none" });
  res.json({ ok: true });
});

app.get("/auth/me", requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user });
});

// Exemplo de rota protegida (teste)
app.get("/admin/ping", requireAuth, (req, res) => {
  res.json({ ok: true, msg: "pong", user: req.user });
});

const port = process.env.PORT || 10000;
app.listen(port, () => console.log("Server running on port", port));
