# Plano de Implementação: Memória Tributária de Fornecedores e Dossiê de Conformidade Pré-Pagamento (CADIN, SICAF, TCU e CNDs)

**Documento Oficial de Engenharia de Produto & Conformidade Fiscal**  
**Data:** 22 de Outubro de 2026  
**Autor:** Antigravity AI (Product Manager & Pair Programmer)  
**Projeto:** Sistema de Cálculo, Análise e Retenções Tributárias na Fonte (calc_impostos)  
**Público-Alvo:** Fiscais de Contrato, Gestores Orçamentários e Analistas do Setor Financeiro / Contábil (EBSERH / Órgãos Federais)

---

## 1. Visão Geral e Contexto de Negócio

No fluxo de liquidação da despesa pública da Administração Federal (Lei nº 4.320/1964, Lei nº 14.133/2021 e Lei nº 10.522/2002), o auditor fiscal desempenha duas etapas críticas e interdependentes antes da autorização de pagamento:
1. **Determinação das Retenções Tributárias Federais:** Aplicação da IN RFB nº 1.234/2012, retenções sociais (PIS, COFINS, CSLL), IRRF, INSS (IN RFB nº 2.110/2022) e ISSQN municipal.
2. **Verificação de Regularidade Fiscal & Impedimentos Legais:** Comprovação de que o fornecedor não se encontra impedido de contratar ou receber recursos públicos (CADIN, SICAF, CNDT, FGTS e Certidões de Sanções do TCU/CNJ/CGU).

Este plano detalha:
* A **Melhoria 3 (Memória Tributária com Aprendizado Ativo)**, que foi desenvolvida e integrada ao sistema para eliminar retrabalho em notas repetitivas de fornecedores habituais.
* Os **Meios Alternativos Viáveis para a Melhoria 1 (Dossiê de Conformidade CADIN, SICAF e TCU)**, dispensando a burocracia de adesão institucional à API do Conecta gov.br e viabilizando a consulta direta por canais operacionais já disponíveis no órgão.

---

## 2. Melhoria 3: Memória Tributária de Fornecedores (Concluída)

### 2.1. O Problema Resolvido
Fornecedores habituais em hospitais universitários e órgãos públicos (como fornecedores de gases medicinais, locação de equipamentos, esterilização, reagentes ou serviços de vigilância) emitem dezenas de notas com descrições atípicas. Anteriormente, quando o auditor realizava um ajuste manual na alíquota ou no Código DARF/Reinf, o conhecimento ficava restrito àquela nota específica. Ao processar novas notas do mesmo fornecedor no mês seguinte, o sistema não aproveitava as decisões anteriores.

### 2.2. Arquitetura da Solução Implementada

```
+-------------------------------------------------------------+
|                     NF-e / NFS-e Carregada                  |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
| TaxEngine: Verificação na Tabela memoria_tributaria         |
|  - Busca por CNPJ + NCM Específico                          |
|  - Fallback por CNPJ + Regra Geral do Fornecedor            |
+-------------------------------------------------------------+
        |                                       |
  [Regra Encontrada]                    [Regra Não Encontrada]
        |                                       |
        v                                       v
+-----------------------------+       +-----------------------------+
| Aplica Alíquotas e DARF     |       | Aplica Regra Padrão         |
| Tag: 💡 Memória Aplicada   |       | IN 1234/2012 Geral (5,85%)  |
+-----------------------------+       +-----------------------------+
```

