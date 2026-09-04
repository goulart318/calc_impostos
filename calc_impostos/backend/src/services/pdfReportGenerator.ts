import PDFDocument from 'pdfkit';
import { ResultadoConsolidado } from './taxEngine';

export class PdfReportGenerator {
  /**
   * Gera o nome padronizado do arquivo PDF incluindo o número da nota e a Razão Social do fornecedor
   */
  public static gerarNomeArquivo(numeroNota?: string, fornecedorNome?: string): string {
    const nota = (numeroNota || 'Fiscal').trim();
    const razaoSocial = (fornecedorNome || '')
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9\s_-]/g, '')
      .replace(/\s+/g, '_')
      .toUpperCase();

    if (razaoSocial) {
      return `Relatorio_Retencao_Nota_${nota}_${razaoSocial}.pdf`;
    }
    return `Relatorio_Retencao_Nota_${nota}.pdf`;
  }

  /**
   * Gera o PDF formatado do relatório individualizado de retenções (Padrão SEI / Órgão Federal)
   */
  public static gerarRelatorio(resultado: ResultadoConsolidado): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const nomeArquivo = PdfReportGenerator.gerarNomeArquivo(resultado.numeroNota, resultado.fornecedorNome);
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 30, bottom: 30, left: 35, right: 35 },
          info: {
            Title: nomeArquivo.replace('.pdf', ''),
            Author: 'Sistema de Retencoes Tributarias - Orgao Federal',
            Subject: 'Memoria de Calculo de Retencoes Tributarias (IN RFB 1.234/2012)'
          }
        });

        const buffers: Buffer[] = [];
        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));

        const formatBRL = (val: number) => {
          return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        };

        const primaryColor = '#0f172a'; // Slate 900
        const accentColor = '#2563eb'; // Blue 600
        const lightBg = '#f8fafc'; // Slate 50
        const borderColor = '#cbd5e1'; // Slate 300
        const textMuted = '#64748b'; // Slate 500

        // ==========================================
        // 1. CABEÇALHO OFICIAL DO DOCUMENTO
        // ==========================================
        doc.fillColor(primaryColor)
           .fontSize(15)
           .font('Helvetica-Bold')
           .text(resultado.tipoDocumento === 'NFE' ? 'NOTA FISCAL DE MERCADORIAS (NF-e)' : 'NOTA FISCAL DE SERVIÇOS (NFS-e)', 35, 30);

        doc.fillColor(textMuted)
           .fontSize(8.5)
           .font('Helvetica')
           .text(`Relatorio de Instrucao de Processo Digital SEI • Analise: ${new Date().toLocaleDateString('pt-BR')}`, 35, 48);

        // Badge do Tipo de Documento
        const badgeX = 390;
        const badgeY = 30;
        doc.rect(badgeX, badgeY, 170, 22).fillAndStroke(lightBg, borderColor);
        doc.fillColor(accentColor).fontSize(8.5).font('Helvetica-Bold')
           .text(resultado.tipoDocumento === 'NFE' ? 'NF-e: Compra / Mercadoria' : 'NFS-e: Prestacao de Servico', badgeX + 10, badgeY + 6);

        // ==========================================
        // 2. SELO DE CONFIRMAÇÃO DE PERTENCE DO CNPJ
        // ==========================================
        const destY = 62;
        const destCnpjFmt = resultado.destinatarioCnpj || '15.126.437/0006-58';
        const destNomeFmt = resultado.destinatarioNome || 'EMPRESA BRASILEIRA DE SERVICOS HOSPITALARES - EBSERH';

        doc.rect(35, destY, 525, 22).fillAndStroke('#ecfdf5', '#a7f3d0');
        doc.fillColor('#047857').fontSize(8).font('Helvetica-Bold')
           .text(`[CONFERENCIA DE CNPJ] DESTINADO A: ${destNomeFmt} (${destCnpjFmt})`, 45, destY + 6, { width: 505, ellipsis: true });

        // ==========================================
        // 3. QUADRO DE INFORMAÇÕES DA NOTA E FORNECEDOR
        // ==========================================
        const boxY = 90;
        doc.rect(35, boxY, 525, 42).fillAndStroke(lightBg, borderColor);

        doc.fillColor(textMuted).fontSize(7.5).font('Helvetica-Bold').text('NUMERO DA NOTA', 45, boxY + 6);
        doc.fillColor(primaryColor).fontSize(12).font('Helvetica-Bold').text(resultado.numeroNota || '---', 45, boxY + 18);

        doc.fillColor(textMuted).fontSize(7.5).font('Helvetica-Bold').text('FORNECEDOR (RAZAO SOCIAL / CNPJ)', 150, boxY + 6);
        const cnpjFmt = resultado.fornecedorCnpj ? ` • CNPJ: ${resultado.fornecedorCnpj}` : '';
        doc.fillColor(primaryColor).fontSize(9.5).font('Helvetica-Bold')
           .text(`${resultado.fornecedorNome}${cnpjFmt}`, 150, boxY + 18, { width: 395, ellipsis: true });

        // ==========================================
        // 4. QUADRO DE ENQUADRAMENTO TRIBUTÁRIO (SIMPLES NACIONAL / REGIME TRIBUTÁRIO)
        // ==========================================
        const simpY = boxY + 48;
        const ehSimples = resultado.optanteSimples;
        const simpBg = ehSimples ? '#fffbeb' : '#eff6ff';
        const simpBorder = ehSimples ? '#fde68a' : '#bfdbfe';
        const simpTextColor = ehSimples ? '#92400e' : '#1e40af';
        const simpSubColor = ehSimples ? '#b45309' : '#1d4ed8';

        doc.rect(35, simpY, 525, 34).fillAndStroke(simpBg, simpBorder);

        doc.fillColor(simpTextColor).fontSize(8.5).font('Helvetica-Bold')
           .text(ehSimples 
              ? 'SITUACAO TRIBUTARIA: OPTANTE PELO SIMPLES NACIONAL (MEI / EPP)' 
              : 'SITUACAO TRIBUTARIA: REGIME NORMAL (NAO OPTANTE PELO SIMPLES NACIONAL)', 45, simpY + 6);

        doc.fillColor(simpSubColor).fontSize(7.5).font('Helvetica')
           .text(ehSimples
              ? 'Enquadramento: Art. 4º, Inciso XI da IN RFB nº 1.234/2012 (Dispensa de Retencao de Tributos Federais).'
              : 'Enquadramento: Sujeito a Retencao Ampla de IR, CSLL, COFINS e PIS/PASEP conforme IN RFB nº 1.234/2012.', 45, simpY + 18);

        doc.fillColor(simpTextColor).fontSize(7.5).font('Helvetica-Bold')
           .text(`SITUACAO CADASTRAL: ${resultado.situacaoCadastral || 'ATIVA'}`, 390, simpY + 6, { width: 160, align: 'right' });

        // ==========================================
        // 5. DETALHAMENTO DOS ITENS COM DESTAQUE REINF E DARF
        // ==========================================
        let currentY = simpY + 40;

        resultado.itens.forEach((item) => {
          doc.rect(35, currentY, 525, 100).fillAndStroke('#ffffff', borderColor);

          // Topo do Item
          doc.fillColor(accentColor).fontSize(8).font('Helvetica-Bold')
             .text(resultado.tipoDocumento === 'NFE' ? 'CRITERIO NCM & CST' : 'CODIGO DO SERVICO', 45, currentY + 6);

          doc.fillColor(textMuted).fontSize(7.5).font('Helvetica-Bold')
             .text('VALOR BRUTO DO ITEM', 420, currentY + 6, { width: 130, align: 'right' });

          doc.fillColor(primaryColor).fontSize(9.5).font('Helvetica-Bold')
             .text(resultado.tipoDocumento === 'NFE' ? `NCM: ${item.ncm || 'Geral'} ${item.cst ? `• CST: ${item.cst}` : ''}` : `Cod. Servico: ${item.codigoServico || '6190'}`, 45, currentY + 17);

          doc.fillColor(primaryColor).fontSize(10.5).font('Helvetica-Bold')
             .text(formatBRL(item.valorBruto), 420, currentY + 17, { width: 130, align: 'right' });

          // Condição Aplicável
          doc.rect(45, currentY + 30, 505, 16).fillAndStroke(lightBg, borderColor);
          doc.fillColor(primaryColor).fontSize(7.5).font('Helvetica-Bold')
             .text(`Condicao aplicavel: ${item.condicaoAplicavel}`, 52, currentY + 34);

          // DESTAQUE DA NATUREZA EFD-REINF R-4020 E CÓDIGO DARF
          const reinfY = currentY + 50;
          doc.rect(45, reinfY, 505, 30).fillAndStroke('#f0f9ff', '#bae6fd');

          // Coluna 1: Reinf
          doc.fillColor('#0369a1').fontSize(7).font('Helvetica-Bold').text('NATUREZA DE RENDIMENTO (EFD-REINF R-4020):', 53, reinfY + 5);
          doc.fillColor('#0c4a6e').fontSize(11).font('Helvetica-Bold').text(item.naturezaRendimentoReinf || '17006', 53, reinfY + 15);

          // Coluna 2: Código DARF
          doc.fillColor('#0369a1').fontSize(7).font('Helvetica-Bold').text('CODIGO DA RECEITA DARF (RFB):', 300, reinfY + 5);
          doc.fillColor('#0c4a6e').fontSize(11).font('Helvetica-Bold').text(item.codigoReceitaDarf || '6190', 300, reinfY + 15);

          // Fundamentação Legal
          doc.fillColor(textMuted).fontSize(7).font('Helvetica')
             .text(`Fundamentacao Legal: ${item.fundamentacaoLegal}`, 45, currentY + 85, { width: 505, ellipsis: true });

          currentY += 108;
        });

        // ==========================================
        // 6. MEMÓRIA DE DEDUÇÕES DA BASE DE CÁLCULO
        // ==========================================
        const temDeducaoMateriais = Boolean(resultado.totalMateriaisInssDeducao && resultado.totalMateriaisInssDeducao > 0);
        const temReducaoIss = Boolean(resultado.percentualReducaoIssAplicado && resultado.percentualReducaoIssAplicado > 0);

        if (temDeducaoMateriais || temReducaoIss) {
          doc.rect(35, currentY, 525, 36).fillAndStroke('#fffbeb', '#fde68a');
          doc.fillColor('#92400e').fontSize(8).font('Helvetica-Bold')
             .text('MEMORIA DE DEDUCOES DA BASE DE CALCULO (MATERIAIS E EQUIPAMENTOS):', 45, currentY + 5);

          let txtDeducao = `Valor Bruto Total: ${formatBRL(resultado.totalBruto)}`;
          if (temDeducaoMateriais) {
            txtDeducao += `  |  (-) Materiais Abatidos (IN 2.110/2022): ${formatBRL(resultado.totalMateriaisInssDeducao || 0)}`;
            txtDeducao += `  |  (=) Base INSS (11%): ${formatBRL(resultado.baseCalculoInssTotal || resultado.totalBruto)}`;
          }
          if (temReducaoIss) {
            txtDeducao += `  |  Base ISSQN Reduzida (${resultado.percentualReducaoIssAplicado}%): ${formatBRL(resultado.baseCalculoIssTotal || resultado.totalBruto)}`;
          }

          doc.fillColor('#78350f').fontSize(7.5).font('Helvetica')
             .text(txtDeducao, 45, currentY + 18, { width: 505 });

          currentY += 42;
        } else {
          currentY += 4;
        }

        // ==========================================
        // 7. CONSOLIDADO DO LOTE E MEMÓRIA DE CÁLCULO
        // ==========================================
        doc.fillColor(primaryColor).fontSize(11).font('Helvetica-Bold').text('CONSOLIDADO DO LOTE E MEMORIA DE CALCULO DAS RETENCOES', 35, currentY);
        currentY += 16;

        // Caixa de Total Retido
        doc.rect(35, currentY, 525, 36).fillAndStroke('#eff6ff', '#bfdbfe');
        doc.fillColor(textMuted).fontSize(7.5).font('Helvetica-Bold').text('TOTAL A RETER (FEDERAIS + INSS + ISS + CONTA VINCULADA)', 45, currentY + 6);
        doc.fillColor('#1e40af').fontSize(14).font('Helvetica-Bold').text(formatBRL(resultado.totalRetidoGeral), 45, currentY + 17);
        doc.fillColor(textMuted).fontSize(7.5).font('Helvetica').text(`sobre o valor bruto de ${formatBRL(resultado.totalBruto)}`, 180, currentY + 21);

        currentY += 42;

        // Tabela Detalhada por Tributo
        const rows = [
          { nome: 'IR (Imposto de Renda)', aliq: resultado.itens[0]?.aliqIr || 0, valor: resultado.totalIr, legal: 'IN RFB nº 1.234/2012' },
          { nome: 'CSLL (Contribuição Social sobre o Lucro Líquido)', aliq: resultado.itens[0]?.aliqCsll || 0, valor: resultado.totalCsll, legal: 'IN RFB nº 1.234/2012' },
          { nome: 'COFINS (Contribuição para o Financiamento da Seguridade)', aliq: resultado.itens[0]?.aliqCofins || 0, valor: resultado.totalCofins, legal: 'IN RFB nº 1.234/2012' },
          { nome: 'PIS/PASEP (Programa de Integração Social)', aliq: resultado.itens[0]?.aliqPis || 0, valor: resultado.totalPis, legal: 'IN RFB nº 1.234/2012' },
          { 
            nome: temDeducaoMateriais 
              ? `INSS — Retenção Previdenciária (BC: ${formatBRL(resultado.baseCalculoInssTotal || resultado.totalBruto)})` 
              : 'INSS — Retenção Previdenciária', 
            aliq: resultado.itens[0]?.aliqInss || 11, 
            valor: resultado.totalInss, 
            legal: temDeducaoMateriais ? 'Art. 120 e 121 da IN RFB nº 2.110/2022' : 'IN RFB nº 2.110/2022' 
          },
          { 
            nome: temReducaoIss 
              ? `ISSQN — Imposto Sobre Serviços (Vitória/ES - Redução ${resultado.percentualReducaoIssAplicado}%)` 
              : 'ISSQN — Imposto Sobre Serviços (Vitória/ES)', 
            aliq: resultado.itens[0]?.aliqIss || 5, 
            valor: resultado.totalIss, 
            legal: 'Lei Municipal nº 6.075/2003 c/c LC nº 116/2003' 
          }
        ];

        if (resultado.totalContaVinculada && resultado.totalContaVinculada > 0) {
          rows.push({
            nome: 'RETENÇÃO PARA CONTA VINCULADA (Provisões Trabalhistas)',
            aliq: 0,
            valor: resultado.totalContaVinculada,
            legal: 'IN SEGES/ME nº 5/2017 (Conta-Depósito Vinculada)'
          });
        }

        rows.forEach((r, rIdx) => {
          const rowBg = rIdx % 2 === 0 ? lightBg : '#ffffff';
          doc.rect(35, currentY, 525, 17).fillAndStroke(rowBg, borderColor);

          doc.fillColor(primaryColor).fontSize(8).font('Helvetica-Bold').text(r.nome, 45, currentY + 4, { width: 270, ellipsis: true });
          doc.fillColor(textMuted).fontSize(7.5).font('Helvetica').text(r.aliq > 0 ? `(${r.aliq.toFixed(2)}%)` : '---', 320, currentY + 4);
          doc.fillColor(primaryColor).fontSize(8.5).font('Helvetica-Bold').text(formatBRL(r.valor), 420, currentY + 3, { width: 130, align: 'right' });

          currentY += 17;
        });

        // Linha de Valor Líquido Final
        currentY += 4;
        doc.rect(35, currentY, 525, 22).fillAndStroke('#f0fdf4', '#86efac');
        doc.fillColor('#166534').fontSize(9).font('Helvetica-Bold').text('VALOR LÍQUIDO A PAGAR AO FORNECEDOR', 45, currentY + 6);
        doc.fillColor('#166534').fontSize(11).font('Helvetica-Bold').text(formatBRL(resultado.valorLiquido), 420, currentY + 5, { width: 130, align: 'right' });

        // Rodapé de Auditoria SEI
        currentY += 26;
        doc.rect(35, currentY, 525, 24).fillAndStroke(lightBg, borderColor);
        doc.fillColor(textMuted).fontSize(6.5).font('Helvetica')
           .text(`AUDITORIA DOCUMENTAL & CONFERENCIA FISCAL: Documento gerado automaticamente para instrucao de processo de pagamento no SEI. Em conformidade com a IN RFB nº 1.234/2012, IN RFB nº 2.110/2022 e Codigo Tributario de Vitoria/ES (Lei nº 6.075/2003).`, 42, currentY + 4, { width: 511 });

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}
