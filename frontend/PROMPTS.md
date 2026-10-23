# TrustVault — AI Collaboration & Defect Remediation Log

This log records genuine defects, unsafe assumptions, and architectural limitations identified during development and how they were corrected.

---

### Entry 1: Authorization Bypass on Administrator Role
- **Date:** 2026-10-20
- **Prompt:** "Write the authorization check for canReadDocument including the administrator role."
- **AI-Generated Output:** Allowed platform administrators automatic read access to all documents (`if (user.role === 'ADMINISTRATOR') return true;`).
- **Defect Identified:** Violates the Zero-Trust security requirement: administrators must manage users and inspect audit logs, but must NOT automatically read confidential document contents without an explicit grant from the owner.
- **Correction Applied:** Removed the administrator bypass in `authz.service.ts`. Reading document contents strictly requires ownership or an active grant in `document_permissions`.

---

### Entry 2: Stale Permission Caching & Revocation Delay
- **Date:** 2026-10-21
- **Prompt:** "How should we implement fast document downloads for authorized users?"
- **AI-Generated Output:** Suggested generating 1-hour pre-signed AWS S3 download URLs.
- **Defect Identified:** Pre-signed URLs introduce a stale permission window: if access is revoked 10 seconds later, the user retains access for the remainder of the hour.
- **Correction Applied:** Implemented an authenticated server-side download streaming endpoint (`GET /api/documents/:id/download`) that queries the live PostgreSQL permissions on every request before streaming bytes.

---

### Entry 3: Express 5 Route Parameter Type Mismatches
- **Date:** 2026-10-22
- **Prompt:** "Connect the document download and permission routes."
- **AI-Generated Output:** Directly passed `req.params.id` into database queries and the audit logger.
- **Defect Identified:** Express 5 types infer route parameters as `string | string[]`, causing TypeScript compilation errors when passed to database and audit functions expecting `string`.
- **Correction Applied:** Explicitly normalized parameters using `String(req.params.id)` across all route handlers.

---

### Entry 4: CORS Credentials and Direct API Communication
- **Date:** 2026-10-22
- **Prompt:** "Configure Axios in the React frontend to communicate with Express."
- **AI-Generated Output:** Sent requests to relative paths (`/api/auth/login`) without explicit origin or credential headers.
- **Defect Identified:** Resulted in `Network Error` because browser cookies were not included in cross-origin requests between port 5173 and port 4000.
- **Correction Applied:** Configured `axios.defaults.baseURL = 'http://localhost:4000'` and `axios.defaults.withCredentials = true`, and configured Express CORS with `origin: 'http://localhost:5173'` and `credentials: true`.