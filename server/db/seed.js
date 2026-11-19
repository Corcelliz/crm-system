'use strict';

/**
 * Dados fictícios de demonstração. Todos os nomes, empresas, e-mails e telefones
 * são inventados. As datas são geradas em relação ao dia de hoje, para que os
 * painéis sempre mostrem um mês corrente "vivo".
 *
 * Uso: npm run seed   (apaga tudo e recria)
 */

const { db, run, get, transaction, SETTINGS_DEFAULTS, saveSettings } = require('./database');
const { hashPasswordSync } = require('../utils/password');
const { STAGE_PROBABILITY } = require('../utils/crm');

// ---------------------------------------------------------------------------
// Gerador pseudoaleatório determinístico (mulberry32)
// ---------------------------------------------------------------------------
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Credenciais de demonstração
// ---------------------------------------------------------------------------
const DEMO_PASSWORDS = { admin: 'Admin@2026', colaborador: 'Colab@2026' };

const USERS = [
  { name: 'Marina Albuquerque', email: 'admin@crmsystem.com.br', role: 'admin', title: 'Diretora comercial', team: 'Diretoria', goal: 0, phone: '(11) 98810-2041' },
  { name: 'Ricardo Menezes', email: 'ricardo.menezes@crmsystem.com.br', role: 'admin', title: 'Gerente de operações', team: 'Operações', goal: 0, phone: '(11) 97743-5520' },
  { name: 'Ana Souza', email: 'ana.souza@crmsystem.com.br', role: 'colaborador', title: 'Executiva de contas', team: 'Vendas Enterprise', goal: 240000, phone: '(11) 99102-3387', pace: 0.78 },
  { name: 'Bruno Carvalho', email: 'bruno.carvalho@crmsystem.com.br', role: 'colaborador', title: 'Executivo de contas', team: 'Vendas Enterprise', goal: 200000, phone: '(11) 98457-1290', pace: 0.94 },
  { name: 'Camila Rocha', email: 'camila.rocha@crmsystem.com.br', role: 'colaborador', title: 'Consultora de vendas', team: 'Vendas PME', goal: 150000, phone: '(21) 99230-6618', pace: 1.08 },
  { name: 'Diego Ferreira', email: 'diego.ferreira@crmsystem.com.br', role: 'colaborador', title: 'Consultor de vendas', team: 'Vendas PME', goal: 140000, phone: '(31) 98821-4405', pace: 0.52 },
  { name: 'Eduarda Lima', email: 'eduarda.lima@crmsystem.com.br', role: 'colaborador', title: 'Analista de pré-vendas', team: 'Pré-vendas', goal: 90000, phone: '(41) 99654-7783', pace: 0.66 },
  { name: 'Felipe Nogueira', email: 'felipe.nogueira@crmsystem.com.br', role: 'colaborador', title: 'Consultor de vendas', team: 'Vendas PME', goal: 120000, phone: '(51) 98112-9034', status: 'inativo' },
];

