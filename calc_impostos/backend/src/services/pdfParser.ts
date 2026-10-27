import zlib from 'zlib';
import pdfParse from 'pdf-parse';
import { NotaFiscalExtraida } from './nfeParser';
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

  private static parseValoresItemDanfe(qtdStr: string | undefined, restoLinha: string | undefined): { valorUnitario: number; valorTotal: number } {
    if (!restoLinha) return { valorUnitario: 0, valorTotal: 0 };
    const limpo = restoLinha.trim();
    const qtd = parseFloat((qtdStr || '1').replace(',', '.')) || 1;

    // Caso valores colados sem espaço: ex: 330,00990,00 ou 1.800,001.800,00 ou 330,001.320,00
    const mColados = limpo.match(/^([0-9]{1,3}(?:\.[0-9]{3})*,\d{2})([0-9]{1,3}(?:\.[0-9]{3})*,\d{2})/);
    if (mColados) {
      const vUnit = parseFloat(mColados[1].replace(/\./g, '').replace(',', '.'));
      const vTot = parseFloat(mColados[2].replace(/\./g, '').replace(',', '.'));
      if (!isNaN(vTot) && vTot > 0) {
        return { valorUnitario: !isNaN(vUnit) && vUnit > 0 ? vUnit : vTot / qtd, valorTotal: vTot };
      }
    }

    // Caso valores com espaço ou pontuação regular
    const tokens = limpo.split(/\s+/).map(t => parseFloat(t.replace(/\./g, '').replace(',', '.'))).filter(n => !isNaN(n) && n > 0);
    if (tokens.length >= 2) {
      return { valorUnitario: tokens[0], valorTotal: tokens[1] };
    } else if (tokens.length === 1) {
      return { valorUnitario: tokens[0] / qtd, valorTotal: tokens[0] };
    }

    return { valorUnitario: 0, valorTotal: 0 };
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
        up.startsWith('LOTE') ||
        up.startsWith('S/N:') ||
        up.startsWith('CÓD.') ||
        up.startsWith('COD.') ||
        up.startsWith('DADOS') ||
        up.startsWith('FOLHA:') ||
        up.startsWith('Nº 00') ||
        up.startsWith('SÉRIE') ||
        up.startsWith('DANFE') ||
        up.startsWith('NATUREZA DA OPERAÇÃO') ||
        up.startsWith('PROTOCOLO') ||
        up.startsWith('INSCRIÇÃO') ||
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
        /^\d{1,4}$/.test(l) ||
        /^[A-Z0-9_\-]{8,25}$/.test(l)
      ) {
        if (descrPartes.length > 0) {
          break;
        }
        continue;
      }

      descrPartes.unshift(l);
      if (descrPartes.length >= 2) break;
    }

    return descrPartes.join(' ').trim();
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
  }> {
    let text = '';
    const itensExtraidosColunaNcm: {
      ncm: string;
      cst: string;
      descricao?: string;
      valorBruto?: number;
      valorUnitario?: number;
      quantidade?: number;
    }[] = [];

    try {
      const parseFn = typeof pdfParse === 'function' ? pdfParse : (pdfParse as any).default || pdfParse;
      const data = await parseFn(pdfBuffer, {
        pagerender: async (pageData: any) => {
          const textContent = await pageData.getTextContent();
          let lastY: any, pageText = '';
          const items: { str: string; x: number; y: number }[] = [];

          for (const item of textContent.items) {
            if (lastY === item.transform[5] || !lastY) {
              pageText += ' ' + item.str;
            } else {
              pageText += '\n' + item.str;
            }
            lastY = item.transform[5];

            const str = (item.str || '').trim();
            if (str.length > 0) {
              items.push({
                str,
                x: Math.round(item.transform[4]),
                y: Math.round(item.transform[5])
              });
            }
          }

          // Busca formal da coluna NCM/SH no cabeçalho da tabela de produtos do DANFE
          const ncmHeader = items.find(it => /^NCM(\/SH)?$/i.test(it.str) || it.str.toUpperCase() === 'NCM/SH');
          if (ncmHeader) {
            const xNcm = ncmHeader.x;

            items.sort((a, b) => b.y - a.y || a.x - b.x);
            const lines: { y: number; items: typeof items }[] = [];
            let currY: number | null = null;
            let currLine: typeof items = [];

            for (const it of items) {
              if (currY === null || Math.abs(it.y - currY) <= 4) {
                currLine.push(it);
                currY = it.y;
              } else {
                lines.push({ y: currY, items: currLine });
                currLine = [it];
                currY = it.y;
              }
            }
            if (currLine.length > 0) lines.push({ y: currY, items: currLine });

            for (let li = 0; li < lines.length; li++) {
              const line = lines[li];
              if (line.items.some(it => /^NCM(\/SH)?$/i.test(it.str))) continue;

              // Encontra o NCM alinhado sob a coluna NCM/SH da tabela
              const itemNcm = line.items.find(it => Math.abs(it.x - xNcm) <= 25 && /^\d{8}$/.test(it.str));
              if (!itemNcm) continue;

              const ncm = itemNcm.str;
              const itemCst = line.items.find(it => it.x > itemNcm.x && it.x < itemNcm.x + 55 && /^\d{2,3}$/.test(it.str));
              const itemCfop = line.items.find(it => it.x > itemNcm.x + 30 && it.x < itemNcm.x + 90 && /^[12567]\d{3}$/.test(it.str));
              const itemQtd = line.items.find(it => it.x > itemNcm.x + 80 && it.x < itemNcm.x + 130 && /^\d+$/.test(it.str));

              const valoresItems = line.items.filter(it => it.x > itemNcm.x + 100 && /^[0-9\.]+,\d{2}$/.test(it.str));
              let valorUnitario = 0;
              let valorTotal = 0;
              if (valoresItems.length >= 2) {
                valorUnitario = parseFloat(valoresItems[0].str.replace(/\./g, '').replace(',', '.'));
                valorTotal = parseFloat(valoresItems[1].str.replace(/\./g, '').replace(',', '.'));
              } else if (valoresItems.length === 1) {
                valorTotal = parseFloat(valoresItems[0].str.replace(/\./g, '').replace(',', '.'));
              }

              let descrPartes: string[] = [];
              const descrMesmaLinha = line.items.filter(it => it.x < xNcm - 15 && it.x > 120 && !/^[A-Z0-9_\-]{10,25}$/.test(it.str)).map(it => it.str).join(' ').trim();
              if (descrMesmaLinha) descrPartes.push(descrMesmaLinha);

              for (let k = li + 1; k < Math.min(lines.length, li + 5); k++) {
                const lNext = lines[k];
                if (lNext.items.some(it => Math.abs(it.x - xNcm) <= 25 && /^\d{8}$/.test(it.str))) break;
                const textoExtra = lNext.items.filter(it => it.x < xNcm - 15 && it.x > 120).map(it => it.str).join(' ').trim();
                if (
                  textoExtra &&
                  !textoExtra.startsWith('Lote') &&
                  !textoExtra.startsWith('Valid') &&
                  !textoExtra.startsWith('Anvisa') &&
                  !textoExtra.startsWith('Produto:') &&
                  !textoExtra.startsWith('Valor') &&
                  !textoExtra.startsWith('R$')
                ) {
                  descrPartes.push(textoExtra);
                }
              }

              itensExtraidosColunaNcm.push({
                ncm,
                cst: itemCst ? (itemCst.str.length === 3 ? itemCst.str.substring(1) : itemCst.str) : '40',
                quantidade: itemQtd ? parseFloat(itemQtd.str) : 1,
                valorUnitario,
                valorBruto: valorTotal,
                descricao: descrPartes.join(' ').trim()
              });
            }
          }

          return pageText + '\n';
        }
      });

      if (data && data.text && data.text.length > 50) {
        text = data.text;
      }
    } catch (err: any) {
      console.warn('pdfParse falhou, acionando fallback manual FlateDecode:', err?.message);
    }

    if (!text || text.length <= 50) {
      text = this.extrairTextoManualFlateDecode(pdfBuffer);
    }

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
      const chaveMatch = text.match(/(?:CHAVE\s*DE\s*ACESSO[^\d]*)([\d\s-]{44,60})/i) ||
                         text.match(/(?:CHAVE\s*DE\s*ACESSO[^\d]*)?(\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}|\d{44,50})/i);
      if (chaveMatch) {
        const candidata = chaveMatch[1].replace(/[\s-]/g, '');
        if (candidata.length >= 44 && candidata.length <= 50) chaveAcesso = candidata;
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
    }

    // Fallbacks para DANFEs de NF-e e documentos estruturados
    const cnpjMatches = text.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g) || [];

    // Se temos a chave de acesso de 44 dígitos da NF-e, o CNPJ do emitente é 100% determinístico (posições 7 a 20)
    if (!fornecedorCnpj) {
      if (chaveAcesso && chaveAcesso.length === 44) {
        const cnpjRaw = chaveAcesso.substring(6, 20);
        fornecedorCnpj = `${cnpjRaw.substring(0,2)}.${cnpjRaw.substring(2,5)}.${cnpjRaw.substring(5,8)}/${cnpjRaw.substring(8,12)}-${cnpjRaw.substring(12,14)}`;
      } else if (cnpjMatches.length > 0) {
        fornecedorCnpj = cnpjMatches[0];
      }
    }

    // Identificação do Destinatário: qualquer CNPJ do documento que não seja o do fornecedor/emitente
    if (!destinatarioCnpj) {
      const cnpjEmitenteClean = fornecedorCnpj.replace(/\D/g, '');
      for (const cnpjCad of cnpjMatches) {
        const clean = cnpjCad.replace(/\D/g, '');
        if (clean !== cnpjEmitenteClean) {
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
      if (!destinatarioNome) {
        const matchRecebedor = text.match(/IDENTIFICA[ÇC][ÃA]O\s*(?:E\s*ASSINATURA)?\s*DO\s*RECEBEDOR\s*\(([^)]+)\)/i);
        if (matchRecebedor && matchRecebedor[1]) {
          destinatarioNome = this.formatarNomeEmpresa(matchRecebedor[1].trim());
        } else {
          destinatarioNome = 'EMPRESA BRASILEIRA DE SERVICOS HOSPITALARES - EBSERH';
        }
      }
    }

    // 5. VALORES E RETENÇÕES DESTAQUE NA NFS-E
    let valorTotal = 0;
    const padroesValorNota = ehServico ? [
      /Vl\.?\s*do\s*Servi[çc]o\s*:?\s*R?\$?\s*([\d\.,]+)/i,
      /Valor\s+do\s+Servi[çc]o\s*:?\s*R?\$?\s*([\d\.,]+)/i,
      /VALOR\s*DA\s*OPERA[ÇC][ÃA]O\s*\/\s*SERVI[ÇC]O\s*:?\s*R?\$?\s*([\d\.,]+)/i,
      /VALOR\s+TOTAL\s+DO\s+SERVIÇO\s*:?\s*R?\$?\s*([\d\.,]+)/i,
      /VALOR\s*TOTAL\s*DA\s*NFS-e\s*:?\s*R?\$?\s*([\d\.,]+)/i,
      /VALOR\s*TOTAL\s*DA\s*NOTA\s*[:\.]?\s*R?\$?\s*([0-9]{1,3}(?:\.[0-9]{3})*,\d{2})/i,
      /VALOR\s+L[ÍI]QUIDO[^\d\n]*R?\$?\s*([0-9]{1,3}(?:\.[0-9]{3})*,\d{2})/i,
      /VALOR\s+TOTAL[^\d\n]*R?\$?\s*([0-9]{1,3}(?:\.[0-9]{3})*,\d{2})/i
    ] : [
      // 1. PRIORIDADE MÁXIMA: "V. TOTAL DA NOTA" ou "VALOR TOTAL DA NOTA" (DANFE oficial)
      /(?:V\.?\s*TOTAL\s*DA\s*NOTA|VALOR\s*TOTAL\s*DA\s*NOTA)\s*[:\.]?\s*[\r\n]*\s*R?\$?\s*([0-9]{1,3}(?:\.[0-9]{3})*,\d{2})/i,
      // 2. Canhoto de recebimento do DANFE: "EMISSÃO: 07/10/2026 VALOR TOTAL: R$ 435,00 DESTINATÁRIO"
      /VALOR\s*TOTAL\s*:?\s*R?\$?\s*([0-9]{1,3}(?:\.[0-9]{3})*,\d{2})\s*(?:DESTINAT[ÁA]RIO|EMISS[ÃA]O|$)/i,
      // 3. Fatura / Duplicata
      /FATURA\s*\/\s*DUPLICATA[\s\S]*?Valor\s*R?\$?\s*([0-9]{1,3}(?:\.[0-9]{3})*,\d{2})/i,
      // 4. Valor Líquido
      /VALOR\s+L[ÍI]QUIDO[^\d\n]*R?\$?\s*([0-9]{1,3}(?:\.[0-9]{3})*,\d{2})/i,
      // 5. Genérico "VALOR TOTAL" (sem casar "DOS PRODUTOS")
      /VALOR\s*TOTAL(?!\s*DOS?\s*PRODUTOS)[^\d\n]*R?\$?\s*([0-9]{1,3}(?:\.[0-9]{3})*,\d{2})/i,
      // 6. ÚLTIMO RECURSO (somente se não constar V. TOTAL DA NOTA): V. TOTAL DOS PRODUTOS
      /(?:V\.?\s*TOTAL\s*DOS\s*PRODUTOS|VALOR\s*TOTAL\s*DOS\s*PRODUTOS)\s*[:\.]?\s*[\r\n]*\s*([0-9]{1,3}(?:\.[0-9]{3})*,\d{2})/i
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

      // 1. PRIORIDADE MÁXIMA: Itens extraídos diretamente procurando a coluna NCM/SH nas páginas da DANFE
      if (itensExtraidosColunaNcm.length > 0) {
        ncmsEncontrados.push(...itensExtraidosColunaNcm);
      } else {
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

      // 1) Busca primária estruturada: NCM de 8 dígitos seguido de CST (2 a 3 dígitos ou 1/00), CFOP (1/2/5/6/7xxx) e Unidade (2 a 4 letras)
      // Exige fronteira de palavra \b ou quebra de linha antes do NCM para nunca casar dentro de sequências numéricas maiores
      const regexItemEstruturado = /(?:^|\n|\b)(\d{8})\s*([0-9]\/[0-9]{2}|\d{2,3})\s*([12567]\d{3})\s*([A-Za-z]{2,4})?(?:[\t ]*(\d+(?:[\.,]\d+)?))?(?:[\t ]*([\d\.,]+?))?(?:[\t ]*([\d\.,]+(?:\s+[\d\.,]+)*))?(?=\r?\n|$)/g;
      let matchEstruturado;
      while ((matchEstruturado = regexItemEstruturado.exec(textoVarreduraItens)) !== null) {
        const candidatoNcm = matchEstruturado[1];
        const candidatoCst = matchEstruturado[2];
        if (this.ehNcmValido(candidatoNcm)) {
          const idxItem = matchEstruturado.index;
          const qtdStr = matchEstruturado[5];
          const restoValores = ((matchEstruturado[6] || '') + (matchEstruturado[7] || '')).trim();

          const valores = this.parseValoresItemDanfe(qtdStr, restoValores);

          // 1. Tenta capturar descrição colada na mesma linha antes do NCM (ex: "AJ-501 VALVULA MEC.AO90213911...")
          let descrItem = '';
          const inicioLinha = Math.max(0, textoVarreduraItens.lastIndexOf('\n', idxItem) + 1);
          const pedacoLinhaAntes = textoVarreduraItens.substring(inicioLinha, idxItem).trim();
          if (pedacoLinhaAntes.length > 3) {
            const limpoMesmaLinha = pedacoLinhaAntes.replace(/^[\d\-_]{4,25}\s*/, '').trim();
            if (limpoMesmaLinha.length >= 3 && !limpoMesmaLinha.startsWith('COD.') && !limpoMesmaLinha.startsWith('DADOS')) {
              descrItem = limpoMesmaLinha;
            }
          }

          // 2. Se não encontrou na mesma linha, busca nas linhas imediatamente anteriores pelo método inteligente
          if (!descrItem) {
            const inicioJanela = Math.max(0, idxItem - 600);
            const trechoAnt = textoVarreduraItens.substring(inicioJanela, idxItem);
            descrItem = this.extrairDescricaoItemDanfe(trechoAnt);
          }

          const cstLimpo = candidatoCst.includes('/') ? candidatoCst.split('/')[1] : (candidatoCst.length >= 2 ? candidatoCst.substring(candidatoCst.length - 2) : candidatoCst);
          ncmsEncontrados.push({
            ncm: candidatoNcm,
            cst: cstLimpo,
            descricao: descrItem || undefined,
            valorBruto: valores.valorTotal > 0 ? valores.valorTotal : undefined,
            valorUnitario: valores.valorUnitario > 0 ? valores.valorUnitario : undefined,
            quantidade: qtdStr ? parseFloat(qtdStr.replace(',', '.')) : undefined
          });
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

    return {
      tipoDocumento: ehServico ? 'NFSE' : 'NFE',
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
}
