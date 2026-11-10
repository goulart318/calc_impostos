import PDFDocument from 'pdfkit';
import type { JobHistorico } from './raufIntegrationService';

/** Pendências que o usuário precisa corrigir (a fila de reenvio não entra: é transitória). */
const MOTIVOS_USUARIO: Record<string, { rotulo: string; acao: string }> = {
  SEM_PROCESSO: { rotulo: 'Sem nº de processo SEI completo', acao: 'Informar o processo SEI (NNNNN.NNNNNN/AAAA-DD)' },
  SEM_NS: { rotulo: 'Sem NS da liquidação', acao: 'Lançar a NS da liquidação (AAAANSXXXXXX)' },
  CNPJ_INVALIDO: { rotulo: 'CNPJ do fornecedor inválido', acao: 'Corrigir o CNPJ do fornecedor na análise' },
  SEM_CHAVE: { rotulo: 'Órgão sem chave de integração', acao: 'Cadastrar a chave do Rauf na aba Integração' },
  RECUSADO: { rotulo: 'Recusada pelo Rauf', acao: 'Ver a mensagem de erro e corrigir os dados' }
};

export function linhasPendencias(job: JobHistorico) {
  return job.problemas
    .filter(p => MOTIVOS_USUARIO[p.motivo])
    .map(p => ({
      notaFiscal: p.notaFiscal,
      fornecedor: p.fornecedor,
      processo: p.processo || '',
      ns: p.documentoHabil || '',
      pendencia: MOTIVOS_USUARIO[p.motivo].rotulo,
      acao: MOTIVOS_USUARIO[p.motivo].acao
    }))
    .sort((a, b) => a.processo.localeCompare(b.processo) || String(a.notaFiscal).localeCompare(String(b.notaFiscal), 'pt-BR', { numeric: true }));
}

export function gerarCsvPendencias(job: JobHistorico): Buffer {
  const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const cab = ['Nota Fiscal', 'Fornecedor', 'Processo SEI', 'NS da liquidação', 'Pendência', 'O que fazer'];
  const linhas = linhasPendencias(job).map(l => [l.notaFiscal, l.fornecedor, l.processo, l.ns, l.pendencia, l.acao].map(esc).join(';'));
  // BOM UTF-8 + separador ';' para o Excel brasileiro abrir com acentos e colunas corretas
  return Buffer.from('﻿' + [cab.map(esc).join(';'), ...linhas].join('\r\n'), 'utf8');
}

export function gerarPdfPendencias(job: JobHistorico, orgao: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const linhas = linhasPendencias(job);
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 28 });
      const buffers: Buffer[] = [];
      doc.on('data', (c: Buffer) => buffers.push(c));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      const colunas = [
        { t: 'NF', w: 60 }, { t: 'Fornecedor', w: 220 }, { t: 'Processo SEI', w: 110 },
        { t: 'NS', w: 90 }, { t: 'Pendência', w: 150 }, { t: 'O que fazer', w: 190 }
      ];
      const cabecalho = () => {
        let x = doc.page.margins.left;
        const y = doc.y;
        doc.font('Helvetica-Bold').fontSize(8);
        colunas.forEach(c => { doc.text(c.t, x, y, { width: c.w - 4 }); x += c.w; });
        doc.moveTo(doc.page.margins.left, y + 12).lineTo(doc.page.width - doc.page.margins.right, y + 12).stroke();
        doc.y = y + 16;
      };

      doc.font('Helvetica-Bold').fontSize(14).text('Notas com pendência para lançamento', { align: 'left' });
      doc.font('Helvetica').fontSize(9).fillColor('#444')
        .text(`${orgao} · gerado em ${new Date().toLocaleString('pt-BR')} · ${linhas.length} nota(s)`).fillColor('#000');
      doc.moveDown(0.6);
      cabecalho();

      doc.font('Helvetica').fontSize(8);
      for (const l of linhas) {
        if (doc.y > doc.page.height - doc.page.margins.bottom - 24) {
          doc.addPage();
          cabecalho();
          doc.font('Helvetica').fontSize(8);
        }
        const y = doc.y;
        let x = doc.page.margins.left;
        const vals = [l.notaFiscal, l.fornecedor, l.processo || '—', l.ns || '—', l.pendencia, l.acao];
        let alturaMax = 0;
        vals.forEach((v, i) => {
          doc.text(String(v), x, y, { width: colunas[i].w - 4 });
          alturaMax = Math.max(alturaMax, doc.y - y);
          x += colunas[i].w;
        });
        doc.y = y + alturaMax + 3;
      }
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}
