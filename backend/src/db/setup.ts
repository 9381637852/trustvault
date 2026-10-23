import { pool } from './index.js';
import crypto from 'crypto';

// Helper to securely hash passwords using Node's built-in crypto
function hashPassword(password: string): string {
  const salt = 'trustvault_secure_salt_2026';
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}

async function setupDatabase() {
  console.log('⏳ Creating database tables...');

  // 1. Create Tables
  await pool.query(`
    -- 1. Users Table
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      full_name VARCHAR(255) NOT NULL,
      role VARCHAR(32) NOT NULL CHECK (role IN ('ADMINISTRATOR', 'DOCUMENT_OWNER', 'VIEWER')),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- 2. Sessions Table
    CREATE TABLE IF NOT EXISTS sessions (
      id VARCHAR(128) PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      csrf_token VARCHAR(128) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_active_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- 3. Documents Table
    CREATE TABLE IF NOT EXISTS documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(255) NOT NULL,
      original_filename VARCHAR(255) NOT NULL,
      storage_path VARCHAR(512) UNIQUE NOT NULL,
      mime_type VARCHAR(128) NOT NULL,
      size_bytes BIGINT NOT NULL,
      sha256_checksum CHAR(64) NOT NULL,
      owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      category VARCHAR(64) NOT NULL DEFAULT 'GENERAL',
      is_archived BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- 4. Document Permissions Table
    CREATE TABLE IF NOT EXISTS document_permissions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      permission_level VARCHAR(32) NOT NULL CHECK (permission_level IN ('READ', 'EDIT')),
      granted_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_doc_user UNIQUE (document_id, user_id)
    );

    -- 5. Tamper-Evident Audit Trail Table
    CREATE TABLE IF NOT EXISTS audit_events (
      sequence_number BIGSERIAL PRIMARY KEY,
      event_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
      timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
      action VARCHAR(64) NOT NULL,
      target_resource_type VARCHAR(64) NOT NULL,
      target_resource_id VARCHAR(128),
      outcome VARCHAR(16) NOT NULL CHECK (outcome IN ('SUCCESS', 'DENIED', 'FAILED')),
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      ip_address VARCHAR(45) NOT NULL DEFAULT '127.0.0.1',
      user_agent TEXT NOT NULL DEFAULT 'SYSTEM',
      previous_hash CHAR(64) NOT NULL,
      current_hash CHAR(64) NOT NULL
    );
  `);

  console.log('✅ Tables created successfully!');

  // 2. Insert Genesis block for tamper-evident audit trail
  const genesisHash = crypto.createHash('sha256').update('GENESIS_BLOCK_TRUSTVAULT').digest('hex');
  await pool.query(`
    INSERT INTO audit_events (
      sequence_number, event_id, timestamp, actor_id, action,
      target_resource_type, target_resource_id, outcome, details,
      previous_hash, current_hash
    ) VALUES (
      0, '00000000-0000-0000-0000-000000000000', CURRENT_TIMESTAMP, NULL,
      'GENESIS_BLOCK', 'SYSTEM', 'SYSTEM_ROOT', 'SUCCESS',
      '{"info": "TrustVault Cryptographic Chain Initialized"}',
      '0000000000000000000000000000000000000000000000000000000000000000',
      $1
    ) ON CONFLICT (sequence_number) DO NOTHING;
  `, [genesisHash]);

  // 3. Insert Demo Accounts
  console.log('⏳ Inserting demo user accounts...');
  const defaultPassword = hashPassword('Password123!');

  const demoUsers = [
    { email: 'alice@trustvault.local', name: 'Alice (Owner)', role: 'DOCUMENT_OWNER' },
    { email: 'bob@trustvault.local', name: 'Bob (Viewer)', role: 'VIEWER' },
    { email: 'charlie@trustvault.local', name: 'Charlie (Admin)', role: 'ADMINISTRATOR' }
  ];
  
  for (const user of demoUsers) {
    await pool.query(`
      INSERT INTO users (email, password_hash, full_name, role)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (email) DO NOTHING;
    `, [user.email, defaultPassword, user.name, user.role]);
  }

  console.log('🎉 Database setup complete! Alice, Bob, and Charlie are ready to log in.');
  process.exit(0);
}

setupDatabase().catch((err) => {
  console.error('❌ Database setup failed:', err);
  process.exit(1);
});