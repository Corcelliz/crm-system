'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scryptAsync = promisify(crypto.scrypt);

// Parâmetros scrypt recomendados pela OWASP (N=2^14, r=8, p=1)
const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;

function encode(salt, hash) {
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function parse(stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  return {
    N: Number(parts[1]),
    r: Number(parts[2]),
    p: Number(parts[3]),
    salt: Buffer.from(parts[4], 'base64'),
    hash: Buffer.from(parts[5], 'base64'),
  };
}

function hashPasswordSync(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH, { N, r: R, p: P });
  return encode(salt, hash);
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scryptAsync(password, salt, KEY_LENGTH, { N, r: R, p: P });
  return encode(salt, hash);
}

/** Compara em tempo constante; retorna false para qualquer hash malformado. */
async function verifyPassword(password, stored) {
  const parsed = parse(stored);
  if (!parsed) return false;
  try {
    const actual = await scryptAsync(String(password), parsed.salt, parsed.hash.length, {
      N: parsed.N,
      r: parsed.r,
      p: parsed.p,
    });
    return crypto.timingSafeEqual(actual, parsed.hash);
  } catch {
    return false;
  }
}

/**
 * Hash usado quando o e-mail não existe: mantém o tempo de resposta igual
 * ao de um usuário real e evita enumeração de contas por tempo.
 */
const DUMMY_HASH = hashPasswordSync(crypto.randomBytes(16).toString('hex'));

function passwordPolicyError(password) {
  if (typeof password !== 'string' || password.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (password.length > 128) return 'A senha pode ter no máximo 128 caracteres.';
  if (!/[A-Za-zÀ-ÿ]/.test(password) || !/\d/.test(password)) return 'A senha precisa combinar letras e números.';
  return null;
}

/** Senha temporária legível (sem caracteres ambíguos como 0/O e 1/l). */
function generateTempPassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';
  const digits = '23456789';
  const pick = (set, n) => Array.from({ length: n }, () => set[crypto.randomInt(set.length)]).join('');
  return `Vtx-${pick(alphabet, 4)}${pick(digits, 2)}${pick(alphabet, 2)}`;
}

module.exports = {
  hashPassword,
  hashPasswordSync,
  verifyPassword,
  DUMMY_HASH,
  passwordPolicyError,
  generateTempPassword,
};
