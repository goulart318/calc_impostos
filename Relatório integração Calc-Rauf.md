# Relatório de Integração: Calc_Impostos ➔ Rauf_App

**Data:** 23/10/2026  
**Status:** Implementado e Homologado  
**Padrão Arquitetural Adotado:** Opção B — Tabela Dedicada e Isolada (`retencoes_calc_impostos`) no Banco de Dados Supabase / PostgreSQL / SQLite.

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

## 2. Modelagem de Dados: Tabela `retencoes_calc_impostos`

A tabela foi projetada para suportar tanto **PostgreSQL (Supabase)** em produção quanto **SQLite** em ambiente local de desenvolvimento.

### 2.1. Estrutura dos Campos

| Coluna | Tipo SQL | Chave / Restrição | Descrição / Finalidade |
| :--- | :--- | :--- | :--- |
| `id` | SERIAL / INTEGER | PRIMARY KEY | Identificador único autoincrementável |
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
| `detalhamento_json` | TEXT | NULL | JSON estruturado com DARFs, códigos de receita e alíquotas |
| `status_conciliacao` | VARCHAR(30) | NOT NULL, DEFAULT 'PENDENTE' | Status do fluxo (`PENDENTE`, `CONCILIADO`, `DIVERGENTE`) |
| `origem_sistema` | VARCHAR(50) | NOT NULL, DEFAULT 'calc_impostos' | Identificador do sistema originador |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Data e hora de inclusão |
| `updated_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Data e hora da última sincronização |

### 2.2. Restrições e Índices
- **Restrição de Unicidade Composta:** `uq_retencoes_proc_dh_nota UNIQUE (numero_processo, documento_habil, numero_nota)` — garante idempotência, impedindo duplicidade caso o cálculo seja refeito. Se a nota for reprocessada, os valores são atualizados via `UPSERT` (`ON CONFLICT DO UPDATE`).
- **Índices de Performance:**
  - `idx_retencoes_proc_dh`: Busca combinada por Processo e Documento Hábil.
  - `idx_retencoes_cnpj`: Filtro ágil por fornecedor.
  - `idx_retencoes_dh`: Localização rápida ao consultar a liquidação no Rauf.
  - `idx_retencoes_status`: Fila de trabalho por status de conciliação.

---

## 3. Modificações Realizadas no Repositório `calc_impostos`

1. **`database/schema.sql`**:
   - Inclusão do DDL de criação da tabela `retencoes_calc_impostos`, restrições de unicidade e criação de índices.
2. **`backend/src/services/raufIntegrationService.ts`**:
   - Criação do serviço de integração inteligente.
   - Suporte a conexão primária dedicada através da variável de ambiente `RAUF_DATABASE_URL` (com fallback elegante para a conexão PostgreSQL padrão do sistema).
   - Método `inserirOuAtualizarRetencao(payload)`: Realiza a gravação via `UPSERT`, convertendo os campos numéricos e gravando o `detalhamento_json`.
   - Método `consultarRetencaoPorChave(processo, dh, numeroNota)`: Permite checar se uma nota já possui retenção homologada.
3. **`backend/src/services/historyService.ts`**:
   - Integrado o gatilho automático no método `salvarOuAtualizarNota()`: Toda vez que uma análise de nota é salva com `numeroProcesso` e `documentoHabil` informados, o serviço dispara de forma assíncrona e transparente a sincronização com o banco do Rauf.
4. **`backend/src/server.ts`**:
   - Criados endpoints dedicados para integração:
     - `POST /api/integracao/rauf/sincronizar`: Envia manualmente ou via script dados de retenção.
     - `GET /api/integracao/rauf/consultar`: Consulta registros já sincronizados.

---

## 4. Modificações Realizadas no Repositório `Rauf_App`

1. **`backend/app/models/retencao_imposto.py`**:
   - Criado o modelo declarativo ORM SQLAlchemy `RetencaoImposto`.
   - Totalmente compatível com SQLite (local) e PostgreSQL Supabase (produção).
2. **`backend/app/routers/retencoes.py`**:
   - Novo roteador FastAPI (`/retencoes`), com documentação automática no Swagger (`/docs`):
     - `GET /retencoes/`: Listagem paginada com múltiplos filtros (processo, documento hábil, CNPJ e status de conciliação).
     - `GET /retencoes/por-processo/{processo}`: Retorna a memória tributária do processo SEI pesquisado.
     - `GET /retencoes/por-documento-habil/{documento_habil}`: Localiza as retenções pelo documento hábil da liquidação (ex: `2026NS000123`).
     - `PATCH /retencoes/{id}/status`: Permite aos módulos do Rauf alterar o status da conciliação (`PENDENTE`, `CONCILIADO`, `DIVERGENTE`).
3. **`backend/app/main.py`**:
   - Importado o modelo `RetencaoImposto` para que o SQLAlchemy execute automaticamente o `Base.metadata.create_all()` no startup do servidor.
   - Incluída a tabela `"retencoes_calc_impostos"` no ciclo de ativação de segurança Row Level Security (RLS) do Supabase.
   - Registrado o roteador `app.include_router(retencoes.router)`.

---

## 5. Script SQL para Implantação Imediata no Supabase

Caso deseje criar a tabela imediatamente pelo **SQL Editor do Supabase** antes do próximo deploy do Rauf, execute o script abaixo:

```sql
-- Criação da tabela isolada de retencoes fiscais
CREATE TABLE IF NOT EXISTS retencoes_calc_impostos (
    id SERIAL PRIMARY KEY,
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
    detalhamento_json TEXT,
    status_conciliacao VARCHAR(30) NOT NULL DEFAULT 'PENDENTE',
    origem_sistema VARCHAR(50) NOT NULL DEFAULT 'calc_impostos',
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_retencoes_proc_dh_nota UNIQUE (numero_processo, documento_habil, numero_nota)
);

