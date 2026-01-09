import express from 'express';
import morgan from 'morgan';
import dotenv from 'dotenv';

import {
  extractOrderIdFromWebhook,
  getOrderDetails
} from './paypal.js';

import { hasProcessed, markProcessed } from './store.js';
import { removeProductsById } from './products.js';

dotenv.config();

const app = express();

// NÃO usar raw body nem assinatura (PayPal quebra fácil)
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (_, res) => res.send('ok'));

app.post('/webhooks/paypal', async (req, res) => {
  try {
    console.log('🔥 WEBHOOK RECEBIDO:', req.body?.event_type);

    // Só processa pagamento concluído
    if (req.body.event_type !== 'PAYMENT.CAPTURE.COMPLETED') {
      return res.status(200).send('Event ignored');
    }

    const eventId = req.body.id;

    // Evita duplicar
    if (await hasProcessed(eventId)) {
      return res.status(200).send('Already processed');
    }

    // Extrai orderId
    const orderId = extractOrderIdFromWebhook(req.body);
    if (!orderId) {
      console.warn('⚠️ Order ID not found');
      return res.status(200).send('No order');
    }

    // Busca detalhes da order no PayPal
    const order = await getOrderDetails(orderId);

    // 🔥 EXTRAI IDS VIA reference_id
    const ids = Array.isArray(order?.purchase_units)
      ? order.purchase_units
          .map(pu => pu.reference_id)
          .filter(Boolean)
      : [];

    console.log('🧾 IDs pagos:', ids);

    if (!ids.length) {
      console.warn('⚠️ No product reference_id found');
      return res.status(200).send('No products');
    }

    // Remove produto + commit
    await removeProductsById(ids);

    // Marca evento como processado
    await markProcessed(eventId, { orderId, ids });

    console.log('✅ Produto removido e commitado:', ids);
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
