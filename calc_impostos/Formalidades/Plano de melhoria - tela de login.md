# Plano de Melhoria — Tela de Login, Autenticação e Área de Superadmin

**Data:** 23/10/2026  
**Status:** ✅ Decisões validadas — em implementação  
**Sistemas impactados:** `calc_impostos` (frontend + backend + banco) e, de forma pontual, `Rauf_App` (segurança dos endpoints de integração)

---

## 1. Resumo do que foi pedido

1. Criar **login e autenticação** de usuários no `calc_impostos`.
2. Criar **área de Superadmin** com o usuário master `ulisses.goularte@ebserh.gov.br` (senha inicial `admin123`).
3. O master também **usa o sistema** e **cadastra usuários e UASGs** (modo isolado, sem Rauf), podendo **escolher a UASG em que vai trabalhar**.
4. Cadastro de usuário **semelhante ao do Rauf_App**: cada usuário tem uma **UASG de origem**.
5. Usar o componente de tela de login (`auth-page.tsx`) **adaptado** à realidade do sistema.
6. **Login** = selecionar UASG + e-mail + senha.
7. A senha é **gerada pelo superadmin** no cadastro; o usuário **pode alterá-la** após o login.
8. Após o login, **remover o card "Identidade do Órgão"** da tela de análise; os **dados da UASG ficam no cabeçalho**, junto com **usuário conectado** e opção **Alterar senha / Sair**.

---

## 2. Diagnóstico do estado atual (levantado no código)

| Item | Situação atual | Impacto |
| :--- | :--- | :--- |
| Frontend | React 19 + Vite 8 + TS. **Sem Tailwind, sem shadcn, sem alias `@/`, sem `framer-motion`, sem `components/ui`** | O componente exige Tailwind v4 + shadcn; é preciso preparar o projeto |
| CSS atual | `index.css` / `App.css` próprios (classes `card`, `btn-primary`, `form-input`…) | Risco de o *preflight* do Tailwind alterar o visual existente |
| Backend | Express 5 + `pg`. **Sem bcrypt/JWT/middleware de auth**; `cors()` aberto; **todas as ~25 rotas `/api/*` são públicas** | Precisa de middleware de autenticação e proteção de todas as rotas |
| Banco local | Tabelas: `ncm_regras`, `fornecedores_simples`, `notas_analisadas`, `retencoes_calc_impostos`, `memoria_tributaria_fornecedores`. **Nenhuma tem `uasg`** (exceto a de integração) | Sem isolamento por UASG no modo isolado; precisa de migração |
| Frontend → API | ~29 chamadas `fetch(` espalhadas em 9 arquivos | Precisam enviar o token; criar `apiFetch` central |
| Identidade do órgão | Hoje guardada em `localStorage` (`orgao_ativo_configurado`) e editável por qualquer um | Passa a vir da UASG autenticada (sessão) |
| Rauf_App (referência) | `usuarios`: `nome, email, senha_hash (bcrypt), role, cargo, ativo, forca_troca_senha, instituicao_id`; JWT access 30 min + refresh 7 dias; superadmin sem instituição | Modelo a ser espelhado |

---

## 3. Decisões de arquitetura propostas

### 3.1 Fonte única de autenticação: **local**
O `calc_impostos` autentica **sempre** na sua própria base (tabela `usuarios_calc`), seja isolado ou conectado ao Rauf. Isso evita depender da disponibilidade/licença do Rauf para logar. Quando conectado, o catálogo de UASGs pode ser **importado do Rauf** (botão no painel do superadmin), mapeando `rauf_instituicao_id`.

### 3.2 Modelo de dados (novas tabelas no `schema.sql`)

