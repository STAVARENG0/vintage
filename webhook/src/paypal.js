import { config } from './config.js';

const baseUrl = config.paypal.mode === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

let cachedToken = null;

function basicAuthHeader() {
  const creds = `${config.paypal.clientId}:${config.paypal.clientSecret}`;
  const b64 = Buffer.from(creds, 'utf8').toString('base64');
  return `Basic ${b64}`;
}

export async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 30_000) {
    return cachedToken.token;
  }

  const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' })
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`PayPal token error: HTTP ${res.status} ${txt}`);
  }

  const data = await res.json();
  const expiresIn = Number(data.expires_in || 0);
  cachedToken = {
    token: data.access_token,
    expiresAt: now + Math.max(expiresIn * 1000, 60_000)
  };
  return cachedToken.token;
}

export async function verifyWebhookSignature(headers, webhookEvent) {
  const token = await getAccessToken();

  const payload = {
    auth_algo: headers['paypal-auth-algo'],
    cert_url: headers['paypal-cert-url'],
    transmission_id: headers['paypal-transmission-id'],
    transmission_sig: headers['paypal-transmission-sig'],
    transmission_time: headers['paypal-transmission-time'],
    webhook_id: config.paypal.webhookId,
    webhook_event: webhookEvent
  };

  const res = await fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`PayPal verify error: HTTP ${res.status} ${txt}`);
  }

  const data = await res.json();
  return data.verification_status === 'SUCCESS';
}

/**
 * 🔥 CORRIGIDO: agora o PayPal retorna os ITEMS (custom_id)
 */
export async function getOrderDetails(orderId) {
  const token = await getAccessToken();
  const res = await fetch(`${baseUrl}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation' // 👈 ESSENCIAL
    }
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`PayPal get order error: HTTP ${res.status} ${txt}`);
  }

  return res.json();
}

/**
 * ✅ EXTRAI IDS DOS PRODUTOS COMPRADOS (custom_id)
 */
export function extractPurchasedIdsFromOrder(order) {
  const ids = [];
  const pus = Array.isArray(order?.purchase_units) ? order.purchase_units : [];

  for (const pu of pus) {
    const puItems = Array.isArray(pu?.items) ? pu.items : [];
    for (const it of puItems) {
      const id = (it?.custom_id ?? '').toString().trim();
      if (id) ids.push(id);
    }
  }

  return ids;
}

export function extractOrderIdFromWebhook(event) {
  const r = event?.resource || {};
  const related = r?.supplementary_data?.related_ids || {};
  if (related.order_id) return related.order_id;

  if (event?.resource_type === 'checkout-order' && r?.id) return r.id;

  const up = Array.isArray(r?.links)
    ? r.links.find(l => l?.rel === 'up' && typeof l.href === 'string')
    : null;

  if (up?.href) {
    const m = up.href.match(/\/v2\/checkout\/orders\/([A-Z0-9]+)/i);
    if (m) return m[1];
  }

  return null;
}

export { baseUrl };
