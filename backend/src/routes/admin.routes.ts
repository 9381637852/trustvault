import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { pool } from '../db/index.js';

const router = Router();

// GET AUDIT EVENTS
router.get('/audit', async (_req: Request, res: Response): Promise<void> => {
  const results = await pool.query(
    `SELECT a.*, u.email as actor_email, u.full_name as actor_name
     FROM audit_events a
     LEFT JOIN users u ON a.actor_id = u.id
     ORDER BY a.sequence_number DESC LIMIT 50`
  );
  res.json({ events: results.rows });
});

// VERIFY CRYPTOGRAPHIC CHAIN INTEGRITY
router.get('/audit/verify', async (_req: Request, res: Response): Promise<void> => {
  const resData = await pool.query('SELECT * FROM audit_events ORDER BY sequence_number ASC');
  const rows = resData.rows;

  if (rows.length <= 1) {
    res.json({ valid: true, totalEvents: rows.length });
    return;
  }

  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    const curr = rows[i];

    if (curr.previous_hash !== prev.current_hash) {
      res.json({
        valid: false,
        error: `Broken link between sequence ${prev.sequence_number} and ${curr.sequence_number}`,
        corruptedSequence: curr.sequence_number,
      });
      return;
    }

    const payload = JSON.stringify({
      sequenceNumber: curr.sequence_number.toString(),
      eventId: curr.event_id,
      timestamp: new Date(curr.timestamp).toISOString(),
      actorId: curr.actor_id,
      action: curr.action,
      targetResourceType: curr.target_resource_type,
      targetResourceId: curr.target_resource_id,
      outcome: curr.outcome,
      previousHash: curr.previous_hash,
    });

    const recomputed = crypto.createHash('sha256').update(payload).digest('hex');
    if (recomputed !== curr.current_hash) {
      res.json({
        valid: false,
        error: `Payload tampering detected at sequence ${curr.sequence_number}`,
        corruptedSequence: curr.sequence_number,
      });
      return;
    }
  }

  res.json({ valid: true, totalEvents: rows.length });
});

export default router;