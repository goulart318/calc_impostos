# 🏛️ Ret-Impostos — Plataforma de Análise e Matriz de Retenções Tributárias

<p align="center">
  <img src="frontend/src/assets/hero.png" alt="Ret-Impostos Banner" width="780" />
</p>

<p align="center">
  <strong>Solução inteligente e automatizada para apuração, cálculo e auditoria de retenções tributárias na fonte para Órgãos Públicos Federais e contratações em geral.</strong>
</p>

<p align="center">
  <a href="#-status-do-projeto"><img src="https://img.shields.io/badge/status-em%20desenvolvimento-brightgreen?style=for-the-badge" alt="Status: Em Desenvolvimento"></a>
  <a href="#-tecnologias-utilizadas"><img src="https://img.shields.io/badge/vers%C3%A3o-1.0.0-blue?style=for-the-badge" alt="Versão: 1.0.0"></a>
  <a href="#-autores-e-licen%C3%A7a"><img src="https://img.shields.io/badge/licen%C3%A7a-Apache%202.0-orange?style=for-the-badge" alt="Licença Apache 2.0"></a>
  <a href="#-autores-e-licen%C3%A7a"><img src="https://img.shields.io/badge/autor-Ulisses%20Fernandes%20Goularte-indigo?style=for-the-badge" alt="Autor: Ulisses Fernandes Goularte"></a>
</p>

---

## 📑 Sumário

