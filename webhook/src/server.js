import express from "express";
import morgan from "morgan";
import dotenv from "dotenv";

import {
  verifyWebhookSignature,
  extractOrderIdFromWebhook,
  getOrderDetails,
  extractPurchasedSkusFromOrder
} from "./paypal.js";

dotenv.config();

const app = express();

app.use(express.json());
app.use(morgan("dev"));

app.get("/health", (req, res) => {
  res.status(200).send("ok");
});

/**
 * 🔔 WEBHOOK PAYPAL (AQUI ESTÁ A CHAVE)
 */
app.post("/webhooks/paypal", async (req, res) => {
  try {
    console.log("🔥 WEBHOOK PAYPAL RECEBIDO");

    const verified = await verifyWebhookSignature(req.headers, req.body);
    if (!verified) {
      console.log("❌ Assinatura inválida");
      return res.sendStatus(400);
    }

    const event = req.body;
    console.log("Evento:", event.event_type);

    // 👉 REGRA DE NEGÓCIO CORRETA
    if (event.event_type !== "PAYMENT.CAPTURE.COMPLETED") {
      return res.sendStatus(200);
    }

    // ❗ NÃO checar status PENDING / ON_HOLD
    const orderId = extractOrderIdFromWebhook(event);
    if (!orderId) {
      console.log("❌ Order ID não encontrado");
      return res.sendStatus(200);
    }

    const order = await getOrderDetails(orderId);
    const items = extractPurchasedSkusFromOrder(order);

    console.log("Itens comprados:", items);

    // 👉 AQUI entra sua lógica real:
    // remove produto do JSON
    // faz commit no GitHub
    // atualiza estoque

    console.log("✅ Produto deve ser removido agora");

    res.sendStatus(200);
  } catch (err) {
    console.error("Erro no webhook:", err);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
