# Relatório de Integração: Calc_Impostos ➔ Rauf_App (Arquitetura Multi-Tenant)

**Data:** 23/10/2026  
**Status:** Implementado, Homologado e Sincronizado com os Repositórios Git  
**Padrão Arquitetural Adotado:** Opção B — Tabela Dedicada e Isolada (`retencoes_calc_impostos`) com Suporte Completo a Multi-Tenancy (`instituicao_id` e `uasg`).

---

## 1. Objetivo e Contexto da Integração

O ecossistema financeiro e contábil do usuário é composto por duas soluções complementares:
1. **`calc_impostos`**: Sistema especialista na leitura, extração e cálculo de retenções tributárias federais e municipais (IN RFB nº 1.234/2012, PIS/COFINS/CSLL, IRRF, INSS e ISSQN) a partir de notas fiscais eletrônicas (NF-e/NFS-e/DANFE) e processos do SEI, incluindo consulta de regularidade no SICAF.
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
* As rotas de consulta da API do `Rauf_App` aplicam automaticamente o filtro de tenant (`tenant_id: int | None = Depends(get_tenant_id)`), garantindo que usuários comuns visualizem exclusivamente as retenções tributárias pertencentes à sua própria instituição.

---

## 3. Modelagem de Dados: Tabela `retencoes_calc_impostos`

A tabela foi projetada para suportar tanto **PostgreSQL (Supabase)** em produção quanto **SQLite** em ambiente local de desenvolvimento.

### 3.1. Estrutura dos Campos

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

### 3.2. Restrições e Índices
- **Restrição de Unicidade Composta:** `uq_retencoes_proc_dh_nota UNIQUE (numero_processo, documento_habil, numero_nota)` — garante idempotência, impedindo duplicidade caso o cálculo seja refeito. Se a nota for reprocessada, os valores são atualizados via `UPSERT` (`ON CONFLICT DO UPDATE`).
- **Índices de Performance:**
  - `idx_retencoes_instituicao`: Busca e isolamento instantâneo por `instituicao_id` e `uasg`.
  - `idx_retencoes_proc_dh`: Busca combinada por Processo e Documento Hábil.
  - `idx_retencoes_cnpj`: Filtro ágil por fornecedor.
  - `idx_retencoes_dh`: Localização rápida ao consultar a liquidação no Rauf.
  - `idx_retencoes_status`: Fila de trabalho por status de conciliação.

---

## 4. Modificações Realizadas no Repositório `calc_impostos`

1. **`database/schema.sql`**:
   - Inclusão das colunas `instituicao_id` e `uasg`, criação da tabela `retencoes_calc_impostos`, restrições de unicidade e índices multi-tenant.
2. **`backend/src/services/raufIntegrationService.ts`**:
   - Método `listarInstituicoesRauf()`: Consulta diretamente as instituições no Supabase (`SELECT id, nome, cnpj, uasg, sigla FROM instituicoes ORDER BY nome ASC`) com fallback padrão seguro.
   - Atualização do método `inserirOuAtualizarRetencao()` para gravar `instituicao_id` e `uasg` no `INSERT` e atualizá-los no `UPSERT`.
   - Suporte à variável `RAUF_DATABASE_URL` no `.env`.
3. **`backend/src/server.ts`**:
   - Endpoint `GET /api/integracao/rauf/instituicoes`: disponibiliza a lista de órgãos/instituições do Rauf para o frontend.
   - Endpoints `/api/integracao/rauf/sincronizar` e `/api/integracao/rauf/consultar`.
4. **`backend/src/services/pdfReportGenerator.ts`**:
   - Cabeçalho 100% dinâmico: imprime a Razão Social do Órgão, Sigla, CNPJ e código UASG cadastrados, eliminando valores estáticos.
5. **`frontend/src/App.tsx`**:
   - Seletor de Identidade do Órgão / Unidade Gestora com sincronização em 1 clique com o Rauf SaaS.
   - Campos configuráveis: UASG (6 dígitos), Sigla/UG, CNPJ do Órgão, Cidade e Razão Social.
   - Badge ativo no cabeçalho: `[🏢 SIGLA: UASG XXXXXX]`.
   - Propagação automática dos dados do órgão em todas as análises, relatórios e gravações.