**`uasgs`** — catálogo de órgãos/UASGs
| Coluna | Tipo | Observação |
| :--- | :--- | :--- |
| `id` | SERIAL PK | |
| `uasg` | VARCHAR(6) UNIQUE NOT NULL | código da UG |
| `sigla` | VARCHAR(30) | ex.: HUCAM |
| `nome` | VARCHAR(255) NOT NULL | razão social / nome oficial |
| `cnpj` | VARCHAR(20) | usado na conferência do destinatário da nota |
| `municipio` | VARCHAR(100) | usado na regra de ISSQN (hoje fica no card) |
| `rauf_instituicao_id` | INTEGER NULL | vínculo com `instituicoes.id` do Rauf |
| `ativo` | BOOLEAN DEFAULT TRUE | |
| `created_at/updated_at` | TIMESTAMP | |

**`usuarios_calc`** — usuários
| Coluna | Tipo | Observação |
| :--- | :--- | :--- |
| `id` | SERIAL PK | |
| `nome` | VARCHAR(100) NOT NULL | |
| `email` | VARCHAR(100) UNIQUE NOT NULL | normalizado em minúsculas |
| `senha_hash` | VARCHAR(255) NOT NULL | bcrypt (custo 10+) |
| `role` | VARCHAR(20) | `superadmin` ou `usuario` |
| `uasg_origem_id` | INTEGER FK → `uasgs.id` | NULL apenas para o superadmin |
| `ativo` | BOOLEAN DEFAULT TRUE | |
| `forca_troca_senha` | BOOLEAN DEFAULT TRUE | exige troca no 1º acesso |
| `tentativas_falhas` / `bloqueado_ate` | INT / TIMESTAMP | proteção contra força bruta |
| `ultimo_login` | TIMESTAMP | |
| `created_at/updated_at` | TIMESTAMP | |

**Isolamento por UASG nas tabelas existentes** — adicionar coluna `uasg VARCHAR(6)` + índice em:
- `notas_analisadas`
- `memoria_tributaria_fornecedores` *(ver decisão D3)*
- `retencoes_calc_impostos` (já possui)

> `ncm_regras` e `fornecedores_simples` são tabelas de referência fiscal e permanecem **globais**.

### 3.3 Sessão e token
- Login gera **JWT** (`HS256`, segredo em `JWT_SECRET` no `.env`), validade de **8 horas**, com claims: `sub` (usuário), `role`, `uasg_ativa`.
- Frontend guarda o token em `sessionStorage` (some ao fechar o navegador) e envia `Authorization: Bearer`.
- Ao receber `401`, o frontend limpa a sessão e volta à tela de login.
- **Superadmin** pode **trocar a UASG ativa** a qualquer momento (seletor no cabeçalho) → backend emite novo token com outra `uasg_ativa`.
- **Usuário comum** só entra se `uasg selecionada == uasg_origem`; caso contrário, erro genérico ("UASG, e-mail ou senha inválidos") para não revelar dados.

### 3.4 Regras de senha
- Senha **gerada pelo superadmin** no cadastro (botão "Gerar senha aleatória" + opção de digitar); exibida **uma única vez** na tela para repasse ao usuário (o sistema não envia e-mail).
- `forca_troca_senha = true` em todo cadastro/reset → no 1º login abre o modal obrigatório de troca.
- Mínimo **8 caracteres**; não pode ser igual à anterior.
- **Bloqueio temporário** (15 min) após 5 tentativas incorretas.
- Superadmin pode **redefinir** a senha de qualquer usuário (gera nova temporária).
- O **master** inicia com `admin123` **conforme solicitado**, **sem troca obrigatória** (decisão D2 do usuário). Usuários comuns criados pelo superadmin continuam com troca no 1º acesso.

---

## 4. Backend — o que será feito

1. **Dependências:** `bcryptjs`, `jsonwebtoken` (+ tipos).
2. **`schema.sql`:** novas tabelas `uasgs` e `usuarios_calc`, colunas `uasg` e índices; migração idempotente (`ADD COLUMN IF NOT EXISTS`).
3. **Seed automático no `initDatabase`:** cria o master `ulisses.goularte@ebserh.gov.br` (role `superadmin`, `admin123`, `forca_troca_senha=true`) se não existir; cria a UASG inicial **155012 – HUCAM** (dados que já estão em uso) *(ver D4)*.
4. **Novos arquivos:**
   - `services/authService.ts` — hash, verificação, emissão/validação de JWT, política de senha, bloqueio.
   - `middleware/auth.ts` — `autenticar` (valida token e injeta `req.usuario` e `req.uasgAtiva`) e `exigirSuperadmin`.
   - `routes/authRoutes.ts` e `routes/adminRoutes.ts` (ou equivalentes dentro do padrão atual do `server.ts`).
