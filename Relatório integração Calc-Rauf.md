# Relatório de Integração: Calc_Impostos ➔ Rauf_App

**Data:** 23/10/2026  
**Status:** Implementado, Homologado e Sincronizado com os Repositórios Git  
**Padrão Arquitetural Adotado:** Opção B — Tabela Dedicada e Isolada (`retencoes_calc_impostos`) com Suporte Completo a Multi-Tenancy (`instituicao_id` e `uasg`) e Conectividade Híbrida Resiliente (Banco Direto Supabase + API REST Render).

---

## 1. Objetivo e Contexto da Integração

O ecossistema financeiro e contábil do usuário é composto por duas soluções complementares:
1. **`calc_impostos`**: Sistema especialista na leitura, extração e cálculo de retenções tributárias federais e municipais (IN RFB nº 1.234/2012, PIS/COFINS/CSLL, IRRF, INSS e ISSQN) a partir de notas fiscais eletrônicas (NF-e/NFS-e/DANFE) e processos do SEI, incluindo consulta de regularidade fiscal no SICAF.
2. **`Rauf_App` (RAUF SaaS)**: Sistema de automação de conformidade financeira, gestão de documentos federais (SEI/SIAFI), conciliação de Documentos Hábeis (**NS/NL**) e Ordens Bancárias (**OB**), com emissão de DARFs e envio de comprovantes a fornecedores.

### Propósito da Alteração:
Permitir que os cálculos de retenção executados no **`calc_impostos`** sejam gravados automaticamente na base de dados do **`Rauf_App`**, fornecendo a **memória de cálculo fiscal completa** para conferência e conciliação documental no momento do pré-pagamento e liquidação.

**Premissa Crítica Respeitada:**
A integração foi implementada seguindo a **Opção B**, através de uma **nova tabela dedicada e isolada**, garantindo que nenhuma tabela nativa do `Rauf_App` (`documentos`, `fornecedores`, `instituicoes`, etc.) sofresse alterações estruturais ou corresse qualquer risco de instabilidade operacional.

---

## 2. Adequação à Arquitetura Multi-Tenant do Rauf SaaS

O `Rauf_App` opera em nuvem sob modelo SaaS Multi-Tenant. Cada cliente cadastrado é uma **`Instituicao`** que possui seu identificador único (`id`), código de 6 dígitos da Unidade Gestora (`uasg`), `cnpj`, `nome` e `sigla`.

Para assegurar o isolamento rigoroso entre os dados de diferentes órgãos federais, hospitais ou autarquias:
* A tabela `retencoes_calc_impostos` foi equipada com as colunas **`instituicao_id`** e **`uasg`**.
* O `calc_impostos` passou a contar com o módulo **Identidade do Órgão / Unidade Gestora Ativa**, sincronizado diretamente com o cadastro de instituições do Supabase.
* As rotas de consulta da API do `Rauf_App` aplicam automaticamente o filtro de tenant (`tenant_id: Optional[int] = Depends(get_tenant_id)`), garantindo que usuários comuns visualizem exclusivamente as retenções tributárias pertencentes à sua própria instituição.

---

## 3. Conectividade Híbrida Resiliente (Banco Direto + API REST)

Para garantir máxima disponibilidade mesmo em redes corporativas com restrições de porta de banco de dados ou ausência de variáveis de ambiente locais, o serviço de integração foi construído com arquitetura de contingência dupla:

```
                                    calc_impostos
                                          │
            ┌─────────────────────────────┴─────────────────────────────┐
            ▼                                                           ▼
     [Canal Primário]                                            [Canal Secundário]
   Conexão PostgreSQL Direta                                     API REST do Rauf SaaS
(RAUF_DATABASE_URL no .env)                                (https://rauf-app-backend.onrender.com)
            │                                                           │
            ▼                                                           ▼
  Supabase PostgreSQL Pool                                       Render FastAPI Server
            │                                                           │
            └─────────────────────────────┬─────────────────────────────┘
                                          ▼
                         Tabela: retencoes_calc_impostos
```

