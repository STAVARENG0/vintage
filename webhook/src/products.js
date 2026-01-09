import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// sobe de webhook/src → webhook → raiz → products/products.json
const PRODUCTS_FILE = path.resolve(
  __dirname,
  '../../products/products.json'
);

export async function removeProductsBySku(skus = []) {
  if (!Array.isArray(skus) || skus.length === 0) return;

  const raw = await fs.readFile(PRODUCTS_FILE, 'utf8');
  const products = JSON.parse(raw);

  const remaining = products.filter(
    p => !skus.includes(p.sku)
  );

  await fs.writeFile(
    PRODUCTS_FILE,
    JSON.stringify(remaining, null, 2)
  );

  console.log('🗑️ Products removed:', skus);
}