const COMPANIES = [
  ['Agropecuária Serra Verde', 'Agronegócio'], ['Construtora Pedra Branca', 'Construção'], ['Lumen Tecnologia', 'Tecnologia'],
  ['Distribuidora Maré Alta', 'Varejo'], ['Clínica Vida Plena', 'Saúde'], ['Colégio Novo Saber', 'Educação'],
  ['Transportes Rota Sul', 'Logística'], ['Têxtil Fio de Ouro', 'Indústria'], ['Café Montanha Azul', 'Alimentos'],
  ['Engenharia Prisma', 'Construção'], ['Farmácias Bem Estar', 'Saúde'], ['Grupo Ipê Amarelo', 'Serviços'],
  ['Metalúrgica Forja Nova', 'Indústria'], ['Nuvem Clara Software', 'Tecnologia'], ['Mercados Bom Preço Leste', 'Varejo'],
  ['Laticínios Campo Sereno', 'Alimentos'], ['Instituto Aprender Mais', 'Educação'], ['Armazéns Cerrado', 'Logística'],
  ['Odonto Sorriso Pleno', 'Saúde'], ['Cooperativa Grão Forte', 'Agronegócio'], ['Vidraçaria Cristal Fino', 'Indústria'],
  ['Studio Pixel Norte', 'Tecnologia'], ['Móveis Jatobá', 'Indústria'], ['Hotel Vale do Sol', 'Serviços'],
  ['Auto Peças Trilho', 'Varejo'], ['Escola Bilíngue Aurora', 'Educação'], ['Frigorífico Pampa Verde', 'Alimentos'],
  ['Construtora Alicerce', 'Construção'], ['Laboratório Exato', 'Saúde'], ['Ponte Digital Datacenter', 'Tecnologia'],
  ['Expresso Bandeira', 'Logística'], ['Sementes Terra Boa', 'Agronegócio'], ['Contábil Balanço Certo', 'Serviços'],
  ['Papelaria Traço Fino', 'Varejo'], ['Bebidas Fonte Fresca', 'Alimentos'], ['Química Orvalho', 'Indústria'],
  ['Academia Corpo em Movimento', 'Serviços'], ['Hospital Santa Clara do Vale', 'Saúde'], ['Moda Linho & Seda', 'Varejo'],
  ['Agrotech Semear', 'Agronegócio'], ['Rede Escolar Caminhos', 'Educação'], ['Plásticos Polimax', 'Indústria'],
  ['Ótica Visão Clara', 'Varejo'], ['Engarrafadora Serra do Mar', 'Alimentos'], ['Cloudbase Sistemas', 'Tecnologia'],
  ['Logística Porto do Sul', 'Logística'], ['Imobiliária Chave Mestra', 'Serviços'], ['Cerâmica Barro Vermelho', 'Construção'],
  ['Pet Shop Patas Felizes', 'Varejo'], ['Usina Solar Raio de Luz', 'Energia'], ['Eólica Ventos do Norte', 'Energia'],
  ['Gráfica Tinta Viva', 'Serviços'], ['Biotec Raiz', 'Saúde'], ['Calçados Passo Firme', 'Indústria'],
  ['Panificadora Trigo Dourado', 'Alimentos'], ['Consultoria Bússola', 'Serviços'], ['Fazenda Três Rios', 'Agronegócio'],
  ['Seguros Amparo', 'Serviços'], ['Estaleiro Âncora', 'Indústria'], ['Editora Página Aberta', 'Educação'],
  ['Campo Conectado Agrotech', 'Tecnologia'], ['Clínica Veterinária Bicho Bom', 'Saúde'], ['Revestimentos Mosaico', 'Construção'],
  ['Atacadão Popular Centro', 'Varejo'], ['Transportadora Asa Branca', 'Logística'], ['Doces Vovó Lurdes', 'Alimentos'],
];

const FIRST = ['Paulo', 'Juliana', 'Rafael', 'Fernanda', 'Gustavo', 'Patrícia', 'Thiago', 'Larissa', 'Marcelo', 'Beatriz', 'Leonardo', 'Vanessa', 'Rodrigo', 'Aline', 'Henrique', 'Tatiane', 'Vinícius', 'Renata', 'André', 'Carolina', 'Fábio', 'Priscila', 'Lucas', 'Mariana', 'Sérgio', 'Débora', 'Otávio', 'Simone', 'Caio', 'Luana'];
const LAST = ['Andrade', 'Barbosa', 'Cardoso', 'Duarte', 'Esteves', 'Figueiredo', 'Gonçalves', 'Hidalgo', 'Lacerda', 'Machado', 'Moraes', 'Pacheco', 'Queiroz', 'Ramos', 'Siqueira', 'Teixeira', 'Valente', 'Xavier', 'Bittencourt', 'Coutinho'];
const ROLES = ['CEO', 'CFO', 'Gerente de TI', 'Gerente de compras', 'Gerente de operações', 'Head de marketing', 'Gerente comercial', 'Coordenação financeira'];
const PLACES = [
  ['São Paulo', 'SP', '11'], ['Campinas', 'SP', '19'], ['Rio de Janeiro', 'RJ', '21'], ['Belo Horizonte', 'MG', '31'],
  ['Curitiba', 'PR', '41'], ['Porto Alegre', 'RS', '51'], ['Florianópolis', 'SC', '48'], ['Recife', 'PE', '81'],
  ['Salvador', 'BA', '71'], ['Goiânia', 'GO', '62'], ['Fortaleza', 'CE', '85'], ['Vitória', 'ES', '27'],
];
const SOURCES = ['Indicação', 'Site', 'LinkedIn', 'Evento', 'Prospecção ativa', 'Parceiro'];
const DEAL_TITLES = [
  'Licenças anuais para 50 usuários', 'Implantação e treinamento da equipe', 'Renovação do contrato anual', 'Upgrade para o plano Enterprise',
  'Consultoria de processos comerciais', 'Integração com o ERP', 'Pacote de suporte premium', 'Expansão para a nova filial',
  'Projeto piloto de 3 meses', 'Módulo de relatórios avançados', 'Migração de dados legados', 'Licenças adicionais para o time de campo',
];
const LOST_REASONS = ['Preço acima do orçamento', 'Escolheu um concorrente', 'Projeto adiado para o próximo ano', 'Sem retorno do decisor', 'Prioridade interna mudou'];