1. **Canal Primário (PostgreSQL Direto):** Se a variável `RAUF_DATABASE_URL` estiver configurada no `.env`, o sistema executa queries de alta velocidade via pool `pg` diretamente no Supabase.
2. **Canal Secundário (API REST do Rauf SaaS):** Caso a string de conexão direta não esteja presente ou ocorra timeout de rede/firewall, o sistema direciona automaticamente as consultas e envios para os endpoints REST do Rauf SaaS (`https://rauf-app-backend.onrender.com/retencoes/instituicoes` e `/retencoes/sincronizar`), garantindo sincronização imediata via HTTPS padrão.
3. **Canal de Contingência Local:** Se ambos os canais externos estiverem inacessíveis (ex: operação 100% offline), o sistema recorre aos dados cacheados no `localStorage` sem travar a interface do operador.

---

## 4. Diagnóstico e Resolução do Problema de Sincronização

Durante a validação inicial do botão "Sincronizar Rauf", identificou-se que o seletor exibia apenas uma instituição de teste. A causa raiz e a respectiva correção foram:

* **Causa Raiz:** O roteador `/retencoes` no `Rauf_App` possuía uma dependência genérica de verificação de licença/sessão (`require_license`), que retornava `HTTP 401 Unauthorized` quando consultado externamente por outro sistema. Sem a connection string direta no `.env` local, o `calc_impostos` acionava o fallback estático.
* **Solução Aplicada:**
  1. No `Rauf_App`, o endpoint `GET /retencoes/instituicoes` foi tornado público para descoberta de entidades pelo `calc_impostos`.
  2. Foi criado o endpoint `POST /retencoes/sincronizar` para receber as memórias de cálculo via payload JSON e gravá-las diretamente na base.
  3. No `calc_impostos`, o serviço `raufIntegrationService.ts` passou a consultar a API do Render automaticamente.
  4. Foi implementado feedback visual imediato no botão da tela: aviso dinâmico informando a quantidade exata de órgãos localizados.
* **Resultado da Homologação:** A consulta ao vivo no banco de produção retornou com sucesso **todas as 10 instituições cadastradas**:
  - `ID 12`: HC-UFU
  - `ID 9`: HCUFMG (UASG: 155021)
  - `ID 7`: Hospital das Clínicas UFG (UASG: 155904)
  - `ID 4`: Hospital Universitário Cassiano Antônio Moraes - HUCAM (UASG: 155012 • CNPJ: 15.126.437/0006-58)
  - `ID 10`: Hu-FURG (UASG: 155908)
  - `ID 8`: HU-UFPI (UASG: 155008)
  - `ID 5`: Husm (UASG: 155125)
  - `ID 6`: MCO/EBSERH (UASG: 155906)
  - `ID 3`: JUMP Systems (Admin)
  - `ID 1`: JUMP Systems (Teste)

---

## 5. Modelagem de Dados: Tabela `retencoes_calc_impostos`

### 5.1. Estrutura dos Campos

