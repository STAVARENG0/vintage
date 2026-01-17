const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const path = require("path");
const rateLimit = require("express-rate-limit");
const passport = require("passport");

require("./auth/google.strategy");
const { cfg } = require("./config");
const { ping } = require("./db");

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/user");
const bonusRoutes = require("./routes/bonus");   // ✅ BONUS
const cartRoutes = require("./routes/cart");     // ✅ CART
const checkoutRoutes = require("./routes/checkout"); // ✅ CHECKOUT

const app = express();

app.set("trust proxy", 1);

// Helmet
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

app.use(express.json({ limit: "200kb" }));
app.use(passport.initialize());

// Rate limit
const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});
app.use(limiter);

// CORS
const allowedOrigins = [
  "https://vintage-clothes.ie",
  "https://www.vintage-clothes.ie",
  "http://localhost:3000",
  "http://127.0.0.1:5500",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("CORS blocked: " + origin));
    },
    credentials: true,
  })
);

// Uploads
const uploadsRoot = process.env.UPLOAD_DIR || "uploads";

app.use(
  "/uploads",
  express.static(path.join(process.cwd(), uploadsRoot), {
    setHeaders: (res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET");
    },
  })
);

// Health
app.get("/health", async (req, res) => {
  try {
    await ping();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, message: "DB connection failed" });
  }
});

// 🔥 ROTAS REGISTRADAS CORRETAMENTE
app.use("/auth", authRoutes);
app.use("/user", userRoutes);
app.use("/bonus", bonusRoutes);
app.use("/cart", cartRoutes);
app.use("/checkout", checkoutRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({ message: "Not found" });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Server error" });
});

// Start server
const PORT = process.env.PORT || 8080;

app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 API running on:", PORT);
});
