import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let dbPath = path.join(dataDir, 'hrms.sqlite');
if (process.env.DATABASE_URL) {
  let rawUrl = process.env.DATABASE_URL;
  if (process.cwd().endsWith('/backend') && rawUrl.startsWith('./backend/')) {
    rawUrl = '.' + rawUrl.slice('./backend'.length);
  }
  let resolved = path.resolve(rawUrl);
  const backendRelative = path.resolve(__dirname, '../../', rawUrl);
  if (!fs.existsSync(resolved) && fs.existsSync(backendRelative)) {
    resolved = backendRelative;
  }
  const targetDir = path.dirname(resolved);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  dbPath = resolved;
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export default db;