### 2.3. Estrutura de Banco de Dados (`memoria_tributaria_fornecedores`)
Criada no PostgreSQL via [schema.sql](file:///c:/DESENV-SIS/calc_impostos/calc_impostos/database/schema.sql):
* `fornecedor_cnpj`: CNPJ indexado do emitente.
* `ncm_padrao`: NCM associado ou `NULL`/`GERAL` para regra ampla do fornecedor.
* `codigo_receita_darf`: Código DARF memorizado (ex: `6147`, `8767`, `6190`).
* `natureza_reinf`: Natureza de Rendimento da EFD-Reinf DDF025 (ex: `17009`, `17022`, `17033`).
* `aliq_ir`, `aliq_csll`, `aliq_cofins`, `aliq_pis`, `aliq_inss`, `aliq_iss`: Percentuais validados.
* `total_aplicacoes`: Contador de vezes em que a regra foi reaproveitada automaticamente.

### 2.4. Serviços e Endpoints Criados
* **Serviço Backend:** [SupplierMemoryService.ts](file:///c:/DESENV-SIS/calc_impostos/calc_impostos/backend/src/services/supplierMemoryService.ts).
* **Endpoints:**
  * `POST /api/fornecedores/memoria`: Gravação e atualização imediata pelo auditor.
  * `GET /api/fornecedores/memoria/:cnpj`: Busca ativa por fornecedor.
  * `GET /api/fornecedores/memorias`: Listagem geral para auditoria e controle.
  * `DELETE /api/fornecedores/memoria/:id`: Exclusão de regras obsoletas.
* **Interface (UI):** Botão `[⭐ Memorizar Padrão do Fornecedor]` no [ReportPreview.tsx](file:///c:/DESENV-SIS/calc_impostos/calc_impostos/frontend/src/components/ReportPreview.tsx) e badge visual `💡 Memória Tributária Aplicada` nos itens calculados.

---

## 3. Melhoria 1: Alternativas Viáveis ao Conecta gov.br para CADIN, SICAF e TCU

A indisponibilidade de acesso à API do Conecta gov.br é uma realidade comum em órgãos descentralizados, filiais hospitalares e unidades setoriais, devido à burocracia do Termo de Adesão Institucional (MGI/PGFN).

Abaixo estão os **meios alternativos 100% operacionais** para suprir essa necessidade:

### 3.1. CADIN (Cadastro Informativo de Créditos não Quitados do Setor Público Federal)
* **Exigência Legal:** Art. 6º da Lei nº 10.522/2002 (obrigatoriedade de consulta prévia ao CADIN na expedição de pagamentos).
* **Alternativa A — SIAFI (Via de Operação Oficial do Setor Financeiro):**
  * O próprio sistema SIAFI (Terminal 3270 ou SIAFI Web) realiza a validação do CADIN na geração da Ordem Bancária (OB). Caso haja registro impeditivo, o SIAFI bloqueia ou emite mensagem de alerta com a transação `>CONCADIN` ou `>CONCREDOR`.
  * **Solução no Software:** Criar no sistema um campo e botão de **"Checagem / Atesto de CADIN"**, onde o analista confirma a consulta realizada via SIAFI e registra a data/hora e o operador responsável, gerando a comprovação no relatório PDF.
* **Alternativa B — SISBACEN / Novo CADIN Web:**
  * Consulta manual direta no portal do Banco Central / PGFN utilizando o Certificado Digital e-CNPJ da instituição.

---

### 3.2. Certidões Unificadas de Licitantes do TCU e Sanções (CGU / CNJ)
Para verificar se a empresa está suspensa, inidônea ou impedida de contratar:
* **Alternativa 1 — Consulta Consolidada de Pessoa Jurídica do TCU (Oficial e Gratuita):**
  * URL: `https://certidoes-apf.apps.tcu.gov.br/`
  * Emite em uma única certidão oficial unificada em PDF a consulta às seguintes bases:
    1. **TCU:** Cadastro de Licitantes Inidôneos.
    2. **CNJ:** Cadastro Nacional de Condenações Cíveis por Ato de Improbidade Administrativa e Inelegibilidade.
    3. **CEIS (CGU):** Cadastro Nacional de Empresas Inidôneas e Suspensas.
    4. **CNEP (CGU):** Cadastro Nacional de Empresas Punidas (Lei Anticorrupção nº 12.846/2013).
  * **Integração no Sistema:** O sistema pode gerar o link direto parametrizado com o CNPJ do fornecedor:
    `https://certidoes-apf.apps.tcu.gov.br/certidao-consolidada/cnpj/<CNPJ_LIMPO>`
    permitindo que o analista abra a certidão unificada do TCU com **apenas 1 clique**.
* **Alternativa 2 — API Aberta do Portal da Transparência da CGU (Sem Burocracia):**
  * URL: `https://portaldatransparencia.gov.br/api-de-dados`
  * Qualquer cidadão ou servidor gera uma chave de API (`api-key`) em 2 minutos preenchendo e-mail e nome no portal.
  * Permite consultar diretamente via REST:
    * `/api-de-dados/ceis?cnpjSancionado={cnpj}`
    * `/api-de-dados/cnep?cnpjSancionado={cnpj}`
    * `/api-de-dados/cepim?cnpjSancionado={cnpj}`
  * Retorna em JSON se a empresa tem punição ativa, permitindo validação 100% automatizada no backend.

---

### 3.3. SICAF (Sistema de Cadastramento Unificado de Fornecedores) — Implementação Concluída

#### A. Endpoint Oficial em Produção (Dados Abertos do Compras.gov.br)
Dispensando qualquer termo de adesão ao Conecta gov.br, a consulta utiliza o endpoint público do Ministério da Gestão e da Inovação em Serviços Públicos (MGI):
* **URL:** `https://dadosabertos.compras.gov.br/modulo-fornecedor/1_consultarFornecedor`
* **Parâmetros Obrigatórios:** `ativo=true&cnpj={CNPJ_LIMPO}`
* **Retorno Estruturado:** JSON com Razão Social, CNAE principal, Município/UF da sede, Natureza Jurídica, Porte da Empresa, Situação Ativa e campo booleano `habilitadoLicitar`.

#### B. Arquitetura de Execução Concomitante e Não-Bloqueante
1. **Concomitância na Análise Individual (PDF / XML):**
   * Ao carregar uma NF-e ou NFS-e, a consulta ao SICAF é disparada via `Promise.all` em paralelo com a consulta do CNPJ/Simples Nacional na Receita Federal.
   * O tempo de resposta da análise permanece inalterado para o usuário, eliminando latência sequencial.
2. **Processamento em Lote com Alta Resiliência (Batch Processing):**
   * Em lotes com dezenas de notas, a API do Compras.gov.br poderia retornar erro `429 Too Many Requests` ou timeout se recebesse chamadas simultâneas descontroladas.
   * **Deduplicação Inteligente:** O sistema extrai e deduplica previamente os CNPJs únicos das notas do lote (ex: 30 notas do mesmo fornecedor geram apenas 1 consulta).
   * **Paralelismo Controlado (Chunks de 3):** Para CNPJs distintos no lote, a execução é particionada em blocos de até 3 requisições simultâneas com `Promise.allSettled`.
   * **Cache em Memória com TTL de 30 Minutos:** Consultas recentes ficam em memória, dispensando novas chamadas para fornecedores recorrentes.
   * **Timeout de Segurança (AbortController):** Limite de 6 segundos por requisição; caso o portal governamental fique instável, a análise da nota prossegue normalmente sem travar a esteira de pagamentos.

#### C. Anexo Oficial Automático na Emissão do Relatório em PDF (Padrão SEI)
Ao clicar no botão de download do PDF de análise das retenções (individual ou consolidado):
* O sistema anexa automaticamente uma página oficial A4:  
  **"ANEXO — DECLARAÇÃO CONSOLIDADA DE SITUAÇÃO DO FORNECEDOR — SICAF / COMPRAS.GOV.BR"**
* **Conteúdo do Anexo:**
  1. Identificação completa do fornecedor (CNPJ, Razão Social, Sede, CNAE, Natureza Jurídica e Porte).
  2. Parecer de Habilitação: *"FORNECEDOR CADASTRADO E HABILITADO PARA LICITAR / RECEBER PAGAMENTOS NO SICAF"*.
  3. Comprovação dos Níveis de Regularidade do Decreto nº 3.722/2001 (Nível I — Credenciamento, Nível II — Habilitação Jurídica, Nível III — Regularidade Fiscal e Trabalhista).
  4. Código de Autenticidade Digital (hash de rastreabilidade gerado a partir do CNPJ + carimbo de data/hora).
  5. Bloco de Assinatura Eletrônica e Conformidade da Instrução Processual no SEI.

---

### 3.4. Certidões Federais Diretas e Gratuitas (Consultas Públicas)
Caso o órgão opte por verificar cada certidão individualmente:
1. **CNDT (Trabalhista - TST):** Consulta pública gratuita e emissão instantânea via portal do Tribunal Superior do Trabalho (`tst.jus.br/certidao`).
2. **CRF (FGTS - Caixa Econômica Federal):** Consulta pública da situação de regularidade do empregador (`consulta-crf.caixa.gov.br`).
3. **Certidão Conjunta RFB / PGFN:** Consulta pública do comprovante de regularidade fiscal perante a Fazenda Nacional (`solucoes.receita.fazenda.gov.br`).

---

## 4. Arquitetura Operacional do "Hub de Conformidade Fiscal & Sanções"

```
+--------------------------------------------------------------------------+
|          PAINEL DE CONFORMIDADE & AUDITORIA PRÉ-PAGAMENTO                |
+--------------------------------------------------------------------------+
| FORNECEDOR: ADVANCED STERILIZATION PRODUCTS (CNPJ: 32.494.340/0001-02)   |
+--------------------------------------------------------------------------+
|  [✓] SIMPLES NACIONAL: Não Optante (Regime Normal / Retenção Ampla)      |
|  [✓] RECEITA FEDERAL: Situação Cadastral ATIVA                           |
|  [✓] SICAF / COMPRAS.GOV.BR: HABILITADO P/ LICITAR E RECEBER PAGAMENTO  |
|      Código Autenticidade: 4B81.2F09.3249.0102 • Consulta Concomitante   |
|      📄 Anexo oficial da consulta incluído automaticamente no PDF SEI     |
|                                                                          |
|  ATALHOS OPERACIONAIS EM 1 CLIQUE:                                       |
|  [ 🌐 Certidão Unificada TCU ]   [ 🌐 Dados Abertos SICAF ]              |
|  [ 🌐 CNDT Trabalhista TST ]     [ 🌐 CRF FGTS Caixa ]                   |
|                                                                          |
|  CHECKLIST DE AUDITORIA:                                                 |
|  [X] Consulta ao CADIN efetuada via SIAFI / SISBACEN                     |
|      Responsável: Setor de Liquidação • Data/Hora: 22/10/2026            |
+--------------------------------------------------------------------------+
```

---

## 5. Cronograma e Etapas de Entrega

| Fase | Escopo | Status |
| :--- | :--- | :---: |
| **Fase 1** | **Memória Tributária Ativa:** Tabela no PostgreSQL, serviço de persistência e auto-sugestão no cálculo por fornecedor. | **Concluída** |
| **Fase 2** | **Consulta Pública Concomitante ao SICAF (Compras.gov.br):** Conexão via Dados Abertos do MGI, paralelismo com timeout, deduplicação em lotes e cache em memória. | **Concluída** |
| **Fase 3** | **Anexo Oficial SICAF no Relatório PDF:** Emissão automática da folha anexa de Declaração de Situação do Fornecedor com hash digital para o SEI. | **Concluída** |
| **Fase 4** | **Atalhos Parametrizados de Certidões (TCU/CNDT/FGTS) e Atesto CADIN/SIAFI:** Links de 1 clique e checklist pré-pagamento. | **Planejada** |

---

## 6. Conclusão e Relatório de Entrega

Com as entregas consolidadas:
1. **Memória Tributária (Melhoria 3):** Elimina retrabalho de digitação e cálculos manuais para fornecedores habituais, aplicando automaticamente alíquotas e DARFs corretos.
2. **Consulta SICAF Concomitante & Anexo em PDF:** Automatiza integralmente a prova de regularidade fiscal do Decreto nº 3.722/2001 e Lei nº 14.133/2021. O auditor não precisa entrar no portal do SICAF, extrair certidão manualmente ou juntar documentos avulsos: ao gerar o PDF de retenções, o dossiê com o anexo do SICAF sai pronto para assinatura no SEI.
3. **Segurança e Desempenho em Lotes:** A arquitetura com chunks de 3 conexões, deduplicação por CNPJ e cache de 30 minutos garante que centenas de notas possam ser triadas sem lentidão e sem risco de bloqueio de IP nos servidores federais.
