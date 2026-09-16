# Plano de Implementação: Processamento em Lote e Relatório Consolidado de Múltiplas Notas

Este plano estabelece a implementação da funcionalidade de **Processos de Pagamento com Múltiplas Notas Fiscais**, permitindo calcular a retenção de vários documentos de uma só vez (via upload em lote) ou selecionar notas salvas no histórico para gerar uma visão agregada e emitir o **Relatório Consolidado do Processo de Pagamento em PDF (Padrão SEI)**.

## User Review Required

> [!IMPORTANT]
> - O upload na tela inicial passará a aceitar **múltiplos arquivos (PDF e XML)** simultaneamente. Se 1 arquivo for enviado, o fluxo individual atual é mantido; se 2 ou mais forem enviados, o sistema ativa o modo de **Processo de Pagamento**.
> - Na aba de **Histórico**, cada nota terá uma caixa de seleção (checkbox). Ao marcar as notas desejadas, uma barra de ações permitirá clicar em *"Consolidar Notas em Processo de Pagamento"*.
> - O relatório consolidado incluirá campos opcionais para identificação institucional: **Número do Processo SEI** e **Nota de Empenho**.
> - Se forem detectados CNPJs de fornecedores diferentes no mesmo lote, o sistema emitirá um alerta amigável de advertência, mas permitirá o prosseguimento caso o usuário deseje.

---

## Proposed Changes

### Backend (`calc_impostos/backend`)

#### [MODIFY] [server.ts](file:///c:/Desenv-sistemas/ret-Impostos/calc_impostos/backend/src/server.ts)
- Adicionar endpoint `POST /api/upload-lote`:
  - Recebe múltiplos arquivos (PDF e XML) em um único FormData.
  - Processa cada arquivo através de `PdfParser` ou `XmlParser`.
  - Utiliza cache em memória para consultas CNPJ a fim de evitar sobrecarga da API da Receita Federal quando várias notas pertencerem ao mesmo fornecedor.
  - Processa cada nota via `TaxEngine.processarNota(...)`.
  - Agrega os totais (Bruto, IR, CSLL, COFINS, PIS, ISS, INSS, Total Retido, Valor Líquido, Códigos DARF e Naturezas Reinf somadas).
- Adicionar endpoint `POST /api/processo/gerar-pdf-consolidado`:
  - Recebe os dados do processo consolidado e metadados (`numeroProcesso`, `notaEmpenho`, notas e totais).
  - Invoca `PdfReportGenerator.gerarRelatorioConsolidado(...)` e devolve o stream do PDF como anexo para download.
- Garantir endpoint `GET /api/notas` como alias de busca para retorno do histórico completo quando não houver query param.

#### [MODIFY] [pdfReportGenerator.ts](file:///c:/Desenv-sistemas/ret-Impostos/calc_impostos/backend/src/services/pdfReportGenerator.ts)
- Implementar o método estático `gerarRelatorioConsolidado(dadosProcesso: DadosProcessoConsolidado): Promise<Buffer>`:
  - **Cabeçalho Oficial SEI**: Título "RELATÓRIO CONSOLIDADO DE RETENÇÕES TRIBUTÁRIAS - PROCESSO DE PAGAMENTO", exibindo Nº do Processo SEI, Nota de Empenho, Tomador/Órgão e Dados do Credor/Fornecedor.
  - **Quadro de Síntese Financeira**: Total de Notas Analisadas, Valor Bruto Consolidado, Total Geral de Retenções e Valor Líquido a Pagar.
  - **Quadro de Retenções Federais (DARF)**: Detalhamento somado por Código de Receita (ex: 8767, 6147, 1708) e Natureza EFD-Reinf.
  - **Quadro de Retenções Municipais e Previdenciárias**: ISSQN e INSS consolidados.
  - **Tabela Analítica das Notas Fiscais**: Lista de cada nota do processo discriminando Nº, Emissão, Bruto, IR, CSLL, COFINS, PIS, ISS, INSS, Total Retido e Líquido, finalizando com linha destacada de TOTAIS.
  - **Termo de Encerramento e Assinatura**: Espaço para ateste da liquidação da despesa pelo gestor financeiro/fiscal.

---

### Frontend (`calc_impostos/frontend`)

#### [NEW] [ProcessoConsolidadoModal.tsx](file:///c:/Desenv-sistemas/ret-Impostos/calc_impostos/frontend/src/components/ProcessoConsolidadoModal.tsx)
- Componente de visualização do Processo de Pagamento Consolidado:
  - Header com inputs para **Número do Processo SEI** e **Nota de Empenho**.
  - Alerta de consistência caso haja mais de um CNPJ de fornecedor no lote.
  - Cards de resumo de totais (Bruto Total, Retido Total, Líquido Total, DARF Total).
  - Tabela comparativa e agregada com todas as notas e linha de totalizador.
  - Quadro resumo de guias DARF, ISS e INSS unificadas.
  - Botão de ação: **"Baixar Relatório Consolidado do Processo (PDF)"**.
  - Botão de ação: **"Salvar Todas no PostgreSQL"** (para quando o lote foi importado via upload).

#### [MODIFY] [HistoricoSearch.tsx](file:///c:/Desenv-sistemas/ret-Impostos/calc_impostos/frontend/src/components/HistoricoSearch.tsx)
- Adicionar coluna de seleção (`checkbox`) para cada nota da tabela.
- Adicionar checkbox "Selecionar Todos" no cabeçalho da tabela.
- Adicionar barra flutuante de ações quando 1 ou mais notas estiverem selecionadas:
  - Indicador *"X nota(s) selecionada(s)"*.
  - Botão *"Consolidar em Processo de Pagamento"* que carrega os dados completos dessas notas e abre a visualização do processo.
  - Botão *"Desmarcar todas"*.

#### [MODIFY] [App.tsx](file:///c:/Desenv-sistemas/ret-Impostos/calc_impostos/frontend/src/App.tsx)
- Atualizar a zona de drag and drop e `<input type="file">` para aceitar `multiple`.
- Ao receber múltiplos arquivos, enviar para `/api/upload-lote` exibindo indicador visual de progresso ("Processando X notas fiscais...").
- Ao concluir o upload em lote, abrir a visualização do processo consolidado com todas as notas prontas para conferência e emissão do relatório PDF unificado.
- Integrar o estado de consolidação entre a aba de Análise e a aba de Histórico.

---

## Verification Plan

### Automated / Manual Verification
1. **Upload em Lote de Arquivos Reais**:
   - Enviar 3 arquivos de uma só vez (ex.: `DBV_COMERCIO___111945.pdf`, `NF agille.pdf`, `NF_4404_NOVA.pdf`).
   - Verificar se as 3 notas são processadas, calculadas e consolidadas sem erro.
2. **Seleção e Agregação via Histórico**:
   - Acessar a aba Histórico, marcar 2 ou mais notas salvas e clicar em "Consolidar Notas em Processo de Pagamento".
   - Conferir se os totais de IR, CSLL, PIS, COFINS, ISS e INSS batem exatamente com a soma das notas individuais.
3. **Download e Verificação do PDF Consolidado**:
   - Clicar em "Baixar Relatório Consolidado do Processo (PDF)".
   - Confirmar a geração do PDF, formato das tabelas, totais somados e inclusão do Processo SEI e Empenho informados.
