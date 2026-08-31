import { XMLParser } from 'fast-xml-parser';
import { NotaFiscalExtraida } from './nfeParser';
import { ItemAnaliseInput } from './taxEngine';

export class XmlParser {
  /**
   * Converte um buffer de arquivo XML em estrutura de nota fiscal analisável
   */
  public static async parseXml(xmlBuffer: Buffer): Promise<NotaFiscalExtraida & {
    destaqueIr?: number;
    destaqueInss?: number;
    destaqueSocial?: number;
    destaqueIss?: number;
    bcIssqnNfse?: number;
    percentualReducaoIssNfse?: number;
    issqnRetidoTomador?: boolean;
    codigoServicoNfse?: string;
  }> {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      parseTagValue: true
    });

    const xmlString = xmlBuffer.toString('utf-8');
    const parsedObj = parser.parse(xmlString);

    // 1. IDENTIFICAÇÃO DE NF-e DE MERCADORIA VS NFS-e DE SERVIÇO
    const isNfe = Boolean(parsedObj.nfeProc || parsedObj.NFe || parsedObj.infNFe);
    const isNfse = Boolean(parsedObj.CompNfse || parsedObj.Nfse || parsedObj.ConsultarNfseResposta || parsedObj.enviLoteRpsResposta || xmlString.includes('InfNfse') || xmlString.includes('Nfse'));

    if (isNfe) {
      return this.parseNfeMercadoria(parsedObj);
    } else if (isNfse) {
      return this.parseNfseServico(parsedObj, xmlString);
    } else {
      // Tentar parsing generico de NFe
      return this.parseNfeMercadoria(parsedObj);
    }
  }

  private static parseNfeMercadoria(parsedObj: any): any {
    const nfeRoot = parsedObj.nfeProc?.NFe || parsedObj.NFe || parsedObj;
    const infNFe = nfeRoot.infNFe || nfeRoot;

    // Chave de Acesso
    let chaveAcesso = '';
    if (infNFe['@_Id']) {
      chaveAcesso = infNFe['@_Id'].replace(/\D/g, '');
    } else if (parsedObj.nfeProc?.protNFe?.infProt?.chNFe) {
      chaveAcesso = String(parsedObj.nfeProc.protNFe.infProt.chNFe);
    }

    // Número da Nota e Emissão
    const ide = infNFe.ide || {};
    const numeroNota = String(ide.nNF || '1');
    const dataEmissao = (ide.dhEmi || ide.dEmi || new Date().toISOString()).split('T')[0];

    // Emitente (Fornecedor)
    const emit = infNFe.emit || {};
    const fornecedorCnpjRaw = String(emit.CNPJ || emit.CPF || '');
    const fornecedorCnpj = this.formatarCnpj(fornecedorCnpjRaw);
    const fornecedorNome = String(emit.xNome || emit.xFant || 'Fornecedor Identificado no XML');

    // Destinatário (Órgão Público)
    const dest = infNFe.dest || {};
    const destinatarioCnpjRaw = String(dest.CNPJ || dest.CPF || '');
    const destinatarioCnpj = this.formatarCnpj(destinatarioCnpjRaw);
    const destinatarioNome = String(dest.xNome || 'EMPRESA BRASILEIRA DE SERVICOS HOSPITALARES - EBSERH');

    // Itens e NCMs
    const detList = Array.isArray(infNFe.det) ? infNFe.det : (infNFe.det ? [infNFe.det] : []);
    const itens: ItemAnaliseInput[] = [];
    let valorTotal = 0;

    detList.forEach((det: any, idx: number) => {
      const prod = det.prod || {};
      const imposto = det.imposto || {};
      const icms = imposto.ICMS || {};
      
      let cst = '01';
      // Extrair CST do ICMS se disponível
      for (const key of Object.keys(icms)) {
        if (icms[key]?.CST) {
          cst = String(icms[key].CST).substring(0, 2);
          break;
        } else if (icms[key]?.CSOSN) {
          cst = String(icms[key].CSOSN).substring(0, 2);
          break;
        }
      }

      const vProd = parseFloat(String(prod.vProd || 0));
      valorTotal += vProd;

      itens.push({
        numeroItem: idx + 1,
        descricao: String(prod.xProd || 'Item de Mercadoria'),
        ncm: String(prod.NCM || '90181990').replace(/\D/g, ''),
        cst,
        valorBruto: vProd
      });
    });

    const vNF = parseFloat(String(infNFe.total?.ICMSTot?.vNF || valorTotal));

    return {
      tipoDocumento: 'NFE',
      numeroNota,
      chaveAcesso,
      fornecedorNome,
      fornecedorCnpj,
      destinatarioNome,
      destinatarioCnpj,
      dataEmissao,
      valorTotal: vNF > 0 ? vNF : valorTotal,
      itens
    };
  }

  private static parseNfseServico(parsedObj: any, xmlString: string): any {
    // Buscar nó InfNfse em qualquer nível
    let infNfse: any = null;
    const buscarNfse = (obj: any) => {
      if (!obj || typeof obj !== 'object') return;
      if (obj.InfNfse || obj.infNfse) {
        infNfse = obj.InfNfse || obj.infNfse;
        return;
      }
      for (const k of Object.keys(obj)) {
        if (typeof obj[k] === 'object') buscarNfse(obj[k]);
      }
    };

    buscarNfse(parsedObj);
    if (!infNfse) infNfse = parsedObj;

    const numeroNota = String(infNfse.Numero || infNfse.numero || '1');
    const dataEmissao = String(infNfse.DataEmissao || infNfse.dataEmissao || new Date().toISOString()).split('T')[0];

    // Prestador
    const prestador = infNfse.PrestadorServico || infNfse.prestadorServico || infNfse.Prestador || {};
    const prestCnpjRaw = String(prestador.IdentificacaoPrestador?.Cnpj || prestador.Cnpj || prestador.CNPJ || '');
    const fornecedorCnpj = this.formatarCnpj(prestCnpjRaw);
    const fornecedorNome = String(prestador.RazaoSocial || prestador.NomeFantasia || 'Prestador de Serviço Identificado no XML');

    // Tomador
    const tomador = infNfse.TomadorServico || infNfse.tomadorServico || infNfse.Tomador || {};
    const tomCnpjRaw = String(tomador.IdentificacaoTomador?.CpfCnpj?.Cnpj || tomador.Cnpj || tomador.CNPJ || '');
    const destinatarioCnpj = this.formatarCnpj(tomCnpjRaw);
    const destinatarioNome = String(tomador.RazaoSocial || 'EMPRESA BRASILEIRA DE SERVICOS HOSPITALARES - EBSERH');

    // Valores do Serviço
    const servico = infNfse.Servico || infNfse.servico || {};
    const valores = servico.Valores || infNfse.Valores || {};

    const valorServicos = parseFloat(String(valores.ValorServicos || valores.valorServicos || 0));
    const destaqueIr = parseFloat(String(valores.ValorIr || valores.valorIr || 0));
    const destaqueInss = parseFloat(String(valores.ValorInss || valores.valorInss || 0));
    const destaqueSocial = parseFloat(String(valores.ValorCsll || valores.valorCsll || 0)) +
                          parseFloat(String(valores.ValorPis || valores.valorPis || 0)) +
                          parseFloat(String(valores.ValorCofins || valores.valorCofins || 0));
    const destaqueIss = parseFloat(String(valores.ValorIss || valores.valorIss || 0));
    const bcIssqnNfse = parseFloat(String(valores.BaseCalculo || valores.baseCalculo || valorServicos));

    let percentualReducaoIssNfse = 0;
    if (valorServicos > 0 && bcIssqnNfse > 0 && bcIssqnNfse < valorServicos) {
      percentualReducaoIssNfse = Number((((valorServicos - bcIssqnNfse) / valorServicos) * 100).toFixed(2));
    }

    const issqnRetidoTomador = Boolean(valores.IssRetido === 1 || valores.IssRetido === '1' || valores.IssRetido === true || true);
    const codigoServicoNfse = String(servico.ItemListaServico || servico.CodigoTributacaoMunicipio || '6190');

    const descrServico = String(servico.Discriminação || servico.Discriminacao || 'Prestação de Serviços Gerais');

    const itens: ItemAnaliseInput[] = [{
      numeroItem: 1,
      descricao: descrServico.substring(0, 150),
      codigoServico: codigoServicoNfse,
      valorBruto: valorServicos
    }];

    return {
      tipoDocumento: 'NFSE',
      numeroNota,
      chaveAcesso: '',
      fornecedorNome,
      fornecedorCnpj,
      destinatarioNome,
      destinatarioCnpj,
      dataEmissao,
      valorTotal: valorServicos,
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

  private static formatarCnpj(raw: string): string {
    const limpo = raw.replace(/\D/g, '');
    if (limpo.length !== 14) return raw;
    return `${limpo.substring(0,2)}.${limpo.substring(2,5)}.${limpo.substring(5,8)}/${limpo.substring(8,12)}-${limpo.substring(12,14)}`;
  }
}
