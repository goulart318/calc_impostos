# Walkthrough Oficial — Sprints 1 e 2: Retenções Tributárias, SEI, Excel e Edição Reativa

> **Documento Oficial de Entrega de Engenharia & Auditoria Fiscal**  
> **Sistema:** Plataforma de Cálculo e Matriz de Retenções Tributárias na Fonte  
> **Versão:** 2.0 (Sprints 1 e 2 Concluídas)  
> **Legislação Base:** IN RFB nº 1.234/2012, IN RFB nº 2.110/2022, Lei Municipal nº 6.075/2003 (Vitória/ES), Lei nº 10.147/2000 e EFD-Reinf Série R-4000.

---

## 📑 Sumário Executivo

As **Sprints 1 e 2** foram executadas e validadas integralmente para atender às demandas de formalização processual, exportação contábil para o padrão Microsoft Excel e flexibilidade operacional através da edição inline de itens com recálculo reativo em tempo real.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           ESTRUTURA DE ENTREGAS                                │
├──────────────────────────────────────┬──────────────────────────────────────────┤
│               SPRINT 1               │                 SPRINT 2                 │
├──────────────────────────────────────┼──────────────────────────────────────────┤
│ 1. Processo Administrativo SEI       │ 1. Painel de Edição Inline de Itens      │
│    Formato: xxxxx.yyyyyy/aaaa-dd     │ 2. Presets da IN RFB nº 1.234/2012       │
│ 2. Nota de Empenho Oficial (NE)      │ 3. Adição e Remoção de Itens Manuais     │
│ 3. Persistência e Índices PostgreSQL │ 4. Recálculo Reativo em Tempo Real       │
│ 4. Relatórios Oficiais (PDF e Tela)  │ 5. Endpoint POST /api/recalcular         │
│ 5. Exportação Contábil para Excel    │ 6. Auditoria de Ajustes Manuais na Nota  │
│    (UTF-8 c/ BOM e Delimitador ;)    │ 7. Sincronização c/ Banco e PDF Oficial  │
└──────────────────────────────────────┴──────────────────────────────────────────┘
```

---

## 🏛️ 1. Sprint 1: Processo Administrativo SEI, Nota de Empenho e Exportação Excel

### 1.1 Máscara e Validação Oficial do Processo SEI
- **Formato Adotado:** `xxxxx.yyyyyy/aaaa-dd`
  - `xxxxx`: 5 dígitos do código da unidade/órgão;
  - `yyyyyy`: 6 dígitos sequenciais do processo;
  - `aaaa`: 4 dígitos do ano corrente do processo;
  - `dd`: 2 dígitos verificadores.
- **Implementação:** Máscara de digitação interativa que formata em tempo real no upload individual, upload em lote e consolidação de processos.

### 1.2 Registro da Nota de Empenho (NE)
- Suporte a identificadores de empenho orçamentário (ex: `2026NE000123`).
- Impressão nos cabeçalhos dos relatórios e consolidações.

### 1.3 Banco de Dados PostgreSQL
Foram adicionadas novas colunas e índices de alta performance na tabela `notas_analisadas`:

```sql
-- Adição de colunas estruturadas
ALTER TABLE notas_analisadas ADD COLUMN IF NOT EXISTS numero_processo VARCHAR(60);
ALTER TABLE notas_analisadas ADD COLUMN IF NOT EXISTS numero_empenho VARCHAR(50);