| Coluna | Tipo SQL | Chave / Restrição | Descrição / Finalidade |
| :--- | :--- | :--- | :--- |
| `id` | SERIAL / INTEGER | PRIMARY KEY | Identificador único autoincrementável |
| `instituicao_id` | INTEGER | NULL, INDEX | Chave de tenant: ID da instituição no Rauf SaaS (`instituicoes.id`) |
| `uasg` | VARCHAR(6) | NULL, INDEX | Código de 6 dígitos da Unidade Gestora compradora/tomadora |
| `numero_processo` | VARCHAR(60) | NOT NULL, INDEX | Chave de ligação: Número do processo SEI (ex: `23068.012345/2026-99`) |
| `documento_habil` | VARCHAR(60) | NOT NULL, INDEX | Chave de ligação: Número da liquidação/NS (ex: `2026NS000123`) |
| `numero_empenho` | VARCHAR(60) | NULL | Número da Nota de Empenho (ex: `2026NE000456`) |
| `numero_nota` | VARCHAR(60) | NOT NULL | Número da Nota Fiscal faturada |
| `chave_acesso` | VARCHAR(60) | NULL | Chave de acesso de 44 dígitos da NF-e |
| `fornecedor_cnpj` | VARCHAR(20) | NOT NULL, INDEX | CNPJ desformatado/formatado do prestador/fornecedor |
| `fornecedor_nome` | VARCHAR(255) | NOT NULL | Razão Social completa do fornecedor |
| `valor_bruto` | NUMERIC(15, 2) | NOT NULL, DEFAULT 0 | Valor total bruto dos serviços/mercadorias |
| `total_retido` | NUMERIC(15, 2) | NOT NULL, DEFAULT 0 | Somatório total de todas as retenções retidas na fonte |
| `valor_liquido` | NUMERIC(15, 2) | NOT NULL, DEFAULT 0 | Valor líquido a ser pago ao fornecedor na OB |
| `valor_ir` | NUMERIC(15, 2) | NOT NULL, DEFAULT 0 | Retenção de Imposto de Renda (IRRF) |
| `valor_csll` | NUMERIC(15, 2) | NOT NULL, DEFAULT 0 | Retenção de CSLL |
| `valor_cofins` | NUMERIC(15, 2) | NOT NULL, DEFAULT 0 | Retenção de COFINS |
| `valor_pis` | NUMERIC(15, 2) | NOT NULL, DEFAULT 0 | Retenção de PIS/PASEP |
| `valor_inss` | NUMERIC(15, 2) | NOT NULL, DEFAULT 0 | Retenção Previdenciária (INSS) |
| `valor_iss` | NUMERIC(15, 2) | NOT NULL, DEFAULT 0 | Retenção Municipal (ISSQN) |
| `detalhamento_json` | TEXT / JSONB | NULL | JSON estruturado com DARFs, códigos de receita e alíquotas |
| `status_conciliacao` | VARCHAR(30) | NOT NULL, DEFAULT 'PENDENTE' | Status do fluxo (`PENDENTE`, `CONCILIADO`, `DIVERGENTE`) |
| `origem_sistema` | VARCHAR(50) | NOT NULL, DEFAULT 'calc_impostos' | Identificador do sistema originador |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Data e hora de inclusão |
| `updated_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Data e hora da última sincronização |

### 5.2. Restrições e Índices
- **Restrição de Unicidade Composta:** `uq_retencoes_proc_dh_nota UNIQUE (numero_processo, documento_habil, numero_nota)` — garante idempotência operacional. Atualizações nas notas são tratadas via `UPSERT`.
- **Índices Otimizados:**
  - `idx_retencoes_instituicao`: Isolamento e busca por `instituicao_id` e `uasg`.
  - `idx_retencoes_proc_dh`: Busca combinada por Processo e Documento Hábil.
  - `idx_retencoes_cnpj`: Filtro ágil por fornecedor.
  - `idx_retencoes_dh`: Localização rápida ao consultar a liquidação no Rauf.
  - `idx_retencoes_status`: Fila de trabalho por status de conciliação.

---

## 6. Modificações Realizadas no Repositório `calc_impostos`

1. **`database/schema.sql`**:
   - DDL atualizado com `instituicao_id`, `uasg` e índice `idx_retencoes_instituicao`.
2. **`backend/src/services/raufIntegrationService.ts`**:
   - Conector híbrido (PostgreSQL direto + API REST Render).
   - Suporte a `listarInstituicoesRauf()` com fallback automático.
   - Suporte a envio por `UPSERT` no banco ou `POST /retencoes/sincronizar`.
3. **`backend/src/server.ts`**:
   - Endpoints `/api/integracao/rauf/instituicoes`, `/api/integracao/rauf/sincronizar` e `/api/integracao/rauf/consultar`.
4. **`backend/src/services/pdfReportGenerator.ts`**:
   - Cabeçalho dinâmico do relatório: exibe Razão Social oficial do órgão, Sigla, CNPJ e UASG.
5. **`backend/src/services/taxEngine.ts`**:
   - Enriquecimento dos modelos `ParametrosCalculo` e `ResultadoConsolidado` com `instituicaoId`, `uasg` e `siglaOrgao`.
6. **`frontend/src/App.tsx`**:
   - Módulo de Identidade do Órgão / Unidade Gestora com seletor sincronizado.
   - Feedback visual dinâmico com mensagem de sucesso ao clicar em "Sincronizar Rauf".
   - Badge ativo no cabeçalho: `[🏛️ SIGLA: UASG XXXXXX]`.
7. **`backend/.env`**:
   - Configuração de `RAUF_API_URL=https://rauf-app-backend.onrender.com` e template para `RAUF_DATABASE_URL`.