---

## 5. Modificações Realizadas no Repositório `Rauf_App`

1. **`backend/app/models/retencao_imposto.py`**:
   - Modelo declarativo ORM SQLAlchemy `RetencaoImposto` atualizado com `instituicao_id = Column(Integer, ForeignKey("instituicoes.id"), nullable=True, index=True)` e `uasg = Column(String(6), nullable=True, index=True)`.
2. **`backend/app/routers/retencoes.py`**:
   - Endpoint `GET /retencoes/instituicoes` para consulta e sincronização de órgãos.
   - Injeção de dependência `tenant_id: int | None = Depends(get_tenant_id)` em todas as rotas (`/retencoes/`, `/por-processo/`, `/por-documento-habil/`, `/{id}/status`), garantindo isolamento estrito por tenant para usuários regulares.
3. **`backend/app/main.py`**:
   - Auto-criação da tabela via SQLAlchemy `create_all()`.
   - Inclusão em `safe_columns` para migração suave de colunas existentes (`instituicao_id`, `uasg`).
   - Ativação de segurança Row Level Security (RLS) no Supabase.
   - Registro do roteador `app.include_router(retencoes.router)`.

---

## 6. Script SQL para Implantação Imediata no Supabase

Caso deseje criar ou atualizar a tabela diretamente no **SQL Editor do Supabase**, execute o script abaixo:

```sql
-- 1. Criação da tabela isolada de retenções com suporte multi-tenant
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

-- 2. Migração segura para bases existentes (adiciona colunas se já existia sem multi-tenancy)
ALTER TABLE retencoes_calc_impostos ADD COLUMN IF NOT EXISTS instituicao_id INTEGER;
ALTER TABLE retencoes_calc_impostos ADD COLUMN IF NOT EXISTS uasg VARCHAR(6);

-- 3. Índices de busca rápida e isolamento multi-tenant
CREATE INDEX IF NOT EXISTS idx_retencoes_instituicao ON retencoes_calc_impostos (instituicao_id, uasg);
CREATE INDEX IF NOT EXISTS idx_retencoes_proc_dh ON retencoes_calc_impostos (numero_processo, documento_habil);
CREATE INDEX IF NOT EXISTS idx_retencoes_cnpj ON retencoes_calc_impostos (fornecedor_cnpj);
CREATE INDEX IF NOT EXISTS idx_retencoes_dh ON retencoes_calc_impostos (documento_habil);
CREATE INDEX IF NOT EXISTS idx_retencoes_status ON retencoes_calc_impostos (status_conciliacao);

-- 4. Segurança e Row Level Security (RLS)
ALTER TABLE retencoes_calc_impostos ENABLE ROW LEVEL SECURITY;
```

---

## 7. Configuração de Conexão no `calc_impostos`

No arquivo `.env` do backend do `calc_impostos` (`calc_impostos/backend/.env`), informe a URI de conexão direta com o banco do Supabase do Rauf:

```env
# Conexão direta com o banco de dados do Rauf_App (Supabase)
RAUF_DATABASE_URL=postgresql://postgres.[REF]:[SENHA]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require
```

---

## 8. Conclusão

Com esta implementação:
- **Identidade do Órgão Totalmente Alinhada:** O `calc_impostos` agora espelha a mesma identidade institucional do `Rauf_App` (UASG, Nome, CNPJ e Sigla).
- **Segurança e Isolamento Multi-Tenant:** Toda retenção gravada fica vinculada ao `instituicao_id` e `uasg`, garantindo que nenhum órgão veja os lançamentos fiscais de outro.
- **Relatórios Oficiais Fidedignos:** O cabeçalho dos relatórios PDF e dossiês de conformidade pré-pagamento exibem dinamicamente a identificação completa da Unidade Gestora compradora.
