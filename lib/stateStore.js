import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'qflow.db');
const JSON_FALLBACK = path.join(__dirname, '..', 'db.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const MAX_BACKUPS = 10;

let dbInstance;

const getDb = () => {
  if (dbInstance) return dbInstance;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  dbInstance = new Database(DB_PATH);
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.exec('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  return dbInstance;
};

export const getDbPath = () => DB_PATH;

export const loadState = (defaultState = {}) => {
  const db = getDb();
  const row = db.prepare('SELECT value FROM kv WHERE key = ?').get('state');
  if (row?.value) {
    try {
      return JSON.parse(row.value);
    } catch (e) {
      console.error('Could not parse state from SQLite, falling back to defaults.', e);
      return { ...defaultState };
    }
  }

  // Migrate from legacy db.json if present
  if (fs.existsSync(JSON_FALLBACK)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(JSON_FALLBACK, 'utf8'));
      saveState(parsed);
      return { ...defaultState, ...parsed };
    } catch (e) {
      console.error('Failed to migrate db.json, using defaults.', e);
    }
  }

  saveState(defaultState);
  return { ...defaultState };
};

export const saveState = (state) => {
  const db = getDb();
  const payload = JSON.stringify(state || {}, null, 2);
  db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('state', payload);
  return state;
};

export const backupDatabase = () => {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(BACKUP_DIR, `qflow-backup-${stamp}.db`);
  // Ensure latest state is flushed before copy
  const db = getDb();
  db.prepare('PRAGMA wal_checkpoint(FULL);').run();
  fs.copyFileSync(DB_PATH, target);

   // Retain only the newest MAX_BACKUPS files
   const files = fs.readdirSync(BACKUP_DIR)
     .filter(f => f.endsWith('.db'))
     .map(f => ({ name: f, time: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
     .sort((a, b) => b.time - a.time);
   files.slice(MAX_BACKUPS).forEach(f => {
     try { fs.unlinkSync(path.join(BACKUP_DIR, f.name)); } catch (e) { /* ignore */ }
   });

  return target;
};

export const listBackups = () => {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.db'))
    .map(f => ({
      file: f,
      path: path.join(BACKUP_DIR, f),
      mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);
};