- [📌 Título e Descrição](#-título-e-descrição)
- [🚦 Status do Projeto](#-status-do-projeto)
- [✨ Funcionalidades](#-funcionalidades)
- [🛠️ Tecnologias Utilizadas](#️-tecnologias-utilizadas)
- [⚙️ Como Instalar e Executar](#️-como-instalar-e-executar)
- [💡 Como Usar](#-como-usar)
- [🤝 Contribuição](#-contribuição)
- [📜 Autores e Licença](#-autores-e-licença)

---

## 📌 Título e Descrição

O **Ret-Impostos** é uma plataforma desenvolvida para simplificar e garantir precisão cirúrgica na apuração de retenções tributárias na fonte incidentes sobre o fornecimento de bens e prestação de serviços por órgãos da Administração Pública Federal.

O sistema atua em total conformidade com a legislação tributária brasileira, aplicando de forma estrita as regras da **Instrução Normativa RFB nº 1.234/2012**, **Instrução Normativa RFB nº 2.110/2022**, regulamentações do **IRPJ**, **CSLL**, **PIS/PASEP**, **COFINS**, **INSS** (retenção previdenciária) e normas municipais para o **ISSQN**.

### 🎯 Objetivos Centrais
* **Eliminação de Erros Manuais:** Substituir planilhas e cálculos manuais por um motor fiscal automatizado (*Tax Engine*).
* **Leitura Direta de Documentos Fiscais:** Extração instantânea de dados a partir de arquivos **XML** (NF-e e NFS-e) e **PDF** (DANFEs e notas de serviços municipais).
* **Auditoria de Enquadramento:** Validação de optantes pelo Simples Nacional, SIMEI/MEI, imunidades e isenções.
* **Instrução Processual Ágil:** Geração de relatórios executivos em PDF e despachos formatados para integração direta ao **SEI (Sistema Eletrônico de Informações)**.
* **Conformidade com EFD-Reinf:** Mapeamento automático dos códigos de receita DARF e naturezas de rendimento da série **R-4000**.

---

## 🚦 Status do Projeto

> 🟢 **Status: Em Desenvolvimento Ativo (Versão 1.0.0 Estável)**

O sistema já se encontra funcional e estável para operações diárias de análise individual e em lote. Novos recursos, aprimoramentos de parsers municipais de NFS-e e expansão dos painéis analíticos continuam sendo implementados continuamente.

| Módulo | Situação | Descrição |
| :--- | :---: | :--- |
| **Tax Engine (Cálculo Fiscal)** | ✅ Concluído | Regras da IN RFB 1234/12, INSS (11% / 3,5%) e ISS |
| **Parser XML (NF-e e NFS-e)** | ✅ Concluído | Extração estruturada de itens, NCMs e dados das partes |
| **Parser PDF (DANFE & NFS-e)** | ✅ Concluído | Extração por expressão regular e layout inteligente |
| **Processamento em Lote** | ✅ Concluído | Análise multi-arquivos com consolidação de valores |
| **Consulta CNPJ / Simples** | ✅ Concluído | Consulta online via API pública com cache PostgreSQL |
| **Despacho SEI e Relatório PDF** | ✅ Concluído | Geração de despachos formatados e relatórios oficiais |
| **Dashboard Analytics** | ✅ Concluído | Gráficos, métricas por tributo e alertas preventivos |
| **Matriz NCM & Anexo I** | ✅ Concluído | Tabelas de consulta rápida com busca contextual |

---

## ✨ Funcionalidades

### 📑 1. Leitura e Extração de Documentos Fiscais
* **Upload por Arrastar e Soltar (Drag & Drop):** Interface intuitiva para envio de notas em **XML** ou **PDF**.
* **Identificação Automática de Partes:** Captura CNPJ, Razão Social do prestador/fornecedor e do órgão tomador.
* **Alerta de Tomador Divergente:** Notifica o operador caso a nota fiscal tenha sido emitida para um CNPJ diferente do órgão configurado.

### 🧮 2. Motor de Cálculo Fiscal (Tax Engine)
* **Retenções Federais (IN RFB 1234/2012):**
  * Apuração de **IR** (alíquotas de 1,2%, 4,8%, etc.), **CSLL** (1,0%), **COFINS** (3,0%) e **PIS/PASEP** (0,65%).
  * Agrupamento por Códigos de Arrecadação DARF (ex.: `6147`, `8767`, `0211`).
* **Tratamento do Simples Nacional / SIMEI:**
  * Identificação automática de enquadramento; dispensa retenções federais nos termos do art. 4º da IN 1234/2012, mantendo os cálculos de ISS e INSS conforme aplicável.
* **Previdência Social (INSS na Fonte - IN RFB 2.110/2022):**
  * Aplicação de alíquota geral de 11% ou 3,5% (para empresas enquadradas na CPRB / Lei 12.546/2011).
  * Dedução de parcelas correspondentes a materiais e equipamentos fornecidos.
  * Destacamento e controle de depósitos em Conta Vinculada.
* **Tributação Municipal (ISS):**
  * Cálculo de ISS com alíquota parametrizável e retenção automática para órgãos públicos.
  * Suporte a deduções e redução legal de base de cálculo.

### 📦 3. Processamento em Lote e Relatório Consolidado
* Envio simultâneo de múltiplos documentos fiscais pertencentes ao mesmo processo administrativo.
* Consolidação automática de faturamento bruto, montante líquido a pagar e tributos retidos.
* Geração de **Relatório Consolidado em PDF** para processos com múltiplas notas.

### 🔄 4. Edição e Recálculo Reativo em Tempo Real
* Flexibilidade para o gestor ajustar itens, valores, códigos NCM ou deduções diretamente na interface.
* Recálculo instantâneo sem necessidade de recarregar a página.

### 📋 5. Instrução Processual e Integração com o SEI
* **Copiar Despacho SEI:** Cria com um único clique um despacho pronto, com tabela estilizada em HTML contendo a memória de cálculo para ser colado diretamente no editor do SEI.
* **Relatório Oficial em PDF:** Emissão de documento PDF para anexação ao processo com espelho da nota fiscal, identificação de partes e dados de arrecadação.

### 📊 6. Dashboard de Analytics e Histórico
* Visão consolidada de tributos retidos acumulados no período.
* Gráfico de distribuição por código DARF e natureza de rendimento EFD-Reinf.
* Painel de alertas para notas sem chave de acesso ou inconsistências de retenção.
* Histórico persistido no PostgreSQL com busca por CNPJ, número de nota, chave de acesso, número de processo SEI ou número de empenho.

---

## 🛠️ Tecnologias Utilizadas

A solução é construída sob uma arquitetura desacoplada, moderna e tipada de ponta a ponta:

```
┌────────────────────────────────────────────────────────┐
│                   RET-IMPOSTOS UI                      │
│       React 19 • TypeScript • Vite • Lucide Icons      │
└───────────────────────────┬────────────────────────────┘
                            │ HTTP / REST (JSON & Multipart)
┌───────────────────────────▼────────────────────────────┐
│                  BACKEND API SERVER                    │
│    Node.js • Express 5 • TypeScript (tsx) • Multer     │
│   Fast-XML-Parser • PDFKit • PDF-Parse • Axios • pg    │
└───────────────────────────┬────────────────────────────┘
                            │ Pool Connection (SQL)
┌───────────────────────────▼────────────────────────────┐
│                 POSTGRESQL DATABASE                    │
│      Tabelas Estruturadas • Índices • Campos JSONB     │
└────────────────────────────────────────────────────────┘
```

### 💻 Frontend
| Tecnologia | Versão | Finalidade |
| :--- | :---: | :--- |
| **React** | `19.x` | Biblioteca central para interface de usuário reativa |
| **TypeScript** | `6.x` | Tipagem estática e segurança em tempo de desenvolvimento |
| **Vite** | `8.x` | Build tool ultrarrápido com Hot Module Replacement (HMR) |
| **Lucide React** | `1.x` | Conjunto completo de ícones modernos e minimalistas |
| **Vanilla CSS3** | — | Estilização limpa, responsiva e performática sem overhead |

### ⚙️ Backend
| Tecnologia | Versão | Finalidade |
| :--- | :---: | :--- |
| **Node.js** | `18+` | Ambiente de execução JavaScript/TypeScript |
| **Express** | `5.x` | Framework HTTP para endpoints RESTful e manipulação de uploads |
| **Multer** | `2.x` | Middleware para recebimento de arquivos em memória |
| **Fast-XML-Parser / XML2JS** | `5.x / 0.6x` | Leitura e validação da árvore estrutural de NF-e e NFS-e |
| **PDF-Parse** | `1.1x` | Extração de texto de DANFEs e espelhos municipais em PDF |
| **PDFKit** | `0.20x` | Renderização programática de relatórios fiscais em PDF |
| **pg (node-postgres)** | `8.x` | Driver de conexão relacional de alto desempenho para PostgreSQL |
| **Axios** | `1.x` | Cliente HTTP para integração com serviços de consulta de CNPJ |

### 🗄️ Banco de Dados
| Tecnologia | Finalidade |
| :--- | :--- |
| **PostgreSQL 14+** | Armazenamento de regras de NCM, cache de fornecedores Simples Nacional e histórico completo de notas analisadas com índices otimizados. |

---

## ⚙️ Como Instalar e Executar

### 📋 Pré-requisitos
Antes de iniciar, certifique-se de possuir instalado em sua máquina:
* [Node.js](https://nodejs.org/) (Versão **18.x** ou superior)
* [PostgreSQL](https://www.postgresql.org/) (Versão **14.x** ou superior)
* [Git](https://git-scm.com/)

---

### 🚀 Passo a Passo de Instalação

#### 1️⃣ Clonar o Repositório
```bash
git clone https://github.com/goulart318/calc_impostos.git
cd calc_impostos
```

> **Nota:** Se o repositório possuir a pasta interna `calc_impostos/`, acesse-a:
> ```bash
> cd calc_impostos
> ```

---

#### 2️⃣ Configurar o Banco de Dados (PostgreSQL)
1. Conecte-se ao PostgreSQL e crie a base de dados:
   ```sql
   CREATE DATABASE ret_impostos;
   ```
2. Execute o script de criação das tabelas e carga inicial de dados contido em `database/schema.sql`:
   * **Via terminal (psql):**
     ```bash
     psql -U postgres -d ret_impostos -f database/schema.sql
     ```
   * **Ou via cliente gráfico (DBeaver, pgAdmin, VS Code):** Abra o arquivo `database/schema.sql`, selecione todo o conteúdo e execute no banco `ret_impostos`.

---

#### 3️⃣ Configurar as Variáveis de Ambiente
Navegue até a pasta `backend/` e crie o arquivo `.env` com base no arquivo `.env.example`:

```bash
cd backend
copy .env.example .env
```

Edite o arquivo `backend/.env` com as configurações do seu PostgreSQL:
```env
PORT=3001
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=suasenha
DB_NAME=ret_impostos
```

Retorne à pasta do projeto:
```bash
cd ..
```

---

#### 4️⃣ Instalar as Dependências

Você pode instalar as dependências de cada módulo executando:

```bash
# Instalar dependências do Backend:
cd backend
npm install

# Instalar dependências do Frontend:
cd ../frontend
npm install

# Retornar à pasta principal:
cd ..
```

---

#### 5️⃣ Inicializar o Sistema

##### **Opção A: Execução Rápida via Script (Windows)**
Basta executar o arquivo em lote que inicia automaticamente o Backend e o Frontend:
```cmd
.\iniciar.bat
```

##### **Opção B: Execução Manual em Dois Terminais**
Abra dois terminais na pasta do projeto:

* **Terminal 1 (Backend - API na porta 3001):**
  ```bash
  cd backend
  npm run dev
  ```
* **Terminal 2 (Frontend - Web UI na porta 5173):**
  ```bash
  cd frontend
  npm run dev
  ```

---

## 💡 Como Usar

### 🌐 Endereços de Acesso
Após iniciar o sistema, abra o navegador nos seguintes endereços:
* **Interface do Usuário (Frontend):** `http://localhost:5173`
* **API REST (Backend):** `http://localhost:3001`

---

### 📖 Fluxo de Trabalho Prático

```
   ┌─────────────────────────────────────────────────────────┐
   │ 1. Upload do Arquivo (XML ou PDF)                       │
   │    Arraste o arquivo para a área de upload              │
   └────────────────────────────┬────────────────────────────┘
                                │
   ┌────────────────────────────▼────────────────────────────┐
   │ 2. Preenchimento Complementar (Opcional)                │
   │    Informe Processo SEI, Nota de Empenho ou deduções    │
   └────────────────────────────┬────────────────────────────┘
                                │
   ┌────────────────────────────▼────────────────────────────┐
   │ 3. Conferência da Memória de Cálculo                    │
   │    Verifique alíquotas de IR, CSLL, PIS, COFINS, INSS   │
   └────────────────────────────┬────────────────────────────┘
                                │
        ┌───────────────────────┴───────────────────────┐
        ▼                                               ▼
┌───────────────────────────────┐     ┌───────────────────────────────┐
│ 4. Copiar Despacho SEI        │     │ 5. Exportar Relatório PDF     │
│    Cole no editor de texto do │     │    Anexe como documento       │
│    processo administrativo    │     │    oficial ao processo        │
└───────────────────────────────┘     └───────────────────────────────┘
```

1. **Configuração Inicial do Órgão:**
   * No cabeçalho da aplicação, informe e salve o CNPJ do seu órgão/estabelecimento. Ele será mantido no seu navegador para alertar se qualquer nota pertencer a outro tomador.
2. **Análise de Documento Fiscal:**
   * Na aba **Análise de Notas**, selecione o tipo de documento (**NF-e** ou **NFS-e**).
   * Arraste o arquivo XML ou PDF para o campo de upload. O sistema extrai automaticamente o prestador, número, valor e itens.
   * Se aplicável, digite o número do processo SEI (ex.: `00000.000000/2026-00`) e a nota de empenho.
3. **Processamento em Lote:**
   * Caso possua várias notas para o mesmo processo, envie múltiplos arquivos simultaneamente na área de lote. Um resumo consolidado será gerado.
4. **Instrução Processual:**
   * Clique em **Copiar Despacho SEI** para obter a tabela de memória de cálculo pronta para colagem.
   * Clique em **Baixar PDF** para gerar o documento fiscal oficial para instrução processual.
   * Clique em **Salvar Análise** para gravar o registro no histórico permanente do banco de dados.
5. **Analytics e Consulta Normativa:**
   * Acesse a aba **Dashboard** para acompanhar os indicadores consolidados e alertas.
   * Acesse as abas **Anexo I** e **Matriz NCM** para consultas rápidas à legislação.

---

## 🤝 Contribuição

Contribuições da comunidade e de desenvolvedores públicos são muito bem-vindas! Para colaborar com a evolução do sistema, siga estas diretrizes:

1. **Faça um Fork** do repositório.
2. **Crie uma Branch** temática para a sua implementação:
   ```bash
   git checkout -b feature/sua-funcionalidade
   ```
3. **Escreva Commits Claros e Descritivos** utilizando o padrão [Conventional Commits](https://www.conventionalcommits.org/):
   * `feat: suporte a leitura de NFS-e padrão Betha`
   * `fix: ajuste no cálculo de retenção de PIS para medicamentos`
   * `docs: atualiza instruções de deploy e variáveis de ambiente`
4. **Envie as Alterações** para o seu repositório remoto:
   ```bash
   git push origin feature/sua-funcionalidade
   ```
5. **Abra um Pull Request (PR)** detalhando:
   * O que foi alterado ou adicionado;
   * Motivo da alteração e embasamento normativo (se aplicável);
   * Evidências de testes manuais ou automatizados.

---

## 📜 Autores e Licença

### 👤 Autor
* **Ulisses Fernandes Goularte** — *Idealização, Arquitetura e Desenvolvimento*
  * GitHub: [@goulart318](https://github.com/goulart318)

---

### 📄 Licença de Uso: Apache License 2.0

Este projeto está licenciado sob os termos da **[Apache License 2.0](http://www.apache.org/licenses/LICENSE-2.0)**.

```
Copyright 2026 Ulisses Fernandes Goularte

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

#### ⚖️ Resumo dos Direitos e Condições de Uso:

| O que você PODE fazer | Condições e Obrigações | O que NÃO É permitido |
| :--- | :--- | :--- |
| ✔️ **Uso Comercial:** Você pode usar este software para fins comerciais e institucionais. | ℹ️ **Aviso de Licença e Copyright:** Manter os créditos do autor original e a cópia da licença Apache 2.0 em distribuições. | ❌ **Uso de Marca:** Não concede direito de uso de marcas ou nomes comerciais do autor. |
| ✔️ **Modificação:** Você pode alterar o código-fonte livremente. | ℹ️ **Declaração de Alterações:** Identificar claramente quaisquer arquivos modificados. | ❌ **Responsabilidade Legal:** O software é fornecido "no estado em que se encontra" (*AS IS*), sem garantias expressas ou implícitas. |
| ✔️ **Distribuição:** Você pode distribuir o código original ou modificado. | ℹ️ **Concessão de Patentes:** Inclui licença expressa de patentes dos contribuidores para os usuários. | |
| ✔️ **Sublicenciamento:** Você pode aplicar termos adicionais nas suas modificações. | | |

---

<p align="center">
  Desenvolvido com foco na eficiência, segurança jurídica e conformidade da Administração Pública. 🇧🇷
</p>