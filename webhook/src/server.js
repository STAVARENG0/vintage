import express from 'express';
import morgan from 'morgan';

import { config } from './config.js';
import {
  verifyWebhookSignature,
  extractOrderIdFromWebhook,
  getOrderDetails,
  extractPurchasedSkusFromOrder,
  captureOrder
} from './paypal.js';
import { getProductsFile, applyInventoryChange, updateProductsFile } from './github.js';
import { hasProcessed, markProcessed } from './store.js';

const app = express();
app.use(morgan('dev'));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => {
  res.status(200).json({ ok: true, mode: config.paypal.mode });
});

async function processOrder(orderId, meta = {}) {
  const key = `order:${orderId}`;
  if (await hasProcessed(key)) {
    return { already: true };
  }

  const order = await getOrderDetails(orderId);
  const purchased = extractPurchasedSkusFromOrder(order);

  if (!purchased.length) {
    await markProcessed(key, { ...meta, note: 'No skus found on order' });
    return { updated: false, note: 'No skus found on order (did you set item.sku = productId?)' };
  }

  const { list, sha } = await getProductsFile();
  const { updated, changed } = applyInventoryChange(list, purchased, config.inventory.removeOnSale);

  if (!changed.length) {
    await markProcessed(key, { ...meta, note: 'No matching products for purchased SKUs', purchased });
    return { updated: false, note: 'No matching products in products.json for those SKUs', purchased };
  }

  await updateProductsFile(
    updated,
    sha,
    `Auto inventory update after PayPal order ${orderId}`
  );

  await markProcessed(key, { ...meta, purchased, changed });
  return { updated: true, changed, purchased };
}

// PayPal Webhook Listener
app.post('/webhooks/paypal', async (req, res) => {
  const event = req.body;
  const eventId = event?.id;
  const eventType = event?.event_type;

  try {
    const ok = await verifyWebhookSignature(req.headers, event);
    if (!ok) {
      return res.status(400).json({ ok: false, error: 'Webhook signature verification failed' });
    }

    // Only act on successful capture. You can also subscribe to CHECKOUT.ORDER.APPROVED, but it isn't "money moved" yet.
    const isCaptureCompleted = eventType === 'PAYMENT.CAPTURE.COMPLETED';
    if (!isCaptureCompleted) {
      return res.status(200).json({ ok: true, ignored: true, eventType });
    }

    const orderId = extractOrderIdFromWebhook(event);
    if (!orderId) {
      return res.status(200).json({ ok: true, ignored: true, reason: 'No orderId found in webhook', eventType });
    }

    const result = await processOrder(orderId, { via: 'webhook', eventId, eventType });
    return res.status(200).json({ ok: true, orderId, ...result });
  } catch (e) {
    console.error('Webhook error:', e);
    return res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

// Optional: capture on the server (if you want to change checkout.html to call this instead of actions.order.capture())
app.post('/api/capture-order', async (req, res) => {
  const { orderId } = req.body || {};
  if (!orderId) return res.status(400).json({ ok: false, error: 'orderId is required' });

  try {
    const capture = await captureOrder(orderId);
    // Capture can succeed but webhook is still the source of truth; we also process immediately here.
    const result = await processOrder(orderId, { via: 'api-capture' });
    return res.status(200).json({ ok: true, capture, ...result });
  } catch (e) {
    console.error('capture-order error:', e);
    return res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

app.listen(config.port, () => {
  console.log(`Server running on http://localhost:${config.port}`);
  console.log(`PayPal mode: ${config.paypal.mode}`);
});
