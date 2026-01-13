const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { cfg } = require("./config");
const { ping } = require("./db");
const authRoutes = require("./routes/auth");

const app = express();

app.set("trust proxy", 1);

app.use(helmet());
app.use(express.json({ limit: "200kb" }));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});
app.use(limiter);

app.use(cors({
  origin: cfg.frontendOrigin || true,
  credentials: false,
}));

app.get("/health", async (req, res) => {
  try{
    await ping();
    res.json({ ok: true });
  }catch(e){
    res.status(500).json({ ok: false, message: "DB connection failed" });
  }
});

app.use("/auth", authRoutes);

// Basic 404
app.use((req, res) => res.status(404).json({ message: "Not found" }));

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Server error" });
});

app.listen(cfg.port, () => {
  console.log(`Server running on port ${cfg.port}`);
});
