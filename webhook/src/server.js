import express from 'express';
import morgan from 'morgan';
import dotenv from 'dotenv';

import {
  verifyWebhookSignature,
  extractOrderIdFromWebhook,
  getOrderDetails
} from './paypal.js';

import { hasProcessed, markProcessed } from './store.js';
import { removeProductsById } from './products.js';

dotenv.config();

const app = express();

// ⚠️ PayPal exige o RAW body
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

app.use(morgan('dev'));

app.get('/health', (_, res) => res.send('ok'));

app.post('/webhooks/paypal', async (req, res) => {
  try {
    // 1️⃣ Verifica assinatura PayPal
    const isValid = await verifyWebhookSignature(req.headers, req.body);
    if (!isValid) {
      return res.status(400).send('Invalid signature');
    }

    const eventId = req.body.id;

    // 2️⃣ Evita processar o mesmo evento duas vezes
    if (await hasProcessed(eventId)) {
      return res.status(200).send('Already processed');
    }

    // 3️⃣ Extrai orderId do webhook
    const orderId = extractOrderIdFromWebhook(req.body);
    if (!orderId) {
      return res.status(400).send('Order ID not found');
    }

    // 4️⃣ Busca detalhes da order no PayPal
    const order = await getOrderDetails(orderId);

    // 🔥 5️⃣ EXTRAI IDs DOS PRODUTOS VIA reference_id
    const ids = Array.isArray(order?.purchase_units)
      ? order.purchase_units
          .map(pu => pu.reference_id)
          .filter(Boolean)
      : [];

    if (!ids.length) {
      console.warn('⚠️ No product reference_id found in order');
      return res.status(200).send('No products to process');
    }

    // 6️⃣ Remove produtos do products.json (GitHub)
    await removeProductsById(ids);

    // 7️⃣ Marca evento como processado
    await markProcessed(eventId, { orderId, ids });

    res.send('OK');
  } catch (err) {
    console.error('❌ Webhook error:', err);
    res.status(500).send('Webhook error');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