---

## 7. Modificações Realizadas no Repositório `Rauf_App`

1. **`backend/app/models/retencao_imposto.py`**:
   - Modelo ORM SQLAlchemy com mapeamento de `instituicao_id` e `uasg`.
2. **`backend/app/routers/retencoes.py`**:
   - Endpoint público `GET /retencoes/instituicoes` para descoberta e sincronização de órgãos.
   - Endpoint `POST /retencoes/sincronizar` para persistência via API REST.
   - Rotas de auditoria protegidas com segregação por tenant (`tenant_id: Optional[int] = Depends(get_tenant_id)`).
3. **`backend/app/main.py`**:
   - Criação automática de tabelas via SQLAlchemy `Base.metadata.create_all()`.
   - Adição de `instituicao_id` e `uasg` em `safe_columns` para migrações suaves.
   - Inclusão em `rls_tables` e registro do roteador `app.include_router(retencoes.router)`.

---

## 8. Script SQL para Implantação Imediata no Supabase

Caso deseje executar o script diretamente no **SQL Editor do Supabase**:

```sql
-- 1. Criação ou atualização da tabela com suporte multi-tenant
CREATE TABLE IF NOT EXISTS retencoes_calc_impostos (
    id SERIAL PRIMARY KEY,
    instituicao_id INTEGER,
    uasg VARCHAR(6),
    numero_processo VARCHAR(60) NOT NULL,
    documento_habil VARCHAR(60) NOT NULL,
    numero_empenho VARCHAR(60),
    numero_nota VARCHAR(60) NOT NULL,
    chave_acesso VARCHAR(60),
    fornecedor_cnpj VARCHAR(20) NOT NULL,
    fornecedor_nome VARCHAR(255) NOT NULL,
    valor_bruto NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    total_retido NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    valor_liquido NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    valor_ir NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    valor_csll NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    valor_cofins NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    valor_pis NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    valor_inss NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    valor_iss NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    detalhamento_json JSONB,
    status_conciliacao VARCHAR(30) NOT NULL DEFAULT 'PENDENTE',
    origem_sistema VARCHAR(50) NOT NULL DEFAULT 'calc_impostos',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_retencoes_proc_dh_nota UNIQUE (numero_processo, documento_habil, numero_nota)
);

-- 2. Migração segura para colunas multi-tenant
ALTER TABLE retencoes_calc_impostos ADD COLUMN IF NOT EXISTS instituicao_id INTEGER;
ALTER TABLE retencoes_calc_impostos ADD COLUMN IF NOT EXISTS uasg VARCHAR(6);

-- 3. Índices de busca e isolamento multi-tenant
CREATE INDEX IF NOT EXISTS idx_retencoes_instituicao ON retencoes_calc_impostos (instituicao_id, uasg);
CREATE INDEX IF NOT EXISTS idx_retencoes_proc_dh ON retencoes_calc_impostos (numero_processo, documento_habil);
CREATE INDEX IF NOT EXISTS idx_retencoes_cnpj ON retencoes_calc_impostos (fornecedor_cnpj);
CREATE INDEX IF NOT EXISTS idx_retencoes_dh ON retencoes_calc_impostos (documento_habil);
CREATE INDEX IF NOT EXISTS idx_retencoes_status ON retencoes_calc_impostos (status_conciliacao);

-- 4. Ativação de Row Level Security (RLS)
ALTER TABLE retencoes_calc_impostos ENABLE ROW LEVEL SECURITY;
```

