'use strict';

const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

const config = require('./config');
const { db } = require('./db/database');
const { seedIfEmpty } = require('./db/seed');
const { HttpError } = require('./utils/http');
const { requireAuth, requireRole, pageGuard, csrfGuard, readSession, HOME_BY_ROLE } = require('./middleware/auth');

seedIfEmpty();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');

// ---------------------------------------------------------------------------
// Segurança de cabeçalhos (CSP sem scripts inline)
// ---------------------------------------------------------------------------
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
        'img-src': ["'self'", 'data:'],
        'connect-src': ["'self'"],
        'object-src': ["'none'"],
        'frame-ancestors': ["'none'"],
        'form-action': ["'self'"],
        'upgrade-insecure-requests': config.IS_PROD ? [] : null,
      },
    },
    strictTransportSecurity: config.IS_PROD,
    crossOriginEmbedderPolicy: false,
  })
);

app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// ---------------------------------------------------------------------------
// Arquivos estáticos (apenas /assets; as páginas passam pelas guardas abaixo)
// ---------------------------------------------------------------------------
app.use(
  '/assets',
  express.static(path.join(config.PUBLIC_DIR, 'assets'), {
    index: false,
    maxAge: config.IS_PROD ? '7d' : 0,
  })
);
app.get('/favicon.ico', (req, res) => res.redirect(301, '/assets/img/favicon.svg'));

// ---------------------------------------------------------------------------
// Páginas
// ---------------------------------------------------------------------------
const page = (name) => (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(config.PUBLIC_DIR, 'pages', `${name}.html`));
};

app.get('/', (req, res) => {
  const { user } = readSession(req);
  res.redirect(302, user ? HOME_BY_ROLE[user.role] : '/login');
});

app.get(
  '/login',
  (req, res, next) => {
    const { user } = readSession(req);
    if (user) return res.redirect(302, HOME_BY_ROLE[user.role]);
    next();
  },
  page('login')
);

// Administradores também podem abrir a área do colaborador (com os próprios dados).
app.get('/colaborador', pageGuard('colaborador', 'admin'), page('colaborador'));
app.get('/admin', pageGuard('admin'), page('admin'));

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
const api = express.Router();
api.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
api.use(csrfGuard(config.CSRF_HEADER, config.CSRF_VALUE));
api.use('/auth', require('./routes/auth.routes'));
api.use('/dashboard', requireAuth, require('./routes/dashboard.routes'));
api.use('/clients', requireAuth, require('./routes/clients.routes'));
api.use('/deals', requireAuth, require('./routes/deals.routes'));
api.use('/tasks', requireAuth, require('./routes/tasks.routes'));
api.use('/activities', requireAuth, require('./routes/activities.routes'));
api.use('/admin', requireAuth, requireRole('admin'), require('./routes/admin.routes'));
api.use((req, res) => res.status(404).json({ error: 'Recurso não encontrado.' }));
app.use('/api', api);

// ---------------------------------------------------------------------------
// 404 e tratamento de erros
// ---------------------------------------------------------------------------
app.use((req, res) => {
  res.status(404).sendFile(path.join(config.PUBLIC_DIR, 'pages', '404.html'));
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, ...err.extra });
  }
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Os dados enviados estão malformados.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Os dados enviados são grandes demais.' });
  if (String(err.code || '').startsWith('ERR_SQLITE') && /UNIQUE/.test(err.message)) {
    return res.status(409).json({ error: 'Já existe um registro com estes dados.' });
  }
  console.error('[erro]', req.method, req.originalUrl, err);
  res.status(500).json({ error: 'Erro interno no servidor. Tente novamente em instantes.' });
});

// ---------------------------------------------------------------------------
// Inicialização
// ---------------------------------------------------------------------------
const server = app.listen(config.PORT, config.HOST, () => {
  const url = `http://${config.HOST === '0.0.0.0' ? 'localhost' : config.HOST}:${config.PORT}`;
  console.log(`\n  CRM System rodando em ${url}\n`);
  console.log('  Administrador  admin@crmsystem.com.br     / Admin@2026');
  console.log('  Colaborador    ana.souza@crmsystem.com.br / Colab@2026\n');
});

function shutdown() {
  server.close(() => {
    try {
      db.close();
    } catch {
      /* já fechado */
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = app;
