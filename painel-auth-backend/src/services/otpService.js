import bcrypt from 'bcryptjs';
import Twilio from 'twilio';
import { pool } from '../db/pool.js';
import { getEnvBool, getEnvInt } from '../utils/env.js';

function genCode() {
  // 6 dígitos
  return String(Math.floor(100000 + Math.random() * 900000));
}

function twilioClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  return Twilio(sid, token);
}

export async function createOtp({ identity, identityType }) {
  const ttl = getEnvInt('OTP_TTL_MINUTES', { required: false, defaultValue: 10 });
  const code = genCode();
  const code_hash = await bcrypt.hash(code, 10);
  const expires_at = new Date(Date.now() + ttl * 60 * 1000);

  await pool.query(
    `INSERT INTO otp_codes (identity, identity_type, code_hash, expires_at)
     VALUES (:identity, :identityType, :code_hash, :expires_at)`,
    { identity, identityType, code_hash, expires_at }
  );

  const debugReturn = getEnvBool('OTP_DEBUG_RETURN_CODE', { defaultValue: process.env.NODE_ENV !== 'production' });

  // Envio SMS só se for phone e Twilio configurado
  if (identityType === 'phone') {
    const from = process.env.TWILIO_FROM_NUMBER;
    const client = twilioClient();

    if (!client || !from) {
      if (!debugReturn) {
        throw new Error('Twilio não configurado (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM_NUMBER)');
      }
      return { sent: false, code };
    }

    await client.messages.create({
      from,
      to: identity,
      body: `Seu código de acesso é: ${code}`
    });

    return { sent: true, code: debugReturn ? code : undefined };
  }

  // Email OTP pode ser implementado aqui se quiser (SendGrid, Resend etc)
  return { sent: false, code };
}

export async function verifyOtp({ identity, identityType, code }) {
  // Pega o último código não consumido e não expirado
  const [rows] = await pool.query(
    `SELECT * FROM otp_codes
     WHERE identity = :identity AND identity_type = :identityType
       AND consumed_at IS NULL
       AND expires_at > NOW()
     ORDER BY id DESC
     LIMIT 1`,
    { identity, identityType }
  );

  const otp = rows[0];
  if (!otp) return { ok: false, reason: 'not_found_or_expired' };

  const ok = await bcrypt.compare(String(code), otp.code_hash);
  if (!ok) return { ok: false, reason: 'invalid_code' };

  await pool.query('UPDATE otp_codes SET consumed_at = NOW() WHERE id = :id', { id: otp.id });
  return { ok: true };
}
