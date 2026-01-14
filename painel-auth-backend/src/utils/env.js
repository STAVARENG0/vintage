import dotenv from 'dotenv';

dotenv.config();

export function getEnv(name, { required = true, defaultValue = undefined } = {}) {
  const v = process.env[name] ?? defaultValue;
  if (required && (v === undefined || v === null || v === '')) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return v;
}

export function getEnvInt(name, { required = true, defaultValue = undefined } = {}) {
  const raw = process.env[name];
  const val = (raw === undefined || raw === '') ? defaultValue : raw;
  if (required && (val === undefined || val === null || val === '')) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  const n = Number(val);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid integer for env ${name}: ${val}`);
  }
  return n;
}

export function getEnvBool(name, { defaultValue = false } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).toLowerCase());
}

export function getCorsOrigins() {
  const raw = process.env.CORS_ORIGINS || '';
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}
