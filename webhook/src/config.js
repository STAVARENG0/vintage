import 'dotenv/config';

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT || 8080),

  paypal: {
    mode: (process.env.PAYPAL_MODE || 'sandbox').toLowerCase(),
    clientId: required('PAYPAL_CLIENT_ID'),
    clientSecret: required('PAYPAL_CLIENT_SECRET'),
    webhookId: required('PAYPAL_WEBHOOK_ID')
  },

  github: {
    token: required('GITHUB_TOKEN'),
    repo: required('GITHUB_REPO'), // owner/repo
    branch: (process.env.GITHUB_BRANCH || 'main'),
    productsPath: (process.env.GITHUB_PRODUCTS_PATH || 'products.json'),
    userAgent: process.env.GITHUB_USER_AGENT || 'paypal-github-stock-webhook'
  },

  inventory: {
    removeOnSale: String(process.env.REMOVE_ON_SALE || 'true').toLowerCase() === 'true'
  }
};

if (!['sandbox', 'live'].includes(config.paypal.mode)) {
  throw new Error('PAYPAL_MODE must be "sandbox" or "live"');
}
