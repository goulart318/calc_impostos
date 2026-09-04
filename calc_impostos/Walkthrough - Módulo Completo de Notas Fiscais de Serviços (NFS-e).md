# Walkthrough: Módulo Completo de Notas Fiscais de Serviços (NFS-e) e Retenção para Conta Vinculada

Desenvolvimento e validação completa do suporte às **Notas Fiscais de Serviços Eletrônicas (NFS-e)** no padrão **DANFSe v2.0**, com regras específicas para **Vitória/ES** (Redução da Base de Cálculo do ISSQN em 20%) e **Retenção para Conta-Depósito Vinculada** (IN 5/2017 SEGES/ME).

---

## 🛠 Alterações Realizadas

### Backend:
1. **Parser Dedicado de NFS-e (`PdfParser.ts`):**
   * Reconhecimento automático de layout **DANFSe v2.0 (Nacional / Municipal)**.
   * Extração isolada dos blocos `PRESTADOR / FORNECEDOR` e `TOMADOR / ADQUIRENTE` para evitar qualquer inversão de CNPJs.
   * Leitura de destaques de retenção da NFS-e: **Valor do Serviço**, **BC ISSQN**, **IRRF**, **Contribuição Previdenciária (INSS/CP)** e **Contribuições Sociais**.
2. **Motor Tributário (`TaxEngine.ts`):**
   * Suporte ao campo `percentualReducaoIss` (ex: 20% para obras/reformação de construção civil em Vitória/ES).
   * Cálculo da `BaseCalculoISS = ValorBruto * (1 - Reducao%)`.
   * Suporte ao campo `valorContaVinculada` (desconto de provisões trabalhistas descontado do pagamento líquido ao fornecedor e fundamentado na IN 5/2017 SEGES/ME).
3. **Servidor API (`server.ts`):**
   * Repasse dos novos parâmetros de NFS-e nas rotas de upload e cálculo.

### Frontend:
1. **Interface do Usuário (`App.tsx`):**
   * Adicionado o painel **Configurações de Serviços, ISS (Vitória/ES) & INSS**.
   * Adicionado o campo **"Redução da Base de Cálculo do ISSQN (%)"** com botões de atalho **⚡ 20% (Construção/Reforma)** e **0% (Integral)**.
   * Adicionado o campo **"🏦 Retenção para Conta-Depósito Vinculada (IN 5/2017 SEGES/ME)"**.
   * Adicionado o controle de **"ISSQN Retido pelo Tomador na Fonte"**.
2. **Relatório do SEI (`ReportPreview.tsx`):**
   * Exibição na memória de cálculo e tabela consolidada da linha de **Conta Vinculada** e dedução no valor líquido a pagar ao fornecedor.

---

## 🧪 Resultados da Validação

- ✅ **`NF_84_comer.pdf` (Comer Construtora - Retrofit CTI/PS HUCAM):**
  - **Prestador:** `27.170.703/0001-14` (COMER CONSTRUTORA)
  - **Tomador:** `15.126.437/0006-58` (EBSERH HUCAM)
  - **Valor Bruto:** R$ 491.250,47
  - **Redução Base ISSQN:** 20% (Base ISSQN: R$ 393.000,38 | ISS 5% Retido: R$ 19.650,02)
  - **INSS Mão de Obra:** R$ 43.230,04
- ✅ **`NF_33912 - cetan.pdf` (Cetan - Análises Técnicas):**
  - **Prestador:** `04.927.092/0002-91` (CETAN)
  - **Tomador:** `15.126.437/0006-58` (EBSERH HUCAM)
  - **Valor Bruto:** R$ 5.418,20
