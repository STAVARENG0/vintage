import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const app = express();
app.set("trust proxy", 1);

// ====== ENV ======
const NODE_ENV = process.env.NODE_ENV || "development";
const ADMIN_USER = (process.env.ADMIN_USER || "").trim();
const ADMIN_PASS_HASH = (process.env.ADMIN_PASS_HASH || "").trim();
const JWT_SECRET = (process.env.JWT_SECRET || "").trim();

const GITHUB_TOKEN = (process.env.GITHUB_TOKEN || "").trim();
const GITHUB_REPO = (process.env.GITHUB_REPO || "").trim(); // "owner/repo"
const GITHUB_BRANCH = (process.env.GITHUB_BRANCH || "main").trim();
const GITHUB_PRODUCTS_PATH = (process.env.GITHUB_PRODUCTS_PATH || "products.json").trim();

const FRONTEND_ORIGINS = (process.env.FRONTEND_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// ====== FETCH (Node <18 fallback) ======
let fetchFn = globalThis.fetch;
if (!fetchFn) {
  const mod = await import("node-fetch");
  fetchFn = mod.default;
}

// ====== MIDDLEWARE ======
// ⚠️ precisa ser maior por causa de imagens base64
app.use(express.json({ limit: "60mb" }));
app.use(cookieParser());

// CORS (front → back)
const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (origin === "null") return cb(null, true);
    if (FRONTEND_ORIGINS.length === 0) return cb(null, true);
    if (FRONTEND_ORIGINS.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

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

function assertGithubConfigured() {
  return Boolean(GITHUB_TOKEN && GITHUB_REPO);
}

function githubAuthHeader() {
  // GitHub aceita "Bearer" tanto para classic quanto fine-grained PAT.
  return `Bearer ${GITHUB_TOKEN}`;
}

function sanitizePathSegment(s) {
  return String(s || "")
    .trim()
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

async function ghGetJson(url) {
  const r = await fetchFn(url, {
    headers: {
      Authorization: githubAuthHeader(),
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "vw-admin-backend",
    },
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

async function ghPutJson(url, body) {
  const r = await fetchFn(url, {
    method: "PUT",
    headers: {
      Authorization: githubAuthHeader(),
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "vw-admin-backend",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

// ====== ROUTES ======
app.get("/", (req, res) => res.send("OK"));
app.get("/health", (req, res) =>
  res.json({ ok: true, env: NODE_ENV, service: "vw-auth" })
);
app.get("/healthz", (req, res) =>
  res.json({ ok: true, env: NODE_ENV, service: "vw-auth" })
);

// ====== AUTH ======
app.get("/auth/login", (req, res) =>
  res.status(405).json({ ok: false, error: "USE_POST_/auth/login" })
);

app.post("/auth/login", async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ ok: false, error: "MISSING_FIELDS" });
  }

  if (!ADMIN_USER || !ADMIN_PASS_HASH || !JWT_SECRET) {
    return res.status(500).json({ ok: false, error: "SERVER_NOT_CONFIGURED" });
  }

  const userOk = String(username).trim() === ADMIN_USER;
  const passOk = await bcrypt.compare(String(password), ADMIN_PASS_HASH);

  if (!userOk || !passOk) {
    return res.status(401).json({ ok: false, error: "INVALID_CREDENTIALS" });
  }

  const token = signToken({ sub: ADMIN_USER, role: "admin" });

  res.cookie("vw_admin", token, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });

  return res.json({ ok: true, token });
});

app.post("/auth/logout", (req, res) => {
  res.clearCookie("vw_admin", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
  });
  res.json({ ok: true });
});

app.get("/auth/me", requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user });
});

// ====== GITHUB (SAFE BACKEND) ======
app.get("/github/config", requireAuth, (req, res) => {
  res.json({
    ok: true,
    repo: GITHUB_REPO,
    branch: GITHUB_BRANCH,
    path: GITHUB_PRODUCTS_PATH,
  });
});

app.get("/github/products", requireAuth, async (req, res) => {
  if (!assertGithubConfigured()) {
    return res.status(500).json({ ok: false, error: "GITHUB_NOT_CONFIGURED" });
  }

  const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_PRODUCTS_PATH}?ref=${encodeURIComponent(
    GITHUB_BRANCH
  )}`;

  try {
    const { ok, status, data } = await ghGetJson(apiUrl);

    // Se o arquivo ainda não existe, devolve lista vazia (pra permitir primeiro publish)
    if (!ok && status === 404) {
      return res.json({ ok: true, products: [] });
    }
    if (!ok) {
      return res.status(500).json({
        ok: false,
        error: "CANNOT_READ_FILE",
        details: { status, message: data?.message, errors: data?.errors, ...data },
      });
    }

    const b64 = data.content || "";
    const jsonText = Buffer.from(b64, "base64").toString("utf8");
    let products = [];
    try {
      products = JSON.parse(jsonText || "[]");
    } catch {
      products = [];
    }

    return res.json({ ok: true, products: Array.isArray(products) ? products : [] });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

app.post("/github/publish", requireAuth, async (req, res) => {
  if (!assertGithubConfigured()) {
    return res.status(500).json({ ok: false, error: "GITHUB_NOT_CONFIGURED" });
  }

  const { products } = req.body || {};
  if (!products) {
    return res.status(400).json({ ok: false, error: "MISSING_PRODUCTS" });
  }

  const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_PRODUCTS_PATH}`;

  try {
    // 1) pegar SHA se existir
    const getUrl = `${apiUrl}?ref=${encodeURIComponent(GITHUB_BRANCH)}`;
    const { ok: okGet, status: stGet, data: fileData } = await ghGetJson(getUrl);

    let sha = null;
    if (okGet && fileData?.sha) sha = fileData.sha;
    if (!okGet && stGet !== 404) {
      return res.status(500).json({
        ok: false,
        error: "CANNOT_READ_FILE",
        details: { status: stGet, ...fileData },
      });
    }

    // 2) commit update (cria se sha null)
    const body = {
      message: "Atualização de produtos",
      content: Buffer.from(JSON.stringify(products, null, 2)).toString("base64"),
      branch: GITHUB_BRANCH,
      ...(sha ? { sha } : {}),
    };

    const { ok: okPut, status: stPut, data: result } = await ghPutJson(apiUrl, body);

    if (!okPut) {
      return res.status(500).json({
        ok: false,
        error: "GITHUB_COMMIT_FAILED",
        details: { status: stPut, message: result?.message, errors: result?.errors, result },
      });
    }

    return res.json({
      ok: true,
      commit: result.commit?.sha,
      content: result.content?.path,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

// Upload de imagens (base64) para o repo, retorna URLs raw
app.post("/github/upload-images", requireAuth, async (req, res) => {
  if (!assertGithubConfigured()) {
    return res.status(500).json({ ok: false, error: "GITHUB_NOT_CONFIGURED" });
  }

  const { productId, images } = req.body || {};
  if (!productId || !Array.isArray(images) || images.length === 0) {
    return res.status(400).json({ ok: false, error: "MISSING_IMAGES" });
  }

  try {
    const safePid = sanitizePathSegment(productId);
    const uploaded = [];

    for (let i = 0; i < images.length; i++) {
      const img = images[i] || {};
      const name = sanitizePathSegment(img.name || `image_${i}.jpg`);
      const b64 = String(img.content || "").replace(/^data:.*?;base64,/, "").replace(/\s+/g, "");
      if (!b64) continue;

      // sempre gerar nome único pra evitar conflito
      const filename = `${Date.now()}_${i}_${name}`;
      const relPath = `products/${safePid}/${filename}`;

      const putUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${relPath}`;
      const body = {
        message: `Add image ${filename} (product ${safePid})`,
        content: b64,
        branch: GITHUB_BRANCH,
      };

      const { ok, status, data } = await ghPutJson(putUrl, body);
      if (!ok) {
        return res.status(500).json({
          ok: false,
          error: "IMAGE_UPLOAD_FAILED",
          details: { status, message: data?.message, errors: data?.errors, result: data, file: relPath },
        });
      }

      // raw url (funciona se repo for público)
      const rawUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/${relPath}`;
      uploaded.push(rawUrl);
    }

    return res.json({ ok: true, urls: uploaded });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

// ====== START ======
const port = process.env.PORT || 10000;
app.listen(port, () => console.log("Server running on port", port));