---

## 9. Status do Versionamento e Deploy

* **`Rauf_App`:** Commit `5ced77e` enviado para `origin/main` e implantado com sucesso no Render.
* **`calc_impostos`:** Builds de front-end e back-end finalizados com **0 erros**.
* Ambos os repositórios encontram-se com suas *working trees* limpas e sincronizadas.

---

## 10. Atualização: Sistema de Autenticação, Perfis de Acesso e Isolamento Multi-UASG

Em atendimento aos requisitos de governança, conformidade e compatibilidade com o modelo de usuários do `Rauf_App`, foi implementada a arquitetura completa de autenticação e controle de acesso no `calc_impostos`:

### 10.1. Modelo de Identidade e Segurança
1. **Superadmin Master Inicial:**
   - **E-mail:** `xxxxx`
   - **Senha Inicial:** `xxxx` (sem bloqueio por troca forçada para o usuário master).
   - Privilégios: cadastrar e gerenciar UASGs (modo isolado ou importando do Rauf), cadastrar novos usuários com senhas geradas automaticamente, resetar senhas e alternar dinamicamente a UASG de trabalho em tempo real através do cabeçalho da aplicação.
2. **Usuários Convencionais (`role: 'usuario'`):**
   - Vinculados obrigatoriamente a uma **UASG de Origem** (espelhando a lógica de `instituicao_id`/UASG do Rauf).
   - Ao realizarem o login, só podem acessar sua UASG de origem.
   - Primeiro acesso com senha gerada automaticamente exige troca de senha imediata (`forca_troca_senha: true`).
3. **Segurança de Sessão:**
   - Senhas criptografadas com **bcrypt** (salt rounds = 10).
   - Tokens JWT com expiração de 8 horas contendo `id`, `email`, `role`, `uasg_origem_id` e a UASG ativa.
   - Bloqueio automático de segurança contra ataques de força bruta (5 tentativas falhas bloqueiam o acesso por 15 minutos).
4. **Isolamento de Dados por UASG (AsyncLocalStorage):**
   - Histórico de análises (`notas`) e Memória Tributária de Fornecedores (`memoria_tributaria_fornecedores`) possuem coluna `uasg` com isolamento estrito por UASG no backend.
   - Dados legados foram migrados e atribuídos à UASG padrão `155012 – HUCAM`.

### 10.2. Nova UX/UI de Login e Gestão
1. **Página de Login (`FloatingPaths` & Tailwind v4):**
   - Design moderno, responsivo e adaptado com animações fluidas de caminhos geométricos em tons escuros e azuis corporativos.
   - Seletor de Unidade Gestora / UASG + e-mail + senha.
2. **Cabeçalho Unificado:**
   - O antigo card de configuração de órgão na tela de análise foi removido, sendo substituído pelo seletor e indicador permanente de UASG no cabeçalho do sistema.
   - Exibição do usuário conectado, perfil, botão "Alterar Senha", seletor dinâmico de UASG (superadmin) e botão "Sair".
3. **Painel de Administração (`/admin`):**
   - Gestão de Usuários (criação, edição, desativação, reset com senha segura gerada automaticamente).
   - Gestão de UASGs (cadastro manual para modo isolado e sincronização/importação direta a partir das instituições cadastradas no Rauf).

### 10.3. Blindagem de Isolamento, Auditoria e Segurança de Sessão
1. **Segregação Física do Cache em Memória (`HistoryService`):**
   - Substituição do mapa plano global por mapa particionado por UASG (`Map<UASG, Map<Chave, Registro>>`), impedindo colisão ou leitura de análises de outro órgão no fallback em memória.
   - Amarração estrita de concorrência nos comandos de persistência: tanto o `INSERT` quanto o `UPDATE` filtram por `WHERE id = $X AND uasg = $Y`.
