# Plataforma de Análise e Matriz de Retenções Tributárias (IN 1234/2012, INSS e ISS Vitória/ES)

Sistema automatizado para análise de notas fiscais (NF-e de compras/materiais e NFS-e de serviços), aplicação automática das regras de retenção tributária federal (IN RFB nº 1.234/2012 por NCM ou código de serviço), previdenciária (IN RFB nº 2.110/2022 / CPRB) e municipal (ISS Vitória/ES - Lei nº 6.075/2003 / LC 116), com persistência em banco PostgreSQL e geração de relatório individualizado detalhado para inserção no SEI.

---

## 1. Visão Geral da Arquitetura

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (React + Vite)                         │
│  - Drag & Drop de PDF (DANFE) ou XML (NF-e / NFS-e) ou Digitação de Chave   │
│  - Seleção: NF-e (Compra/Consumo) ou NFS-e (Serviço)                        │
│  - Painel de Conferência em Tempo Real com Memória de Cálculo Detalhada     │
│  - Visualizador e Gerador de Relatório SEI (PDF Individualizado por Nota)   │
│  - Histórico de Notas e Gestão da Matriz de NCMs / Serviços                 │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ REST API (JSON / Multipart)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BACKEND (Node.js / Express)                       │
│  - Parser de XML (NF-e / NFS-e) e Extração de PDF (pdf-parse / regex)       │
│  - Consulta de CNPJ e Simples Nacional (BrasilAPI / ReceitaWS)               │
│  - Motor Fiscal (Rule Engine):                                              │
│      • IN RFB 1234/2012 (Matriz de NCMs: Cód. 6147, 8767, 6170, 6190, etc.) │
│      • Isenção Simples Nacional (Art. 4º, XI da IN 1234)                     │
│      • INSS (IN 2110/2022 - 11% / 3,5% CPRB Lei 14.973/2024)                 │
│      • ISSQN Vitória/ES (Lei 6.075/2003 e LC 116/2003)                      │
│  - Gerador de PDF em Alta Resolução (PDFKit / Puppeteer) idêntico ao modelo │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Pool de Conexão (pg)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     BANCO DE DADOS (PostgreSQL / pgAdmin)                   │
│  - Tabelas: notas_fiscais, nota_itens, ncm_regras, servicos_regras, config │
│  - Scripts de inicialização DDL automáticos no primeiro boot                │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Estrutura do Banco de Dados (PostgreSQL)

O banco de dados será estruturado no PostgreSQL para que você possa visualizá-lo e gerenciá-lo diretamente via **pgAdmin**:

* **`notas_fiscais`**:
  * `id` (SERIAL PRIMARY KEY)
  * `tipo_documento` ('NFE' ou 'NFSE')
  * `numero_nota` (VARCHAR)
  * `chave_acesso` (VARCHAR(44))
  * `fornecedor_nome` (VARCHAR)
  * `fornecedor_cnpj` (VARCHAR(18))
  * `optante_simples` (BOOLEAN)
  * `situacao_cadastral` (VARCHAR)
  * `data_emissao` (DATE)
  * `valor_bruto` (NUMERIC(14,2))
  * `total_retido` (NUMERIC(14,2))
  * `valor_liquido` (NUMERIC(14,2))
  * `created_at` (TIMESTAMP)

* **`nota_itens`** (Detalhamento por Item / NCM / Serviço):
  * `id` (SERIAL PRIMARY KEY)
  * `nota_id` (INTEGER REFERENCES notas_fiscais)
  * `numero_item` (INTEGER)
  * `descricao` (TEXT)
  * `ncm` (VARCHAR(10))
  * `codigo_servico` (VARCHAR(20))
  * `valor_bruto` (NUMERIC(14,2))
  * `condicao_aplicavel` (VARCHAR) — ex: "Uso em hospitais / Alíquota zero PIS/COFINS", "Padrão 9,45%"
  * `codigo_receita_darf` (VARCHAR(10)) — ex: 6147, 8767, 6190, 6170
  * `natureza_rendimento_reinf` (VARCHAR(10)) — ex: 17022, 17006
  * **Alíquotas e Valores Retidos Detalhados:**
    * `aliq_ir` / `valor_ir`
    * `aliq_csll` / `valor_csll`
    * `aliq_cofins` / `valor_cofins`
    * `aliq_pis` / `valor_pis`
    * `aliq_inss` / `valor_inss` (11% ou 3,5% CPRB)
    * `aliq_iss` / `valor_iss` (Vitória/ES)
    * `total_retido_item`
    * `valor_liquido_item`

* **`ncm_regras`** (Matriz Parametrizável de NCMs):
  * `id` (SERIAL PRIMARY KEY)
  * `ncm_prefixo` (VARCHAR(10))
  * `descricao_categoria` (VARCHAR)
  * `codigo_receita` (VARCHAR(10))
  * `natureza_reinf` (VARCHAR(10))
  * `aliq_ir`, `aliq_csll`, `aliq_cofins`, `aliq_pis`
  * `fundamentacao_legal` (TEXT)

