import xml2js from 'xml2js';
import { ItemAnaliseInput } from './taxEngine';

export interface NotaFiscalExtraida {
  tipoDocumento: 'NFE' | 'NFSE';
  numeroNota: string;
  chaveAcesso?: string;
  fornecedorNome: string;
  fornecedorCnpj: string;
  destinatarioNome?: string;
  destinatarioCnpj?: string;
  dataEmissao: string;
  valorTotal: number;
  itens: ItemAnaliseInput[];
}

export class NfeParser {
  private static ehPisCofinsZero(cst?: string): boolean {
    if (!cst) return false;
    const cstClean = String(cst).trim();
    return ['04', '06', '07', '08', '09', '4', '6', '7', '8', '9'].includes(cstClean);
  }

  public static async parseXml(xmlContent: string): Promise<NotaFiscalExtraida> {
    const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false });
    const result = await parser.parseStringPromise(xmlContent);

    // 1. NF-e (Modelo 55 - Mercadoria)
    const nfeProc = result.nfeProc || result.NFe || result['procNFe'] || result;
    const nfe = nfeProc.NFe || nfeProc;
    const infNFe = nfe.infNFe;

    if (infNFe) {
      const ide = infNFe.ide || {};
      const emit = infNFe.emit || {};
      const dest = infNFe.dest || {};
      const total = infNFe.total?.ICMSTot || {};
      
      const numeroNota = ide.nNF ? String(ide.nNF) : '0';
      const chaveAcesso = (infNFe.$ && infNFe.$.Id ? infNFe.$.Id.replace(/\D/g, '') : (nfeProc.protNFe?.infProt?.chNFe || ''));
      const fornecedorNome = emit.xNome || emit.xFant || 'Fornecedor Desconhecido';
      const fornecedorCnpj = emit.CNPJ || emit.CPF || '';
      
      const destinatarioNome = dest.xNome || 'Destinatário Desconhecido';
      const destinatarioCnpj = dest.CNPJ || dest.CPF || '';

      const dataEmissao = ide.dhEmi ? ide.dhEmi.split('T')[0] : (ide.dEmi ? ide.dEmi : new Date().toISOString().split('T')[0]);
      const valorTotal = parseFloat(total.vNF || total.vProd || '0');

      const detList = Array.isArray(infNFe.det) ? infNFe.det : (infNFe.det ? [infNFe.det] : []);
      const itens: ItemAnaliseInput[] = detList.map((det: any, idx: number) => {
        const prod = det.prod || {};
        const imposto = det.imposto || {};
        
        const rawNcm = typeof prod.NCM === 'object' ? (prod.NCM._ || prod.NCM.$) : prod.NCM;
        const ncm = String(rawNcm || '').replace(/\D/g, '');
        const valorBruto = parseFloat(prod.vProd || prod.vNF || '0');

        const pisGroup = imposto.PIS || {};
        const cofinsGroup = imposto.COFINS || {};
        
        const pisCstRaw = pisGroup.PISAliq?.CST || pisGroup.PISNT?.CST || pisGroup.PISOutr?.CST || pisGroup.PISQtde?.CST || '';
        const cofinsCstRaw = cofinsGroup.COFINSAliq?.CST || cofinsGroup.COFINSNT?.CST || cofinsGroup.COFINSOutr?.CST || cofinsGroup.COFINSQtde?.CST || '';
        
        const cstStr = String(pisCstRaw || cofinsCstRaw || '01').replace(/\D/g, '');
        const ehPisCofinsZero = this.ehPisCofinsZero(cstStr);

        return {
          numeroItem: parseInt(det.$?.nItem || String(idx + 1)),
          descricao: prod.xProd || `Item ${idx + 1}`,
          ncm: ncm,
          cst: cstStr || '01',
          valorBruto: valorBruto,
          condicaoEspecial: ehPisCofinsZero ? '8767' : undefined
        };
      });

      return {
        tipoDocumento: 'NFE',
        numeroNota,
        chaveAcesso,
        fornecedorNome,
        fornecedorCnpj,
        destinatarioNome,
        destinatarioCnpj,
        dataEmissao,
        valorTotal,
        itens
      };
    }

    // 2. NFS-e (Serviço)
    const compNfse = result.CompNfse || result.Nfse || result.ConsultarNfseResposta || result;
    const infNfse = compNfse.Nfse?.InfNfse || compNfse.InfNfse || result;

    if (infNfse) {
      const declaracao = infNfse.DeclaracaoPrestacaoServico?.InfDeclaracaoPrestacaoServico || infNfse;
      const prestador = declaracao.PrestadorServico || declaracao.Prestador || {};
      const tomador = declaracao.TomadorServico || declaracao.Tomador || {};
      const servico = declaracao.Servico || {};
      const valores = servico.Valores || {};

      const numeroNota = infNfse.Numero ? String(infNfse.Numero) : (declaracao.IdentificacaoRps?.Numero ? String(declaracao.IdentificacaoRps.Numero) : '0');
      const fornecedorNome = prestador.RazaoSocial || prestador.NomeFantasia || 'Prestador de Serviço';
      const fornecedorCnpj = prestador.IdentificacaoPrestador?.CpfCnpj?.Cnpj || prestador.Cnpj || prestador.Cpf || '';
      
      const destinatarioNome = tomador.RazaoSocial || tomador.NomeFantasia || 'Tomador de Serviço';
      const destinatarioCnpj = tomador.IdentificacaoTomador?.CpfCnpj?.Cnpj || tomador.Cnpj || tomador.Cpf || '';

      const dataEmissao = infNfse.DataEmissao ? String(infNfse.DataEmissao).split('T')[0] : new Date().toISOString().split('T')[0];
      const valorTotal = parseFloat(valores.ValorServicos || valores.ValorLiquidoNfse || '0');

      const itens: ItemAnaliseInput[] = [{
        numeroItem: 1,
        descricao: servico.Discriminacao || 'Prestação de Serviços',
        codigoServico: servico.ItemListaServico || '6190',
        valorBruto: valorTotal
      }];

      return {
        tipoDocumento: 'NFSE',
        numeroNota,
        fornecedorNome,
        fornecedorCnpj,
        destinatarioNome,
        destinatarioCnpj,
        dataEmissao,
        valorTotal,
        itens
      };
    }

    throw new Error('Não foi possível identificar a estrutura do XML.');
  }
}
