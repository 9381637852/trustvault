import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { pool } from '../db/index.js';
import { StorageService } from '../services/storage.service.js';
import { AuthorizationService } from '../services/authz.service.js';
import { AuditService } from '../services/audit.service.js';

const router = Router();
const upload = multer({ dest: './uploads/tmp' });
StorageService.init();

// Helper to get authenticated user from session cookie
async function getAuthUser(req: any) {
  const sessionId = req.cookies ? req.cookies['trustvault_session'] : undefined;
  if (!sessionId) return null;

  const res = await pool.query(
    `SELECT u.id, u.email, u.full_name, u.role 
     FROM sessions s 
     JOIN users u ON s.user_id = u.id 
     WHERE s.id = $1 AND s.expires_at > CURRENT_TIMESTAMP`,
    [sessionId]
  );
  return res.rows[0] || null;
}

// 1. LIST ACCESSIBLE DOCUMENTS
router.get('/', async (req: any, res: any) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const query = `
    SELECT DISTINCT d.id, d.title, d.original_filename, d.size_bytes, d.category, d.created_at,
           u.full_name as owner_name,
           CASE WHEN d.owner_id = $1 THEN 'OWNER' ELSE dp.permission_level END as permission
    FROM documents d
    JOIN users u ON d.owner_id = u.id
    LEFT JOIN document_permissions dp ON d.id = dp.document_id AND dp.user_id = $1
    WHERE d.owner_id = $1 OR dp.user_id = $1
    ORDER BY d.created_at DESC
  `;

  const results = await pool.query(query, [user.id]);
  return res.json({ documents: results.rows });
});

// 2. UPLOAD DOCUMENT
router.post('/upload', upload.single('file') as any, async (req: any, res: any) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  if (user.role === 'VIEWER') {
    return res.status(403).json({ error: 'Viewers cannot upload documents' });
  }

  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'No file selected' });
  }

  try {
    const { storagePath, sha256Checksum, sizeBytes } = await StorageService.storeFile(
      file.path,
      file.originalname
    );

    const title = String(req.body.title || file.originalname);
    const category = String(req.body.category || 'GENERAL');

    const insertRes = await pool.query(
      `INSERT INTO documents (
        title, original_filename, storage_path, mime_type, size_bytes, sha256_checksum, owner_id, category
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [title, file.originalname, storagePath, file.mimetype || 'application/octet-stream', sizeBytes, sha256Checksum, user.id, category]
    );

    const docId = String(insertRes.rows[0].id);

    await AuditService.record({
      actorId: user.id,
      action: 'DOCUMENT_UPLOAD',
      targetResourceType: 'DOCUMENT',
      targetResourceId: docId,
      outcome: 'SUCCESS',
      details: { title, filename: file.originalname },
    });

    return res.status(201).json({ id: docId, message: 'Document uploaded securely' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

// 3. DOWNLOAD DOCUMENT (Live Revocation Check)
router.get('/:id/download', async (req: any, res: any) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // Fix: Explicitly ensure docId is a single string
  const docId = String(req.params.id);
  const canRead = await AuthorizationService.canReadDocument(user.id, docId);

  if (!canRead) {
    await AuditService.record({
      actorId: user.id,
      action: 'DOWNLOAD_DENIED',
      targetResourceType: 'DOCUMENT',
      targetResourceId: docId,
      outcome: 'DENIED',
    });
    return res.status(404).json({ error: 'Document not found' });
  }

  const docRes = await pool.query('SELECT * FROM documents WHERE id = $1', [docId]);
  if (docRes.rows.length === 0) {
    return res.status(404).json({ error: 'Document not found' });
  }

  const doc = docRes.rows[0];
  const filePath = path.resolve(StorageService.getFilePath(doc.storage_path));

  await AuditService.record({
    actorId: user.id,
    action: 'DOCUMENT_DOWNLOAD',
    targetResourceType: 'DOCUMENT',
    targetResourceId: docId,
    outcome: 'SUCCESS',
  });

  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.original_filename)}"`);
  res.setHeader('Content-Type', doc.mime_type);
  res.sendFile(filePath);
});

// 4. SHARE PERMISSION WITH BOB
router.post('/:id/share', async (req: any, res: any) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // Fix: Explicitly ensure docId is a single string
  const docId = String(req.params.id);
  const targetEmail = String(req.body.targetEmail);
  const permissionLevel = String(req.body.permissionLevel || 'READ');

  const canManage = await AuthorizationService.canManageDocument(user.id, docId);
  if (!canManage) {
    return res.status(403).json({ error: 'Only the document owner can grant permissions' });
  }

  const targetRes = await pool.query('SELECT id FROM users WHERE email = $1', [targetEmail]);
  if (targetRes.rows.length === 0) {
    return res.status(404).json({ error: 'User with that email does not exist' });
  }

  const targetUserId = targetRes.rows[0].id;

  await pool.query(
    `INSERT INTO document_permissions (document_id, user_id, permission_level, granted_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (document_id, user_id) DO UPDATE SET permission_level = $3`,
    [docId, targetUserId, permissionLevel, user.id]
  );

  await AuditService.record({
    actorId: user.id,
    action: 'PERMISSION_GRANTED',
    targetResourceType: 'DOCUMENT',
    targetResourceId: docId,
    outcome: 'SUCCESS',
    details: { targetEmail, permissionLevel },
  });

  return res.json({ message: `Access granted to ${targetEmail}` });
});

// 5. REVOKE PERMISSION IMMEDIATELY
router.post('/:id/revoke', async (req: any, res: any) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // Fix: Explicitly ensure docId is a single string
  const docId = String(req.params.id);
  const targetEmail = String(req.body.targetEmail);

  const canManage = await AuthorizationService.canManageDocument(user.id, docId);
  if (!canManage) {
    return res.status(403).json({ error: 'Only the owner can revoke permissions' });
  }

  const targetRes = await pool.query('SELECT id FROM users WHERE email = $1', [targetEmail]);
  if (targetRes.rows.length > 0) {
    await pool.query(
      'DELETE FROM document_permissions WHERE document_id = $1 AND user_id = $2',
      [docId, targetRes.rows[0].id]
    );
  }

  await AuditService.record({
    actorId: user.id,
    action: 'PERMISSION_REVOKED',
    targetResourceType: 'DOCUMENT',
    targetResourceId: docId,
    outcome: 'SUCCESS',
    details: { targetEmail },
  });

  return res.json({ message: `Access revoked from ${targetEmail}` });
});

export default router;