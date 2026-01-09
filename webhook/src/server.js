import express from 'express';
import morgan from 'morgan';
import dotenv from 'dotenv';

import { verifyWebhookSignature, extractOrderIdFromWebhook, getOrderDetails, extractPurchasedSkusFromOrder } from './paypal.js';
import { hasProcessed, markProcessed } from './store.js';
import { removeProductsBySku } from './products.js';

dotenv.config();

const app = express();

// ⚠️ PayPal exige o RAW body
app.use(express.json({ verify: (req, res, buf) => {
  req.rawBody = buf.toString();
}}));

app.use(morgan('dev'));

app.get('/health', (_, res) => res.send('ok'));

app.post('/webhooks/paypal', async (req, res) => {
  try {
    const isValid = await verifyWebhookSignature(req.headers, req.body);
    if (!isValid) {
      return res.status(400).send('Invalid signature');
    }

    const eventId = req.body.id;
    if (await hasProcessed(eventId)) {
      return res.status(200).send('Already processed');
    }

    const orderId = extractOrderIdFromWebhook(req.body);
    if (!orderId) {
      return res.status(400).send('Order ID not found');
    }

    const order = await getOrderDetails(orderId);
    const items = extractPurchasedSkusFromOrder(order);
    const skus = items.map(i => i.sku);

    // 👉 AQUI O PRODUTO SOME
    await removeProductsBySku(skus);

    await markProcessed(eventId, { orderId, skus });

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
