# Plataforma de Análise de Retenções Tributárias (IN 1234/2012, INSS & ISS Vitória/ES)

Sistema automatizado desenvolvido para análise tributária de notas fiscais (NF-e de mercadorias e NFS-e de serviços) para órgãos federais situados em Vitória/ES, com geração de relatório individualizado detalhado para anexar no SEI e persistência em PostgreSQL (pgAdmin).

---

## 1. O que foi Construído

### 🚀 Backend & Motor Fiscal (Node.js + Express + TypeScript)
- **Motor Fiscal de Retenções:**
  - Aplica o Anexo I oficial da **IN RFB nº 1.234/2012** (códigos `6147`, `9060`, `8739`, `8767`, `6175`, `8850`, `8863`, `6188`, `6190`).
  - **Matriz Inteligente de NCMs:** Mapeia NCMs com alíquota zero / monofásico de PIS e COFINS (ex: hospitalares `9018`, medicamentos `3003/3004`, combustíveis `2710`, autopeças `8708`, livros `4901`), enquadrando automaticamente no Código DARF `8767` (2,20% = IR 1,2% + CSLL 1,0%) e Natureza EFD-Reinf `17022`.
  - **Regra do Simples Nacional (Art. 4º, XI da IN 1234):** Zera automaticamente a retenção dos tributos federais mantendo apenas a análise de ISS/INSS.
  - **NFS-e de Serviços:** Padrão pré-selecionado de **9,45% (Código 6190)**, com ISS de Vitória/ES (Lei nº 6.075/2003 / LC 116) e INSS (11% ou 3,5% CPRB desoneração da folha conforme a Lei nº 14.973/2024).
- **Parsers Automáticos:**
  - **Upload de PDF (DANFE):** Extrai chave de acesso, CNPJ, razão social, número da nota e itens/NCMs.
  - **Upload de XML (NF-e e NFS-e):** Extração completa e instantânea de todos os itens e campos fiscais.
- **Consulta Online de CNPJ e Simples Nacional:**
  - Integração em tempo real com a **BrasilAPI** para identificação de optante pelo Simples Nacional e situação cadastral.
- **Gerador de PDF de Alta Resolução:**
  - Gera o relatório em PDF com layout idêntico ao modelo, pronto para download e anexação ao processo no SEI.

---

### 🎨 Frontend Moderno (React + TypeScript + Vite)
- **Painel de Análise Rápida:**
  - Seletor entre **NF-e (Compra / Material)** e **NFS-e (Prestação de Serviço)**.
  - Área de Drag & Drop para arrastar arquivos PDF ou XML.
  - Pré-visualização ao vivo do relatório com memória de cálculo discriminada por imposto (IR, CSLL, PIS, COFINS, INSS, ISS) e valor líquido final.
  - Botão **"Baixar Relatório para o SEI (PDF)"** e **"Salvar no PostgreSQL"**.
- **Abas de Apoio:**
  - **Histórico (PostgreSQL):** Lista e pesquisa todas as notas salvas no banco.
  - **Tabela Oficial Anexo I:** Consulta de todos os códigos de receita da IN 1234/2012.
  - **Matriz de NCMs:** Mapeamento de categorias e regras especiais de PIS/COFINS.

---

### 🗄 Banco de Dados (PostgreSQL / pgAdmin)
- Arquivo de inicialização salvo em `database/schema.sql` com:
  - `notas_fiscais` (tabela mestre de notas analisadas);
  - `nota_itens` (detalhamento por item, NCM, alíquotas e valores retidos de cada tributo);
  - `ncm_regras` (matriz parametrizável de NCMs);
  - `servicos_regras` (regras e alíquotas de serviços);
  - `in1234_anexo1` (tabela de referência oficial da IN 1234).

---

## 2. Como Executar a Aplicação

### Opção A: Executar via Script no Windows
Basta dar um duplo-clique no arquivo:
```text
c:\Desenv-sistemas\Ret-Impostos\iniciar.bat
```

### Opção B: Executar via Terminal (PowerShell)
```bash
# Terminal 1 - Backend:
cd c:\Desenv-sistemas\Ret-Impostos\backend
npm run dev

# Terminal 2 - Frontend:
cd c:\Desenv-sistemas\Ret-Impostos\frontend
npm run dev
```

Abra seu navegador em: **`http://localhost:5173`**

---

## 3. Conexão com o pgAdmin
1. Crie o banco de dados chamado **`ret_impostos`** no seu pgAdmin (conforme orientado no script).
2. O backend conectará automaticamente utilizando as credenciais configuradas no `backend/.env`.
3. Ao salvar qualquer nota no sistema, ela será gravada e estará disponível para consulta via `SELECT * FROM notas_fiscais;` no pgAdmin.
