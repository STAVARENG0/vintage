import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { sanitizeUser } from '../services/userService.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  return res.json({ user: sanitizeUser(req.user) });
});

export default router;
