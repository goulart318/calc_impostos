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

### 3.3. SICAF (Sistema de Cadastramento Unificado de Fornecedores)
* **Alternativa 1 — Dados Abertos do Compras.gov.br (`compras.dados.gov.br`):**
  * O Portal de Compras Públicas federais possui APIs públicas e abertas (sem necessidade de convênio do Conecta) que retornam dados de fornecedores e contratos:
    `https://compras.dados.gov.br/fornecedores/v1/fornecedores.json?cnpj={cnpj}`
* **Alternativa 2 — Consulta Pública do SICAF Web:**
  * O analista pode acessar a consulta pública de situação de fornecedor do Compras.gov.br (`sicaf.comprasgovernamentais.gov.br`), que lista os Níveis:
    * Nível I: Credenciamento.
    * Nível II: Habilitação Jurídica.
    * Nível III: Regularidade Fiscal e Trabalhista Federal (Receita/PGFN, FGTS e CNDT).
    * Nível IV: Regularidade Fiscal Estadual/Municipal.
    * Nível V: Qualificação Técnica.
    * Nível VI: Qualificação Econômico-Financeira.

---

### 3.4. Certidões Federais Diretas e Gratuitas (Consultas Públicas)
Caso o órgão opte por verificar cada certidão individualmente:
1. **CNDT (Trabalhista - TST):** Consulta pública gratuita e emissão instantânea via portal do Tribunal Superior do Trabalho (`tst.jus.br/certidao`).
2. **CRF (FGTS - Caixa Econômica Federal):** Consulta pública da situação de regularidade do empregador (`consulta-crf.caixa.gov.br`).
3. **Certidão Conjunta RFB / PGFN:** Consulta pública do comprovante de regularidade fiscal perante a Fazenda Nacional (`solucoes.receita.fazenda.gov.br`).

---

## 4. Arquitetura Proposta para o "Hub de Conformidade Fiscal & Sanções"

Para operacionalizar essas consultas no sistema sem depender do Conecta gov.br:

```
+--------------------------------------------------------------------------+
|          PAINEL DE CONFORMIDADE & AUDITORIA PRÉ-PAGAMENTO                |
+--------------------------------------------------------------------------+
| FORNECEDOR: ADVANCED STERILIZATION PRODUCTS (CNPJ: 32.494.340/0001-02)   |
+--------------------------------------------------------------------------+
|  [✓] SIMPLES NACIONAL: Não Optante (Regime Normal / Retenção Ampla)      |
|  [✓] RECEITA FEDERAL: Situação Cadastral ATIVA                           |
|  [✓] CEIS/CNEP/CGU: Sem Sanções Impeditivas (Verificado via CGU API)     |
|                                                                          |
|  ATALHOS OPERACIONAIS EM 1 CLIQUE:                                       |
|  [ 🌐 Certidão Unificada TCU ]   [ 🌐 Declaração SICAF ]                 |
|  [ 🌐 CNDT Trabalhista TST ]     [ 🌐 CRF FGTS Caixa ]                   |
|                                                                          |
|  CHECKLIST DE AUDITORIA:                                                 |
|  [X] Consulta ao CADIN efetuada via SIAFI / SISBACEN                     |
|      Responsável: Ulisses Goularte • Data/Hora: 22/10/2026 11:45         |
+--------------------------------------------------------------------------+
```

---

## 5. Cronograma e Etapas de Entrega

| Fase | Escopo | Status |
| :--- | :--- | :---: |
| **Fase 1** | **Memória Tributária Ativa:** Tabela no PostgreSQL, serviço de persistência e auto-sugestão no cálculo por fornecedor. | **Concluída** |
| **Fase 2** | **Integração com API Pública da CGU:** Conexão com CEIS/CNEP aberta via Portal da Transparência para verificação de punições. | **Planejada** |
| **Fase 3** | **Atalhos Parametrizados de Certidões:** Botões de 1 clique para TCU Unificado, SICAF, CNDT e FGTS com o CNPJ pré-carregado. | **Planejada** |
| **Fase 4** | **Checklist CADIN / SIAFI no Relatório:** Inclusão do campo de atesto de conformidade no relatório PDF de retenções. | **Planejada** |

---

## 6. Conclusão e Próximos Passos

A **Melhoria 3** já está totalmente implementada, testada e em operação, garantindo que o sistema aprenda com as correções do auditor e automatize as alíquotas de fornecedores habituais. 

Para a **Melhoria 1**, o caminho mais eficiente, seguro e sem atritos burocráticos consiste em:
1. Utilizar a **API Aberta da CGU (Transparência)** para checagem imediata de punições (CEIS/CNEP).
2. Incorporar os **links diretos parametrizados do TCU Unificado e SICAF**.
3. Adicionar o **módulo de atesto de consulta ao CADIN (SIAFI)** com aposição do carimbo digital no relatório PDF.

Dessa forma, o órgão cumpre integralmente a legislação fiscal e as exigências dos órgãos de controle (TCU, CGU e PGFN) sem depender de licenças ou integrações restritas.
