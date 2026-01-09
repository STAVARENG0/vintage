import express from "express";
import morgan from "morgan";
import dotenv from "dotenv";

import {
  extractOrderIdFromWebhook,
  getOrderDetails,
  extractPurchasedSkusFromOrder
} from "./paypal.js";

import { removeProductsBySku } from "./store.js";

dotenv.config();

const app = express();

app.use(express.json());
app.use(morgan("dev"));

// Health check (Render usa isso)
app.get("/health", (req, res) => {
  res.status(200).send("ok");
});

// ✅ WEBHOOK DO PAYPAL
app.post("/webhooks/paypal", async (req, res) => {
  try {
    const event = req.body;

    console.log("📩 PayPal webhook recebido:", event.event_type);

    // Só processa pagamento concluído
    if (event.event_type !== "PAYMENT.CAPTURE.COMPLETED") {
      return res.status(200).send("ignored");
    }

    const orderId = extractOrderIdFromWebhook(event);
    if (!orderId) {
      console.error("❌ Order ID não encontrado");
      return res.status(400).send("no order id");
    }

    const order = await getOrderDetails(orderId);
    const items = extractPurchasedSkusFromOrder(order);

    for (const item of items) {
      await removeProductsBySku(item.sku, item.qty);
      console.log(`🗑 Produto removido: ${item.sku}`);
    }

    // ⚠️ ESSENCIAL: responder 200
    res.status(200).send("ok");

  } catch (err) {
    console.error("🔥 Erro no webhook:", err);
    res.status(500).send("error");
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
