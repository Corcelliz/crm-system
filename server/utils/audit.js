'use strict';

const { run, now } = require('../db/database');
const { clientIp } = require('./http');

/**
 * Registra uma ação na trilha de auditoria.
 * @param {import('express').Request} req
 * @param {string} action  ex.: 'auth.login', 'client.update'
 * @param {{ entity?: string, entityId?: number, details?: object|string, user?: {id:number,email:string} }} [opts]
 */
function audit(req, action, opts = {}) {
  const actor = opts.user || req.user || null;
  const details =
    opts.details === undefined ? null : typeof opts.details === 'string' ? opts.details : JSON.stringify(opts.details);
  try {
    run(
      `INSERT INTO audit_logs (user_id, user_email, action, entity, entity_id, details, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [actor?.id ?? null, actor?.email ?? opts.email ?? null, action, opts.entity ?? null, opts.entityId ?? null, details, req ? clientIp(req) : null, now()]
    );
  } catch (err) {
    // A auditoria nunca deve derrubar a requisição principal.
    console.error('[auditoria] falha ao registrar:', err.message);
  }
}

module.exports = { audit };