-- Índices de busca rápida
CREATE INDEX IF NOT EXISTS idx_retencoes_proc_dh ON retencoes_calc_impostos (numero_processo, documento_habil);
CREATE INDEX IF NOT EXISTS idx_retencoes_cnpj ON retencoes_calc_impostos (fornecedor_cnpj);
CREATE INDEX IF NOT EXISTS idx_retencoes_dh ON retencoes_calc_impostos (documento_habil);
CREATE INDEX IF NOT EXISTS idx_retencoes_status ON retencoes_calc_impostos (status_conciliacao);

-- Segurança e Row Level Security (RLS)
ALTER TABLE retencoes_calc_impostos ENABLE ROW LEVEL SECURITY;
```

---

## 6. Configuração de Conexão no `calc_impostos`

No arquivo `.env` do backend do `calc_impostos` (`calc_impostos/backend/.env`), adicione a variável com a URI do Supabase do Rauf:

```env
# Conexão direta com o banco de dados do Rauf_App (Supabase)
RAUF_DATABASE_URL=postgresql://postgres.[REF]:[SENHA]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require
```

> **Resiliência:** Se a variável `RAUF_DATABASE_URL` não for configurada, o `calc_impostos` utiliza sua própria conexão de banco local como contingência, sem travar a aplicação ou interromper a emissão dos relatórios de retenção.

---

## 7. Conclusão e Próximos Passos

A solução implementada entrega integração ponta a ponta:
- **Segurança:** O banco do `Rauf_App` não sofreu alterações em tabelas já em uso.
- **Eficiência:** O `calc_impostos` grava os dados via UPSERT com unicidade `(processo, doc_habil, nota)`.
- **Rastreabilidade:** O Rauf agora conta com endpoints REST (`/retencoes`) e uma tabela com a composição detalhada de cada tributo retido (IR, CSLL, COFINS, PIS, INSS e ISS) para bater com os valores líquidos das Ordens Bancárias e Documentos Hábeis.