5. **Endpoints de autenticação:**
   | Método | Rota | Acesso | Função |
   | :--- | :--- | :--- | :--- |
   | GET | `/api/auth/uasgs` | público | lista mínima (`id`, `uasg`, `sigla`, `nome`) para o seletor do login |
   | POST | `/api/auth/login` | público | `{uasgId, email, senha}` → token + dados do usuário/UASG |
   | GET | `/api/auth/me` | autenticado | usuário e UASG da sessão |
   | POST | `/api/auth/alterar-senha` | autenticado | senha atual + nova |
   | POST | `/api/auth/trocar-uasg` | superadmin | emite token para outra UASG |
6. **Endpoints de administração (somente superadmin):**
   | Método | Rota | Função |
   | :--- | :--- | :--- |
   | GET/POST/PUT | `/api/admin/usuarios` | listar, criar (com senha gerada) e editar |
   | POST | `/api/admin/usuarios/:id/resetar-senha` | nova senha temporária |
   | PATCH | `/api/admin/usuarios/:id/ativo` | ativar/inativar |
   | GET/POST/PUT | `/api/admin/uasgs` | CRUD de UASGs |
   | POST | `/api/admin/uasgs/importar-rauf` | importa instituições do Rauf (upsert por UASG) |
   - Proteções: o master não pode ser inativado, rebaixado nem excluído; e-mail único; UASG com 6 dígitos numéricos.
7. **Proteção das rotas existentes:** aplicar `autenticar` a **todas** as rotas `/api/*` (exceto `/api/auth/login` e `/api/auth/uasgs`).
8. **Isolamento por UASG:** `historyService`, `supplierMemoryService`, dashboard e pesquisas passam a filtrar/gravar por `uasg` da sessão. `instituicaoId`, `uasg`, `siglaOrgao`, destinatário e município passam a vir **da UASG da sessão** (não mais do corpo da requisição) — evita adulteração.
9. **`raufIntegrationService`:** usa `rauf_instituicao_id` e `uasg` da UASG ativa.

---

## 5. Frontend — o que será feito

### 5.1 Preparação do projeto (requisito do componente)
- Instalar **Tailwind CSS v4** (`tailwindcss` + `@tailwindcss/vite`), `framer-motion`, `@radix-ui/react-slot`, `class-variance-authority`, `clsx`, `tailwind-merge` (`lucide-react` já existe).
- Configurar **alias `@/` → `src/`** em `vite.config.ts` e `tsconfig.app.json` (`baseUrl`/`paths`).
- Criar `src/lib/utils.ts` (`cn`) e a pasta **`src/components/ui/`** — importante por ser o caminho padrão do shadcn: os componentes copiados importam `@/lib/utils` e `./button`, e o CLI/ferramentas esperam essa estrutura.
- Criar `components.json` (estilo shadcn) e definir os **tokens CSS** (`--background`, `--foreground`, `--muted`, `--muted-foreground`, `--border`, `--primary`, `--ring`, etc.) exigidos por `bg-muted/60`, `text-muted-foreground`, `border-input`…
- **Mitigação de regressão visual:** importar o Tailwind **sem o `preflight`** (somente `theme` + `utilities`) para não alterar o CSS atual do sistema (`card`, `btn-primary`, `form-input`…).
- Ajustes de compatibilidade do componente: `verbatimModuleSyntax` (usar `import type`), remover `'use client'` (Next.js), manter `framer-motion` apenas na tela de login.

