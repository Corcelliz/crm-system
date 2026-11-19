'use strict';

/** Erro com status HTTP e mensagem pronta para o usuário final. */
class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const fail = (status, message, extra) => {
  throw new HttpError(status, message, extra);
};

function clientIp(req) {
  const ip = req.ip || req.socket?.remoteAddress || '';
  if (ip === '::1') return '127.0.0.1';
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

// ---------------------------------------------------------------------------
// Validação de entrada
// ---------------------------------------------------------------------------
function text(value, label, { required = false, max = 255, min = 0 } = {}) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string' && typeof value !== 'number') fail(422, `${label}: valor inválido.`);
  const v = String(value).trim();
  if (required && !v) fail(422, `Preencha o campo ${label.toLowerCase()}.`);
  if (v && v.length < min) fail(422, `${label} precisa ter pelo menos ${min} caracteres.`);
  if (v.length > max) fail(422, `${label} pode ter no máximo ${max} caracteres.`);
  return v || null;
}

function oneOf(value, allowed, label, { required = true, fallback } = {}) {
  if ((value === undefined || value === null || value === '') && !required) return fallback ?? null;
  if (!allowed.includes(value)) fail(422, `${label}: opção inválida.`);
  return value;
}

function number(value, label, { min = -Infinity, max = Infinity, required = false, integer = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) fail(422, `Preencha o campo ${label.toLowerCase()}.`);
    return null;
  }
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(n)) fail(422, `${label}: informe um número válido.`);
  if (integer && !Number.isInteger(n)) fail(422, `${label}: informe um número inteiro.`);
  if (n < min || n > max) fail(422, `${label} deve estar entre ${min} e ${max}.`);
  return n;
}

function email(value, label = 'E-mail', { required = false } = {}) {
  const v = text(value, label, { required, max: 160 });
  if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) fail(422, 'Informe um e-mail válido.');
  return v ? v.toLowerCase() : null;
}

function isoDate(value, label, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) fail(422, `Preencha o campo ${label.toLowerCase()}.`);
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) fail(422, `${label}: use uma data válida.`);
  const [y, m, d] = String(value).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) fail(422, `${label}: data inexistente.`);
  return String(value);
}

function id(value, label = 'Identificador') {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) fail(400, `${label} inválido.`);
  return n;
}

/** Data local no formato AAAA-MM-DD, deslocada em `offsetDays`. */
function localDate(offsetDays = 0, base = new Date()) {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offsetDays);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Escapa curingas do LIKE e envolve em %...%. Use com ESCAPE '\\'. */
function likePattern(term) {
  return `%${String(term).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

module.exports = {
  HttpError,
  fail,
  clientIp,
  v: { text, oneOf, number, email, isoDate, id },
  localDate,
  likePattern,
};