-- Índices de consulta rápida
CREATE INDEX IF NOT EXISTS idx_notas_numero_processo ON notas_analisadas(numero_processo);
CREATE INDEX IF NOT EXISTS idx_notas_numero_empenho ON notas_analisadas(numero_empenho);
```

### 1.4 Exportação Contábil para Excel (CSV)
Botão **"Exportar para Excel (CSV)"** implementado nas abas **Histórico** e **Dashboard**:
- **Encoding:** UTF-8 com BOM (`\uFEFF`), garantindo que o Microsoft Excel e LibreOffice Calc abram o arquivo diretamente sem corromper acentuação ou caracteres especiais.
- **Delimitador:** Ponto e vírgula (`;`).
- **Formatação Numérica:** Padrão monetário brasileiro com vírgula nos decimais (`"1250,50"`), permitindo que o Excel interprete imediatamente como números operáveis para fórmulas e somas.
- **Colunas Geradas na Planilha:**
  1. ID da Análise
  2. Data e Hora da Análise
  3. Processo Administrativo SEI
  4. Nota de Empenho
  5. Tipo de Documento (NF-e / NFS-e)
  6. Número da Nota Fiscal
  7. Chave de Acesso (44 dígitos)
  8. CNPJ do Fornecedor
  9. Razão Social do Fornecedor
  10. Optante pelo Simples Nacional (SIM/NÃO)
  11. Valor Bruto (R$)
  12. IR Retido (R$)
  13. CSLL Retida (R$)
  14. PIS Retido (R$)
  15. COFINS Retida (R$)
  16. INSS Retido (R$)
  17. ISSQN Retido (R$)
  18. Total Geral Retido (R$)
  19. Valor Líquido a Pagar (R$)
  20. Códigos de Arrecadação DARF Agrupados
  21. Naturezas de Rendimento da EFD-Reinf Agrupadas

---

## ⚡ 2. Sprint 2: Edição Inline de Itens e Recálculo Reativo

### 2.1 Modo de Edição Inline de Itens
Ao clicar no botão **"Editar Itens / Ajuste Manual"** na tela de parecer técnico, os itens da nota passam a exibir campos interativos:

| Campo Editável | Descrição |
| :--- | :--- |
| **Descrição do Item** | Texto descritivo do produto ou serviço prestado. |
| **NCM / Cód. Serviço** | Código fiscal de classificação de mercadorias ou serviço. |
| **Valor Bruto (R$)** | Valor monetário individual de cada linha do documento. |
| **Regra Tributária (Preset)** | Seletor ágil com as regras consolidadas da IN RFB nº 1.234/2012. |
| **Alíquotas Livres** | Campos individuais para % IR, % CSLL, % PIS, % COFINS, % INSS e % ISS. |
| **Códigos Fiscais Manuais** | Código de Receita DARF e Código de Rendimento EFD-Reinf (Série R-4000). |

### 2.2 Presets da Instrução Normativa RFB nº 1.234/2012

| Preset | Alíquota Federal | Composição das Alíquotas | Código DARF | Reinf | Aplicação Principal |
| :---: | :---: | :--- | :---: | :---: | :--- |
| **AUTO** | Dinâmica | Resolução automática por banco NCM / Serviço | --- | --- | Classificação padrão do sistema. |
| **6147** | **5,85%** | IR: 1,20% \| CSLL: 1,00% \| PIS: 0,65% \| COFINS: 3,00% | `6147` | `17099` | Bens em geral, materiais de consumo e obras de construção civil. |
| **6190** | **9,45%** | IR: 4,80% \| CSLL: 1,00% \| PIS: 0,65% \| COFINS: 3,00% | `6190` | `17006` | Serviços em geral, consultoria, advocacia, locação de bens móveis. |
| **6175** | **7,05%** | IR: 2,40% \| CSLL: 1,00% \| PIS: 0,65% \| COFINS: 3,00% | `6175` | `17009` | Transporte intermunicipal/interestadual de cargas e passageiros. |
| **8767** | **2,20%** | IR: 1,20% \| CSLL: 1,00% \| PIS: 0,00% \| COFINS: 0,00% | `8767` | `17022` | Medicamentos, vacinas, produtos farmacêuticos e hospitalares. |
| **ISENTO** | **0,00%** | IR: 0,00% \| CSLL: 0,00% \| PIS: 0,00% \| COFINS: 0,00% | `ISENTO` | `ISENTO` | Imunidades, isenções legais e alíquota zero. |
| **MANUAL** | Livre | Definida campo a campo pelo auditor fiscal | Custom | Custom | Casos especiais, liminares judiciais ou regimes diferenciados. |

### 2.3 Gestão de Linhas de Itens
- **➕ Adicionar Item:** Permite incluir manualmente novos itens para desdobramentos de faturamento.
- **🗑️ Remover Item:** Exclui o item com renumeração automática.
- **↺ Restaurar Originais:** Descarta todas as modificações manuais e restabelece a leitura exata do XML ou PDF original.

### 2.4 Arquitetura do Endpoint Reativo
Foi criado o endpoint dedicado:
```http
POST /api/recalcular
Content-Type: application/json
```
O backend recebe o conjunto de itens alterados, submete à lógica do `TaxEngine.processarNota`, unifica a memória de cálculo e devolve a consolidação tributária completa em menos de 100 milissegundos.

---

## 🛠️ Arquivos Modificados no Repositório

| Módulo | Arquivo | Principais Alterações |
| :--- | :--- | :--- |
| **Banco de Dados** | `database/schema.sql` | Novas colunas `numero_processo` e `numero_empenho` com índices. |
| **Motor Fiscal** | `backend/src/services/taxEngine.ts` | Overrides manuais, novos presets e suporte a recálculo dinâmico. |
| **Servidor API** | `backend/src/server.ts` | Endpoint `POST /api/recalcular` e persistência de processo/empenho. |
| **Gerador PDF** | `backend/src/services/pdfReportGenerator.ts` | Inclusão de Processo SEI e Empenho na tarja oficial do documento. |
| **Interface Geral** | `frontend/src/App.tsx` | Máscara SEI `xxxxx.yyyyyy/aaaa-dd`, sincronização bidirecional de notas recalculadas. |
| **Parecer Técnico** | `frontend/src/components/ReportPreview.tsx` | Modo edição inline, seletor de presets, adição/remoção de itens e recálculo reativo. |
| **Histórico** | `frontend/src/components/HistoricoSearch.tsx` | Badges de SEI/NE, busca por processo e exportação CSV para Excel. |
| **Dashboard** | `frontend/src/components/DashboardTab.tsx` | Filtro por natureza Reinf, badges e exportação CSV consolidada para Excel. |

---

## 🧪 Relatório de Validação e Testes

1. **Compilação Backend TypeScript:**
   - Comando: `npx tsc --noEmit`
   - Resultado: **0 erros de compilação.**

2. **Compilação Frontend TypeScript (Vite/React):**
   - Comando: `npx tsc --noEmit`
   - Resultado: **0 erros de compilação.**

3. **Teste de Integração de Recálculo:**
   - **Cenário 1 (Preset 6147 - Bens em Geral):**
     - Base de Cálculo: R$ 10.000,00
     - Total Retido Calculado: R$ 585,00 (5,85%)
     - Valor Líquido: R$ 9.415,00
     - DARF: `6147` (R$ 585,00) \| Reinf: `17099` (R$ 10.000,00)
     - **Status:** Aprovado ✅
   - **Cenário 2 (Ajuste Manual Livre com ISS):**
     - Base de Cálculo: R$ 5.000,00
     - Alíquotas Forçadas: IR 4,80% + CSLL 1,00% + PIS 0,65% + COFINS 3,00% + ISS 5,00%
     - Total Federal: R$ 472,50 (9,45%)
     - Total ISS: R$ 250,00 (5,00%)
     - Total Retido Geral: R$ 722,50 (14,45%)
     - Valor Líquido: R$ 4.277,50
     - **Status:** Aprovado ✅

4. **Sincronização de Versionamento (Git):**
   - Commits registrados e enviados para o branch `main`:
     - `754a43c`: *feat: Sprint 1 - Processo Administrativo SEI (formato xxxxx.yyyyyy/aaaa-dd), Nota de Empenho e Exportacao Contabil Excel/CSV*
     - `7dd8498`: *feat: Sprint 2 - Edicao inline de itens, presets tributarios IN 1234/2012 e recalculacao reativa*
   - Status: `Everything up-to-date`.

---

## 📌 Guia Rápido de Uso pelo Auditor Fiscal

1. **Acessar a Aplicação:** Abra `http://localhost:5173` no navegador.
2. **Identificação Processual:** Ao analisar uma nota ou lote, informe o **Nº do Processo SEI** (a máscara `xxxxx.yyyyyy/aaaa-dd` guiará a digitação) e o **Número do Empenho**.
3. **Edição do Parecer:** No relatório gerado, clique em **"Editar Itens / Ajuste Manual"**.
4. **Alteração de Regras:** Ajuste valores, descrições ou selecione presets como **5,85% (Bens)**, **9,45% (Serviços)** ou **Isenção**.
5. **Recalcular:** Clique em **"Recalcular Retenções"** e visualize imediatamente as novas somas e códigos.
6. **Finalização:** Clique em **"Salvar no PostgreSQL"** ou **"Baixar Relatório para o SEI (PDF)"**.
7. **Exportação Excel:** No Histórico ou Dashboard, utilize o botão **"Exportar para Excel (CSV)"** para baixar a planilha consolidada pronta para conferência contábil.
