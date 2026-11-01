import { Router } from 'express';
import jwt from 'jsonwebtoken';
import verifyToken from '../../middleware/jwt';

const router = Router();

router.post('/session', verifyToken, (req: any, res) => {
  const email = req.headers['x-actor-email'] as string | undefined;

  if (!email) return res.status(400).json({ error: 'No email claim' });

  const ssoToken = jwt.sign(
    { email },
    process.env.SUPERSET_SSO_JWT_SECRET!,
    { expiresIn: '8h' },
  );

  res.cookie('superset_sso', ssoToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/superset',
    maxAge: 8 * 60 * 60 * 1000,
  });

  res.json({ ok: true });
});

export default router;
