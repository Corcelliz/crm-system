'use strict';

const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');

// Carrega variáveis do arquivo .env (recurso nativo do Node 21.7+), se existir.
try {
  process.loadEnvFile(path.join(ROOT, '.env'));
} catch {
  /* sem .env: segue com os padrões */
}

const DATA_DIR = process.env.DATA_DIR ? path.resolve(ROOT, process.env.DATA_DIR) : path.join(ROOT, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

/**
 * Segredo de assinatura das sessões. Usa JWT_SECRET quando definido;
 * caso contrário gera um valor aleatório e o persiste para que as sessões
 * sobrevivam a reinicializações do servidor.
 */
function loadSecret() {
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv && fromEnv.length >= 32) return fromEnv;
  const file = path.join(DATA_DIR, 'jwt-secret.key');
  if (fs.existsSync(file)) {
    const saved = fs.readFileSync(file, 'utf8').trim();
    if (saved.length >= 32) return saved;
  }
  const secret = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

module.exports = Object.freeze({
  ROOT,
  DATA_DIR,
  PUBLIC_DIR: path.join(ROOT, 'public'),
  DB_FILE: path.join(DATA_DIR, 'crm-system.db'),
  PORT: Number(process.env.PORT) || 3000,
  HOST: process.env.HOST || '127.0.0.1',
  IS_PROD: process.env.NODE_ENV === 'production',
  JWT_SECRET: loadSecret(),
  COOKIE_NAME: 'crm_system_session',
  CSRF_HEADER: 'x-requested-with',
  CSRF_VALUE: 'CRMSystem',
});
