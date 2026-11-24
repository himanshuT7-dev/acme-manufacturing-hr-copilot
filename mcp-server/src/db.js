import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve path to SQLite database in backend/data/hrms.sqlite
const dataDir = path.resolve(__dirname, '../../backend/data');
const defaultDbPath = path.join(dataDir, 'hrms.sqlite');
const dbPath = process.env.DATABASE_URL
  ? path.resolve(process.env.DATABASE_URL)
  : defaultDbPath;

let dbInstance = null;

export function getDatabase() {
  if (!dbInstance) {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    dbInstance = new Database(dbPath);
    dbInstance.pragma('journal_mode = WAL');
    dbInstance.pragma('foreign_keys = ON');
  }
  return dbInstance;
}

/**
 * Normalizes user role ensuring "hr admin" becomes "hr_admin"
 */
export function normalizeRole(role) {
  if (!role) return 'employee';
  const clean = String(role).trim().toLowerCase();
  if (clean === 'hr admin' || clean === 'hr_admin') {
    return 'hr_admin';
  }
  return 'employee';
}

/**
 * Looks up the active user record by email from SQLite.
 * Defaults to 'priya@acme.test' if MCP_USER_EMAIL is not set.
 */
export function getActiveUser(emailOverride = null) {
  const db = getDatabase();
  const email = emailOverride || process.env.MCP_USER_EMAIL || 'priya@acme.test';

  const user = db.prepare(`
    SELECT employee_id, name, email, role, department, shift_start, on_probation
    FROM employees
    WHERE email = ?
  `).get(email);

  if (!user) {
    throw new Error(`Active user not found in SQLite for email: "${email}". Ensure backend is seeded with "npm run seed".`);
  }

  return {
    ...user,
    role: normalizeRole(user.role),
    on_probation: Boolean(user.on_probation)
  };
}

export default {
  getDatabase,
  getActiveUser,
  normalizeRole
};
