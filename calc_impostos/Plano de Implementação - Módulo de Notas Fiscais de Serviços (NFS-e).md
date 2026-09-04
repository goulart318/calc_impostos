# Plano de Implementação: Módulo de Notas Fiscais de Serviços (NFS-e), DANFSe v2.0 e Redução de Base do ISSQN

Desenvolvimento do suporte completo a **Notas Fiscais de Serviços Eletrônicas (NFS-e)**, correção do parser de **DANFSe v2.0** (evitando a inversão de Prestador/Tomador) e inclusão da **Redução da Base de Cálculo do ISSQN** (ex: 20% para obras de construção/reforma em Vitória/ES).

---

## 🎯 Objetivos do Módulo

1. **Parser de NFS-e / DANFSe v2.0 sem Inversão de CNPJ:**
   * Garantir a leitura correta dos blocos oficiais `PRESTADOR / FORNECEDOR` e `TOMADOR / ADQUIRENTE`.
   * Eliminar trocas entre quem presta e quem toma o serviço.
2. **Leitura de Retenções Destaque do DANFSe:**
   * Extração direta do **Valor da Operação / Serviço**, **BC ISSQN**, **IRRF**, **Contribuição Previdenciária Retida (INSS / CP)** e **Contribuições Sociais Retidas (PIS/COFINS/CSLL)**.
3. **Redução Configurável da Base de Cálculo do ISSQN (Vitória/ES):**
   * Campo configurável de **Redução da Base de Cálculo do ISSQN (%)** (ex: 0% a 100%, com atalho de 20% para Construção Civil / Reformas - Item 7.02).
   * Memória de cálculo exibindo a `Base Reduzida de ISSQN` e o valor retido do imposto municipal.
4. **Enquadramento no Motor Tributário (`TaxEngine`):**
   * Código DARF 6190 (Serviços em Geral - 9,45%), 6147 (Serviços Hospitalares / Engenharia com Material - 5,85%), 6175 (Transporte - 7,05%), etc.

---

## 📋 Open Questions & Confirmações

> [!NOTE]
> **1. Retenção de INSS (Contribuição Previdenciária):**
> Na NFS-e da Comer Construtora (NF 84), consta o destaque de **Contribuição Previdenciária Retida (R$ 43.230,04 - 11% sobre a mão de obra R$ 393.000,38)**. O sistema deve sugerir automaticamente a retenção de INSS de 11% quando houver destaque de CP/INSS na NFS-e ou quando for serviço de empreitada/mão de obra?

---

## 🛠 Arquivos e Modificações Propostas

---

### Backend (Serviços & Parsers)

#### [MODIFY] [pdfParser.ts](file:///c:/Desenv-sistemas/Ret-Impostos/backend/src/services/pdfParser.ts)
- Adicionar detector específico do padrão **DANFSe v2.0** e notas de serviço municipais.
- Extração estruturada via regex dos blocos delimitados:
  - `PRESTADOR / FORNECEDOR` -> CNPJ, Razão Social, Município.
  - `TOMADOR / ADQUIRENTE` -> CNPJ, Razão Social, Município.
- Extração de retenções pré-destacadas na NFS-e:
  - `Valor da Operação / Serviço` (Valor Bruto da NFS-e);
  - `BC ISSQN` e `Alíquota Aplicada` (com cálculo de redução de base);
  - `IRRF`, `Contribuição Previdenciária - Retida (INSS/CP)` e `Contribuições Sociais - Retidas`.

#### [MODIFY] [taxEngine.ts](file:///c:/Desenv-sistemas/Ret-Impostos/backend/src/services/taxEngine.ts)
- Expandir a interface `ParametrosCalculo` para NFS-e:
  - `percentualReducaoIss`: number (ex: 20.00%);
  - `retencaoIss`: boolean (Retido pelo Tomador vs Não Retido);
  - `valorInssDestacado`: number (para preenchimento direto do valor de INSS/CP da NFS-e).
- Atualizar a fórmula do ISSQN:
  - `BaseCalculoISS = ValorBruto * (1 - percentualReducaoIss / 100)`;
  - `ValorISS = BaseCalculoISS * (aliqIss / 100)`.

#### [MODIFY] [server.ts](file:///c:/Desenv-sistemas/Ret-Impostos/backend/src/services/server.ts)
- Repassar os novos campos de NFS-e (redução de base de ISSQN, retenção de INSS e retenção de ISS) entre o parser e o motor tributário.

---

### Frontend (Interface do Usuário)

#### [MODIFY] [App.tsx](file:///c:/Desenv-sistemas/Ret-Impostos/frontend/src/App.tsx)
- Adicionar controles específicos no formulário quando `Tipo de Nota = NFS-e (Serviço)`:
  - Campo **"Redução da Base de Cálculo do ISSQN (%)"** (Input numérico de 0 a 100%, com botão rápido **"20% (Construção/Reforma)"**);
  - Checkbox/Opção **"ISSQN Retido pelo Tomador"**;
  - Campo **"Retenção de INSS / Contribuição Previdenciária"** (Sim/Não e percentual/valor).
- Atualizar a tabela de itens e resumo tributário para apresentar a base reduzida de ISSQN de forma transparente.

#### [MODIFY] [ReportPreview.tsx](file:///c:/Desenv-sistemas/Ret-Impostos/frontend/src/components/ReportPreview.tsx)
- Exibir a memória de cálculo do ISSQN com o destaque da eventual redução de base de cálculo em Vitória/ES no relatório final em PDF.

---

## 🧪 Plano de Verificação

### Testes Automatizados e Backend:
- Rodar o script de verificação dos dois PDFs reais de NFS-e (`NF_84_comer.pdf` e `NF_33912 - cetan.pdf`).
- Verificar se:
  - Na `NF_84_comer.pdf`: Prestador = `27.170.703/0001-14` (COMER CONSTRUTORA), Tomador = `15.126.437/0006-58` (EBSERH HUCAM). Valor do Serviço = R$ 491.250,47. BC ISS = R$ 393.000,38 (20% de redução).
  - Na `NF_33912 - cetan.pdf`: Prestador = `04.927.092/0002-91` (CETAN), Tomador = `15.126.437/0006-58` (EBSERH HUCAM). Valor do Serviço = R$ 5.418,20.

### Verificação Manual:
- Testar o upload direto na interface web com as duas NFS-e.
- Confirmar a validação de pertence verde (Match do CNPJ `15.126.437/0006-58`).
- Ajustar o campo de Redução de Base de ISSQN e validar o recálculo imediato na tela.
