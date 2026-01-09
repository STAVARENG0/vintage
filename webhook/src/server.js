import express from "express";
import morgan from "morgan";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(express.json());
app.use(morgan("dev"));

app.get("/health", (req, res) => {
  res.status(200).send("ok");
});

// 👉 aqui depois entram os webhooks do PayPal
// app.post("/webhooks/paypal", ...);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
