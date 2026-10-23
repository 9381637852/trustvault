import { pool } from '../db/index.js';

export class AuthorizationService {
  // Check if user has permission to read/download
  static async canReadDocument(userId: string, documentId: string): Promise<boolean> {
    const query = `
      SELECT d.owner_id, dp.permission_level
      FROM documents d
      LEFT JOIN document_permissions dp ON d.id = dp.document_id AND dp.user_id = $1
      WHERE d.id = $2
    `;
    const res = await pool.query(query, [userId, documentId]);
    if (res.rows.length === 0) return false;

    const row = res.rows[0];
    if (row.owner_id === userId) return true;
    if (row.permission_level === 'READ' || row.permission_level === 'EDIT') return true;

    return false;
  }

  // Check if user is the document owner
  static async canManageDocument(userId: string, documentId: string): Promise<boolean> {
    const res = await pool.query('SELECT owner_id FROM documents WHERE id = $1', [documentId]);
    if (res.rows.length === 0) return false;
    return res.rows[0].owner_id === userId;
  }
}