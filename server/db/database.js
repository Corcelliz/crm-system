'use strict';

const { DatabaseSync } = require('node:sqlite');
const { DB_FILE } = require('../config');

const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 3000;');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  name                  TEXT    NOT NULL,
  email                 TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash         TEXT    NOT NULL,
  role                  TEXT    NOT NULL CHECK (role IN ('admin', 'colaborador')),
  title                 TEXT,
  team                  TEXT,
  phone                 TEXT,
  monthly_goal          REAL    NOT NULL DEFAULT 0,
  status                TEXT    NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  must_change_password  INTEGER NOT NULL DEFAULT 0,
  token_version         INTEGER NOT NULL DEFAULT 0,
  last_login_at         TEXT,
  created_at            TEXT    NOT NULL,
  updated_at            TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS clients (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  company       TEXT NOT NULL,
  contact_name  TEXT NOT NULL,
  contact_role  TEXT,
  email         TEXT,
  phone         TEXT,
  segment       TEXT,
  city          TEXT,
  state         TEXT,
  source        TEXT,
  status        TEXT NOT NULL DEFAULT 'lead' CHECK (status IN ('lead', 'prospect', 'cliente', 'inativo')),
  owner_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  notes         TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deals (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT    NOT NULL,
  client_id       INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  owner_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  value           REAL    NOT NULL DEFAULT 0,
  stage           TEXT    NOT NULL CHECK (stage IN ('prospeccao', 'qualificacao', 'proposta', 'negociacao', 'ganho', 'perdido')),
  probability     INTEGER NOT NULL DEFAULT 10,
  expected_close  TEXT,
  closed_at       TEXT,
  lost_reason     TEXT,
  created_at      TEXT    NOT NULL,
  updated_at      TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT NOT NULL,
  description   TEXT,
  due_date      TEXT,
  priority      TEXT NOT NULL DEFAULT 'media' CHECK (priority IN ('baixa', 'media', 'alta')),
  status        TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'concluida')),
  owner_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
  client_id     INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  deal_id       INTEGER REFERENCES deals(id) ON DELETE SET NULL,
  completed_at  TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activities (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  type         TEXT    NOT NULL CHECK (type IN ('ligacao', 'email', 'reuniao', 'whatsapp', 'nota')),
  description  TEXT    NOT NULL,
  client_id    INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  deal_id      INTEGER REFERENCES deals(id) ON DELETE SET NULL,
  user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_email  TEXT,
  action      TEXT NOT NULL,
  entity      TEXT,
  entity_id   INTEGER,
  details     TEXT,
  ip          TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_clients_owner    ON clients(owner_id);
CREATE INDEX IF NOT EXISTS idx_deals_owner      ON deals(owner_id);
CREATE INDEX IF NOT EXISTS idx_deals_client     ON deals(client_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage      ON deals(stage);
CREATE INDEX IF NOT EXISTS idx_tasks_owner      ON tasks(owner_id);
CREATE INDEX IF NOT EXISTS idx_activities_client ON activities(client_id);
CREATE INDEX IF NOT EXISTS idx_audit_created    ON audit_logs(created_at);
`;

db.exec(SCHEMA);

// ---------------------------------------------------------------------------
// Helpers de consulta (parâmetros posicionais, com cache de statements)
// ---------------------------------------------------------------------------
const cache = new Map();

function statement(sql) {
  let stmt = cache.get(sql);
  if (!stmt) {
    stmt = db.prepare(sql);
    cache.set(sql, stmt);
  }
  return stmt;
}

function bind(params) {
  if (params === undefined) return [];
  const list = Array.isArray(params) ? params : [params];
  return list.map((v) => {
    if (v === undefined) return null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    return v;
  });
}

const plain = (row) => (row ? { ...row } : row);

function get(sql, params) {
  return plain(statement(sql).get(...bind(params)));
}

function all(sql, params) {
  return statement(sql).all(...bind(params)).map(plain);
}

function run(sql, params) {
  const r = statement(sql).run(...bind(params));
  return { changes: Number(r.changes), lastId: Number(r.lastInsertRowid) };
}

let txDepth = 0;

/** Executa `fn` numa transação. Chamadas aninhadas reaproveitam a transação externa. */
function transaction(fn) {
  if (txDepth > 0) return fn();
  db.exec('BEGIN');
  txDepth++;
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    txDepth--;
  }
}

const now = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// Configurações do sistema (chave/valor) com valores padrão tipados
// ---------------------------------------------------------------------------
const SETTINGS_DEFAULTS = Object.freeze({
  company_name: 'CRM System Soluções',
  session_hours: 8,
  remember_days: 30,
  max_login_attempts: 5,
  lockout_minutes: 15,
  default_monthly_goal: 120000,
  maintenance_mode: false,
});

function getSettings() {
  const rows = all('SELECT key, value FROM settings');
  const out = { ...SETTINGS_DEFAULTS };
  for (const { key, value } of rows) {
    if (!(key in SETTINGS_DEFAULTS)) continue;
    const def = SETTINGS_DEFAULTS[key];
    if (typeof def === 'number') out[key] = Number(value);
    else if (typeof def === 'boolean') out[key] = value === 'true';
    else out[key] = value;
  }
  return out;
}

function saveSettings(partial) {
  transaction(() => {
    for (const [key, value] of Object.entries(partial)) {
      if (!(key in SETTINGS_DEFAULTS)) continue;
      run(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        [key, String(value)]
      );
    }
  });
  return getSettings();
}

module.exports = {
  db,
  get,
  all,
  run,
  transaction,
  now,
  getSettings,
  saveSettings,
  SETTINGS_DEFAULTS,
};
