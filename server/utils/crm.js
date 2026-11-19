'use strict';

const { fail } = require('./http');

const STAGES = ['prospeccao', 'qualificacao', 'proposta', 'negociacao', 'ganho', 'perdido'];
const OPEN_STAGES = ['prospeccao', 'qualificacao', 'proposta', 'negociacao'];
const STAGE_PROBABILITY = { prospeccao: 10, qualificacao: 25, proposta: 50, negociacao: 75, ganho: 100, perdido: 0 };
const STAGE_LABEL = {
  prospeccao: 'Prospecção',
  qualificacao: 'Qualificação',
  proposta: 'Proposta',
  negociacao: 'Negociação',
  ganho: 'Ganho',
  perdido: 'Perdido',
};

const CLIENT_STATUS = ['lead', 'prospect', 'cliente', 'inativo'];
const TASK_PRIORITY = ['baixa', 'media', 'alta'];
const ACTIVITY_TYPES = ['ligacao', 'email', 'reuniao', 'whatsapp', 'nota'];
const SEGMENTS = [
  'Agronegócio',
  'Alimentos',
  'Construção',
  'Educação',
  'Energia',
  'Indústria',
  'Logística',
  'Saúde',
  'Serviços',
  'Tecnologia',
  'Varejo',
];
const SOURCES = ['Indicação', 'Site', 'LinkedIn', 'Evento', 'Prospecção ativa', 'Parceiro'];

const isAdmin = (req) => req.user?.role === 'admin';

/** Administradores podem pedir a visão global com ?scope=all. */
const wantsAll = (req) => isAdmin(req) && req.query.scope === 'all';

/** Garante que o usuário pode ver/alterar um registro com owner_id. */
function assertOwner(req, row, entityLabel = 'Registro') {
  if (!row) fail(404, `${entityLabel} não encontrado.`);
  if (!isAdmin(req) && row.owner_id !== req.user.id) fail(404, `${entityLabel} não encontrado.`);
  return row;
}

module.exports = {
  STAGES,
  OPEN_STAGES,
  STAGE_PROBABILITY,
  STAGE_LABEL,
  CLIENT_STATUS,
  TASK_PRIORITY,
  ACTIVITY_TYPES,
  SEGMENTS,
  SOURCES,
  isAdmin,
  wantsAll,
  assertOwner,
};
