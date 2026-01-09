import fs from 'node:fs/promises';
import path from 'node:path';

const PRODUCTS_FILE = path.resolve(process.cwd(), 'products.json');

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