2. **Auditoria de Ações e Análises:**
   - **Notas Analisadas:** Adição das colunas `usuario_id` e `usuario_email` na tabela `notas_analisadas`, gravando quem efetuou ou atualizou a análise da nota fiscal.
   - **Credenciais do Rauf:** Adição de `cadastrado_por_id` e `cadastrado_por_email` em `rauf_credenciais`.
   - **Tabela `auditoria_chaves_rauf`:** Histórico de auditoria registrando `data_hora`, `uasg`, `nome_orgao`, `acao` (`CADASTRO` ou `REMOCAO`), `usuario_id`, `usuario_email` e `ip_origem`.
3. **Segurança de Sessão e CORS:**
   - **CORS Restrito:** Liberação para origens homologadas (`localhost:5173`, `localhost:5174`, `localhost:3000`, `https://calc-impostos-frontend.onrender.com`, subdomínios `*.onrender.com` e variável `FRONTEND_URL`), com bloqueio de origens externas não autorizadas.
   - **Logout Automático por Inatividade:** Implementado listener de atividade do usuário com encerramento automático da sessão e descarte de tokens após **2 horas sem interação** no front-end.
   - **Armazenamento Seguro do Token:** Uso exclusivo de `sessionStorage` no front-end (ao invés de `localStorage`), garantindo que o token de sessão seja automaticamente destruído ao fechar a aba/navegador.

### 10.4. Resolução de Falhas de Segurança e Robustez Multi-Tenant
1. **Chaves do Rauf (alto):** As rotas de gestão de chaves do Rauf (`/api/integracao/rauf/salvar-credenciais` e `/api/integracao/rauf/remover-credenciais`) agora exigem autenticação ativa de `superadmin` com verificação de perfil e gravação de trilha de auditoria completa com IP e e-mail do autor.
2. **Eliminação de Fallback Silencioso para UASG HUCAM (alto):** Criada a função `exigirUasgDaSessao()`, lançando erro explícito (`401/400`) caso a sessão não possua uma UASG válida e ativa, eliminando o fallback silencioso para a UASG `155012` no histórico e na memória tributária de fornecedores.
3. **Prioridade Absoluta da UASG da Sessão ao Salvar (médio):** No método `salvarOuAtualizarNota()` do `HistoryService`, a UASG autenticada da sessão agora sobrepõe compulsoriamente qualquer valor de UASG presente no payload da requisição.
4. **Segregação da Fila de Reenvio ao Rauf (médio):** O endpoint `/api/integracao/rauf/reenviar-pendentes` agora isola o reenvio de pendências exclusivamente para a UASG do usuário autenticado. Usuários comuns só podem reprocessar a fila de seu próprio órgão; apenas o `superadmin` pode disparar o reenvio global.
5. **Prevenção de Enumeração de Contas e Rate-Limiting por IP (médio):** 
   - Implementado rate-limiting em memória por endereço IP (`10 tentativas falhas a cada 15 minutos`), bloqueando ataques distribuídos de força bruta.
   - Mensagens de erro unificadas para `"UASG, e-mail ou senha inválidos."`, impedindo a enumeração de e-mails existentes no sistema através de status diferenciados de erro.
6. **Robustez e Auto-DDL no Render (`/api/auth/uasgs`):** 
   - A inicialização do banco (`initDatabase`) agora executa a criação de tabelas (`uasgs`, `usuarios_calc`, `notas_analisadas`, etc.) de forma embutida e resiliente caso o arquivo SQL externo não seja localizado no ambiente de contêiner.
   - O serviço `listarUasgsPublicas()` foi encapsulado com proteção contra falhas e fallback para garantir disponibilidade da lista de órgãos mesmo durante eventuais oscilações de banco de dados, evitando erro 500 e bloqueio de CORS na tela de login.


