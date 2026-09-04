# Plano de Implementação: Leitura de XML, Análise em Lote e Tela de Consulta/Persistência no PostgreSQL

Estruturação do módulo completo de persistência fiscal, leitura nativa de arquivos XML (NF-e / NFS-e), análise em lote de múltiplos arquivos e tela de pesquisa por CNPJ, Chave de Acesso e Número da Nota Fiscal.

---

## 🎯 Objetivos

1. **Leitura Nativa de Arquivos XML (`xmlParser.ts`):** Suporte ao upload de arquivos `.xml` de NF-e e NFS-e no padrão ABRASF/Nacional com extração instantânea dos itens, NCMs, CSTs e destaques de retenções sem passar por OCR textual.
2. **Análise em Lote (Múltiplos PDFs/XMLs):** Permitir o envio de múltiplos arquivos simultaneamente para auditá-los em um único processo e consolidar os DARFs e retenções gerais do lote.
3. **Persistência de Análises no PostgreSQL (`notas_analisadas`):** Salvar todas as análises realizadas no banco de dados com seus respectivos parâmetros e memória de cálculo em JSONB.
4. **Tela de Consulta e Pesquisa Avançada (`HistoricoSearch.tsx`):**
   * Busca rápida por **CNPJ do Fornecedor**, **Chave de Acesso**, **Número da Nota** ou **Nome da Razão Social**.
   * Reabertura de cálculos salvos permitindo ajustar manualmente os valores (ex: Conta Vinculada, dedução de materiais, retenção de ISS) antes de gerar o relatório oficial do SEI.

---

## 📋 Alterações Propostas

### Backend (`backend/src/`):

#### 1. Banco de Dados (`database/schema.sql`)
* Criar a tabela `notas_analisadas`:
  ```sql
  CREATE TABLE IF NOT EXISTS notas_analisadas (
    id SERIAL PRIMARY KEY,
    tipo_documento VARCHAR(10) NOT NULL, -- NFE ou NFSE
    numero_nota VARCHAR(50) NOT NULL,
    chave_acesso VARCHAR(60),
    fornecedor_cnpj VARCHAR(20) NOT NULL,
    fornecedor_nome VARCHAR(255) NOT NULL,
    destinatario_cnpj VARCHAR(20),
    destinatario_nome VARCHAR(255),
    optante_simples BOOLEAN DEFAULT FALSE,
    valor_bruto NUMERIC(15, 2) NOT NULL,
    valor_liquido NUMERIC(15, 2) NOT NULL,
    total_retido NUMERIC(15, 2) NOT NULL,
    dados_json JSONB NOT NULL, -- Armazena todo o ResultadoConsolidado e parâmetros
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  ```

#### 2. Parser de XML (`backend/src/services/xmlParser.ts`)
* Criar a classe `XmlParser` utilizando a biblioteca `fast-xml-parser` para processar:
  * **NF-e de Mercadorias (`<nfeProc>` / `<NFe>`):** Extração de emitente, destinatário, número, chave de 44 dígitos, itens `<det>`, NCMs, CSTs, valores brutos e destaques de PIS/COFINS.
  * **NFS-e de Serviços (`<CompNfse>` / `<Nfse>`):** Extração de Prestador, Tomador, valor dos serviços, código de tributação municipal, retenções de IR, INSS, CSLL/PIS/COFINS e ISSQN.

#### 3. Rotas da API (`backend/src/server.ts`)
* **`POST /api/upload-xml`**: Upload e extração estruturada de arquivo `.xml`.
* **`POST /api/upload-batch`**: Upload de múltiplos arquivos (`.pdf` e/ou `.xml`) em uma única requisição.
* **`POST /api/notas/salvar`**: Salva ou atualiza uma análise no PostgreSQL.
* **`GET /api/notas/pesquisar`**: Consulta registros no banco com filtro por termo (`?q=CNPJ/Chave/Numero/Fornecedor`).
* **`GET /api/notas/:id`**: Retorna os detalhes de uma análise salva para ajuste na tela.

---

### Frontend (`frontend/src/`):

#### 1. Navegação e Cabeçalho Superior (`App.tsx`)
* Inserir abas de navegação no topo da aplicação:
  * 📥 **Nova Análise (PDF / XML / Lote)**
  * 🔍 **Consultar & Historico de Análises**

#### 2. Módulo de Upload em Lote e Suporte a XML (`FileUploader.tsx`)
* Atualizar o componente de upload para aceitar extensoes `.pdf` e `.xml`.
* Suporte ao upload simultâneo de múltiplos arquivos com indicador visual de progresso por nota.

#### 3. Tela de Pesquisa e Ajustes (`HistoricoSearch.tsx`)
* Campo de busca em tempo real (digite CNPJ, número da nota ou chave).
* Tabela de resultados com:
  * Data da análise, Número da Nota, Fornecedor (CNPJ), Tipo (NF-e/NFS-e), Valor Bruto, Total Retido e Valor Líquido.
  * Botão **"👁️ Reabrir / Ajustar Análise"**: Carrega os dados salvos na tela de edição para que o usuário possa recalcular, alterar Conta Vinculada ou deduções e re-emitir o relatório para o SEI.
  * Botão **"📄 Baixar PDF SEI"**: Baixa diretamente o relatório PDF da nota gravada.

---

## 🧪 Plano de Verificação

1. **Leitura de XML:** Enviar XMLs de exemplo de NF-e e NFS-e e atestar extração precisa sem depender de PDF.
2. **Análise em Lote:** Enviar 3 PDFs e XMLs simultaneamente e validar a consolidação do lote.
3. **Persistência no PostgreSQL:** Salvar uma análise, fechar o navegador, abrir a tela de consulta, buscar pelo CNPJ `27.170.703/0001-14` ou Número `84` e confirmar a recuperação com 100% dos dados.
4. **Re-ajuste e Re-emissão:** Alterar o valor da Conta Vinculada na nota recuperada da pesquisa e re-gerar o relatório do SEI.