const ACTIVITY_TEMPLATES = {
  ligacao: ['Ligação com {c} para entender o cenário atual da operação.', 'Retorno de ligação: {c} pediu revisão dos valores da proposta.', 'Ligação de alinhamento sobre prazos de implantação com {c}.'],
  email: ['Proposta comercial enviada para {c}.', 'Enviado material de apresentação e casos do segmento {s}.', 'E-mail de follow-up após a reunião, com resumo dos próximos passos.'],
  reuniao: ['Reunião de descoberta com {c} e equipe.', 'Demonstração da plataforma para a equipe da {e}.', 'Reunião de negociação: {c} trouxe o financeiro para a conversa.'],
  whatsapp: ['{c} confirmou interesse e pediu agenda para a próxima semana.', 'Mensagem de {c}: contrato está com o jurídico.', 'Enviado link da apresentação para {c} por mensagem.'],
  nota: ['Cliente avalia concorrente; reforçar diferencial de suporte local.', 'Orçamento aprovado internamente, aguardando assinatura.', 'Decisor principal entra de férias no fim do mês; antecipar reunião.'],
};
const TASK_TEMPLATES = [
  'Ligar para {c} sobre a proposta', 'Enviar proposta revisada para {e}', 'Agendar demonstração com {e}', 'Follow-up com {c}',
  'Preparar apresentação para {e}', 'Confirmar reunião com {c}', 'Enviar contrato para assinatura da {e}', 'Levantar requisitos técnicos com {e}',
];

