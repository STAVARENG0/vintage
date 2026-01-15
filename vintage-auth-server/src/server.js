require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const path = require("path");

const { ensureDbReady } = require("./services/db");
const { errorHandler, notFound } = require("./middleware/errors");
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/user");
const cartRoutes = require("./routes/cart");
const bonusRoutes = require("./routes/bonus");
const checkoutRoutes = require("./routes/checkout");

const app = express();

app.set("trust proxy", 1);

// CORS global (API – JSON)
app.use(
  cors({
    origin: process.env.CORS_ORIGIN === "*" ? "*" : (process.env.CORS_ORIGIN || "*"),
    credentials: true
  })
);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

/**
 * ✅ CORS LIBERADO MANUALMENTE PARA ARQUIVOS ESTÁTICOS (IMAGENS)
 * ISSO RESOLVE DEFINITIVAMENTE O ERRO NotSameOrigin
 */
const uploadDir = process.env.UPLOAD_DIR || "uploads";
app.use(
  "/uploads",
  express.static(path.join(process.cwd(), uploadDir), {
    setHeaders: (res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET");
    }
  })
);

app.get("/health", async (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// Rotas da API
app.use("/auth", authRoutes);
app.use("/user", userRoutes);
app.use("/cart", cartRoutes);
app.use("/bonus", bonusRoutes);
app.use("/checkout", checkoutRoutes);

// Middlewares finais
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 8080;

ensureDbReady()
  .then(() => {
    app.listen(PORT, () => console.log(`API running on :${PORT}`));
  })
  .catch((e) => {
    console.error("DB connection failed:", e);
    process.exit(1);
  });
