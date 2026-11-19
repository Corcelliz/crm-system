# CRM System

Sistema de CRM completo com **login autenticado no servidor**, **área do colaborador** e **área do administrador**.
Back-end em Node.js + Express com banco SQLite nativo; front-end em HTML, CSS e JavaScript puros (sem etapa de build).

## Como rodar

Requisito: **Node.js 22.13 ou superior** (usa o módulo `node:sqlite`, nativo do Node).

```bash
npm install
npm start
```

Acesse **http://127.0.0.1:3000**. Na primeira execução, o banco `data/crm-system.db` é criado e populado com dados fictícios.

| Script          | O que faz                                                     |
| --------------- | ------------------------------------------------------------- |
| `npm start`     | Sobe o servidor                                               |
| `npm run dev`   | Sobe o servidor reiniciando a cada alteração de código        |
| `npm run seed`  | Apaga tudo e recria a base de demonstração                    |

## Credenciais de demonstração

| Perfil        | E-mail                             | Senha        |
| ------------- | ---------------------------------- | ------------ |
| Administrador | `admin@crmsystem.com.br`             | `Admin@2026` |
| Administrador | `ricardo.menezes@crmsystem.com.br`   | `Admin@2026` |
| Colaborador   | `ana.souza@crmsystem.com.br`         | `Colab@2026` |
| Colaborador   | `bruno.carvalho@crmsystem.com.br`    | `Colab@2026` |
| Colaborador   | `camila.rocha@crmsystem.com.br`      | `Colab@2026` |
| Colaborador   | `diego.ferreira@crmsystem.com.br`    | `Colab@2026` |
| Colaborador   | `eduarda.lima@crmsystem.com.br`      | `Colab@2026` |
| Inativo       | `felipe.nogueira@crmsystem.com.br`   | `Colab@2026` (login recusado: conta desativada) |

Todos os nomes, empresas, e-mails e telefones são inventados.

> **Atenção:** estas contas e senhas existem só para demonstração e são públicas de propósito. Antes de usar o sistema com dados reais, apague a base de demonstração, crie seus próprios usuários e defina um `JWT_SECRET` forte.

## O que cada área oferece

### Login (`/login`)
- Validação das credenciais no servidor (senhas com hash **scrypt**, comparação em tempo constante).
- Bloqueio temporário após 5 senhas erradas seguidas (configurável), com contagem regressiva na tela.
- Mostrar/ocultar senha, aviso de Caps Lock, "manter conectado", atalhos para as contas de demonstração.
- Avisos de sessão expirada, sessão encerrada, conta desativada e modo manutenção.
- Redirecionamento automático conforme o perfil (administrador → `/admin`, colaborador → `/colaborador`).

### Área do colaborador (`/colaborador`)
- **Meu dia**: meta do mês com marcador de ritmo esperado, pipeline aberto, previsão ponderada, conversão em 90 dias, agenda (atrasadas, hoje e próximos 7 dias), fechamentos previstos, gráficos e interações recentes.
- **Funil de vendas**: quadro kanban com arrastar e soltar entre estágios (e menu acessível pelo teclado), registro de motivo de perda e filtro.
- **Clientes**: carteira com busca e filtros; ficha lateral com contatos, oportunidades, tarefas e histórico de interações (ligação, e-mail, reunião, WhatsApp, nota).
- **Tarefas**: filtros por pendentes, hoje, atrasadas, próximas e concluídas, agrupadas por prazo.
- Perfil, troca de senha e tema claro/escuro.

O colaborador só vê e altera **a própria carteira**; a regra é aplicada no servidor.

