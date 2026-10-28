import zlib from 'zlib';
import pdfParse from 'pdf-parse';
import { NotaFiscalExtraida } from './nfeParser';
import { ChaveAcessoValidator } from './chaveAcessoValidator';
import { ItemAnaliseInput } from './taxEngine';

export class PdfParser {
  private static extrairTextoManualFlateDecode(pdfBuffer: Buffer): string {
    let fullText = '';
    let pos = 0;
    while ((pos = pdfBuffer.indexOf('stream', pos)) !== -1) {
      let streamStart = pos + 6;
      if (pdfBuffer[streamStart] === 0x0d && pdfBuffer[streamStart + 1] === 0x0a) {
        streamStart += 2;
      } else if (pdfBuffer[streamStart] === 0x0a) {
        streamStart += 1;
      }
      const streamEnd = pdfBuffer.indexOf('endstream', streamStart);
      if (streamEnd === -1) break;

      const streamChunk = pdfBuffer.subarray(streamStart, streamEnd);
      try {
        const decompressed = zlib.inflateSync(streamChunk);
        const str = decompressed.toString('latin1');
        const matches: string[] = [];
        const regex = /\((.*?)\)\s*Tj/g;
        let m;
        while ((m = regex.exec(str)) !== null) {
          matches.push(m[1]);
        }
        if (matches.length > 0) {
          fullText += matches.join('\n') + '\n';
        }
      } catch (e) {
      }
      pos = streamEnd + 9;
    }
    return fullText;
  }

  private static ehNcmValido(candidato: string): boolean {
    const limpo = candidato.replace(/\D/g, '');
    if (limpo.length !== 8) return false;

    const cap = parseInt(limpo.substring(0, 2), 10);
    if (isNaN(cap) || cap < 1 || cap > 97) return false;

    if (limpo.startsWith('202') || limpo.startsWith('201') || limpo.startsWith('199')) return false;

    if (limpo.startsWith('135') || limpo.startsWith('232') || limpo.startsWith('335') || 
        limpo.startsWith('3526') || limpo.startsWith('3226') || limpo.startsWith('1512')) {
      return false;
    }

    if (limpo.startsWith('15126437')) return false;
    if (/^(\d)\1{7}$/.test(limpo)) return false;

    return true;
  }

  private static extrairCnpjLimpo(texto: string): string {
    const match = texto.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
    return match ? match[0] : '';
  }

  private static formatarNomeEmpresa(raw: string): string {
    if (!raw) return '';
    return raw
      .replace(/Nome\s*\/\s*NomeEmpresarial/gi, '')
      .replace(/Nome\s*\/\s*Nome Empresarial/gi, '')
      .replace(/Razão\s*Social/gi, '')
      .replace(/CNPJ\s*\/\s*CPF\s*\/\s*NIF/gi, '')
      .replace(/IndicadorMunicipal/gi, '')
      .trim();
  }

  private static parseValoresItemDanfe(restoLinha: string | undefined, valorTotalNota?: number): { quantidade: number; valorUnitario: number; valorTotal: number } {
    let valorUnitario = 0;
    let valorTotal = 0;
    let qtd = 1;

    if (!restoLinha) return { quantidade: qtd, valorUnitario, valorTotal };
    let limpo = restoLinha.trim();

    // Se inicia com quantidade inteira ou decimal seguida de espaço: ex: "3 330,00990,00" ou "1 1.800,001.800,00"
    const mQtdEspaco = limpo.match(/^(\d+(?:[\.,]\d+)?)\s+(.*)$/);
    if (mQtdEspaco) {
      qtd = parseFloat(mQtdEspaco[1].replace(/\./g, '').replace(',', '.')) || 1;
      limpo = mQtdEspaco[2].trim();
    }

    // 1. Caso 4 decimais (ou 2 a 4 decimais) colados: 3.000,00000,66001.980,00 ou 1,004.300,00004.300,00
    const mColados4Dec = limpo.match(/^([0-9]{1,3}(?:\.[0-9]{3})*,\d{2,4})\s*([0-9]{1,3}(?:\.[0-9]{3})*,\d{3,4})\s*([0-9]{1,3}(?:\.[0-9]{3})*,\d{2})/);
    if (mColados4Dec) {
      qtd = parseFloat(mColados4Dec[1].replace(/\./g, '').replace(',', '.'));
      valorUnitario = parseFloat(mColados4Dec[2].replace(/\./g, '').replace(',', '.'));
      valorTotal = parseFloat(mColados4Dec[3].replace(/\./g, '').replace(',', '.'));
      return { quantidade: qtd, valorUnitario, valorTotal };
    }

    // 2. Caso 2 decimais colados: 330,00990,00 ou 1.800,001.800,00
    const mColados2Dec = limpo.match(/^([0-9]{1,3}(?:\.[0-9]{3})*,\d{2})([0-9]{1,3}(?:\.[0-9]{3})*,\d{2})/);
    if (mColados2Dec) {
      valorUnitario = parseFloat(mColados2Dec[1].replace(/\./g, '').replace(',', '.'));
      valorTotal = parseFloat(mColados2Dec[2].replace(/\./g, '').replace(',', '.'));
      return { quantidade: qtd, valorUnitario, valorTotal };
    }

    // 3. Tokens separados por espaço
    const tokens = limpo.split(/\s+/).map(t => {
      const v = parseFloat(t.replace(/\./g, '').replace(',', '.'));
      return isNaN(v) ? null : v;
    }).filter((v): v is number => v !== null && v > 0);

    if (tokens.length >= 2) {
      valorUnitario = tokens[0];
      valorTotal = tokens[1];
      return { quantidade: qtd, valorUnitario, valorTotal };
    } else if (tokens.length === 1) {
      valorTotal = tokens[0];
      valorUnitario = valorTotal / qtd;
      return { quantidade: qtd, valorUnitario, valorTotal };
    }

    // 4. Se não achou e o valor total da nota estiver presente na string:
    if (valorTotalNota && valorTotalNota > 0) {
      const vNotaFormatado = valorTotalNota.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      if (limpo.includes(vNotaFormatado)) {
        valorTotal = valorTotalNota;
        if (qtd > 0) valorUnitario = valorTotal / qtd;
      }
    }

    return { quantidade: qtd, valorUnitario, valorTotal };
  }

