import { config } from './config.js';

function ghHeaders() {
  return {
    'Authorization': `token ${config.github.token}`,
    'Accept': 'application/vnd.github+json',
    'User-Agent': config.github.userAgent
  };
}

export async function getProductsFile() {
  const url = `https://api.github.com/repos/${config.github.repo}/contents/${config.github.productsPath}?ref=${config.github.branch}`;
  const res = await fetch(url, { headers: ghHeaders() });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`GitHub GET products.json failed: HTTP ${res.status} ${txt}`);
  }
  const data = await res.json();
  const content = Buffer.from(data.content || '', 'base64').toString('utf8');
  let list;
  try {
    list = JSON.parse(content || '[]');
  } catch (e) {
    throw new Error(`products.json is not valid JSON: ${e.message}`);
  }
  if (!Array.isArray(list)) list = [];
  return { list, sha: data.sha };
}

export function applyInventoryChange(products, purchased, removeOnSale = true) {
  // purchased: [{ sku, qty }]
  const purchaseMap = new Map();
  for (const p of purchased) {
    const sku = String(p.sku);
    const qty = Number(p.qty || 1);
    purchaseMap.set(sku, (purchaseMap.get(sku) || 0) + (Number.isFinite(qty) && qty > 0 ? qty : 1));
  }

  const updated = [];
  const changed = [];

  for (const prod of products) {
    const id = String(prod?.id ?? '');
    if (!id || !purchaseMap.has(id)) {
      updated.push(prod);
      continue;
    }

    const qty = purchaseMap.get(id);
    const currentStock = Number.isFinite(prod.stock) ? prod.stock : parseInt(String(prod.stock || 0), 10) || 0;
    const newStock = Math.max(0, currentStock - qty);

    if (removeOnSale && newStock <= 0) {
      changed.push({ id, action: 'removed', from: currentStock, to: 0 });
      continue; // remove item
    }

    const next = { ...prod, stock: newStock };
    changed.push({ id, action: 'stock', from: currentStock, to: newStock });
    updated.push(next);
  }

  return { updated, changed };
}

export async function updateProductsFile(newList, sha, commitMessage) {
  const url = `https://api.github.com/repos/${config.github.repo}/contents/${config.github.productsPath}`;
  const body = {
    message: commitMessage,
    branch: config.github.branch,
    content: Buffer.from(JSON.stringify(newList, null, 2), 'utf8').toString('base64'),
    sha
  };

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      ...ghHeaders(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`GitHub PUT products.json failed: HTTP ${res.status} ${txt}`);
  }

  return res.json();
}