### Área do administrador (`/admin`)
- **Visão geral**: receita do mês com comparação, meta da equipe, pipeline, conversão, receita por mês (12 meses), funil, ranking de desempenho por colaborador, receita por segmento e atividade recente.
- **Oportunidades, Clientes e Tarefas** de toda a empresa: filtros por responsável, estágio, status e segmento; edição, reatribuição de carteira e exclusão.
- **Usuários e permissões**: criar, editar, trocar perfil, definir meta, redefinir senha (gera senha temporária com troca obrigatória), encerrar sessões, desativar/reativar e excluir transferindo a carteira.
- **Auditoria**: trilha completa de acessos e alterações, com filtros por tipo, usuário e período, paginação e exportação.
- **Segurança**: logins e falhas em 24 h, contas bloqueadas com desbloqueio manual, falhas recentes e últimos acessos.
- **Configurações**: nome da empresa, duração da sessão, política de bloqueio, meta padrão, **modo manutenção** (bloqueia colaboradores na hora) e restauração dos dados de demonstração.
- Exportação em CSV (compatível com Excel) de clientes, oportunidades, tarefas, usuários e auditoria.

## Segurança implementada

- Sessão em cookie `httpOnly` + `SameSite=Strict` com JWT assinado (HS256); `Secure` em produção.
- O usuário é recarregado a cada requisição: desativar a conta, trocar a senha, mudar o perfil ou encerrar sessões vale imediatamente (`token_version`).
- Proteção CSRF por cabeçalho customizado obrigatório em toda requisição que altera dados.
- Limite de tentativas por conta+IP e por IP; tempo de resposta igual para e-mail existente ou não (evita enumeração de contas).
- Páginas protegidas no servidor: `/admin` exige perfil administrador; sem sessão, tudo redireciona para `/login`.
- Cabeçalhos de segurança com Helmet e CSP sem scripts inline.
- Todo conteúdo dinâmico é escapado no front-end (template `html` com escape por padrão).
- Exportação CSV protegida contra injeção de fórmulas.
- Regras de integridade: não é possível remover o último administrador ativo nem rebaixar ou desativar a própria conta.

## Estrutura

```
server/
  index.js                 inicialização, rotas de página, CSP e tratamento de erros
  config.js                variáveis de ambiente e segredo de sessão
  db/database.js           esquema SQLite, helpers de consulta e configurações
  db/seed.js               dados fictícios de demonstração
  middleware/auth.js       sessão, guardas de API/página e CSRF
  middleware/loginLimiter.js  proteção contra força bruta
  routes/                  auth, dashboard, clients, deals, tasks, activities, admin
  services/metrics.js      indicadores (meta, pipeline, conversão, receita por mês)
  utils/                   hash de senha, validação, auditoria, vocabulário do CRM
public/
  pages/                   login.html, colaborador.html, admin.html, 404.html
  assets/css/              base.css (sistema visual), login.css, app.css
  assets/js/lib/           api, dom, ui, shell, crm, charts, format, icons, theme
  assets/js/               login.js, colaborador.js, admin.js
```

## Principais rotas da API

| Método | Rota                                   | Acesso        |
| ------ | -------------------------------------- | ------------- |
| POST   | `/api/auth/login` · `/logout`          | público       |
| GET    | `/api/auth/me`                         | autenticado   |
| POST   | `/api/auth/change-password`            | autenticado   |
| GET    | `/api/dashboard`                       | autenticado   |
| CRUD   | `/api/clients`, `/api/deals`, `/api/tasks`, `/api/activities` | autenticado (escopo da carteira) |
| PATCH  | `/api/deals/:id/stage`                 | autenticado   |
| GET    | `/api/admin/overview`                  | administrador |
| CRUD   | `/api/admin/users` (+ status, reset-password, revoke-sessions) | administrador |
| GET    | `/api/admin/audit` · `/security`       | administrador |
| GET/PUT| `/api/admin/settings`                  | administrador |
| GET    | `/api/admin/export/:entidade`          | administrador |

## Configuração

Copie `.env.example` para `.env` para ajustar `PORT`, `HOST`, `NODE_ENV`, `JWT_SECRET` e `DATA_DIR`.
Sem `JWT_SECRET`, um segredo aleatório é gerado e salvo em `data/jwt-secret.key`.

Para publicar em produção: defina `NODE_ENV=production` e um `JWT_SECRET` forte, e sirva atrás de HTTPS.

## Licença

[MIT](LICENSE).
