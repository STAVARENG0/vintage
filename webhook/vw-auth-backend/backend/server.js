import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const app = express();

// ====== ENV ======
const NODE_ENV = process.env.NODE_ENV || "development";
const ADMIN_USER = (process.env.ADMIN_USER || "").trim();
const ADMIN_PASS_HASH = (process.env.ADMIN_PASS_HASH || "").trim();
const JWT_SECRET = (process.env.JWT_SECRET || "").trim();

const FRONTEND_ORIGIN = (process.env.FRONTEND_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// ====== MIDDLEWARE ======
app.use(express.json());
app.use(cookieParser());

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (FRONTEND_ORIGIN.length === 0)
        return cb(new Error("CORS: FRONTEND_ORIGIN vazio"));
      if (FRONTEND_ORIGIN.includes(origin)) return cb(null, true);
      return cb(new Error("CORS blocked: " + origin));
    },
    credentials: true,
  })
);

app.options("*", cors({ origin: true, credentials: true }));

// ====== HELPERS ======
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

function getToken(req) {
  const cookieToken = req.cookies?.vw_admin;
  const auth = req.headers.authorization || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  return cookieToken || bearer;
}

function requireAuth(req, res, next) {
  const token = getToken(req);
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

app.get("/health", (req, res) =>
  res.json({ ok: true, env: NODE_ENV, service: "vw-auth" })
);

app.get("/healthz", (req, res) =>
  res.json({ ok: true, env: NODE_ENV, service: "vw-auth" })
);

app.post("/auth/login", async (req, res) => {
  // trim também no que vem do front (evita "karla " e "senha " sem querer)
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "").trim();

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

  res.cookie("vw_admin", token, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  return res.json({ ok: true, token });
});

app.post("/auth/logout", (req, res) => {
  res.clearCookie("vw_admin", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
  });
  res.json({ ok: true });
});

app.get("/auth/me", requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user });
});

// ====== START ======
const port = process.env.PORT || 10000;
app.listen(port, () => console.log("Server running on port", port));