* **`servicos_regras`** (Tabela de Serviços IN 1234 e ISS Vitória):
  * Padrão padrão de 9,45% (Código 6190 - IR 4,8%, CSLL 1%, COFINS 3%, PIS 0,65%), com opções de exceção (5,85%, 2,4%, 1,5%).

---

## 3. Relatório Individualizado por Nota (Modelo SEI)

O relatório gerado em PDF e na tela terá exatamente a estrutura do modelo que você forneceu:
1. **Cabeçalho:** Identificação do Órgão, Tipo de Documento (NF-e / NFS-e), Número da Nota e Fornecedor (Nome, CNPJ, Situação do Simples Nacional).
2. **Quadro de Itens & Critérios:** Para cada item, exibe NCM/Serviço, Condição Aplicável segundo a matriz, Natureza de Rendimento da EFD-Reinf (Série R-4000), Código de Receita DARF e valor bruto.
3. **Consolidado do Lote / Memória de Cálculo Individualizada:**
   * Tabela discriminando **cada imposto**, com sua alíquota e valor retido:
     - **IR** (Alíquota e Valor em R$)
     - **CSLL** (Alíquota e Valor em R$)
     - **COFINS** (Alíquota e Valor em R$)
     - **PIS/PASEP** (Alíquota e Valor em R$)
     - **INSS** (IN RFB nº 2.110/2022 - 11% ou 3,5% CPRB)
     - **ISSQN** (Legislação de Vitória/ES - CTM Vitória / LC 116)
   * **Total Retido (Tributos Federais + INSS + ISS)**
   * **Valor Líquido a Pagar**
4. **Fundamentação Legal e Instruções para o Processo SEI:**
   * Referências normativas da IN RFB nº 1.234/2012, IN RFB nº 2.110/2022, Lei nº 14.973/2024 (CPRB) e Código Tributário de Vitória/ES (Lei nº 6.075/2003).

---

## 4. Plano de Execução por Etapas

### Etapa 1: Backend & Motor Fiscal
- Criar projeto backend com TypeScript/Express.
- Configurar conexão com PostgreSQL (`pg`) com variáveis de ambiente (`.env` com porta, usuário, senha, host e database padrão `ret_impostos`).
- Criar script DDL que cria automaticamente o banco e tabelas caso ainda não existam.
- Criar o **Motor Fiscal de Retenções** (IN 1234/2012, NCMs monofásicos/alíquota zero, regra padrão 9,45% cód 6190 para serviços, INSS e ISS Vitória).
- Criar parsers de XML e de PDF (DANFE).
- Criar endpoint de consulta de CNPJ/Simples Nacional via BrasilAPI.

### Etapa 2: Gerador de PDF (Padrão SEI)
- Criar módulo gerador de PDF individualizado no backend com layout idêntico ao modelo (tipografia profissional, quadros de auditoria, memória discriminada de cada tributo).

### Etapa 3: Frontend Moderno & Intuitivo
- Criar aplicação frontend (React + Vite + Vanilla CSS moderno).
- Tela com:
  1. Opção de selecionar NF-e (Material) ou NFS-e (Serviço).
  2. Área de upload drag-and-drop para PDF ou XML, ou campo de digitação de Chave/Valores.
  3. Painel de conferência e auditoria em tempo real com memória detalhada.
  4. Botão de emissão instantânea do PDF para o SEI.
  5. Aba de Histórico de Notas salvas no PostgreSQL.
  6. Aba de Matriz de NCMs e Regras Tributárias (para consulta e parametrização).

### Etapa 4: Validação & Testes
- Testar com exemplos de NF-e com NCMs com alíquota zero de PIS/COFINS (como o exemplo do PDF cód 8767 / R-4020 17022).
- Testar com exemplos de NFS-e aplicando a regra de 9,45% (cód 6190) + ISS Vitória + INSS.
- Testar fornecedor do Simples Nacional comprovando a dispensa de retenção federal.
- Validar persistência e consulta no PostgreSQL / pgAdmin.

---

## 5. Verificação e Critérios de Aceite
- [x] O usuário pode subir um PDF ou XML, ou digitar a chave/valores.
- [x] O sistema identifica automaticamente o regime (Simples Nacional) e regras por NCM/Serviço.
- [x] Na NFS-e, o padrão 9,45% (cód. 6190) vem pré-carregado.
- [x] O relatório traz detalhadamente a alíquota e o valor retido de cada imposto (IR, CSLL, PIS, COFINS, INSS, ISS).
- [x] O PDF gerado é individualizado por nota e formatado para o processo SEI.
- [x] Todos os dados são persistidos no PostgreSQL para visualização no pgAdmin.
