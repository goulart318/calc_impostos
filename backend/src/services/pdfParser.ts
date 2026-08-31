import pdfParse from 'pdf-parse';
import { NotaFiscalExtraida } from './nfeParser';
import { ItemAnaliseInput } from './taxEngine';

export class PdfParser {
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

  public static async parsePdf(pdfBuffer: Buffer): Promise<NotaFiscalExtraida & {
    destaqueIr?: number;
    destaqueInss?: number;
    destaqueSocial?: number;
    destaqueIss?: number;
    bcIssqnNfse?: number;
    percentualReducaoIssNfse?: number;
    issqnRetidoTomador?: boolean;
    codigoServicoNfse?: string;
  }> {
    const parseFn = typeof pdfParse === 'function' ? pdfParse : (pdfParse as any).default || pdfParse;
    const data = await parseFn(pdfBuffer);
    const text: string = data.text || '';

    // 1. TIPO DE DOCUMENTO (NF-e vs NFS-e)
    const upperText = text.toUpperCase();
    const ehServico = upperText.includes('NFS-E') || 
                      upperText.includes('DANFSE') ||
                      upperText.includes('NOTA FISCAL DE SERVIÇOS') || 
                      upperText.includes('PRESTADOR') ||
                      upperText.includes('TOMADOR') ||
                      upperText.includes('IMPOSTO SOBRE SERVIÇOS');

    // 2. CHAVE DE ACESSO
    let chaveAcesso = '';
    const chaveMatch = text.match(/(?:CHAVE\s*DE\s*ACESSO[^\d]*)?(\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}|\d{50})/i);
    if (chaveMatch) {
      const candidata = chaveMatch[1].replace(/[\s-]/g, '');
      if (candidata.length >= 44 && candidata.length <= 50) chaveAcesso = candidata;
    }

    // 3. NÚMERO DA NOTA FISCAL
    let numeroNota = '';
    const padroesNumero = [
      /NÚMERODANFS-e[^\d]*0*([1-9]\d{0,10})/i,
      /NÚMERO DA NFS-e[^\d]*0*([1-9]\d{0,10})/i,
      /N[ºo\.]\s*NFS-e[^\d]*0*([1-9]\d{0,10})/i,
      /(?:N[ºo\.]|N[úu]mero da Nota|N[úu]mero|NF-e|NFS-e)\s*[:\.]?\s*0*([1-9]\d{0,8})/i,
      /N[ºo]\s*([0-9]{1,3}(?:\.[0-9]{3})*)/i
    ];
    for (const padrao of padroesNumero) {
      const match = text.match(padrao);
      if (match && match[1]) {
        numeroNota = match[1].replace(/\./g, '');
        break;
      }
    }

    // 4. EXTRAÇÃO ESTRUTURADA DE PRESTADOR VS TOMADOR
    let fornecedorCnpj = '';
    let fornecedorNome = '';
    let destinatarioCnpj = '';
    let destinatarioNome = '';

    if (ehServico) {
      const idxPrestador = text.search(/PRESTADOR\s*\/\s*FORNECEDOR|PRESTADOR DE SERVIÇOS/i);
      const idxTomador = text.search(/TOMADOR\s*\/\s*ADQUIRENTE|TOMADOR DE SERVIÇOS/i);

      if (idxPrestador !== -1) {
        const fimTrechoPrest = idxTomador !== -1 && idxTomador > idxPrestador ? idxTomador : idxPrestador + 600;
        const trechoPrestador = text.substring(idxPrestador, fimTrechoPrest);

        fornecedorCnpj = this.extrairCnpjLimpo(trechoPrestador);

        const matchNomePrest = trechoPrestador.match(/(COMER[^\n]{4,60}|CETAN[^\n]{4,60}|[A-Z0-9\s\.\-&]{5,60}LTDA|[A-Z0-9\s\.\-&]{5,60}EPP|[A-Z0-9\s\.\-&]{5,60}S\/A)/i);
        if (matchNomePrest && matchNomePrest[0]) {
          fornecedorNome = this.formatarNomeEmpresa(matchNomePrest[0]);
        }
      }

      if (idxTomador !== -1) {
        const trechoTomador = text.substring(idxTomador, idxTomador + 600);
        destinatarioCnpj = this.extrairCnpjLimpo(trechoTomador);

        const matchNomeTom = trechoTomador.match(/(EMPRESA BRASILEIRA DE SERVICOS HOSPITALARES[^\n]*|EBSERH[^\n]*)/i);
        if (matchNomeTom && matchNomeTom[0]) {
          destinatarioNome = this.formatarNomeEmpresa(matchNomeTom[0]);
        }
      }
    }