### 5.2 Componentes
- `components/ui/button.tsx`, `input.tsx` (shadcn, conforme fornecidos) e **`label`/`select` simples** no mesmo padrão.
- **`components/ui/auth-page.tsx` adaptado** (ver 5.3).
- `contexts/AuthContext.tsx` — estado da sessão (usuário, UASG, token), `login`, `logout`, `alterarSenha`, `trocarUasg`.
- `lib/apiFetch.ts` — wrapper de `fetch` que injeta o token e trata `401`; **substitui as ~29 chamadas** atuais.
- `components/ModalAlterarSenha.tsx` — troca voluntária e **troca obrigatória** no 1º acesso (não pode ser fechado).
- `components/AdminTab.tsx` — área do superadmin (sub-abas **Usuários** e **UASGs**).

### 5.3 Adaptação da tela de login (`AuthPage`)
| Original | Adaptado |
| :--- | :--- |
| Marca "Asme" | Marca do sistema: **Plataforma de Retenções Tributárias** (ícone `Building2`/`Landmark`) |
| Depoimento "Ali Hassan" | Texto institucional (IN RFB 1.234/2012, SEI, SICAF…) |
| Botões Google / Apple / GitHub + separador "OR" | **Removidos** |
| Campo único de e-mail ("Continue with Email") | **UASG (select)** + **E-mail** + **Senha** (com mostrar/ocultar) + botão **Entrar** |
| "Sign In or Join Now!" / criar conta | **"Acesse sua conta"** — sem autocadastro (usuários criados só pelo superadmin) |
| Link "Home", Termos / Privacidade | Removidos; rodapé com versão e aviso "Acesso restrito" |
| Textos em inglês | **Português** |
| — | Estados: carregando, erro (UASG/e-mail/senha inválidos, conta bloqueada), lista de UASGs indisponível |
| Camada visual | Mantém `FloatingPaths` animado e layout em 2 colunas (responsivo) |

### 5.4 Tela de análise e cabeçalho
- **Remover** o card "Identidade do Órgão / Unidade Gestora (Multi-Tenant)" e o badge antigo.
- **Novo cabeçalho** exibe: `SIGLA · UASG 155012`, nome do órgão e CNPJ (tooltip), **nome do usuário conectado**, perfil e menu com **Alterar senha** e **Sair**.
- **Superadmin:** seletor para **trocar a UASG de trabalho** no cabeçalho (recarrega os dados da nova UASG).
- Cidade (ISSQN), CNPJ do destinatário e demais dados do órgão passam a ser lidos da **UASG da sessão**.
- Nova aba **"Administração"** (visível só ao superadmin).
- O botão "Sincronizar Rauf" muda de lugar: passa a existir na aba **Administração → UASGs** ("Importar do Rauf").

---

## 6. Detalhes/lacunas identificados na análise (além do que foi pedido)

1. **Município da UASG** é necessário para a regra de ISSQN — incluído no cadastro de UASG.
2. **Isolamento dos dados existentes:** o histórico atual não tem `uasg`; precisa de regra de migração (D4).
3. **Segurança herdada da integração com o Rauf** *(ponto de atenção)*: para destravar a sincronização, os endpoints `GET /retencoes/instituicoes` (retorna e-mail de contato de todas as instituições) e `POST /retencoes/sincronizar` do Rauf ficaram **públicos**. Recomenda-se **protegê-los com uma chave de integração** (`X-Integration-Key`, variável de ambiente no Render e no `calc_impostos`) e remover `emailContato` da listagem pública. Está na Fase 7 (D5).
4. **Senha `admin123` em ambiente público (Render):** por ser conhecida, o master deve ter troca obrigatória no primeiro acesso; recomenda-se também definir `JWT_SECRET` forte no Render.
5. **Sem envio de e-mail:** não há SMTP no `calc_impostos`; a senha temporária é repassada manualmente pelo superadmin (mostrada uma única vez).
6. **Auditoria mínima:** registrar `ultimo_login` e eventos sensíveis (criação/reset de usuário, troca de UASG) no log do servidor.
7. **Sessão simultânea do superadmin em outra UASG** não mistura dados: cada requisição usa a `uasg_ativa` do token.

---

## 7. Decisões (confirmadas pelo usuário / padrão adotado)