const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, 'e').replace(/[^a-z0-9]+/g, '');
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function seed({ reset = false, quiet = false } = {}) {
  const r = rng(20261112);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const int = (min, max) => Math.floor(r() * (max - min + 1)) + min;
  const roundTo = (n, step) => Math.round(n / step) * step;
  const NOW = new Date();
  const daysAgo = (n, hour = int(8, 18)) => {
    const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - n, hour, int(0, 59), int(0, 59));
    return d > NOW ? new Date(NOW.getTime() - int(5, 90) * 60000) : d;
  };
  const iso = (d) => d.toISOString();

  transaction(() => {
    if (reset) {
      for (const table of ['audit_logs', 'activities', 'tasks', 'deals', 'clients', 'users', 'settings']) db.exec(`DELETE FROM ${table};`);
      db.exec("DELETE FROM sqlite_sequence WHERE name IN ('audit_logs','activities','tasks','deals','clients','users');");
    }
    saveSettings(SETTINGS_DEFAULTS);

    // ---------------------------------------------------------------- usuários
    const hashes = { admin: hashPasswordSync(DEMO_PASSWORDS.admin), colaborador: hashPasswordSync(DEMO_PASSWORDS.colaborador) };
    const userIds = [];
    USERS.forEach((u, i) => {
      const created = iso(daysAgo(420 - i * 20));
      const lastLogin = u.status === 'inativo' ? iso(daysAgo(48)) : iso(daysAgo(int(0, 2)));
      const { lastId } = run(
        `INSERT INTO users (name, email, password_hash, role, title, team, phone, monthly_goal, status, last_login_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [u.name, u.email, hashes[u.role], u.role, u.title, u.team, u.phone, u.goal, u.status || 'ativo', lastLogin, created, created]
      );
      userIds.push({ id: lastId, ...u });
    });
    const sellers = userIds.filter((u) => u.role === 'colaborador');
    const activeSellers = sellers.filter((u) => u.status !== 'inativo');

    // ---------------------------------------------------------------- clientes
    const clients = [];
    COMPANIES.forEach(([company, segment], i) => {
      // Distribui a carteira; o colaborador inativo fica com poucas contas.
      const owner = i % 13 === 12 ? sellers.find((s) => s.status === 'inativo') : activeSellers[i % activeSellers.length];
      const [city, state, ddd] = pick(PLACES);
      const first = pick(FIRST);
      const last = pick(LAST);
      const roll = r();
      const status = roll < 0.42 ? 'cliente' : roll < 0.72 ? 'prospect' : roll < 0.9 ? 'lead' : 'inativo';
      const created = daysAgo(int(20, 400));
      const domain = `${slug(company).slice(0, 18)}.com.br`;
      const { lastId } = run(
        `INSERT INTO clients (company, contact_name, contact_role, email, phone, segment, city, state, source, status, owner_id, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          company, `${first} ${last}`, pick(ROLES), `${slug(first)}.${slug(last)}@${domain}`,
          `(${ddd}) 9${int(6000, 9999)}-${int(1000, 9999)}`, segment, city, state, pick(SOURCES), status, owner.id,
          r() < 0.35 ? 'Prefere contato por e-mail no período da manhã.' : null, iso(created), iso(created),
        ]
      );
      clients.push({ id: lastId, company, contact: first, segment, status, owner, created });
    });

    // ---------------------------------------------------------------- oportunidades
    const insertDeal = (d) =>
      run(
        `INSERT INTO deals (title, client_id, owner_id, value, stage, probability, expected_close, closed_at, lost_reason, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [d.title, d.client.id, d.client.owner.id, d.value, d.stage, STAGE_PROBABILITY[d.stage], d.expected, d.closed ? iso(d.closed) : null, d.lost || null, iso(d.created), iso(d.updated || d.closed || d.created)]
      ).lastId;
    const openDeals = [];

    for (const client of clients) {
      const ageDays = Math.round((NOW - client.created) / 86400000);
      if (client.status === 'cliente') {
        // Histórico de negócios ganhos ao longo do ano.
        const wins = int(1, 3);
        for (let k = 0; k < wins; k++) {
          const closedAgo = int(32, Math.max(40, ageDays - 5));
          insertDeal({
            title: pick(DEAL_TITLES), client, value: roundTo(int(9, 95) * 1000, 500), stage: 'ganho',
            created: daysAgo(closedAgo + int(15, 70)), closed: daysAgo(closedAgo), expected: null,
          });
        }
      }
      if (client.status === 'inativo' || r() < 0.25) {
        const closedAgo = int(10, 200);
        insertDeal({
          title: pick(DEAL_TITLES), client, value: roundTo(int(12, 120) * 1000, 500), stage: 'perdido', lost: pick(LOST_REASONS),
          created: daysAgo(closedAgo + int(20, 60)), closed: daysAgo(closedAgo), expected: null,
        });
      }
      if (client.status !== 'inativo' && client.owner.status !== 'inativo') {
        const opens = client.status === 'lead' ? 1 : int(1, 2);
        for (let k = 0; k < opens; k++) {
          const stage = client.status === 'lead' ? pick(['prospeccao', 'prospeccao', 'qualificacao']) : pick(['prospeccao', 'qualificacao', 'qualificacao', 'proposta', 'proposta', 'negociacao']);
          const created = daysAgo(int(3, 75));
          const expectedDate = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + int(-4, 75));
          const id = insertDeal({
            title: pick(DEAL_TITLES), client, value: roundTo(int(8, 160) * 1000, 500), stage,
            created, updated: daysAgo(int(0, 10)), expected: ymd(expectedDate),
          });
          openDeals.push({ id, client, stage });
        }
      }
    }

    // Ganhos do mês corrente: cada colaborador ativo perto do ritmo definido.
    const monthDay = NOW.getDate();
    for (const seller of activeSellers) {
      const target = seller.goal * seller.pace;
      const mine = clients.filter((c) => c.owner.id === seller.id && c.status !== 'inativo');
      if (!mine.length) continue;
      let total = 0;
      let guard = 0;
      while (total < target * 0.97 && guard++ < 8) {
        const value = roundTo(Math.min(target - total, int(18, 70) * 1000), 500);
        if (value < 4000) break;
        const client = mine[guard % mine.length];
        const closedAgo = int(0, Math.max(0, monthDay - 1));
        insertDeal({ title: pick(DEAL_TITLES), client, value, stage: 'ganho', created: daysAgo(closedAgo + int(20, 50)), closed: daysAgo(closedAgo), expected: null });
        run("UPDATE clients SET status = 'cliente' WHERE id = ?", [client.id]);
        total += value;
      }
    }

    // ---------------------------------------------------------------- atividades
    const types = Object.keys(ACTIVITY_TEMPLATES);
    for (const client of clients) {
      const n = client.status === 'lead' ? int(1, 2) : int(2, 6);
      for (let k = 0; k < n; k++) {
        const type = pick(types);
        const text = pick(ACTIVITY_TEMPLATES[type]).replace('{c}', client.contact).replace('{s}', client.segment.toLowerCase()).replace('{e}', client.company);
        const when = daysAgo(int(0, 75));
        run('INSERT INTO activities (type, description, client_id, deal_id, user_id, created_at) VALUES (?, ?, ?, NULL, ?, ?)', [type, text, client.id, client.owner.id, iso(when)]);
      }
    }
    // Clientes ordenados pela interação mais recente.
    db.exec('UPDATE clients SET updated_at = COALESCE((SELECT MAX(created_at) FROM activities a WHERE a.client_id = clients.id), updated_at);');
    // "Cliente desde" nunca é posterior ao primeiro negócio ou interação registrados.
    db.exec(`UPDATE clients SET created_at = MIN(
               created_at,
               COALESCE((SELECT MIN(created_at) FROM deals d WHERE d.client_id = clients.id), created_at),
               COALESCE((SELECT MIN(created_at) FROM activities a WHERE a.client_id = clients.id), created_at));`);

    // ---------------------------------------------------------------- tarefas
    for (const seller of activeSellers) {
      const mine = clients.filter((c) => c.owner.id === seller.id && c.status !== 'inativo');
      if (!mine.length) continue;
      const plan = [
        ...Array.from({ length: 2 }, () => ({ offset: -int(1, 6), done: false })),
        ...Array.from({ length: 3 }, () => ({ offset: 0, done: false })),
        ...Array.from({ length: 5 }, () => ({ offset: int(1, 14), done: false })),
        ...Array.from({ length: 6 }, () => ({ offset: -int(1, 20), done: true })),
      ];
      plan.forEach((p, k) => {
        const client = mine[(k * 3) % mine.length];
        const deal = openDeals.find((d) => d.client.id === client.id);
        const title = pick(TASK_TEMPLATES).replace('{c}', client.contact).replace('{e}', client.company);
        const due = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + p.offset);
        const created = daysAgo(Math.max(1, -p.offset + int(2, 8)));
        run(
          `INSERT INTO tasks (title, description, due_date, priority, status, owner_id, client_id, deal_id, completed_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            title, r() < 0.4 ? 'Levar números do último trimestre e o cronograma de implantação.' : null, ymd(due),
            pick(['baixa', 'media', 'media', 'alta']), p.done ? 'concluida' : 'pendente', seller.id, client.id, deal ? deal.id : null,
            p.done ? iso(daysAgo(Math.max(0, -p.offset - 1))) : null, iso(created), iso(created),
          ]
        );
      });
    }

    // ---------------------------------------------------------------- auditoria
    const auditRow = (u, action, when, details, ip = `10.0.${int(1, 20)}.${int(2, 250)}`) =>
      run('INSERT INTO audit_logs (user_id, user_email, action, entity, entity_id, details, ip, created_at) VALUES (?, ?, ?, NULL, NULL, ?, ?, ?)', [
        u ? u.id : null, u ? u.email : details.email, action, JSON.stringify(details), ip, iso(when),
      ]);
    for (let day = 14; day >= 0; day--) {
      for (const u of userIds.filter((x) => x.status !== 'inativo')) {
        if (r() < 0.8) auditRow(u, 'auth.login', daysAgo(day, int(8, 10)), { lembrar: r() < 0.3 });
      }
      if (r() < 0.35) {
        const u = pick(activeSellers);
        auditRow(u, 'auth.login_failed', daysAgo(day, int(8, 11)), { motivo: 'senha incorreta' });
      }
    }
    auditRow(null, 'auth.login_failed', daysAgo(1, 3), { email: 'teste@exemplo.com', motivo: 'e-mail não cadastrado' }, '203.0.113.45');
    auditRow(null, 'auth.login_failed', daysAgo(1, 3), { email: 'admin@admin.com', motivo: 'e-mail não cadastrado' }, '203.0.113.45');
    const felipe = userIds.find((u) => u.status === 'inativo');
    auditRow(userIds[0], 'user.deactivate', daysAgo(47), { nome: felipe.name });
  });

  if (!quiet) {
    const counts = ['users', 'clients', 'deals', 'tasks', 'activities', 'audit_logs'].map((t) => `${t}: ${get(`SELECT COUNT(*) AS n FROM ${t}`).n}`);
    console.log(`[seed] dados de demonstração criados (${counts.join(', ')})`);
  }
}

function seedIfEmpty() {
  const { n } = get('SELECT COUNT(*) AS n FROM users');
  if (n === 0) seed({ reset: false });
}

module.exports = { seed, seedIfEmpty, DEMO_PASSWORDS };

if (require.main === module) {
  seed({ reset: process.argv.includes('--reset') });
}
