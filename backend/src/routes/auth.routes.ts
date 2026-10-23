import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { pool } from '../db/index.js';
import { AuditService } from '../services/audit.service.js';

const router = Router();

function hashPassword(password: string): string {
  const salt = 'trustvault_secure_salt_2026';
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}

// 1. LOGIN
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const userRes = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  if (userRes.rows.length === 0) {
    await AuditService.record({
      actorId: null,
      action: 'LOGIN_FAILURE',
      targetResourceType: 'USER',
      targetResourceId: email,
      outcome: 'DENIED',
      details: { reason: 'User not found' },
    });
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const user = userRes.rows[0];
  const inputHash = hashPassword(password);

  if (inputHash !== user.password_hash) {
    await AuditService.record({
      actorId: user.id,
      action: 'LOGIN_FAILURE',
      targetResourceType: 'USER',
      targetResourceId: user.id,
      outcome: 'DENIED',
      details: { reason: 'Incorrect password' },
    });
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Create server-side session
  const sessionId = crypto.randomUUID();
  const csrfToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await pool.query(
    'INSERT INTO sessions (id, user_id, csrf_token, expires_at) VALUES ($1, $2, $3, $4)',
    [sessionId, user.id, csrfToken, expiresAt]
  );

  // Set HTTP-only secure session cookie
  res.cookie('trustvault_session', sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000,
  });

  await AuditService.record({
    actorId: user.id,
    action: 'LOGIN_SUCCESS',
    targetResourceType: 'USER',
    targetResourceId: user.id,
    outcome: 'SUCCESS',
  });

  return res.json({
    message: 'Login successful',
    csrfToken,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
    },
  });
});

// 2. GET CURRENT USER (ME)
router.get('/me', async (req: Request, res: Response) => {
  const sessionId = req.cookies['trustvault_session'];
  if (!sessionId) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  const sessionRes = await pool.query(
    `SELECT s.csrf_token, u.id, u.email, u.full_name, u.role
     FROM sessions s
     JOIN users u ON s.user_id = u.id
     WHERE s.id = $1 AND s.expires_at > CURRENT_TIMESTAMP`,
    [sessionId]
  );

  if (sessionRes.rows.length === 0) {
    res.clearCookie('trustvault_session');
    return res.status(401).json({ error: 'Session expired' });
  }

  const row = sessionRes.rows[0];
  return res.json({
    user: {
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      role: row.role,
    },
    csrfToken: row.csrf_token,
  });
});

// 3. LOGOUT
router.post('/logout', async (req: Request, res: Response) => {
  const sessionId = req.cookies['trustvault_session'];
  if (sessionId) {
    await pool.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
  }
  res.clearCookie('trustvault_session');
  return res.json({ message: 'Logged out successfully' });
});

export default router;