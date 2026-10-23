import crypto from 'crypto';
import { pool } from '../db/index.js';

export interface AuditEventInput {
  actorId: string | null;
  action: string;
  targetResourceType: string;
  targetResourceId: string | null;
  outcome: 'SUCCESS' | 'DENIED' | 'FAILED';
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export class AuditService {
  static async record(input: AuditEventInput): Promise<string> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const latestRes = await client.query(
        'SELECT sequence_number, current_hash FROM audit_events ORDER BY sequence_number DESC LIMIT 1 FOR UPDATE'
      );

      const latest = latestRes.rows[0];
      const previousHash = latest ? latest.current_hash : '0'.repeat(64);
      const nextSequence = latest ? BigInt(latest.sequence_number) + 1n : 1n;

      const eventId = crypto.randomUUID();
      const timestamp = new Date().toISOString();
      const sanitizedDetails = input.details || {};

      // Deterministic hash linking
      const payloadToHash = JSON.stringify({
        sequenceNumber: nextSequence.toString(),
        eventId,
        timestamp,
        actorId: input.actorId,
        action: input.action,
        targetResourceType: input.targetResourceType,
        targetResourceId: input.targetResourceId,
        outcome: input.outcome,
        previousHash,
      });

      const currentHash = crypto.createHash('sha256').update(payloadToHash).digest('hex');

      await client.query(
        `INSERT INTO audit_events (
          sequence_number, event_id, timestamp, actor_id, action,
          target_resource_type, target_resource_id, outcome, details,
          ip_address, user_agent, previous_hash, current_hash
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          nextSequence.toString(),
          eventId,
          timestamp,
          input.actorId,
          input.action,
          input.targetResourceType,
          input.targetResourceId,
          input.outcome,
          JSON.stringify(sanitizedDetails),
          input.ipAddress || '127.0.0.1',
          input.userAgent || 'UNKNOWN',
          previousHash,
          currentHash,
        ]
      );

      await client.query('COMMIT');
      return eventId;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Audit recording error:', err);
      return '';
    } finally {
      client.release();
    }
  }
}