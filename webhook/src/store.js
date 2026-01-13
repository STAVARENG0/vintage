import fs from 'node:fs/promises';

const DATA_DIR = new URL('../data/', import.meta.url);
const FILE = new URL('./processed.json', DATA_DIR);

async function ensureFile() {
  try {
    await fs.access(FILE);
  } catch {
    await fs.mkdir(new URL('.', FILE), { recursive: true }).catch(() => {});
    await fs.writeFile(FILE, JSON.stringify({ processed: {} }, null, 2));
  }
}

export async function hasProcessed(key) {
  await ensureFile();
  const raw = await fs.readFile(FILE, 'utf8');
  const data = JSON.parse(raw || '{"processed":{}}');
  return Boolean(data.processed?.[key]);
}

export async function markProcessed(key, meta = {}) {
  await ensureFile();
  const raw = await fs.readFile(FILE, 'utf8');
  const data = JSON.parse(raw || '{"processed":{}}');
  if (!data.processed) data.processed = {};
  data.processed[key] = { at: new Date().toISOString(), ...meta };
  await fs.writeFile(FILE, JSON.stringify(data, null, 2));
}
