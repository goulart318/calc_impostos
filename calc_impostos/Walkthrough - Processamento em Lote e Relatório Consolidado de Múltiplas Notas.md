# Walkthrough: Processamento em Lote e Relatório Consolidado de Múltiplas Notas

Implementamos a funcionalidade completa para suporte a **Processos de Pagamento com Múltiplas Notas Fiscais**, atendendo a processos que possuem várias notas fiscais a serem liquidadas conjuntamente.

## 🎯 O que foi implementado

### 1. Upload em Lote e Cálculo Automático
- **Área de Importação Multi-Arquivo**: A zona de drag and drop e o seletor de arquivos na aba *Análise de Retenção* agora aceitam múltiplos arquivos (PDFs e XMLs) simultaneamente.
- **Processamento Concorrente com Cache de CNPJ**: O endpoint `POST /api/upload-lote` processa cada documento fiscal, reutilizando em memória os dados do fornecedor para máxima velocidade e sem sobrecarregar a API da Receita Federal.
- **Agrupamento Automático**: Se você enviar mais de uma nota, o sistema calcula os impostos individuais e abre a tela consolidada do processo.

---

### 2. Seleção Múltipla no Histórico do PostgreSQL
- **Checkboxes de Seleção**: Na aba *Histórico no PostgreSQL*, cada nota salva possui uma caixa de seleção, além do botão no cabeçalho para *Selecionar / Desmarcar Todas*.
- **Barra Flutuante de Consolidação**: Ao selecionar uma ou mais notas, surge a barra com o total de notas marcadas e o botão **"Consolidar em Processo de Pagamento"**.

---

### 3. Modal e Painel de Processo Consolidado (`ProcessoConsolidadoModal`)
- **Metadados Institucionais SEI**:
  - Campo para informar o **Número do Processo SEI** (ex: `23000.012345/2026-00`).
  - Campo para informar a **Nota de Empenho / Contrato** (ex: `2026NE000123`).
  - Campo opcional para **Observações do Processo**.
- **Cards com Síntese Financeira do Processo**:
  - 💰 **Valor Bruto Total do Processo**
  - 🏛️ **DARF Federal Consolidada (IR + CSLL + COFINS + PIS)**
  - 🛡️ **Total Geral Retido (Federal + INSS + ISSQN)**
  - 💵 **Valor Líquido Total a Pagar ao(s) Credor(es)**
- **Alerta de Múltiplos Fornecedores**: Caso o lote possua notas de CNPJs diferentes, exibe um alerta amigável de advertência para conferência.
- **Tabela Comparativa Analítica Completa**:
  - Lista cada nota com seu Nº, Tipo, Data, Bruto, Federais, INSS, ISS, Total Retido e Líquido.
  - Linha destacada de **TOTAIS CONSOLIDADOS DO PROCESSO** no rodapé.
- **Quadro de Guias de Recolhimento**:
  - Valores somados por Código DARF (ex: Código 6147, Código 8767).
  - Total de INSS e Total de ISSQN.

---

### 4. Emissão de Relatório Consolidado em PDF (Padrão SEI)
- **Botão "Baixar Relatório Consolidado (PDF SEI)"**:
  - Gera documento oficial A4 formatado para juntada no processo SEI.
  - Contém cabeçalho com número do processo, credores, demonstrativo analítico de todas as notas, detalhamento dos tributos, códigos DARF somados e termo de atesto da liquidação.

---

## 🧪 Validação dos Testes

O teste automatizado processou 3 notas fiscais reais (`DBV_COMERCIO___111945.pdf`, `NF agille.pdf` e `NF_4404_NOVA.pdf`) em lote:

```text
Total de arquivos recebidos: 3
Total processadas com sucesso: 3
Múltiplos fornecedores detectados: true
Resumo consolidado:
  - Total Bruto: R$ 66.822,20
  - Total Retido Geral: R$ 2.951,66
  - Total Líquido a Pagar: R$ 63.870,54
  - DARF Código 6147: R$ 2.374,58
  - DARF Código 8767: R$ 577,08
✅ PDF Consolidado gerado com sucesso!
```

---

## 🚀 Como Usar no Dia a Dia

1. **Opção 1 (Upload em Lote)**:
   - Na aba *Análise de Retenção*, selecione ou arraste 2 ou mais arquivos (PDF ou XML) de uma só vez.
   - O modal do processo consolidado abrirá automaticamente com os cálculos e somas já efetuados.
   - Preencha o Nº do Processo SEI e Empenho e clique em **"Baixar Relatório Consolidado (PDF SEI)"**.

2. **Opção 2 (Seleção no Histórico)**:
   - Vá para a aba *Histórico no PostgreSQL*.
   - Marque as caixas de seleção das notas que compõem o processo de pagamento.
   - Clique em **"Consolidar em Processo de Pagamento"**.
