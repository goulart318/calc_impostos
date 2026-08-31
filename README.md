# Ret-Impostos — Plataforma de Análise e Matriz de Retenções Tributárias

Plataforma completa para automação, consulta e cálculo de retenções tributárias na fonte para **Órgãos Públicos Federais**, desenvolvida em conformidade com as normas da **IN RFB 1234/2012**, **IN RFB 2110/2022**, legislação do **INSS**, **CSLL**, **PIS**, **COFINS**, **IRPJ** e regulamentações municipais (**ISS**).

---

## 📌 Descrição do Projeto

O **Ret-Impostos** foi criado para resolver a complexidade e eliminar erros manuais na apuração de retenções de impostos incidentes sobre a contratação de bens e serviços por órgãos da Administração Pública Federal. 

O sistema oferece uma interface intuitiva e um mecanismo inteligente de cálculo (Tax Engine) que cruza dados de Notas Fiscais Eletrônicas (**NF-e**) e Notas Fiscais de Serviços (**NFS-e**) via upload de arquivos XML e PDF com a **Matriz NCM** e o **Anexo I da Instrução Normativa RFB nº 1.234/2012**.

### Principais Objetivos
* **Automação de Retenções:** Determinação precisa das alíquotas de IR, CSLL, PIS/COFINS, INSS e ISS.
* **Leitura Inteligente de Documentos:** Leitura direta de XML (NFe/NFS-e) e extração via PDF com identificação de itens, serviços prestados e CNPJ.
* **Conformidade Legal:** Validação de enquadramentos tributários, regimes de tributação (Simples Nacional, Imunidades/Isenções) e retenções municipais.
* **Relatórios e Histórico:** Geração automatizada de relatórios em PDF com espelho da nota fiscal, memória de cálculo e registro para EFD-Reinf.

---

## 🛠️ Tecnologias Utilizadas

### **Frontend**
* **React 19** & **TypeScript** — Interface reativa e type-safe.
* **Vite** — Build tool e servidor de desenvolvimento ultrarrápido.
* **Lucide React** — Biblioteca de ícones modernos.
* **CSS3 / Vanilla CSS** — Estilização modular com design moderno e responsivo.

### **Backend**
* **Node.js** & **Express 5** — API RESTful em TypeScript (`tsx`).
* **PostgreSQL** (`pg`) — Banco de dados relacional para armazenamento de NCMs, alíquotas e histórico de retenções.
* **Multer** — Middleware para upload e processamento de arquivos.
* **Fast-XML-Parser / XML2JS** — Parsing eficiente de estrutura de XMLs de NF-e e NFS-e.
* **PDFKit** & **PDF-Parse** — Processamento de leitura de PDFs e geração de relatórios/comprovantes de retenção.

---

## 🚀 Instruções de Instalação e Execução Local

### **Pré-requisitos**
Certifique-se de ter instalado em sua máquina:
* [Node.js](https://nodejs.org/) (Versão 18.x ou superior)
* [PostgreSQL](https://www.postgresql.org/) (Versão 14.x ou superior)
* [Git](https://git-scm.com/)

---

### **Passo a Passo**

#### **1. Clonar o Repositório**
```bash
git clone https://github.com/goulart318/calc_impostos.git
cd calc_impostos
```

#### **2. Configurar o Banco de Dados**
1. Acesse o seu PostgreSQL e crie um banco de dados denominado `ret_impostos`:
   ```sql
   CREATE DATABASE ret_impostos;
   ```
2. Execute o script de criação das tabelas presente no arquivo [`database/schema.sql`](file:///c:/Desenv-sistemas/Ret-Impostos/database/schema.sql).

#### **3. Configurar as Variáveis de Ambiente**
Crie um arquivo `.env` dentro do diretório `backend/` contendo as credenciais de acesso ao PostgreSQL:
```env
PORT=3001
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=suasenha
DB_NAME=ret_impostos
```

#### **4. Instalar as Dependências**
Você pode instalar as dependências de cada ambiente (raiz, backend e frontend):

```bash
# Na raiz do projeto:
npm install

# Instalar dependências do Backend:
cd backend
npm install

# Instalar dependências do Frontend:
cd ../frontend
npm install

# Retornar à raiz:
cd ..
```

#### **5. Executar o Projeto**

##### **Opção A: Utilizando o atalho (Windows)**
Execute o arquivo batch clicando duas vezes ou rodando no terminal:
```cmd
.\iniciar.bat
```

##### **Opção B: Via Terminal (NPM Scripts)**
Abra dois terminais simultâneos:
* **Terminal 1 (Backend):**
  ```bash
  npm run dev:backend
  ```
* **Terminal 2 (Frontend):**
  ```bash
  npm run dev:frontend
  ```

---

## 💻 Como Usar

### **1. Acessar a Aplicação**
Após iniciar a aplicação, acesse no seu navegador:
* **Frontend UI:** `http://localhost:5173`
* **API Backend:** `http://localhost:3001`

### **2. Funcionalidades Principais**
* **Matriz NCM & Anexo I IN 1234:**
  Navegue até a aba **Matriz NCM** ou **Anexo I** para buscar pela descrição do serviço ou código NCM e visualizar as alíquotas correspondentes (IR, CSLL, PIS, COFINS, INSS e ISS).
* **Leitura de Nota Fiscal (XML/PDF):**
  Na tela principal de importação, faça o upload de um arquivo XML de NF-e/NFS-e ou PDF. O backend processará os dados do prestador, tomador, itens e valor total, aplicando as regras de retenção automaticamente.
* **Consulta e Análise de Retenções:**
  Visualize o espelho dos impostos a reter, o enquadramento na IN 1234/2012 RFB e imprima/exporte a memória de cálculo em PDF.
* **Histórico & EFD-Reinf:**
  Consulte notas fiscais anteriores no histórico, acompanhe os totais retidos e exporte resumos alinhados aos eventos da EFD-Reinf (Série R-4000).

---

## 🤝 Como Contribuir

Contribuições são super bem-vindas! Siga os passos abaixo para contribuir:

1. **Faça um Fork** deste repositório.
2. **Crie uma Branch** para sua funcionalidade ou correção:
   ```bash
   git checkout -b feature/minha-nova-funcionalidade
   ```
3. **Faça o Commit** das suas alterações com mensagens claras:
   ```bash
   git commit -m 'feat: adiciona suporte a leitura de lote de NFS-e'
   ```
4. **Envie as alterações (Push)** para o seu repositório remoto:
   ```bash
   git push origin feature/minha-nova-funcionalidade
   ```
5. **Abra um Pull Request (PR)** explicando as alterações realizadas para revisão.

---

## 📄 Licença

Este projeto está licenciado sob a licença **MIT** — consulte o arquivo [LICENSE](file:///c:/Desenv-sistemas/Ret-Impostos/LICENSE) para mais informações.
