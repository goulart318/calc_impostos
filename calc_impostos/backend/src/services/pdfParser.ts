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
    const chaveMatch = text.match(/(?:CHAVE\s*DE\s*ACESSO[^\d]*)([\d\s-]{44,60})/i) ||
                       text.match(/(?:CHAVE\s*DE\s*ACESSO[^\d]*)?(\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}|\d{44,50})/i);
    if (chaveMatch) {
      const candidata = chaveMatch[1].replace(/[\s-]/g, '');
      if (candidata.length >= 44 && candidata.length <= 50) chaveAcesso = candidata;
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
    const padroesValorNota = ehServico ? [
      /Vl\.?\s*do\s*Servi[çc]o\s*:?\s*R?\$?\s*([\d\.,]+)/i,
      /Valor\s+do\s+Servi[çc]o\s*:?\s*R?\$?\s*([\d\.,]+)/i,
      /VALOR\s*DA\s*OPERA[ÇC][ÃA]O\s*\/\s*SERVI[ÇC]O\s*:?\s*R?\$?\s*([\d\.,]+)/i,
      /VALOR\s+TOTAL\s+DO\s+SERVIÇO\s*:?\s*R?\$?\s*([\d\.,]+)/i,
      /VALOR\s*TOTAL\s*DA\s*NFS-e\s*:?\s*R?\$?\s*([\d\.,]+)/i,
      /VALOR\s*TOTAL\s*DA\s*NOTA\s*:?\s*R?\$?\s*([\d\.,]+)/i,
      /VALOR\s+L[ÍI]QUIDO[^\d]*([\d\.,]+)/i,
      /VALOR\s+TOTAL[^\d]*R?\$?\s*([\d\.,]+)/i
    ] : [
      /VALOR\s*TOTAL\s*DA\s*NOTA[^\d]*([\d\.,]+)/i,
      /VALOR\s*TOTAL\s*DOS\s*PRODUTOS[^\d]*([\d\.,]+)/i,
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
      const ncmsEncontrados: { ncm: string; cst: string; descricao?: string }[] = [];

      let secaoProdutos = text;
      const idxInicioProd = text.search(/DADOS\s+DO(?:S)?\s+PRODUTO(?:S)?/i);
      const idxFimProd = text.search(/(?:DADOS\s+ADICIONAIS|C[ÁA]LCULO\s+DO\s+ISSQN|INFORMA[ÇC][ÕO]ES\s+COMPLEMENTARES)/i);

      if (idxInicioProd !== -1) {
        secaoProdutos = idxFimProd !== -1 && idxFimProd > idxInicioProd 
          ? text.substring(idxInicioProd, idxFimProd) 
          : text.substring(idxInicioProd);
      }

      // 1) Busca detalhada por linha na seção de produtos (suporta tabelas compactadas/coladas)
      const linhasSecao = secaoProdutos.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
      let descrCandidata = '';
      for (const linha of linhasSecao) {
        if (/^(?:DADOS|C[ÓO]DIGO|DESCRI|VALOR|UNIT|TOTAL|DESC|B\.C[ÁA]LC|ICMS|AL[ÍI]Q|IPI)/i.test(linha)) {
          continue;
        }

        // Procura linha que comece com NCM válido de 8 dígitos colado ou com espaços
        // Exemplo: "901839291/406108NO190,000017,50003.325,000..." ou "9018.39.29"
        const matchColadoLinha = linha.match(/^(\d{8})(?:(\d|\d\/\d{2}|\d{3}))?(\d{4})?([A-Za-z]{2,4})?([\d\.,]+)/);
        if (matchColadoLinha) {
          const candidato = matchColadoLinha[1];
          if (this.ehNcmValido(candidato)) {
            const rawCst = matchColadoLinha[2] || '01';
            const cstLimpo = rawCst.replace(/\D/g, '').substring(0, 2) || '01';
            if (!ncmsEncontrados.some(x => x.ncm === candidato)) {
              ncmsEncontrados.push({
                ncm: candidato,
                cst: cstLimpo,
                descricao: descrCandidata || undefined
              });
            }
            descrCandidata = '';
            continue;
          }
        }

        // Se não for linha de NCM, mas for texto de descrição válido (ignora Lote, Reg. ANVISA, etc.)
        if (!linha.startsWith('Reg.') && !linha.startsWith('Lote:') && !linha.startsWith('Validade:') && !/^\d{2}\/\d{2}\/\d{4}$/.test(linha)) {
          if (!descrCandidata) {
            descrCandidata = linha;
          }
        }
      }

      // 2) Se não encontrou por linha, tenta expressões regulares gerais
      if (ncmsEncontrados.length === 0) {
        const regexLinhaItem = /(?:^|\s)([0-9]{4}\.?[0-9]{2}\.?[0-9]{2})\s+([0-9]{2,3})\s+([0-9]{4})\s+([A-Za-z]{2,4})\s+([\d\.,]+)\s+([\d\.,]+)/gm;
        let matchLinha;
        while ((matchLinha = regexLinhaItem.exec(secaoProdutos)) !== null) {
          const ncmLimpo = matchLinha[1].replace(/\D/g, '');
          const cstLimpo = matchLinha[2].substring(0, 2);
          if (this.ehNcmValido(ncmLimpo) && !ncmsEncontrados.some(x => x.ncm === ncmLimpo)) {
            ncmsEncontrados.push({ ncm: ncmLimpo, cst: cstLimpo });
          }
        }
      }

      if (ncmsEncontrados.length === 0) {
        const regexColado = /(?:[A-Za-z])?(\d{8})\s*(\d{2,3})\s*(\d{4})/g;
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
        const valorUnitarioSubtotal = valorTotal > 0 ? (valorTotal / ncmsEncontrados.length) : 0;
        ncmsEncontrados.forEach((itemNcm, idx) => {
          const itemAdicionar: ItemAnaliseInput = {
            numeroItem: idx + 1,
            descricao: itemNcm.descricao || descrDefault,
            ncm: itemNcm.ncm,
            cst: itemNcm.cst || '01',
            valorBruto: Number(valorUnitarioSubtotal.toFixed(2))
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