  private static extrairDescricaoItemDanfe(trechoTextoAntes: string): string {
    const linhas = trechoTextoAntes.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
    const descrPartes: string[] = [];

    for (let i = linhas.length - 1; i >= 0; i--) {
      const l = linhas[i];
      const up = l.toUpperCase();

      if (
        up.startsWith('VALOR APROXIMADO') ||
        /^R\$\s*[\d\.,]+$/i.test(l) ||
        up.startsWith('PRODUTO:') ||
        up.startsWith('VALID:') ||
        up.startsWith('ANVISA:') ||
        up.startsWith('REG.ANVISA') ||
        up.startsWith('LOTE') ||
        up.includes('LOTE:') ||
        up.includes('N LT:') ||
        up.includes('FAB:') ||
        up.includes('VAL:') ||
        up.includes('DT VAL:') ||
        up.includes('DT. VAL') ||
        up.includes('DT. FABRIC') ||
        up.includes('AL. PROD') ||
        up.includes('PFCP') ||
        up.includes('VFCP') ||
        up.includes('PICMS') ||
        up.includes('VICMS') ||
        up.includes('Nº DE SERIE') ||
        up.startsWith('SERIE:') ||
        up.startsWith('S/N:') ||
        up.startsWith('CÓD.') ||
        up.startsWith('COD.') ||
        up.startsWith('DADOS') ||
        up.startsWith('FOLHA') ||
        up.startsWith('Nº 00') ||
        up.startsWith('N. 0') ||
        up.startsWith('SÉRIE') ||
        up.startsWith('DANFE') ||
        up.startsWith('NATUREZA DA OPERAÇÃO') ||
        up.startsWith('PROTOCOLO') ||
        up.startsWith('INSCRIÇÃO') ||
        up.startsWith('INSC.') ||
        up.startsWith('CNPJ') ||
        up.startsWith('CHAVE') ||
        up.startsWith('CONSULTA') ||
        up.startsWith('WWW.') ||
        up.startsWith('BASE CÁLCULO') ||
        up.startsWith('VALOR TOTAL') ||
        up.startsWith('VALOR DO') ||
        up.startsWith('QUANTIDADE') ||
        up.startsWith('FRETE') ||
        up.startsWith('RAZÃO SOCIAL') ||
        up.startsWith('ENDEREÇO') ||
        up.startsWith('MUNICÍPIO') ||
        up.startsWith('UF') ||
        up.startsWith('VALOR') ||
        up.startsWith('UNIT') ||
        up.startsWith('TOTAL') ||
        up.startsWith('DESC') ||
        up.startsWith('B.CÁLC') ||
        up.startsWith('ICMS') ||
        up.startsWith('IPI') ||
        up.startsWith('ALÍQ') ||
        up.startsWith('ENTO ICMS') ||
        up.startsWith('ORROG.ATE') ||
        up.startsWith('ONV ') ||
        up.includes('CÓDIGO PRODUTO') ||
        up.includes('DESCRIÇÃO DO PRODUTO') ||
        /^(?:\.\s*){4,}$/.test(l) ||
        /^\d{1,4}$/.test(l) ||
        /^\d+,\d{2,4}\d+,\d{2,4}/.test(l) ||
        /^[A-Z0-9_\-]{8,25}$/.test(l)
      ) {
        if (descrPartes.length > 0) {
          break;
        }
        continue;
      }

      const regexPrefixoCodigo = /^(?:\d{5,20}\s*|[\d\-_]{4,25}|[A-Z]{2,5}\d{1,10}(?:-\d{1,10})*\s*|[A-Z]{2,5}(?:-\d{1,10})+\s*|[A-Z]{2,4}\.[A-Z0-9\.]{2,12}\s*)(?=[A-Za-z"\(])/;
      const tinhaCodigoColado = regexPrefixoCodigo.test(l);
      const limpa = l
        .replace(regexPrefixoCodigo, '')
        .replace(/^"+/, '')
        .trim();
      const textoFinalLinha = limpa || l;
      if (!descrPartes.includes(textoFinalLinha)) {
        descrPartes.unshift(textoFinalLinha);
      }
      if (tinhaCodigoColado || descrPartes.length >= 2) break;
    }

    return descrPartes.join(' ').trim();
  }

  public static async extrairPaginasTexto(pdfBuffer: Buffer): Promise<string[]> {
    const pageTexts: string[] = [];
    const render_page = (pageData: any) => {
      return pageData.getTextContent().then((textContent: any) => {
        let lastY: any, text = '';
        for (const item of textContent.items) {
          if (lastY === item.transform[5] || !lastY) {
            text += item.str;
          } else {
            text += '\n' + item.str;
          }
          lastY = item.transform[5];
        }
        pageTexts.push(text);
        return text;
      });
    };

    try {
      const parseFn = typeof pdfParse === 'function' ? pdfParse : (pdfParse as any).default || pdfParse;
      await parseFn(pdfBuffer, { pagerender: render_page });
    } catch (e: any) {
      console.warn('pdfParse orientado a páginas falhou, tentando fallback padrão:', e?.message);
    }

    if (pageTexts.length === 0) {
      const fallback = this.extrairTextoManualFlateDecode(pdfBuffer);
      if (fallback) {
        pageTexts.push(fallback);
      }
    }

    return pageTexts;
  }

  public static extrairChaveAcesso(text: string): string {
    const regexChaveDanfe44 = /\b(\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4})\b/;
    const matchDanfe44 = text.match(regexChaveDanfe44);
    if (matchDanfe44) {
      return matchDanfe44[1].replace(/\s/g, '');
    }
    const chaveMatch = text.match(/\b\d{50}\b/) || text.match(/\b\d{44}\b/) ||
      text.match(/(?:CHAVE\s*DE\s*ACESSO[^\d]*)([\d\s-]{44,60})/i);
    if (chaveMatch) {
      const candidata = (chaveMatch[1] || chaveMatch[0]).replace(/[\s-]/g, '');
      if (candidata.length >= 44 && candidata.length <= 50) return candidata;
    }
    return '';
  }

  public static extrairNumeroNotaDocumento(text: string, chaveAcesso?: string): string {
    let numeroNota = '';
    const chave = chaveAcesso || this.extrairChaveAcesso(text);
    if (chave && chave.length === 50) {
      const rawNum = chave.substring(23, 36);
      const mYear = rawNum.match(/^(20\d{2})0*([1-9]\d*)$/);
      if (mYear) numeroNota = mYear[2];
      else {
        const semZeros = rawNum.replace(/^0+/, '');
        if (semZeros) numeroNota = semZeros;
      }
    }
    if (!numeroNota && chave && chave.length === 44) {
      const numChave = chave.substring(25, 34).replace(/^0+/, '');
      if (numChave && numChave !== '0') numeroNota = numChave;
    }
    if (!numeroNota) {
      const matchNumeroNfseDireto = text.match(/(?:N[úu]mero\s*da\s*NFS-e|NÚMERODANFS-e|NÚMERO DA NFS-e|N[ºo\.]\s*NFS-e)[^\d]*0*([1-9]\d{0,10})/i);
      if (matchNumeroNfseDireto && matchNumeroNfseDireto[1]) {
        let n = matchNumeroNfseDireto[1].replace(/\./g, '');
        const mYear = n.match(/^(20\d{2})0*([1-9]\d*)$/);
        if (mYear) n = mYear[2];
        numeroNota = n;
      }
    }
    if (!numeroNota) {
      const padroes = [
        /N[úu]mero\s*da\s*Nota\s*Fiscal[^\d]*0*([1-9]\d{0,10})/i,
        /N[ºo\.]\s*0*([0-9]{1,3}(?:\.[0-9]{3})+)/i,
        /N[ºo]\.?\s*0*([1-9]\d{2,8})\b/i,
        /(?:N[úu]mero da Nota|N[úu]mero|NF-e|NFS-e)\s*[:\.]?\s*0*([1-9]\d{0,8})\b/i
      ];
      for (const p of padroes) {
        const m = text.match(p);
        if (m && m[1]) {
          numeroNota = m[1].replace(/\./g, '');
          break;
        }
      }
    }
    return numeroNota;
  }

  public static agruparPaginasPorDocumentoFiscal(paginas: string[]): Array<{ texto: string; paginasIndices: number[] }> {
    if (paginas.length <= 1) {
      return [{ texto: paginas[0] || '', paginasIndices: [1] }];
    }

    const docs: Array<{ texto: string; paginasIndices: number[] }> = [];
    let docAtualTexto = paginas[0];
    let docAtualIndices = [1];
    let chaveAtual = this.extrairChaveAcesso(paginas[0]);
    let numAtual = this.extrairNumeroNotaDocumento(paginas[0], chaveAtual);

    for (let i = 1; i < paginas.length; i++) {
      const pag = paginas[i];
      const chavePag = this.extrairChaveAcesso(pag);
      const numPag = this.extrairNumeroNotaDocumento(pag, chavePag);

      // Critério 1: Chaves de acesso identificadas e distintas -> NOVA NOTA
      const temChavesDistintas = Boolean(chavePag && chaveAtual && chavePag !== chaveAtual);

      // Critério 2: Números de nota identificados e distintos
      const temNumsDistintos = Boolean(numPag && numAtual && numPag !== numAtual);

      // Critério 3: Cabeçalho claro de nova nota
      const temCabecalhoInicio = /(?:DANFESe\s+v\d|DOCUMENTO AUXILIAR DA NOTA FISCAL|DANFE|PREFEITURA MUNICIPAL|NOTA FISCAL DE SERVIÇOS ELETRÔNICA)/i.test(pag.substring(0, 400));
      const ehFolha1 = /FOLHA\s*1\s*\/\s*1|FOLHA\s*0?1\s*\/\s*0?[1-9]/i.test(pag);
      const ehContinuaFolhaSubsequente = /FOLHA\s*[2-9]\s*\/\s*\d/i.test(pag);

      const ehNovoDocumento = temChavesDistintas || 
                             (temNumsDistintos && temCabecalhoInicio) || 
                             (temCabecalhoInicio && !ehContinuaFolhaSubsequente && (ehFolha1 || (chavePag && chavePag !== chaveAtual)));

      if (ehNovoDocumento) {
        docs.push({ texto: docAtualTexto, paginasIndices: [...docAtualIndices] });
        docAtualTexto = pag;
        docAtualIndices = [i + 1];
        chaveAtual = chavePag || this.extrairChaveAcesso(pag);
        numAtual = numPag || this.extrairNumeroNotaDocumento(pag, chaveAtual);
      } else {
        docAtualTexto += '\n\n' + pag;
        docAtualIndices.push(i + 1);
        if (!chaveAtual && chavePag) chaveAtual = chavePag;
        if (!numAtual && numPag) numAtual = numPag;
      }
    }

    docs.push({ texto: docAtualTexto, paginasIndices: [...docAtualIndices] });
    return docs;
  }

  public static parseTexto(text: string): NotaFiscalExtraida & {
    destaqueIr?: number;
    destaqueInss?: number;
    destaqueSocial?: number;
    destaqueIss?: number;
    bcIssqnNfse?: number;
    percentualReducaoIssNfse?: number;
    issqnRetidoTomador?: boolean;
    codigoServicoNfse?: string;
    localPrestacaoServico?: string;
    aliqIssNfseDestaque?: number;
    numeroPaginaOrigem?: number;
    totalPaginasDocumento?: number;
    totalNotasNoPdf?: number;
  } {
    // 1. TIPO DE DOCUMENTO (NF-e vs NFS-e)
    const upperText = text.toUpperCase();
    const temMarcadorReformaNfse = upperText.includes('TRIBUTAÇÃO IBS / CBS') || 
                                   upperText.includes('IMPOSTO E CONTRIBUIÇÃO SOBRE BENS E SERVIÇOS') ||
                                   upperText.includes('DADOS DO SERVIÇO PRESTADO') ||
                                   upperText.includes('CÓD. TRIB. NACIONAL') ||
                                   upperText.includes('CÓDIGO DE TRIBUTAÇÃO NACIONAL') ||
                                   upperText.includes('VALOR TOTAL DA NFS-E');

    const temMarcadorDanfeNfe = !temMarcadorReformaNfse && upperText.includes('DANFE') && 
                                (upperText.includes('DOCUMENTO AUXILIAR DA NOTA FISCAL ELETRÔNICA') || 
                                 upperText.includes('DOCUMENTO AUXILIAR DA') || 
                                 upperText.includes('CHAVE DE ACESSO'));

    const ehServico = temMarcadorReformaNfse || (!temMarcadorDanfeNfe && (
      upperText.includes('NFS-E') || 
      upperText.includes('DANFSE') ||
      upperText.includes('NOTA FISCAL DE SERVIÇOS') || 
      upperText.includes('NOTA FISCAL DE SERVIÇO ELETRÔNICA') ||
      upperText.includes('IMPOSTO SOBRE SERVIÇOS DE QUALQUER NATUREZA') ||
      upperText.includes('SERVIÇO PRESTADO')
    ));

    // 2. CHAVE DE ACESSO
    let chaveAcesso = '';
    const regexChaveDanfe44 = /\b(\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4})\b/;
    const matchDanfe44 = text.match(regexChaveDanfe44);
    if (matchDanfe44) {
      chaveAcesso = matchDanfe44[1].replace(/\s/g, '');
    } else {
      const match50 = text.match(/\b\d{50}\b/);
      if (match50) {
        chaveAcesso = match50[0];
      } else {
        const chaveMatch = text.match(/(?:CHAVE\s*DE\s*ACESSO[^\d]*)([\d\s-]{44,60})/i) ||
                           text.match(/(?:CHAVE\s*DE\s*ACESSO[^\d]*)?(\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}|\d{44,50})/i);
        if (chaveMatch) {
          const candidata = (chaveMatch[1] || chaveMatch[0]).replace(/[\s-]/g, '');
          if (candidata.length >= 44 && candidata.length <= 50) chaveAcesso = candidata;
        }
      }
    }

    // 3. NÚMERO DA NOTA FISCAL
    let numeroNota = '';
    
    // Se temos a Chave de Acesso de NFS-e padrão nacional (50 dígitos), extrai o número diretamente da chave
    // Na chave de 50 dígitos, os dígitos 24 a 36 (13 posições) representam o Número da NFS-e / DPS (frequentemente prefixado pelo ano ex: 2026000026936 -> 26936)
    if (chaveAcesso && chaveAcesso.length === 50) {
      const rawNum = chaveAcesso.substring(23, 36);
      const mYear = rawNum.match(/^(20\d{2})0*([1-9]\d*)$/);
      if (mYear) {
        numeroNota = mYear[2];
      } else {
        const semZeros = rawNum.replace(/^0+/, '');
        if (semZeros) numeroNota = semZeros;
      }
    }

    // Se temos a Chave de Acesso de NF-e modelo 55 (44 dígitos), o número da NF-e está nas posições 26 a 34 (9 dígitos)
    if (!numeroNota && chaveAcesso && chaveAcesso.length === 44) {
      const numChave = chaveAcesso.substring(25, 34).replace(/^0+/, '');
      if (numChave && numChave !== '0') {
        numeroNota = numChave;
      }
    }

    // Para NFS-e quando não houver chave de 50 dígitos, busca o campo específico "Número da NFS-e"
    if (!numeroNota) {
      const matchNumeroNfseDireto = text.match(/(?:N[úu]mero\s*da\s*NFS-e|NÚMERODANFS-e|NÚMERO DA NFS-e|N[ºo\.]\s*NFS-e)[^\d]*0*([1-9]\d{0,10})/i);
      if (matchNumeroNfseDireto && matchNumeroNfseDireto[1]) {
        let n = matchNumeroNfseDireto[1].replace(/\./g, '');
        // Se vier com o ano embutido ex: 2026000026936
        const mYear = n.match(/^(20\d{2})0*([1-9]\d*)$/);
        if (mYear) n = mYear[2];
        numeroNota = n;
      }
    }

    if (!numeroNota) {
      const padroesNumero = [
        /N[úu]mero\s*da\s*Nota\s*Fiscal[^\d]*0*([1-9]\d{0,10})/i,
        /N[ºo\.]\s*0*([0-9]{1,3}(?:\.[0-9]{3})+)/i,
        /N[ºo]\.?\s*0*([1-9]\d{2,8})\b/i,
        /(?:N[úu]mero da Nota|N[úu]mero|NF-e|NFS-e)\s*[:\.]?\s*0*([1-9]\d{0,8})\b/i
      ];
      for (const padrao of padroesNumero) {
        const match = text.match(padrao);
        if (match && match[1]) {
          numeroNota = match[1].replace(/\./g, '');
          break;
        }
      }
    }

    // 4. EXTRAÇÃO ESTRUTURADA DE PRESTADOR VS TOMADOR
    let fornecedorCnpj = '';
    let fornecedorNome = '';
    let destinatarioCnpj = '';
    let destinatarioNome = '';

    if (ehServico) {
      // Reconhece todas as variações de Prestador / Emitente e Tomador (Destinatário)
      const idxPrestador = text.search(/EMITENTE\s*(?:DA\s*NFS-e)?|PRESTADOR\s*(?:DO\s*SERVI[ÇC]O|DE\s*SERVI[ÇC]OS|\/\s*FORNECEDOR)?|IDENTIFICA[ÇC][ÃA]O\s*DO\s*PRESTADOR/i);
      const idxTomador = text.search(/TOMADOR\s*(?:DO\s*SERVI[ÇC]O|DE\s*SERVI[ÇC]OS|\/\s*ADQUIRENTE)?|IDENTIFICA[ÇC][ÃA]O\s*DO\s*TOMADOR/i);

      // Regex de captura de nome empresarial / razão social
      const regexNomeRazao = /(?:Nome\s*\/?\s*Nome\s*Empresarial|Nome\s*\/?\s*Raz[ãa]o\s*Social|Raz[ãa]o\s*Social)\s*[:\n\r]+\s*([^\n\r]{3,120})/i;

      if (idxPrestador !== -1) {
        const fimTrechoPrest = idxTomador !== -1 && idxTomador > idxPrestador ? idxTomador : idxPrestador + 700;
        const trechoPrestador = text.substring(idxPrestador, fimTrechoPrest);

        fornecedorCnpj = this.extrairCnpjLimpo(trechoPrestador);

        const matchNomePrest = trechoPrestador.match(regexNomeRazao);
        if (matchNomePrest && matchNomePrest[1]) {
          fornecedorNome = this.formatarNomeEmpresa(matchNomePrest[1]);
        } else {
          const matchGenericoPrest = trechoPrestador.match(/(COMER[^\n]{4,60}|CETAN[^\n]{4,60}|[A-Z0-9\s\.\-&]{5,60}LTDA|[A-Z0-9\s\.\-&]{5,60}EPP|[A-Z0-9\s\.\-&]{5,60}S\/A)/i);
          if (matchGenericoPrest && matchGenericoPrest[0]) {
            fornecedorNome = this.formatarNomeEmpresa(matchGenericoPrest[0]);
          }
        }
      }

      if (idxTomador !== -1) {
        const fimTrechoTom = idxPrestador !== -1 && idxPrestador > idxTomador ? idxPrestador : idxTomador + 700;
        const trechoTomador = text.substring(idxTomador, fimTrechoTom);

        destinatarioCnpj = this.extrairCnpjLimpo(trechoTomador);

        const matchNomeTom = trechoTomador.match(regexNomeRazao);
        if (matchNomeTom && matchNomeTom[1]) {
          destinatarioNome = this.formatarNomeEmpresa(matchNomeTom[1]);
        } else {
          const matchGenericoTom = trechoTomador.match(/(EMPRESA BRASILEIRA DE SERVICOS HOSPITALARES[^\n]*|EBSERH[^\n]*)/i);
          if (matchGenericoTom && matchGenericoTom[0]) {
            destinatarioNome = this.formatarNomeEmpresa(matchGenericoTom[0]);
          }
        }
      }
    } else {
      // Extração estruturada por blocos da DANFE (Emitente vs Destinatário / Remetente)
      const idxDestSecao = text.search(/DESTINAT[ÁA]RIO\s*\/\s*REMETENTE/i);
      if (idxDestSecao !== -1) {
        const trechoAntesDest = text.substring(0, idxDestSecao);
        const cnpjsAntesDest = trechoAntesDest.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g) || [];
        if (cnpjsAntesDest.length > 0) {
          fornecedorCnpj = cnpjsAntesDest[0];
        }

        const restoAposDest = text.substring(idxDestSecao);
        const idxFimDest = restoAposDest.search(/(?:FATURA|DUPLICATA|C[ÁA]LCULO\s*DO\s*IMPOSTO|TRANSPORTADOR|DADOS\s*DO)/i);
        const trechoDest = idxFimDest !== -1 ? restoAposDest.substring(0, idxFimDest) : restoAposDest.substring(0, 700);

        const cnpjsDest = trechoDest.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g) || [];
        if (cnpjsDest.length > 0) {
          destinatarioCnpj = cnpjsDest[0];
        }

        const matchNomeDestSecao = trechoDest.match(/NOME\s*\/\s*RAZ[ÃA]O\s*SOCIAL\s*[\r\n]+\s*([^\r\n]{4,120})/i);
        if (matchNomeDestSecao && matchNomeDestSecao[1]) {
          const candDest = matchNomeDestSecao[1].trim();
          if (!/^(?:CNPJ|ENDERE|DATA|BAIRRO|MUNIC)/i.test(candDest)) {
            destinatarioNome = this.formatarNomeEmpresa(candDest);
          }
        }
      }
    }

    // CNPJ do emitente conforme impresso no corpo da DANFE (antes de qualquer fallback pela chave de acesso)
    const cnpjEmitenteCorpo = fornecedorCnpj;

    // Fallbacks para DANFEs de NF-e e documentos estruturados
    const cnpjMatches = text.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g) || [];
    const cnpjChaveClean = (chaveAcesso && chaveAcesso.length === 44) ? chaveAcesso.substring(6, 20) : '';

    // Se ainda não identificou o CNPJ do emitente, usa a chave de acesso de 44 dígitos (posições 7 a 20) ou primeiro CNPJ
    if (!fornecedorCnpj) {
      if (cnpjChaveClean.length === 14) {
        fornecedorCnpj = `${cnpjChaveClean.substring(0,2)}.${cnpjChaveClean.substring(2,5)}.${cnpjChaveClean.substring(5,8)}/${cnpjChaveClean.substring(8,12)}-${cnpjChaveClean.substring(12,14)}`;
      } else if (cnpjMatches.length > 0) {
        fornecedorCnpj = cnpjMatches[0];
      }
    }

    // Identificação do Destinatário: qualquer CNPJ do documento que não seja o do fornecedor/emitente
    if (!destinatarioCnpj) {
      const cnpjEmitenteClean = fornecedorCnpj.replace(/\D/g, '');
      for (const cnpjCad of cnpjMatches) {
        const clean = cnpjCad.replace(/\D/g, '');
        if (clean !== cnpjEmitenteClean && (!cnpjChaveClean || clean !== cnpjChaveClean)) {
          destinatarioCnpj = cnpjCad;
          break;
        }
      }
    }

    if (!fornecedorNome) {
      const matchEmitente = text.match(/IDENTIFICA[ÇC][ÃA]O\s*DO\s*EMITENTE\s*[\r\n]+\s*([^\r\n]{4,80})/i);
      if (matchEmitente && matchEmitente[1] && !matchEmitente[1].toUpperCase().includes('DANFE')) {
        fornecedorNome = matchEmitente[1].trim();
      } else {
        const recebemosMatch = text.match(/RECEBEMOS DE\s+([A-Z0-9\s\.\-&]{4,60})\s+OS PRODUTOS/i);
        if (recebemosMatch && recebemosMatch[1]) {
          fornecedorNome = recebemosMatch[1].trim();
        } else {
          const matchTopoDanfe = text.match(/S[EÉ]RIE[:\s]+\d+\s+([A-Z0-9\s\.\-&]{4,70}?)(?=\r?\n\s*(?:Avenida|Av\.|Rua|Al\.|Rodovia|Estrada|Praça|Complemento|CEP|Fone|DANFE))/i);
          if (matchTopoDanfe && matchTopoDanfe[1]) {
            const cand = matchTopoDanfe[1].trim();
            if (cand.length >= 4 && !cand.toUpperCase().includes('DANFE')) {
              fornecedorNome = this.formatarNomeEmpresa(cand);
            }
          }
          if (!fornecedorNome) {
            fornecedorNome = 'Prestador / Fornecedor Identificado no Documento';
          }
        }
      }
    }

    if (!destinatarioNome) {
      // 1) Se identificou o CNPJ do destinatário, busca o nome da empresa nas linhas adjacentes
      if (destinatarioCnpj) {
        const linhasDoc = text.split(/[\r\n]+/);
        const idxLinhaCnpj = linhasDoc.findIndex(l => l.includes(destinatarioCnpj));
        if (idxLinhaCnpj !== -1) {
          for (let k = idxLinhaCnpj - 1; k >= Math.max(0, idxLinhaCnpj - 8); k--) {
            const linhaCand = linhasDoc[k].trim();
            if (
              linhaCand.length >= 5 &&
              !/^\d{5}-?\d{3}$/.test(linhaCand) &&
              !/^\d+$/.test(linhaCand) &&
              !/^\d{10,20}\s*[-–]/.test(linhaCand) &&
              !/^\d{2}\/\d{2}\/\d{4}/.test(linhaCand) &&
              !/^\d{2}:\d{2}(?::\d{2})?$/.test(linhaCand) &&
              !/^(?:NOME|RAZ[ÃA]O|DESTINAT[ÁA]RIO|ENDERE[ÇC]O|CNPJ|MUNIC[ÍI]PIO|DATA|HORA|BAIRRO|CEP|INSCRI|UF|FONE|PROTOCOLO)/i.test(linhaCand)
            ) {
              destinatarioNome = this.formatarNomeEmpresa(linhaCand);
              break;
            }
          }
        }
      }

      // 2) Busca por menção de órgãos conhecidos no documento (ex: recebedor na DANFE)
      if (!destinatarioNome || destinatarioNome.length < 5 || /^[A-Za-zÀ-ÿ\s]+[\/-]\s*[A-Z]{2}$/i.test(destinatarioNome.trim())) {
        const matchEbserh = text.match(/(?:Ebserh[^\n\r]{0,80}|EMPRESA BRASILEIRA DE SERVI[ÇC]OS HOSPITALARES[^\n\r]{0,80}|Hospital Universit[áa]rio[^\n\r]{0,80})/i);
        if (matchEbserh) {
          destinatarioNome = this.formatarNomeEmpresa(matchEbserh[0].trim());
        } else {
          const matchRecebedor = text.match(/IDENTIFICA[ÇC][ÃA]O\s*(?:E\s*ASSINATURA)?\s*DO\s*RECEBEDOR\s*\(([^)]+)\)/i);
          if (matchRecebedor && matchRecebedor[1]) {
            destinatarioNome = this.formatarNomeEmpresa(matchRecebedor[1].trim());
          } else {
            destinatarioNome = 'EMPRESA BRASILEIRA DE SERVICOS HOSPITALARES - EBSERH';
          }
        }
      }
    }

    // 5. VALORES E RETENÇÕES DESTAQUE NA NFS-E
    let valorTotal = 0;
    const padroesValorNota = ehServico ? [
      /(?:VALOR\s*TOTAL\s*DA\s*NFS-E|VALOR\s*DA\s*OPERA[ÇC][ÃA]O\s*\/\s*SERVI[ÇC]O)[\s\S]*?R\$\s*([0-9]{1,3}(?:\.[0-9]{3})*,\d{2})/i,
      /Vl\.?\s*do\s*Servi[çc]o\s*:?\s*R?\$?\s*([\d\.,]+)/i,
      /Valor\s+do\s+Servi[çc]o\s*:?\s*R?\$?\s*([\d\.,]+)/i,
      /VALOR\s*DA\s*OPERA[ÇC][ÃA]O\s*\/\s*SERVI[ÇC]O\s*:?\s*R?\$?\s*([\d\.,]+)/i,
      /VALOR\s+TOTAL\s+DO\s+SERVIÇO\s*:?\s*R?\$?\s*([\d\.,]+)/i,
      /VALOR\s*TOTAL\s*DA\s*NFS-e\s*:?\s*R?\$?\s*([\d\.,]+)/i,
      /VALOR\s*TOTAL\s*DA\s*NOTA\s*[:\.]?\s*R?\$?\s*([0-9]{1,3}(?:\.[0-9]{3})*,\d{2})/i,
      /VALOR\s+L[ÍI]QUIDO[^\d\n]*R?\$?\s*([0-9]{1,3}(?:\.[0-9]{3})*,\d{2})/i,
      /VALOR\s+TOTAL[^\d\n]*R?\$?\s*([0-9]{1,3}(?:\.[0-9]{3})*,\d{2})/i
    ] : [
      // 1. PRIORIDADE MÁXIMA: "V. TOTAL DA NOTA" ou "VALOR TOTAL DA NOTA" ou "VALOR TOTAL DA NF" (DANFE oficial)
      /(?:V\.?\s*TOTAL\s*DA\s*(?:NOTA|NF|NF-E)|VALOR\s*TOTAL\s*DA\s*(?:NOTA|NF|NF-E))\s*[:\.]?\s*[\r\n]*\s*R?\$?\s*([0-9]{1,3}(?:\.[0-9]{3})*,\d{2})/i,
      // 2. Canhoto de recebimento do DANFE: "EMISSÃO: 07/10/2026 VALOR TOTAL: R$ 435,00 DESTINATÁRIO"
      /VALOR\s*TOTAL\s*:?\s*R?\$?\s*([0-9]{1,3}(?:\.[0-9]{3})*,\d{2})\s*(?:DESTINAT[ÁA]RIO|EMISS[ÃA]O|$)/i,
      // 3. Fatura / Duplicata
      /FATURA\s*\/\s*DUPLICATA[\s\S]*?Valor\s*R?\$?\s*([0-9]{1,3}(?:\.[0-9]{3})*,\d{2})/i,
      // 4. Valor Líquido
      /VALOR\s+L[ÍI]QUIDO[^\d\n]*R?\$?\s*([0-9]{1,3}(?:\.[0-9]{3})*,\d{2})/i,
      // 5. Genérico "VALOR TOTAL" (sem casar "DOS PRODUTOS")
      /VALOR\s*TOTAL(?!\s*(?:DOS?\s*)?PRODUTOS)[^\d\n]*R?\$?\s*([0-9]{1,3}(?:\.[0-9]{3})*,\d{2})/i,
      // 6. ÚLTIMO RECURSO (somente se não constar V. TOTAL DA NOTA): V. TOTAL DOS PRODUTOS ou VALOR TOTAL PRODUTOS
      /(?:V\.?\s*TOTAL\s*(?:DOS\s*)?PRODUTOS|VALOR\s*TOTAL\s*(?:DOS\s*)?PRODUTOS)\s*[:\.]?\s*[\r\n]*\s*([0-9]{1,3}(?:\.[0-9]{3})*,\d{2})/i
    ];

    for (const pv of padroesValorNota) {
      const match = text.match(pv);
      if (match && match[1]) {
        const vClean = match[1].replace(/\./g, '').replace(',', '.');
        const vNum = parseFloat(vClean);
        if (!isNaN(vNum) && vNum > 0) {
          valorTotal = vNum;
          break;
        }
      }
    }

    // Fallback de valor total para DANFEs com quebras de linha entre o rótulo e o valor
    if (!valorTotal) {
      // 1. Tenta Valor Total da Nota
      const rDanfeTotalNota = /(?:VALOR|V\.?)\s*TOTAL\s*DA\s*NOTA[^\n]*\n(?:[^\n]*\n){0,35}?([0-9]{1,3}(?:\.[0-9]{3})*,\d{2})/i;
      const mTotNota = text.match(rDanfeTotalNota);
      if (mTotNota && mTotNota[1]) {
        const vClean = mTotNota[1].replace(/\./g, '').replace(',', '.');
        const vNum = parseFloat(vClean);
        if (!isNaN(vNum) && vNum > 0) {
          valorTotal = vNum;
        }
      }
    }

    if (!valorTotal) {
      // 2. Tenta genérico sem produtos
      const rDanfeTotalGen = /VALOR\s*TOTAL(?!\s*DOS?\s*PRODUTOS)[^\n]*\n(?:[^\n]*\n){0,35}?([0-9]{1,3}(?:\.[0-9]{3})*,\d{2})/i;
      const mTotGen = text.match(rDanfeTotalGen);
      if (mTotGen && mTotGen[1]) {
        const vClean = mTotGen[1].replace(/\./g, '').replace(',', '.');
        const vNum = parseFloat(vClean);
        if (!isNaN(vNum) && vNum > 0) {
          valorTotal = vNum;
        }
      }
    }

    if (!valorTotal) {
      // 3. Contingência: Valor dos Produtos apenas se nada mais foi detectado
      const rDanfeTotalProd = /(?:VALOR|V\.?)\s*TOTAL\s*DOS\s*PRODUTOS[^\n]*\n(?:[^\n]*\n){0,35}?([0-9]{1,3}(?:\.[0-9]{3})*,\d{2})/i;
      const mTotProd = text.match(rDanfeTotalProd);
      if (mTotProd && mTotProd[1]) {
        const vClean = mTotProd[1].replace(/\./g, '').replace(',', '.');
        const vNum = parseFloat(vClean);
        if (!isNaN(vNum) && vNum > 0) {
          valorTotal = vNum;
        }
      }
    }

    // Destaques de Retenções na NFS-e (com rigor para evitar captura incorreta de COFINS por INSS)
    let destaqueIr = 0;
    let destaqueInss = 0;
    let destaqueSocial = 0;
    let destaqueIss = 0;
    let bcIssqnNfse = 0;
    let percentualReducaoIssNfse = 0;
    let issqnRetidoTomador = true; // DEFAULT = TRUE para tomador público
    let codigoServicoNfse = '6190';
    let aliqIssNfseDestaque: number | undefined = undefined;
    let localPrestacaoServico: string | undefined = undefined;

    if (ehServico) {
      const matchIr = text.match(/IRRF[^\d]*R?\$?\s*([\d\.,]+)/i);
      if (matchIr) destaqueIr = parseFloat(matchIr[1].replace(/\./g, '').replace(',', '.'));

      // Rigor no INSS: Verifica se no campo da Contribuição Previdenciária consta '-' ou Vazio ou '0,00'
      const matchInssStrict = text.match(/Contribuição\s*Previdenciária\s*[-–—]\s*Retida\s*[\r\n]+\s*(?:R\$\s*)?([R\$\d\.,-]+)/i);
      if (matchInssStrict && matchInssStrict[1]) {
        const valStr = matchInssStrict[1].trim();
        if (valStr !== '-' && !valStr.includes('-') && valStr !== '0,00' && valStr !== '0') {
          const vNum = parseFloat(valStr.replace(/[^\d,\.]/g, '').replace(/\./g, '').replace(',', '.'));
          if (!isNaN(vNum) && vNum > 0) destaqueInss = vNum;
        }
      }

      // Modelo com "Vl. CP Retido" (Contribuição Previdenciária) explícito
      if (destaqueInss === 0) {
        const matchInssCp = text.match(/(?:Vl\.?\s*)?CP\s*Retido[^\d]*R?\$?\s*([\d\.,]+)/i);
        if (matchInssCp && matchInssCp[1]) {
          const vNum = parseFloat(matchInssCp[1].replace(/\./g, '').replace(',', '.'));
          if (!isNaN(vNum) && vNum > 0) destaqueInss = vNum;
        }
      }

      // Modelo com PIS/COFINS/CSLL detalhados individualmente ("Vl. PIS", "Vl. COFINS", "Vl. CSLL")
      const matchPisVal = text.match(/Vl\.?\s*PIS[^\d]*R?\$?\s*([\d\.,]+)/i);
      const matchCofinsVal = text.match(/Vl\.?\s*COFINS[^\d]*R?\$?\s*([\d\.,]+)/i);
      const matchCsllVal = text.match(/Vl\.?\s*CSLL[^\d]*R?\$?\s*([\d\.,]+)/i);
      if (matchPisVal || matchCofinsVal || matchCsllVal) {
        const pisV = matchPisVal ? parseFloat(matchPisVal[1].replace(/\./g, '').replace(',', '.')) : 0;
        const cofinsV = matchCofinsVal ? parseFloat(matchCofinsVal[1].replace(/\./g, '').replace(',', '.')) : 0;
        const csllV = matchCsllVal ? parseFloat(matchCsllVal[1].replace(/\./g, '').replace(',', '.')) : 0;
        const somaSocial = pisV + cofinsV + csllV;
        if (somaSocial > 0) destaqueSocial = Number(somaSocial.toFixed(2));
      }

      if (destaqueSocial === 0) {
        const matchSocial = text.match(/Contribuições\s*Sociais\s*[-–—]\s*Retidas\s*[\r\n]+\s*(?:R\$\s*)?([\d\.,]+)/i) ||
                            text.match(/PIS\/COFINS\/CSLL\s*Retidos[^\d]*R?\$?\s*([\d\.,]+)/i);
        if (matchSocial && matchSocial[1]) {
          destaqueSocial = parseFloat(matchSocial[1].replace(/\./g, '').replace(',', '.'));
        }
      }

      // ISSQN e Redução de Base — restringe a busca ao bloco do ISSQN para não capturar
      // valores da tabela IBS/CBS (que também tem seu próprio "Base de Cálculo")
      const idxIssqnSecao = text.search(/IMPOSTO SOBRE SERVI[ÇC]O DE QUALQUER NATUREZA|C[ÁA]LCULO DO ISSQN/i);
      const idxIbsCbsSecao = text.search(/IMPOSTO E CONTRIBUI[ÇC][ÃA]O SOBRE BENS E SERVI[ÇC]OS/i);
      let trechoIssqn = text;
      if (idxIssqnSecao !== -1) {
        const fimIssqn = idxIbsCbsSecao !== -1 && idxIbsCbsSecao > idxIssqnSecao ? idxIbsCbsSecao : idxIssqnSecao + 500;
        trechoIssqn = text.substring(idxIssqnSecao, fimIssqn);
      }

      const matchBcIss = trechoIssqn.match(/BC\s*ISSQN[^\d]*R?\$?\s*([\d\.,]+)/i) ||
                         trechoIssqn.match(/Base\s*de\s*C[áa]lculo[^\d]*R?\$?\s*([\d\.,]+)/i);
      if (matchBcIss) {
        bcIssqnNfse = parseFloat(matchBcIss[1].replace(/\./g, '').replace(',', '.'));
        if (valorTotal > 0 && bcIssqnNfse > 0 && bcIssqnNfse < valorTotal) {
          percentualReducaoIssNfse = Number((((valorTotal - bcIssqnNfse) / valorTotal) * 100).toFixed(2));
        }
      }

      const matchIssApurado = trechoIssqn.match(/ISSQN\s*Apurado[^\d]*R?\$?\s*([\d\.,]+)/i) ||
                              trechoIssqn.match(/Vl\.?\s*ISSQN[^\d]*R?\$?\s*([\d\.,]+)/i);
      if (matchIssApurado) destaqueIss = parseFloat(matchIssApurado[1].replace(/\./g, '').replace(',', '.'));

      if (upperText.includes('RETENÇÃO DO ISSQN\nNÃO RETIDO') || upperText.includes('NÃO RETIDO')) {
        issqnRetidoTomador = false; // Se constar explicitamente "Não Retido", marca como false
      }

      // Alíquota do ISS aplicada na NFS-e (ex: "Alíquota Aplicada\n2,00%" ou "Alíquota: 3,00%")
      const matchAliqIssStrict = text.match(/(?:Al[íi]quota\s*Aplicada|Al[íi]quota\s*do\s*ISSQN|Al[íi]quota\s*:)[^\d%]*(\d{1,2}(?:[,\.]\d{1,2})?)\s*%/i);
      if (matchAliqIssStrict && matchAliqIssStrict[1]) {
        const alNum = parseFloat(matchAliqIssStrict[1].replace(',', '.'));
        if (!isNaN(alNum) && alNum > 0 && alNum <= 10) {
          aliqIssNfseDestaque = alNum;
        }
      }

      // Local da prestação do serviço (Município onde o serviço foi executado)
      const matchLocalPrest = text.match(/(?:Local\s*da\s*Presta[çc][ãa]o|LocaldaPresta[çc][ãa]o)[^\n]*\n\s*([^\n\r/]{3,60})/i) ||
                              text.match(/(?:Munic[íi]pio\s*de\s*Incid[êe]ncia\s*do\s*ISSQN)[^\n]*\n\s*([^\n\r/]{3,60})/i);
      if (matchLocalPrest && matchLocalPrest[1]) {
        localPrestacaoServico = matchLocalPrest[1].trim();
      }

      // Código do Serviço: prioriza o Código de Tributação Nacional (XX.XX.XX) quando presente
      const matchCodTribNacional = text.match(/C[óo]d\.?\s*Trib\.?\s*Nacional\s*:?\s*([\d\.]{4,10})/i) ||
                                   text.match(/(?:Código\s*de\s*Tributação\s*Nacional|CódigodeTributaçãoNacional)[^\n]*\n\s*([\d\.]+)/i);
      if (matchCodTribNacional && matchCodTribNacional[1]) {
        codigoServicoNfse = matchCodTribNacional[1];
      } else {
        const matchCodServ = text.match(/(07\.02|17\.09|1709|6190|6175)/);
        if (matchCodServ && matchCodServ[1]) {
          codigoServicoNfse = matchCodServ[1];
        }
      }
    }

    // 6. MONTAGEM DOS ITENS
    const itens: ItemAnaliseInput[] = [];

    if (ehServico) {
      let descrServico = 'Prestação de Serviços Gerais';
      const matchDesc = text.match(/Descri[çc][ãa]o\s*do\s*Servi[çc]o\s*:?\s*([\s\S]{5,400}?)(?=\n?IMPOSTO\s+SOBRE|\n?TRIBUTA[ÇC][ÃA]O|\n?INFORMA[ÇC][ÕO]ES\s+COMPLEMENTARES|\n\n)/i) ||
                        text.match(/Descrição\s*do\s*Serviço[^\n]*\n\s*([^\n]{5,200})/i) ||
                        text.match(/(?:REFERENTE A|EXECUCAO DE SERVICOS)[^\n]{5,150}/i);
      if (matchDesc && matchDesc[1]) descrServico = matchDesc[1].replace(/\s+/g, ' ').trim();

      const itemServico: ItemAnaliseInput = {
        numeroItem: 1,
        descricao: descrServico,
        codigoServico: codigoServicoNfse,
        valorBruto: valorTotal
      };

      // Regra especial DDF025: Serviços prestados com dedicação exclusiva de mão de obra
      // Código DARF: 6190 (9,45%), Natureza REINF R-4020: 17033 (Locação / Cessão de mão de obra)
      const descrLower = descrServico.toLowerCase();
      if (
        descrLower.includes('dedicação exclusiva de mão de obra') || 
        descrLower.includes('dedicacao exclusiva de mao de obra') ||
        descrLower.includes('dedicação exclusiva') ||
        descrLower.includes('cessão de mão de obra') ||
        descrLower.includes('locação de mão de obra')
      ) {
        itemServico.manualCodigoDarf = '6190';
        itemServico.manualNaturezaReinf = '17033';
        itemServico.manualFundamentacao = 'DDF025 - Natureza 17033 (Locação / Cessão de Mão de Obra com dedicação exclusiva - DARF 6190 / 9,45%)';
      }

      itens.push(itemServico);
    } else {
      const ncmsEncontrados: {
        ncm: string;
        cst: string;
        descricao?: string;
        valorBruto?: number;
        valorUnitario?: number;
        quantidade?: number;
      }[] = [];

      let secaoProdutos = text;
      const regexHeaderProd = /DADOS\s+DO(?:S)?\s+PRODUTO(?:S)?/gi;
      const indicesHeaders: number[] = [];
      let mHeader;
      while ((mHeader = regexHeaderProd.exec(text)) !== null) {
        indicesHeaders.push(mHeader.index);
      }

      if (indicesHeaders.length > 0) {
        const blocos: string[] = [];
        for (let i = 0; i < indicesHeaders.length; i++) {
          const start = indicesHeaders[i];
          const proximoHeader = i + 1 < indicesHeaders.length ? indicesHeaders[i + 1] : text.length;
          const sub = text.substring(start, proximoHeader);
          // O bloco de produtos termina no início de Dados Adicionais, Cálculo do ISSQN ou Informações Complementares
          const idxFim = sub.search(/(?:DADOS\s+ADICIONAIS|C[ÁA]LCULO\s+DO\s+ISSQN|INFORMA[ÇC][ÕO]ES\s+COMPLEMENTARES)/i);
          if (idxFim !== -1) {
            blocos.push(sub.substring(0, idxFim));
          } else {
            blocos.push(sub);
          }
        }
        secaoProdutos = blocos.join('\n\n--- PAGINA ---\n\n');
      }

      // Máscara da chave de acesso e de protocolos longos para evitar casamentos falsos de NCM
      let textoVarreduraItens = secaoProdutos;
      const chaves44 = textoVarreduraItens.match(/\b\d{44}\b/g) || [];
      for (const ch of chaves44) {
        textoVarreduraItens = textoVarreduraItens.split(ch).join(' '.repeat(44));
      }
      const protocolosLongos = textoVarreduraItens.match(/\b\d{15}\b/g) || [];
      for (const pr of protocolosLongos) {
        textoVarreduraItens = textoVarreduraItens.split(pr).join(' '.repeat(15));
      }

      // 1) Busca primária estruturada: NCM de 8 dígitos seguido de CST/CSOSN (2 a 3 dígitos, 0/00 ou 0/400), CFOP (1/2/5/6/7xxx) e Unidade (1 a 6 letras)
      const regexItemEstruturado = /(?<![0-9])(\d{8})\s*([0-9]\/[0-9]{2,3}|\d{2,3})\s*([12567]\d{3})\s*([A-Za-z]{1,6})(?=\s|\d|\r|\n|$)[\t ]*([^\r\n]*)/g;
      let matchEstruturado;
      let fimUltimoItem = 0;
      while ((matchEstruturado = regexItemEstruturado.exec(textoVarreduraItens)) !== null) {
        const candidatoNcm = matchEstruturado[1];
        const candidatoCst = matchEstruturado[2];
        if (this.ehNcmValido(candidatoNcm)) {
          const idxItem = matchEstruturado.index;
          let restoLinha = (matchEstruturado[5] || '').trim();
          let fimMatchAtual = idxItem + matchEstruturado[0].length;

          // Se os valores numéricos estiverem na linha imediatamente seguinte (ex: "...902139116406108UN\n1,004.300,00004.300,00...")
          if (!restoLinha) {
            const posAposMatch = fimMatchAtual;
            const proxQuebra = textoVarreduraItens.indexOf('\n', posAposMatch + 1);
            const proxLinha = (proxQuebra !== -1
              ? textoVarreduraItens.substring(posAposMatch, proxQuebra)
              : textoVarreduraItens.substring(posAposMatch)
            ).trim();
            if (/^\d+(?:[\.,]\d+)/.test(proxLinha)) {
              restoLinha = proxLinha;
              if (proxQuebra !== -1) fimMatchAtual = proxQuebra;
            }
          }

          // Exige que após a unidade (UN/PC/CX/etc.) existam valores numéricos de quantidade/preço (evita falso positivo em códigos EAN/GTIN colados à descrição)
          if (!/^\d/.test(restoLinha)) {
            continue;
          }

          const valores = this.parseValoresItemDanfe(restoLinha, valorTotal);
          if (valores.valorTotal <= 0) {
            continue;
          }

          // 1. Tenta capturar descrição colada na mesma linha antes do NCM (ex: "AJ-501 VALVULA MEC.AO90213911...")
          let descrItem = '';
          const inicioLinha = Math.max(0, textoVarreduraItens.lastIndexOf('\n', idxItem) + 1);
          const pedacoLinhaAntes = textoVarreduraItens.substring(inicioLinha, idxItem).trim();
          if (pedacoLinhaAntes.length > 3) {
            const limpoMesmaLinha = pedacoLinhaAntes
              .replace(/^[\d\-_]{4,25}\s*(?=[A-Za-z"\(])/, '')
              .replace(/^"+/, '')
              .trim();
            if (limpoMesmaLinha.length >= 3 && !limpoMesmaLinha.startsWith('COD.') && !limpoMesmaLinha.startsWith('DADOS')) {
              descrItem = limpoMesmaLinha;
            }
          }

          // 2. Se não encontrou na mesma linha, busca nas linhas imediatamente anteriores (limitado ao fim do item anterior)
          if (!descrItem) {
            const inicioJanela = Math.max(fimUltimoItem, idxItem - 600);
            const trechoAnt = textoVarreduraItens.substring(inicioJanela, inicioLinha);
            descrItem = this.extrairDescricaoItemDanfe(trechoAnt);
          }

          fimUltimoItem = fimMatchAtual;

          const cstLimpo = candidatoCst.includes('/') ? candidatoCst.split('/')[1] : (candidatoCst.length >= 2 ? candidatoCst.substring(candidatoCst.length - 2) : candidatoCst);
          ncmsEncontrados.push({
            ncm: candidatoNcm,
            cst: cstLimpo,
            descricao: descrItem || undefined,
            valorBruto: valores.valorTotal > 0 ? valores.valorTotal : undefined,
            valorUnitario: valores.valorUnitario > 0 ? valores.valorUnitario : undefined,
            quantidade: valores.quantidade > 0 ? valores.quantidade : undefined
          });
        }
      }

      // 1b) Variante estruturada onde CFOP aparece após o Valor Total e a descrição vem na linha seguinte (ex: "210690900102UN160,000010,001.600,00005102...")
      if (ncmsEncontrados.length === 0) {
        const regexItemCfopPos = /(?:^|\n)(\d{8})(\d{3,4})([A-Za-z]{1,6})([0-9]{1,3}(?:\.[0-9]{3})*,\d{2,4})([0-9]{1,3}(?:\.[0-9]{3})*,\d{2,4})([0-9]{1,3}(?:\.[0-9]{3})*,\d{2,4})([12567]\d{3})[^\r\n]*[\r\n]+\s*([^\r\n]+)/g;
        let matchCfopPos;
        while ((matchCfopPos = regexItemCfopPos.exec(textoVarreduraItens)) !== null) {
          const candidatoNcm = matchCfopPos[1];
          const candidatoCst = matchCfopPos[2];
          if (this.ehNcmValido(candidatoNcm)) {
            const qtd = parseFloat(matchCfopPos[4].replace(/\./g, '').replace(',', '.'));
            const vUnit = parseFloat(matchCfopPos[5].replace(/\./g, '').replace(',', '.'));
            const vTot = parseFloat(matchCfopPos[6].replace(/\./g, '').replace(',', '.'));
            const descrLinhaSeguinte = (matchCfopPos[8] || '').trim();
            const cstLimpo = candidatoCst.length >= 3 ? candidatoCst.substring(1) : candidatoCst;
            ncmsEncontrados.push({
              ncm: candidatoNcm,
              cst: cstLimpo,
              descricao: descrLinhaSeguinte || undefined,
              valorBruto: !isNaN(vTot) && vTot > 0 ? vTot : undefined,
              valorUnitario: !isNaN(vUnit) && vUnit > 0 ? vUnit : undefined,
              quantidade: !isNaN(qtd) && qtd > 0 ? qtd : undefined
            });
          }
        }
      }

      // 2) Busca detalhada por linha na seção de produtos (se não encontrou pela estrutura combinada)
      if (ncmsEncontrados.length === 0) {
        const linhasSecao = textoVarreduraItens.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
        let descrCandidata = '';
        for (let i = 0; i < linhasSecao.length; i++) {
          const linha = linhasSecao[i];
          if (/^(?:DADOS|C[ÓO]DIGO|DESCRI|VALOR|UNIT|TOTAL|DESC|B\.C[ÁA]LC|ICMS|AL[ÍI]Q|IPI|CSOSN)/i.test(linha)) {
            continue;
          }

          // Procura linha que comece com NCM válido de EXATAMENTE 8 dígitos isolado ou com separador
          const matchColadoLinha = linha.match(/^(\d{8})(?:(?:\s+(\d{2,3}))|(?:(\d{2,3})\s*(?:[A-Za-z]{2,4})))/);
          if (matchColadoLinha) {
            const candidato = matchColadoLinha[1];
            if (this.ehNcmValido(candidato)) {
              const rawCst = matchColadoLinha[2] || matchColadoLinha[3] || '01';
              const cstLimpo = rawCst.replace(/\D/g, '').substring(0, 2) || '01';

              let descrItem = descrCandidata;
              if (!descrItem && i - 1 >= 0) {
                descrItem = linhasSecao[i - 1];
              }

              ncmsEncontrados.push({
                ncm: candidato,
                cst: cstLimpo,
                descricao: descrItem || undefined
              });
              descrCandidata = '';
              continue;
            }
          }

          if (!linha.startsWith('Reg.') && !linha.startsWith('Lote:') && !linha.startsWith('Validade:') && !/^\d{2}\/\d{2}\/\d{4}$/.test(linha) && !linha.startsWith('Codigo CEST') && !/^\d+$/.test(linha)) {
            if (!descrCandidata) {
              descrCandidata = linha;
            }
          }
        }
      }

      // 3) Se não encontrou por linha, tenta expressões regulares gerais
      if (ncmsEncontrados.length === 0) {
        const regexLinhaItem = /(?:^|\s)([0-9]{4}\.?[0-9]{2}\.?[0-9]{2})\s+([0-9]{2,3})\s+([0-9]{4})\s+([A-Za-z]{2,4})\s+([\d\.,]+)\s+([\d\.,]+)/gm;
        let matchLinha;
        while ((matchLinha = regexLinhaItem.exec(textoVarreduraItens)) !== null) {
          const ncmLimpo = matchLinha[1].replace(/\D/g, '');
          const cstLimpo = matchLinha[2].substring(0, 2);
          const vBruto = parseFloat(matchLinha[6].replace(/\./g, '').replace(',', '.'));
          if (this.ehNcmValido(ncmLimpo) && !ncmsEncontrados.some(x => x.ncm === ncmLimpo)) {
            ncmsEncontrados.push({ ncm: ncmLimpo, cst: cstLimpo, valorBruto: !isNaN(vBruto) ? vBruto : undefined });
          }
        }
      }

      if (ncmsEncontrados.length === 0) {
        const regexFormatado = /\b(\d{4}\.\d{2}\.\d{2})\b/g;
        let matchFmt;
        while ((matchFmt = regexFormatado.exec(textoVarreduraItens)) !== null) {
          const limpo = matchFmt[1].replace(/\D/g, '');
          if (this.ehNcmValido(limpo)) {
            if (!ncmsEncontrados.some(x => x.ncm === limpo)) {
              ncmsEncontrados.push({ ncm: limpo, cst: '01' });
            }
          }
        }
      }

      if (ncmsEncontrados.length === 0) {
        const regexOitoDigitos = /\b(\d{8})\b/g;
        let matchOito;
        while ((matchOito = regexOitoDigitos.exec(textoVarreduraItens)) !== null) {
          const limpo = matchOito[1];
          if (this.ehNcmValido(limpo)) {
            if (!ncmsEncontrados.some(x => x.ncm === limpo)) {
              ncmsEncontrados.push({ ncm: limpo, cst: '01' });
            }
          }
        }
      }

      // Detecção de retenções federais expressas nas Informações Complementares da NF-e
      // Exemplo: "IMPOSTOS RETIDOS NA FONTE: PIS R$ 21,61 0,65% ,COFINS R$ 99,75 3,00% ,CSLL R$ 33,25 1,00% ,IRRF R$ 39,90 1,20%"
      let aliqIrDestaqueNfe: number | undefined;
      let aliqCsllDestaqueNfe: number | undefined;
      let aliqCofinsDestaqueNfe: number | undefined;
      let aliqPisDestaqueNfe: number | undefined;

      const matchRetFonte = text.match(/IMPOSTOS\s*RETIDOS\s*NA\s*FONTE\s*:?\s*([^]+?)(?=(?:horas|Total|ISENTO|$))/i);
      if (matchRetFonte) {
        const blocoRet = matchRetFonte[1];
        const pPis = blocoRet.match(/PIS\s*(?:R\$\s*)?([\d\.,]+)\s*([\d\.,]+)\s*%/i);
        const pCofins = blocoRet.match(/COFINS\s*(?:R\$\s*)?([\d\.,]+)\s*([\d\.,]+)\s*%/i);
        const pCsll = blocoRet.match(/CSLL\s*(?:R\$\s*)?([\d\.,]+)\s*([\d\.,]+)\s*%/i);
        const pIr = blocoRet.match(/IRRF\s*(?:R\$\s*)?([\d\.,]+)\s*([\d\.,]+)\s*%/i);

        if (pIr && pIr[2]) aliqIrDestaqueNfe = parseFloat(pIr[2].replace(',', '.'));
        if (pCsll && pCsll[2]) aliqCsllDestaqueNfe = parseFloat(pCsll[2].replace(',', '.'));
        if (pCofins && pCofins[2]) aliqCofinsDestaqueNfe = parseFloat(pCofins[2].replace(',', '.'));
        if (pPis && pPis[2]) aliqPisDestaqueNfe = parseFloat(pPis[2].replace(',', '.'));
      }

      // Detecção de descrições reais do produto
      const descrFioGuia = text.match(/([A-Z0-9\-_]{2,20}FIO\s*GUIA[^\n\r]{4,80}|FIO\s*GUIA[^\n\r]{4,80})/i);
      const descrStent = text.match(/(STENT[^\n]{4,80})/i);
      const descrEnergia = text.match(/(ENERGIA EL[EÉ]TRICA[^\n]{4,80})/i);
      const descrDapagliflozina = text.match(/(DAPAGLIFLOZINA[^\n]{4,60})/i);
      const descrSensor = text.match(/(Sensor de SpO2[^\n]{4,60})/i);
      const descrCateter = text.match(/(Cateter para Terapia[^\n]{4,60})/i);

      let descrDefault = 'Item de Material / Mercadoria';
      if (descrFioGuia) descrDefault = descrFioGuia[1].trim();
      else if (descrStent) descrDefault = descrStent[1].trim();
      else if (descrEnergia) descrDefault = descrEnergia[1].trim();
      else if (descrDapagliflozina) descrDefault = descrDapagliflozina[1].trim();
      else if (descrSensor) descrDefault = descrSensor[1].trim();
      else if (descrCateter) descrDefault = descrCateter[1].trim();

      if (ncmsEncontrados.length > 0) {
        // Se a soma dos valores brutos individuais for coerente com o total da nota (ou total for 0)
        const somaBrutosItens = Number(ncmsEncontrados.reduce((acc, it) => acc + (it.valorBruto || 0), 0).toFixed(2));
        const temValoresIndividuaisValidos = somaBrutosItens > 0 && (valorTotal === 0 || Math.abs(somaBrutosItens - valorTotal) <= 1.0);

        if (valorTotal === 0 && somaBrutosItens > 0) {
          valorTotal = somaBrutosItens;
        }

        const valorUnitarioSubtotal = valorTotal > 0 ? (valorTotal / ncmsEncontrados.length) : 0;

        ncmsEncontrados.forEach((itemNcm, idx) => {
          const valorFinalItem = (temValoresIndividuaisValidos && itemNcm.valorBruto && itemNcm.valorBruto > 0)
            ? itemNcm.valorBruto
            : (itemNcm.valorBruto && itemNcm.valorBruto > 0 && valorTotal === 0 ? itemNcm.valorBruto : Number(valorUnitarioSubtotal.toFixed(2)));

          const itemAdicionar: ItemAnaliseInput = {
            numeroItem: idx + 1,
            descricao: itemNcm.descricao || descrDefault,
            ncm: itemNcm.ncm,
            cst: itemNcm.cst || '01',
            valorBruto: valorFinalItem
          };

          // Se a nota fiscal traz retenção federal na fonte expressa pelo fornecedor (órgão público tomador)
          if (aliqCofinsDestaqueNfe !== undefined && aliqPisDestaqueNfe !== undefined) {
            itemAdicionar.manualAliqIr = aliqIrDestaqueNfe;
            itemAdicionar.manualAliqCsll = aliqCsllDestaqueNfe;
            itemAdicionar.manualAliqCofins = aliqCofinsDestaqueNfe;
            itemAdicionar.manualAliqPis = aliqPisDestaqueNfe;
            itemAdicionar.manualCodigoDarf = '6147';
            itemAdicionar.manualNaturezaReinf = '17009';
            itemAdicionar.manualFundamentacao = 'IN RFB nº 1.234/2012 (Código DARF 6147 - Retenção Ampla na Fonte destacada no documento fiscal)';
          }

          itens.push(itemAdicionar);
        });
      }
    }

    if (itens.length === 0) {
      itens.push({
        numeroItem: 1,
        descricao: ehServico ? 'Prestação de Serviço' : 'Item de Material / Consumo',
        ncm: ehServico ? undefined : '',
        cst: '01',
        codigoServico: ehServico ? '6190' : undefined,
        valorBruto: valorTotal
      });
    }

    // Extração da data de emissão
    let dataEmissao = new Date().toISOString().split('T')[0];
    const matchData = text.match(/DATA\s*DA\s*EMISS[ÃA]O\s*[\r\n]+\s*(\d{2})\/(\d{2})\/(\d{4})/i) ||
                      text.match(/EMISS[ÃA]O\s*[:\.]?\s*(\d{2})\/(\d{2})\/(\d{4})/i);
    if (matchData && matchData[1] && matchData[2] && matchData[3]) {
      dataEmissao = `${matchData[3]}-${matchData[2]}-${matchData[1]}`;
    }

    // Extração da Nota de Empenho (NE) se informada nas Informações Complementares ou Pedido
    let numeroEmpenho: string | undefined = undefined;
    const matchEmpenho = text.match(/(?:(?:NOTA\s*DE\s*)?EMPENHO|NE|PEDIDO)[:\s]*([0-9]{4}NE[0-9]{4,6})/i);
    if (matchEmpenho && matchEmpenho[1]) {
      numeroEmpenho = matchEmpenho[1].toUpperCase();
    }

    // Validação cruzada: CNPJ e número da chave de acesso vs. corpo da nota (somente DANFE/NF-e)
    let validacaoChave = undefined;
    if (!ehServico && chaveAcesso) {
      const matchNumeroCorpo = text.match(/N[ºo°]\.?\s*(\d{3}\.\d{3}\.\d{3})\b/i);
      validacaoChave = ChaveAcessoValidator.validar({
        chaveAcesso,
        cnpjCorpo: cnpjEmitenteCorpo,
        numeroCorpo: matchNumeroCorpo ? matchNumeroCorpo[1] : undefined
      });
    }

    return {
      tipoDocumento: ehServico ? 'NFSE' : 'NFE',
      validacaoChave,
      numeroNota: numeroNota || '1',
      chaveAcesso,
      numeroEmpenho,
      fornecedorNome,
      fornecedorCnpj,
      destinatarioNome,
      destinatarioCnpj,
      dataEmissao,
      valorTotal,
      itens,
      destaqueIr,
      destaqueInss,
      destaqueSocial,
      destaqueIss,
      bcIssqnNfse,
      percentualReducaoIssNfse,
      issqnRetidoTomador,
      codigoServicoNfse,
      localPrestacaoServico,
      aliqIssNfseDestaque
    };
  }

  public static async parseMultiplasNotas(pdfBuffer: Buffer): Promise<Array<NotaFiscalExtraida & {
    destaqueIr?: number;
    destaqueInss?: number;
    destaqueSocial?: number;
    destaqueIss?: number;
    bcIssqnNfse?: number;
    percentualReducaoIssNfse?: number;
    issqnRetidoTomador?: boolean;
    codigoServicoNfse?: string;
    localPrestacaoServico?: string;
    aliqIssNfseDestaque?: number;
    numeroPaginaOrigem?: number;
    totalPaginasDocumento?: number;
    totalNotasNoPdf?: number;
  }>> {
    const paginas = await this.extrairPaginasTexto(pdfBuffer);
    const grupos = this.agruparPaginasPorDocumentoFiscal(paginas);

    const resultados: Array<any> = [];
    for (const g of grupos) {
      const extraida = this.parseTexto(g.texto);
      extraida.numeroPaginaOrigem = g.paginasIndices[0];
      extraida.totalPaginasDocumento = g.paginasIndices.length;
      extraida.totalNotasNoPdf = grupos.length;
      resultados.push(extraida);
    }
    return resultados;
  }

  public static async parsePdf(pdfBuffer: Buffer): Promise<NotaFiscalExtraida & {
    destaqueIr?: number;
    destaqueInss?: number;
    destaqueSocial?: number;
    destaqueIss?: number;
    bcIssqnNfse?: number;
    percentualReducaoIssNfse?: number;
    issqnRetidoTomador?: boolean;
    codigoServicoNfse?: string;
    localPrestacaoServico?: string;
    aliqIssNfseDestaque?: number;
    totalNotasNoPdf?: number;
    todasNotasNoPdf?: Array<any>;
  }> {
    const notas = await this.parseMultiplasNotas(pdfBuffer);
    const primeiraNota = notas[0] || this.parseTexto('');
    (primeiraNota as any).totalNotasNoPdf = notas.length;
    (primeiraNota as any).todasNotasNoPdf = notas;
    return primeiraNota;
  }
}
