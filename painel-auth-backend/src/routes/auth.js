import express from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

import { issueJwt } from '../middleware/auth.js';
import { pool } from "../db/pool.js";
import { createOtp, verifyOtp } from '../services/otpService.js';
import { verifyGoogleIdToken } from '../services/googleService.js';
import {
  createUser,
  findUserByEmail,
  findUserByPhone,
  findUserByGoogleSub,
  sanitizeUser,
  setVerified,
  verifyPassword
} from '../services/userService.js';

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false
});

router.use(authLimiter);

router.post('/register/password', async (req, res, next) => {
  try {
    const schema = z.object({
      name: z.string().min(2).max(120),
      email: z.string().email().max(190),
      password: z.string().min(6).max(80)
    });

    const { name, email, password } = schema.parse(req.body);
    const existing = await findUserByEmail(email);
    if (existing) return res.status(409).json({ error: 'email_in_use' });

    const user = await createUser({ name, email, password, is_verified: 0 });
    return res.status(201).json({ user: sanitizeUser(user), message: 'created' });
  } catch (e) {
    next(e);
  }
});

router.post('/login/password', async (req, res, next) => {
  try {
    const schema = z.object({
      email: z.string().email().max(190),
      password: z.string().min(1).max(80)
    });
    const { email, password } = schema.parse(req.body);

    const user = await findUserByEmail(email);
    if (!user) return res.status(401).json({ error: 'invalid_credentials' });

    const ok = await verifyPassword(user, password);
    if (!ok) return res.status(401).json({ error: 'invalid_credentials' });

    if (!user.is_verified) {
      return res.status(403).json({ error: 'not_verified' });
    }

    const token = issueJwt(user);
    return res.json({ token, user: sanitizeUser(user) });
  } catch (e) {
    next(e);
  }
});

router.post('/login/otp/request', async (req, res, next) => {
  try {
    const schema = z.object({
      phone: z.string().min(6).max(40)
    });
    const { phone } = schema.parse(req.body);

    const result = await createOtp({ identity: phone, identityType: 'phone' });
    return res.json({ sent: result.sent, ...(result.code ? { code: result.code } : {}) });
  } catch (e) {
    next(e);
  }
});

router.post('/login/otp/verify', async (req, res, next) => {
  try {
    const schema = z.object({
      phone: z.string().min(6).max(40),
      code: z.string().min(4).max(10),
      name: z.string().min(2).max(120).optional()
    });
    const { phone, code, name } = schema.parse(req.body);

    const v = await verifyOtp({ identity: phone, identityType: 'phone', code });
    if (!v.ok) return res.status(401).json({ error: 'invalid_code', reason: v.reason });

    let user = await findUserByPhone(phone);
    if (!user) {
      user = await createUser({ name: name || 'Cliente', phone, is_verified: 1 });
    } else if (!user.is_verified) {
      await setVerified(user.id, true);
      user.is_verified = 1;
    }

    const token = issueJwt(user);
    return res.json({ token, user: sanitizeUser(user) });
  } catch (e) {
    next(e);
  }
});

router.post('/login/google', async (req, res, next) => {
  try {
    const schema = z.object({ idToken: z.string().min(20) });
    const { idToken } = schema.parse(req.body);

    const info = await verifyGoogleIdToken(idToken);

    let user = await findUserByGoogleSub(info.sub);
    if (!user && info.email) {
      // se já existe conta com email, conecta
      user = await findUserByEmail(info.email);
      if (user && !user.google_sub) {
        // vincula google_sub
        await pool.query(
          'UPDATE users SET google_sub = :sub, is_verified = 1 WHERE id = :id',
          { sub: info.sub, id: user.id }
        );
        user.google_sub = info.sub;
        user.is_verified = 1;
      }
    }

    if (!user) {
      user = await createUser({
        name: info.name || 'Cliente',
        email: info.email,
        google_sub: info.sub,
        is_verified: 1
      });
    }

    if (!user.is_verified) {
      await setVerified(user.id, true);
      user.is_verified = 1;
    }

    const token = issueJwt(user);
    return res.json({ token, user: sanitizeUser(user) });
  } catch (e) {
    next(e);
  }
});

export default router;