| # | Decisão | Resultado |
| :--- | :--- | :--- |
| D1 | Perfis de usuário | ✅ Apenas **`superadmin`** e **`usuario`** |
| D2 | Troca de senha obrigatória do master | ✅ **Não** — master entra com `admin123` sem troca forçada |
| D3 | Memória tributária de fornecedores | ✅ **Isolada por UASG** |
| D4 | Dados já existentes (sem UASG) | ✅ Atribuídos à UASG **155012 – HUCAM** (já migrado em `notas_analisadas`/`retencoes`) |
| D5 | Proteção dos endpoints do Rauf | ✅ **Já implementada por outro agente** (`X-API-Key` por órgão, chaves em `RAUF_API_KEYS`). Fase 7 não será refeita; a importação de UASGs do Rauf fica limitada aos órgãos com chave configurada no servidor |

Mecanismo de isolamento adotado: `AsyncLocalStorage` (contexto da requisição com usuário + UASG ativa), evitando alterar a assinatura de todos os serviços; `apiFetch` central no frontend.

Padrões mantidos:

| # | Decisão | Padrão |
| :--- | :--- | :--- |
| D6 | Lista de UASGs na tela de login | **Pública** (apenas id, UASG, sigla e nome). Alternativa: digitar o código da UASG |
| D7 | Local do token | `sessionStorage` + header `Authorization` (alternativa: cookie httpOnly) |

---

## 8. Fases de implementação

- [ ] **Fase 1 — Banco e seed:** `schema.sql` (`uasgs`, `usuarios_calc`, colunas `uasg`), seed do master e da UASG inicial, migração dos dados existentes.
- [ ] **Fase 2 — Backend de autenticação:** `authService`, middleware, rotas `/api/auth/*`, bloqueio por tentativas, JWT.
- [ ] **Fase 3 — Backend administrativo e isolamento:** rotas `/api/admin/*`; proteção de todas as rotas; filtros por `uasg` em histórico, memória, dashboard e integração Rauf.
- [ ] **Fase 4 — Base do frontend:** Tailwind v4 (sem preflight), alias `@/`, `lib/utils`, `components/ui` (button, input, label), `AuthContext`, `apiFetch` e migração das ~29 chamadas `fetch`.
- [ ] **Fase 5 — Tela de login:** `AuthPage` adaptada, modal de troca de senha (obrigatória e voluntária).
- [ ] **Fase 6 — Cabeçalho e Administração:** novo cabeçalho (UASG + usuário + menu), remoção do card de identidade, aba **Administração** (usuários e UASGs, importação do Rauf).
- [x] **Fase 7 — Segurança da integração Rauf:** já entregue por outro agente (`X-API-Key` por órgão). Nada a fazer.
- [ ] **Fase 8 — Testes e entrega:** build front/back sem erros; testes de API (login válido/ inválido, UASG divergente, bloqueio, troca de senha, isolamento entre UASGs, rotas sem token → 401); validação visual no navegador (login, cabeçalho, administração); atualização do **Relatório integração Calc-Rauf.md**; commit/push dos dois repositórios.

---

## 9. Critérios de aceite

1. Sem token, qualquer rota `/api/*` (exceto login e lista de UASGs) retorna **401**.
2. O master `ulisses.goularte@ebserh.gov.br` / `admin123` entra (sem troca forçada) e vê a aba **Administração**.
3. O superadmin cadastra uma UASG e um usuário (com senha gerada exibida uma vez) e o usuário consegue logar **somente** na sua UASG de origem.
4. O usuário altera a própria senha pelo menu do cabeçalho; a senha antiga deixa de funcionar.
5. O cabeçalho mostra UASG, órgão, usuário conectado, **Alterar senha** e **Sair**; o card de identidade não existe mais na análise.
6. O superadmin troca de UASG no cabeçalho e **só enxerga** os dados da UASG selecionada.
7. Notas, memória tributária e retenções enviadas ao Rauf saem com a `uasg`/`instituicao_id` da sessão.
8. Tela de login responsiva (desktop/mobile), em português, sem botões de login social.