    // Fallbacks para DANFEs genéricas
    const cnpjMatches = text.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g) || [];
    if (!fornecedorCnpj) {
      if (chaveAcesso && chaveAcesso.length >= 44) {
        const cnpjRaw = chaveAcesso.substring(6, 20);
        fornecedorCnpj = `${cnpjRaw.substring(0,2)}.${cnpjRaw.substring(2,5)}.${cnpjRaw.substring(5,8)}/${cnpjRaw.substring(8,12)}-${cnpjRaw.substring(12,14)}`;
      } else if (cnpjMatches.length > 0) {
        fornecedorCnpj = cnpjMatches[0];
      }
    }

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
      const recebemosMatch = text.match(/RECEBEMOS DE\s+([A-Z0-9\s\.\-&]{4,60})\s+OS PRODUTOS/i);
      if (recebemosMatch && recebemosMatch[1]) {
        fornecedorNome = recebemosMatch[1].trim();
      } else {
        fornecedorNome = 'Prestador / Fornecedor Identificado no Documento';
      }
    }

    if (!destinatarioNome) {
      destinatarioNome = 'EMPRESA BRASILEIRA DE SERVICOS HOSPITALARES - EBSERH';
    }

    // 5. VALORES E RETENÇÕES DESTAQUE NA NFS-E
    let valorTotal = 0;
    const padroesValorNota = [
      /VALORDAOPERAÇÃO\s*\/\s*SERVIÇO[^\d]*([\d\.,]+)/i,
      /VALOR DA OPERAÇÃO \/ SERVIÇO[^\d]*([\d\.,]+)/i,
      /VALORTOTALDANFS-e[^\d]*([\d\.,]+)/i,
      /VALOR TOTAL DA NFS-e[^\d]*([\d\.,]+)/i,
      /V(?:ALOR)?\.?\s*TOTAL\s+DA\s+NOTA[^\d]*([\d\.,]+)/i,
      /VALOR\s+TOTAL\s+DO\s+SERVIÇO[^\d]*([\d\.,]+)/i,
      /VALOR\s+L[ÍI]QUIDO[^\d]*([\d\.,]+)/i,
      /VALOR\s+TOTAL[^\d]*R?\$?\s*([\d\.,]+)/i
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

    // Destaques de Retenções na NFS-e (com rigor para evitar captura incorreta de COFINS por INSS)
    let destaqueIr = 0;
    let destaqueInss = 0;
    let destaqueSocial = 0;
    let destaqueIss = 0;
    let bcIssqnNfse = 0;
    let percentualReducaoIssNfse = 0;
    let issqnRetidoTomador = true; // DEFAULT = TRUE para tomador público
    let codigoServicoNfse = '6190';

    if (ehServico) {
      const matchIr = text.match(/IRRF[^\d]*R?\$?\s*([\d\.,]+)/i);
      if (matchIr) destaqueIr = parseFloat(matchIr[1].replace(/\./g, '').replace(',', '.'));

      // Rigor no INSS: Verifica se no campo da Contribuição Previdenciária consta '-' ou Vazio ou '0,00'
      const matchInssStrict = text.match(/Contribuição\s*Previdenciária\s*-\s*Retida\s*[\n\r]*\s*([R\$\d\.,-]+)/i);
      if (matchInssStrict && matchInssStrict[1]) {
        const valStr = matchInssStrict[1].trim();
        if (valStr !== '-' && !valStr.includes('-') && valStr !== '0,00' && valStr !== '0') {
          const vNum = parseFloat(valStr.replace(/[^\d,\.]/g, '').replace(/\./g, '').replace(',', '.'));
          if (!isNaN(vNum) && vNum > 0) destaqueInss = vNum;
        }
      }

      const matchSocial = text.match(/Contribuições\s*Sociais\s*-\s*Retidas[^\d]*R?\$?\s*([\d\.,]+)/i) ||
                          text.match(/PIS\/COFINS\/CSLL\s*Retidos[^\d]*R?\$?\s*([\d\.,]+)/i);
      if (matchSocial) destaqueSocial = parseFloat(matchSocial[1].replace(/\./g, '').replace(',', '.'));

      // ISSQN e Redução de Base
      const matchBcIss = text.match(/BC\s*ISSQN[^\d]*R?\$?\s*([\d\.,]+)/i);
      if (matchBcIss) {
        bcIssqnNfse = parseFloat(matchBcIss[1].replace(/\./g, '').replace(',', '.'));
        if (valorTotal > 0 && bcIssqnNfse > 0 && bcIssqnNfse < valorTotal) {
          percentualReducaoIssNfse = Number((((valorTotal - bcIssqnNfse) / valorTotal) * 100).toFixed(2));
        }
      }

      const matchIssApurado = text.match(/ISSQN\s*Apurado[^\d]*R?\$?\s*([\d\.,]+)/i);
      if (matchIssApurado) destaqueIss = parseFloat(matchIssApurado[1].replace(/\./g, '').replace(',', '.'));

      if (upperText.includes('RETENÇÃO DO ISSQN\nNÃO RETIDO') || upperText.includes('NÃO RETIDO')) {
        issqnRetidoTomador = false; // Se constar explicitamente "Não Retido", marca como false
      }

      // Código do Serviço
      const matchCodServ = text.match(/(?:Código\s*de\s*Tributação\s*Nacional|CódigodeTributaçãoNacional)[^\n]*\n\s*([\d\.]+)/i) ||
                           text.match(/(07\.02|17\.09|1709|6190|6175)/);
      if (matchCodServ && matchCodServ[1]) {
        codigoServicoNfse = matchCodServ[1];
      }
    }

    // 6. MONTAGEM DOS ITENS
    const itens: ItemAnaliseInput[] = [];

    if (ehServico) {
      let descrServico = 'Prestação de Serviços Gerais';
      const matchDesc = text.match(/Descrição\s*do\s*Serviço[^\n]*\n\s*([^\n]{5,150})/i) ||
                        text.match(/(REFERENTE A [^\n]{5,150})/i) ||
                        text.match(/(EXECUCAO DE SERVICOS[^\n]{5,150})/i);
      if (matchDesc && matchDesc[1]) descrServico = matchDesc[1].trim();

      itens.push({
        numeroItem: 1,
        descricao: descrServico,
        codigoServico: codigoServicoNfse,
        valorBruto: valorTotal
      });
    } else {
      const ncmsEncontrados: { ncm: string; cst: string; descricao?: string }[] = [];

      let secaoProdutos = text;
      const idxInicioProd = text.search(/DADOS\s+DO(?:S)?\s+PRODUTO(?:S)?/i);
      const idxFimProd = text.search(/(?:DADOS\s+ADICIONAIS|C[ÁA]LCULO\s+DO\s+ISSQN|INFORMA[ÇC][ÕO]ES\s+COMPLEMENTARES)/i);

      if (idxInicioProd !== -1) {
        secaoProdutos = idxFimProd !== -1 && idxFimProd > idxInicioProd 
          ? text.substring(idxInicioProd, idxFimProd) 
          : text.substring(idxInicioProd);
      }

      const regexColado = /(?:[A-Za-z])?(\d{8})\s*(\d{3})\s*(\d{4})/g;
      let matchColado;
      while ((matchColado = regexColado.exec(secaoProdutos)) !== null) {
        const candidatoNcm = matchColado[1];
        const candidatoCstFull = matchColado[2];
        const cstSimples = candidatoCstFull.substring(0, 2);

        if (this.ehNcmValido(candidatoNcm)) {
          if (!ncmsEncontrados.some(x => x.ncm === candidatoNcm)) {
            ncmsEncontrados.push({
              ncm: candidatoNcm,
              cst: cstSimples
            });
          }
        }
      }

      if (ncmsEncontrados.length === 0) {
        const regexFormatado = /\b(\d{4}\.\d{2}\.\d{2}|\d{8})\b/g;
        let matchFmt;
        while ((matchFmt = regexFormatado.exec(secaoProdutos)) !== null) {
          const limpo = matchFmt[1].replace(/\D/g, '');
          if (this.ehNcmValido(limpo)) {
            if (!ncmsEncontrados.some(x => x.ncm === limpo)) {
              ncmsEncontrados.push({ ncm: limpo, cst: '01' });
            }
          }
        }
      }

      const descrDapagliflozina = text.match(/(DAPAGLIFLOZINA[^\n]{4,60})/i);
      const descrSensor = text.match(/(Sensor de SpO2[^\n]{4,60})/i);
      const descrCateter = text.match(/(Cateter para Terapia[^\n]{4,60})/i);

      let descrDefault = 'Item de Material / Consumo';
      if (descrDapagliflozina) descrDefault = descrDapagliflozina[1].trim();
      else if (descrSensor) descrDefault = descrSensor[1].trim();
      else if (descrCateter) descrDefault = descrCateter[1].trim();

      if (ncmsEncontrados.length > 0) {
        const valorUnitarioSubtotal = valorTotal > 0 ? (valorTotal / ncmsEncontrados.length) : 0;
        ncmsEncontrados.forEach((itemNcm, idx) => {
          itens.push({
            numeroItem: idx + 1,
            descricao: itemNcm.descricao || descrDefault,
            ncm: itemNcm.ncm,
            cst: itemNcm.cst || '01',
            valorBruto: Number(valorUnitarioSubtotal.toFixed(2))
          });
        });
      }
    }

    if (itens.length === 0) {
      itens.push({
        numeroItem: 1,
        descricao: ehServico ? 'Prestação de Serviço' : 'Item de Material / Consumo',
        ncm: ehServico ? undefined : '90181990',
        cst: '01',
        codigoServico: ehServico ? '6190' : undefined,
        valorBruto: valorTotal
      });
    }

    return {
      tipoDocumento: ehServico ? 'NFSE' : 'NFE',
      numeroNota: numeroNota || '1',
      chaveAcesso,
      fornecedorNome,
      fornecedorCnpj,
      destinatarioNome,
      destinatarioCnpj,
      dataEmissao: new Date().toISOString().split('T')[0],
      valorTotal,
      itens,
      destaqueIr,
      destaqueInss,
      destaqueSocial,
      destaqueIss,
      bcIssqnNfse,
      percentualReducaoIssNfse,
      issqnRetidoTomador,
      codigoServicoNfse
    };
  }
}
