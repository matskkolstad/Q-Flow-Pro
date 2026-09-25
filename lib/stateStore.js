import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// QFLOW_DATA_DIR lets systemd/tests keep the database outside the source tree.
const DATA_DIR = process.env.QFLOW_DATA_DIR
  ? path.resolve(process.env.QFLOW_DATA_DIR)
  : path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'qflow.db');
const JSON_FALLBACK = path.join(__dirname, '..', 'db.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
// How many backup files to keep (newest first). BACKUP_RETENTION_DAYS also removes old ones.
const BACKUP_KEEP = Math.max(1, Number(process.env.BACKUP_KEEP || 14));
const SQLITE_HEADER = Buffer.from('SQLite format 3\0', 'latin1');

let dbInstance;

// kv holds the live state (settings, users, live queue) as one JSON document.
// ticket_history holds every finished ticket for statistics.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS ticket_history (
    id TEXT PRIMARY KEY,
    number TEXT NOT NULL,
    service_id TEXT,
    service_name TEXT,
    counter_id TEXT,
    counter_name TEXT,
    status TEXT NOT NULL,
    source TEXT,
    day TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    called_at INTEGER,
    finished_at INTEGER,
    recall_count INTEGER DEFAULT 0,
    transferred_from TEXT,
    served_by TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_history_day ON ticket_history(day);
`;

export const getDb = () => {
  if (dbInstance) return dbInstance;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  dbInstance = new Database(DB_PATH);
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.exec(SCHEMA);
  return dbInstance;
};

// Closing checkpoints the write-ahead log into qflow.db, so the file alone is a complete copy.
export const closeDb = () => {
  if (!dbInstance) return;
  dbInstance.close();
  dbInstance = undefined;
};

export const getDbPath = () => DB_PATH;
export const getDataDir = () => DATA_DIR;
export const getBackupDir = () => BACKUP_DIR;

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
  const payload = JSON.stringify(state || {});
  db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('state', payload);
  return state;
};

const pruneBackups = () => {
  const files = listBackups();
  files.slice(BACKUP_KEEP).forEach((f) => {
    try { fs.unlinkSync(path.join(BACKUP_DIR, f.file)); } catch { /* ignore */ }
  });
};

// Consistent online backup (SQLite backup API), safe while the server is writing.
export const backupDatabase = async (label = 'backup') => {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeLabel = String(label).replace(/[^a-z0-9-]/gi, '').slice(0, 20) || 'backup';
  const name = `qflow-${safeLabel}-${stamp}.db`;
  await getDb().backup(path.join(BACKUP_DIR, name));
  pruneBackups();
  return name;
};

export const listBackups = () => {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.db'))
    .map(f => {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      return { file: f, mtime: stat.mtimeMs, size: stat.size };
    })
    .sort((a, b) => b.mtime - a.mtime);
};

export const isValidBackupName = (name) => typeof name === 'string'
  && /^[A-Za-z0-9._-]+\.db$/.test(name)
  && !name.includes('..');

export const backupPath = (name) => {
  if (!isValidBackupName(name)) return null;
  const target = path.join(BACKUP_DIR, name);
  if (!target.startsWith(BACKUP_DIR + path.sep)) return null;
  return fs.existsSync(target) ? target : null;
};

// Reads the state and ticket history from a backup file without touching the live database.
export const readBackup = (file) => {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const row = db.prepare("SELECT value FROM kv WHERE key = 'state'").get();
    if (!row?.value) throw new Error('backup_has_no_state');
    const state = JSON.parse(row.value);
    const hasHistory = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ticket_history'").get();
    const history = hasHistory ? db.prepare('SELECT * FROM ticket_history').all() : [];
    return { state, history };
  } finally {
    db.close();
  }
};

export const replaceHistory = (rows) => {
  const db = getDb();
  const columns = ['id', 'number', 'service_id', 'service_name', 'counter_id', 'counter_name', 'status', 'source', 'day',
    'created_at', 'called_at', 'finished_at', 'recall_count', 'transferred_from', 'served_by'];
  const insert = db.prepare(`INSERT OR REPLACE INTO ticket_history (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`);
  db.transaction(() => {
    db.prepare('DELETE FROM ticket_history').run();
    rows.forEach((row) => insert.run(...columns.map((c) => row[c] ?? null)));
  })();
};

// Stores an uploaded backup after checking that it is a Q-Flow SQLite database.
export const saveUploadedBackup = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.byteLength < 100 || !buffer.subarray(0, 16).equals(SQLITE_HEADER)) {
    throw new Error('not_a_sqlite_database');
  }
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const name = `qflow-upload-${stamp}.db`;
  const target = path.join(BACKUP_DIR, name);
  fs.writeFileSync(target, buffer);
  try {
    readBackup(target);
  } catch (err) {
    fs.unlinkSync(target);
    throw new Error('not_a_qflow_backup');
  }
  pruneBackups();
  return name;
};
