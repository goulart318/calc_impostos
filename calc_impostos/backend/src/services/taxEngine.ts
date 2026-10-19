import { pool } from '../config/db';

export interface ItemAnaliseInput {
  numeroItem: number;
  descricao: string;
  ncm?: string;
  cst?: string;
  codigoServico?: string;
  valorBruto: number;
  condicaoEspecial?: string;

  // Overrides manuais opcionais se editados pelo usuário
  manualAliqIr?: number;
  manualAliqCsll?: number;
  manualAliqPis?: number;
  manualAliqCofins?: number;
  manualAliqInss?: number;
  manualAliqIss?: number;
  manualCodigoDarf?: string;
  manualNaturezaReinf?: string;
  manualFundamentacao?: string;
}

export interface ItemCalculado {
  numeroItem: number;
  descricao: string;
  ncm: string;
  cst: string;
  codigoServico?: string;
  valorBruto: number;
  condicaoAplicavel: string;
  codigoReceitaDarf: string;
  naturezaRendimentoReinf: string;
  fundamentacaoLegal: string;
  alertaIncompatibilidade?: string;
  
  // Alíquotas (%)
  aliqIr: number;
  aliqCsll: number;
  aliqCofins: number;
  aliqPis: number;
  aliqInss: number;
  aliqIss: number;
  aliqTotalFederal: number;
  aliqTotalGeral: number;

  // Valores (R$)
  valorIr: number;
  valorCsll: number;
  valorCofins: number;
  valorPis: number;
  valorFederalTotal: number;
  valorInss: number;
  baseCalculoInss: number;
  valorMateriaisInss: number;
  valorIss: number;
  baseCalculoIss: number;
  valorContaVinculada: number;
  valorTotalRetido: number;
  valorLiquido: number;
}

export interface ParametrosCalculo {
  tipoDocumento: 'NFE' | 'NFSE';
  numeroNota: string;
  chaveAcesso?: string;
  numeroProcesso?: string;
  numeroEmpenho?: string;
  fornecedorNome: string;
  fornecedorCnpj: string;
  destinatarioNome?: string;
  destinatarioCnpj?: string;
  optanteSimples: boolean;
  situacaoCadastral?: string;
  dataEmissao?: string;
  itens: ItemAnaliseInput[];
  
  // Opções para NFS-e
  codigoServicoPadrao?: string; // Padrão 6190 (9,45%)
  aliqIss?: number; // Padrão 5.0% em Vitória/ES
  percentualReducaoIss?: number; // Ex: 20% para reformas/obras
  retencaoIss?: boolean; // Retido pelo Tomador vs Não Retido
  retencaoInss?: boolean;
  aliqInss?: number; // 11.0% ou 3.5% (CPRB)
  valorMateriaisInss?: number; // Abatimento de materiais da BC do INSS (IN 2.110/2022)
  valorInssDestacado?: number; // Valor preenchido ou lido diretamente da NFS-e
  valorContaVinculada?: number; // Retenção para Conta Vinculada de Mão de Obra (IN 5/2017 SEGES/ME)
  optanteCprb?: boolean;
}

export interface ResultadoConsolidado {
  tipoDocumento: 'NFE' | 'NFSE';
  numeroNota: string;
  chaveAcesso?: string;
  numeroProcesso?: string;
  numeroEmpenho?: string;
  fornecedorNome: string;
  fornecedorCnpj: string;
  destinatarioNome?: string;
  destinatarioCnpj?: string;
  optanteSimples: boolean;
  optanteSimei?: boolean;
  dataOpcaoSimples?: string;
  situacaoCadastral: string;
  fonteConsultaCnpj?: string;
  dataEmissao: string;
  itens: ItemCalculado[];
  
  totalBruto: number;
  totalIr: number;
  totalCsll: number;
  totalCofins: number;
  totalPis: number;
  totalFederal: number;
  totalInss: number;
  baseCalculoInssTotal: number;
  totalMateriaisInssDeducao: number;
  totalIss: number;
  totalContaVinculada: number;
  baseCalculoIssTotal: number;
  percentualReducaoIssAplicado: number;
  issRetidoTomador: boolean;
  totalRetidoGeral: number;
  valorLiquido: number;
  naturezasEFDReinf: { codigo: string; descricao: string; valor: number }[];
  codigosReceitaDarf: { codigo: string; valor: number }[];
  fundamentacaoLegalResumo: string[];
  alertasCriticaFiscal?: string[];

  // Auditoria e Conferência Específica de INSS (11% oficial vs Base Reduzida / CPRB 3,5%)
  auditoriaInss?: {
    aliquotaOficialEsperada: number; // 11% (ou 3,5% se CPRB)
    aliquotaEfetivaSobreTotal: number; // (totalInss / totalBruto) * 100
    valorInssEsperadoTotal: number;
    valorInssDestacado: number;
    correspondeAliquotaOficial: boolean;
    tipoApuracao: 'CONFERE_11_PORCENTO' | 'DIVERGENCIA_BASE_OU_ALIQUOTA' | 'ISENTO_OU_NAO_DESTACADO';
    mensagemAlerta?: string;
  };
}

export class TaxEngine {
  /**
   * Identifica a regra da IN 1234/2012 pelo NCM do item e CST conforme a Lei 10.147/2000 e Decreto 6.426/2008
   */
  public static async identificarRegraNCM(ncmRaw?: string, codigoForcado?: string, cstRaw?: string): Promise<{
    codigoReceita: string;
    naturezaReinf: string;
    condicao: string;
    aliqIr: number;
    aliqCsll: number;
    aliqCofins: number;
    aliqPis: number;
    fundamentacao: string;
  }> {
    const ncm = (ncmRaw || '').replace(/\D/g, '');

    if (codigoForcado === 'ISENTO') {
      return {
        codigoReceita: 'ISENTO',
        naturezaReinf: 'ISENTO',
        condicao: 'Operação Isenta / Imune de Retenção Federal',
        aliqIr: 0,
        aliqCsll: 0,
        aliqCofins: 0,
        aliqPis: 0,
        fundamentacao: 'Operação dispensada / isenta de retenção federal'
      };
    }

    if (codigoForcado === '8767') {
      return {
        codigoReceita: '8767',
        naturezaReinf: '17022',
        condicao: 'Produtos/Serviços com Alíquota Zero de PIS/COFINS (Art. 2º § 5º IN 1234/2012 - 2,20%)',
        aliqIr: 1.20,
        aliqCsll: 1.00,
        aliqCofins: 0.00,
        aliqPis: 0.00,
        fundamentacao: 'Anexo I c/c Art. 2º § 5º da IN RFB nº 1.234/2012 - Código 8767'
      };
    }

    if (codigoForcado === '8739') {
      return {
        codigoReceita: '8739',
        naturezaReinf: '17013',
        condicao: 'Combustíveis e Derivados adquiridos de varejistas/distribuidores (1,24%)',
        aliqIr: 0.24,
        aliqCsll: 1.00,
        aliqCofins: 0.00,
        aliqPis: 0.00,
        fundamentacao: 'Anexo I da IN RFB nº 1.234/2012 - Código 8739'
      };
    }

    if (codigoForcado === '9060') {
      return {
        codigoReceita: '9060',
        naturezaReinf: '17013',
        condicao: 'Combustíveis adquiridos de refinarias/produtores/importadores (4,89%)',
        aliqIr: 0.24,
        aliqCsll: 1.00,
        aliqCofins: 3.00,
        aliqPis: 0.65,
        fundamentacao: 'Anexo I da IN RFB nº 1.234/2012 - Código 9060'
      };
    }

    if (codigoForcado === '6175') {
      return {
        codigoReceita: '6175',
        naturezaReinf: '17023',
        condicao: 'Transporte de passageiros (Passagens aéreas/rodoviárias - 7,05%)',
        aliqIr: 2.40,
        aliqCsll: 1.00,
        aliqCofins: 3.00,
        aliqPis: 0.65,
        fundamentacao: 'Anexo I da IN RFB nº 1.234/2012 - Código 6175'
      };
    }

    if (codigoForcado === '8850') {
      return {
        codigoReceita: '8850',
        naturezaReinf: '17024',
        condicao: 'Transporte internacional de passageiros por empresas nacionais (3,40%)',
        aliqIr: 2.40,
        aliqCsll: 1.00,
        aliqCofins: 0.00,
        aliqPis: 0.00,
        fundamentacao: 'Anexo I da IN RFB nº 1.234/2012 - Código 8850'
      };
    }

    if (codigoForcado === '8863') {
      return {
        codigoReceita: '8863',
        naturezaReinf: '17025',
        condicao: 'Serviços prestados por associações e cooperativas (4,65%)',
        aliqIr: 0.00,
        aliqCsll: 1.00,
        aliqCofins: 3.00,
        aliqPis: 0.65,
        fundamentacao: 'Anexo I da IN RFB nº 1.234/2012 - Código 8863'
      };
    }

    if (codigoForcado === '6188') {
      return {
        codigoReceita: '6188',
        naturezaReinf: '17026',
        condicao: 'Instituições Financeiras e Seguro Saúde (7,05%)',
        aliqIr: 2.40,
        aliqCsll: 1.00,
        aliqCofins: 3.00,
        aliqPis: 0.65,
        fundamentacao: 'Anexo I da IN RFB nº 1.234/2012 - Código 6188'
      };
    }

    if (codigoForcado === '6190') {
      return {
        codigoReceita: '6190',
        naturezaReinf: '17099',
        condicao: 'Prestação de Serviços em Geral (Regra 9,45%)',
        aliqIr: 4.80,
        aliqCsll: 1.00,
        aliqCofins: 3.00,
        aliqPis: 0.65,
        fundamentacao: 'Anexo I da IN RFB nº 1.234/2012 - Código 6190'
      };
    }

    if (codigoForcado === '6147') {
      return {
        codigoReceita: '6147',
        naturezaReinf: '17009',
        condicao: 'Mercadorias, bens em geral e serviços hospitalares/materiais (Regra 5,85%)',
        aliqIr: 1.20,
        aliqCsll: 1.00,
        aliqCofins: 3.00,
        aliqPis: 0.65,
        fundamentacao: 'Anexo I da IN RFB nº 1.234/2012 - Código 6147'
      };
    }

    const fallbackRegraGeral = {
      codigoReceita: '6147',
      naturezaReinf: '17009',
      condicao: 'Mercadorias e bens em geral (Regra Geral 5,85% - IR 1,2% + CSLL 1% + COFINS 3% + PIS 0,65%)',
      aliqIr: 1.20,
      aliqCsll: 1.00,
      aliqCofins: 3.00,
      aliqPis: 0.65,
      fundamentacao: 'Anexo I da IN RFB nº 1.234/2012 - Código 6147'
    };

    if (!ncm) return fallbackRegraGeral;

    try {
      const query = `
        SELECT * FROM ncm_regras 
        WHERE $1 LIKE ncm_prefixo || '%'
        ORDER BY LENGTH(ncm_prefixo) DESC 
        LIMIT 1;
      `;
      const res = await pool.query(query, [ncm]);
      if (res.rows.length > 0) {
        const row = res.rows[0];
        return {
          codigoReceita: row.codigo_receita,
          naturezaReinf: row.natureza_reinf,
          condicao: row.condicao_aplicavel,
          aliqIr: parseFloat(row.aliq_ir),
          aliqCsll: parseFloat(row.aliq_csll),
          aliqCofins: parseFloat(row.aliq_cofins),
          aliqPis: parseFloat(row.aliq_pis),
          fundamentacao: row.fundamentacao_legal || 'Art. 2º § 5º da IN RFB nº 1.234/2012'
        };
      }
    } catch (e) {
      // Fallback em memória
    }

    const ehMedicamentoOuVacina = ncm.startsWith('3001') || ncm.startsWith('3002') || ncm.startsWith('3003') || 
                                  ncm.startsWith('3004') || ncm.startsWith('3005') || ncm.startsWith('3006');
    const ehEquipamentoHospitalar = ncm.startsWith('9018') || ncm.startsWith('9019') || ncm.startsWith('9022');
    
    // Tabela 4.3.13 do SPED / Decreto 6.426/2008 / Grupo 300 - Saúde e Acessibilidade:
    // 8713 e 8714.20 (cadeiras de rodas e partes)
    // 9021.10 (ortopedia/fraturas), 9021.3 (próteses), 9021.40 / 9021.90.82 / 9021.90.92 (auditivos)
    // 9021.90.19 (neuroestimuladores/implantes cocleares)
    const ehAssistivaOuOrtopedicoAliqZero = 
      ncm.startsWith('8713') || ncm.startsWith('871420') ||
      ncm.startsWith('902110') || ncm.startsWith('90213') || 
      ncm.startsWith('902140') || ncm.startsWith('90219082') || 
      ncm.startsWith('90219092') || ncm.startsWith('90219019');

    if (ehMedicamentoOuVacina || ehEquipamentoHospitalar || ehAssistivaOuOrtopedicoAliqZero) {
      return {
        codigoReceita: '8767',
        naturezaReinf: '17022',
        condicao: 'Saúde / Próteses / Aparelhos Ortopédicos / Medicamentos com Alíquota Zero PIS/COFINS (Decreto 6.426/2008 c/c IN 1234/2012)',
        aliqIr: 1.20,
        aliqCsll: 1.00,
        aliqCofins: 0.00,
        aliqPis: 0.00,
        fundamentacao: 'Art. 2º § 5º da IN RFB nº 1.234/2012 c/c Decreto nº 6.426/2008 (Código 8767 - 2,20%)'
      };
    }

    // Energia Elétrica (NCM 2716.00.00) - Código 6147 (5,85%) / Natureza REINF 17002
    if (ncm.startsWith('2716')) {
      return {
        codigoReceita: '6147',
        naturezaReinf: '17002',
        condicao: 'Energia Elétrica (Regra Geral 5,85% - IR 1,2% + CSLL 1% + COFINS 3% + PIS 0,65%)',
        aliqIr: 1.20,
        aliqCsll: 1.00,
        aliqCofins: 3.00,
        aliqPis: 0.65,
        fundamentacao: 'Anexo I da IN RFB nº 1.234/2012 - Código 6147'
      };
    }

    return fallbackRegraGeral;
  }

  /**
   * Identifica a regra para NFS-e (Serviços)
   */
  public static async identificarRegraServico(codigoReceitaEscolhido?: string): Promise<{
    codigoReceita: string;
    naturezaReinf: string;
    condicao: string;
    aliqIr: number;
    aliqCsll: number;
    aliqCofins: number;
    aliqPis: number;
    fundamentacao: string;
  }> {
    const cod = codigoReceitaEscolhido || '6190';

    if (cod === 'ISENTO') {
      return {
        codigoReceita: 'ISENTO',
        naturezaReinf: 'ISENTO',
        condicao: 'Serviço Isento ou Dispensa de Retenção',
        aliqIr: 0,
        aliqCsll: 0,
        aliqCofins: 0,
        aliqPis: 0,
        fundamentacao: 'Operação dispensada / isenta de retenção federal'
      };
    }

    if (cod === '8767') {
      return {
        codigoReceita: '8767',
        naturezaReinf: '17022',
        condicao: 'Serviços/Produtos com Alíquota Zero de PIS/COFINS (2,20%)',
        aliqIr: 1.20,
        aliqCsll: 1.00,
        aliqCofins: 0.00,
        aliqPis: 0.00,
        fundamentacao: 'Anexo I c/c Art. 2º § 5º da IN RFB nº 1.234/2012'
      };
    }

    if (cod === '8739') {
      return {
        codigoReceita: '8739',
        naturezaReinf: '17013',
        condicao: 'Combustíveis e derivados de varejistas (1,24%)',
        aliqIr: 0.24,
        aliqCsll: 1.00,
        aliqCofins: 0.00,
        aliqPis: 0.00,
        fundamentacao: 'Anexo I da IN RFB nº 1.234/2012 - Código 8739'
      };
    }

    if (cod === '6147' || cod === '07.02' || cod === '7.02') {
      return {
        codigoReceita: '6147',
        naturezaReinf: '17003', // Serviços prestados com emprego de materiais / Construção Civil
        condicao: 'Serviços de Engenharia / Obras com Emprego de Materiais / Hospitalares (5,85%)',
        aliqIr: 1.20,
        aliqCsll: 1.00,
        aliqCofins: 3.00,
        aliqPis: 0.65,
        fundamentacao: 'Anexo I da IN RFB nº 1.234/2012 - Código 6147'
      };
    }

    if (cod === '6175') {
      return {
        codigoReceita: '6175',
        naturezaReinf: '17023', // Passagens aéreas, rodoviárias e demais serviços de transporte de passageiros
        condicao: 'Transporte de passageiros ou cargas (7,05%)',
        aliqIr: 2.40,
        aliqCsll: 1.00,
        aliqCofins: 3.00,
        aliqPis: 0.65,
        fundamentacao: 'Anexo I da IN RFB nº 1.234/2012 - Código 6175'
      };
    }

    if (cod === '8850') {
      return {
        codigoReceita: '8850',
        naturezaReinf: '17024',
        condicao: 'Transporte internacional de passageiros (3,40%)',
        aliqIr: 2.40,
        aliqCsll: 1.00,
        aliqCofins: 0.00,
        aliqPis: 0.00,
        fundamentacao: 'Anexo I da IN RFB nº 1.234/2012 - Código 8850'
      };
    }

    if (cod === '8863') {
      return {
        codigoReceita: '8863',
        naturezaReinf: '17025',
        condicao: 'Serviços prestados por cooperativas/associações (4,65%)',
        aliqIr: 0.00,
        aliqCsll: 1.00,
        aliqCofins: 3.00,
        aliqPis: 0.65,
        fundamentacao: 'Anexo I da IN RFB nº 1.234/2012 - Código 8863'
      };
    }

    if (cod === '6188') {
      return {
        codigoReceita: '6188',
        naturezaReinf: '17026',
        condicao: 'Serviços Financeiros e Seguro Saúde (7,05%)',
        aliqIr: 2.40,
        aliqCsll: 1.00,
        aliqCofins: 3.00,
        aliqPis: 0.65,
        fundamentacao: 'Anexo I da IN RFB nº 1.234/2012 - Código 6188'
      };
    }

    // Padrão de serviços gerais sujeito a retenção integral 9,45%: Natureza 17099 (Demais serviços)
    return {
      codigoReceita: '6190',
      naturezaReinf: '17099',
      condicao: 'Demais Serviços em Geral (Regra Padrão 9,45%)',
      aliqIr: 4.80,
      aliqCsll: 1.00,
      aliqCofins: 3.00,
      aliqPis: 0.65,
      fundamentacao: 'Anexo I da IN RFB nº 1.234/2012 - Código 6190'
    };
  }

  /**
   * Executa a análise e consolidação tributária completa de uma nota
   */
  public static async processarNota(params: ParametrosCalculo): Promise<ResultadoConsolidado> {
    const itensCalculados: ItemCalculado[] = [];
    const fundSet = new Set<string>();

    let totalBruto = 0;
    let totalIr = 0;
    let totalCsll = 0;
    let totalCofins = 0;
    let totalPis = 0;
    let totalFederal = 0;
    let totalInss = 0;
    let baseCalculoInssTotal = 0;
    let totalMateriaisInssDeducao = params.valorMateriaisInss || 0;
    let totalIss = 0;
    let baseCalculoIssTotal = 0;
    const totalContaVinculada = params.tipoDocumento === 'NFSE' ? (params.valorContaVinculada || 0) : 0;

    if (totalContaVinculada > 0) {
      fundSet.add('Retenção para Conta-Depósito Vinculada (IN SEGES/ME nº 5/2017 - Provisões Trabalhistas de Mão de Obra)');
    }

    const naturezasMap = new Map<string, { descricao: string; valor: number }>();
    const codigosDarfMap = new Map<string, number>();

    const ehServico = params.tipoDocumento === 'NFSE';
    const percReducaoIss = ehServico ? (params.percentualReducaoIss || 0) : 0;
    const issRetidoTomador = ehServico ? (params.retencaoIss !== undefined ? params.retencaoIss : true) : false;

    for (let i = 0; i < params.itens.length; i++) {
      const itemInput = params.itens[i];
      const valorBruto = itemInput.valorBruto || 0;
      totalBruto += valorBruto;

      let regraTributaria: {
        codigoReceita: string;
        naturezaReinf: string;
        condicao: string;
        aliqIr: number;
        aliqCsll: number;
        aliqCofins: number;
        aliqPis: number;
        fundamentacao: string;
      };

      if (ehServico) {
        regraTributaria = await this.identificarRegraServico(itemInput.codigoServico || params.codigoServicoPadrao || '6190');
        
        // Verificação contextual da descrição do serviço para regras da DDF025:
        const descrLower = (itemInput.descricao || '').toLowerCase();
        if (
          descrLower.includes('dedicação exclusiva de mão de obra') ||
          descrLower.includes('dedicacao exclusiva de mao de obra') ||
          descrLower.includes('dedicação exclusiva') ||
          descrLower.includes('cessão de mão de obra') ||
          descrLower.includes('locação de mão de obra')
        ) {
          regraTributaria = {
            ...regraTributaria,
            codigoReceita: '6190',
            naturezaReinf: '17033', // DDF025: Locação de mão-de-obra / cessão de mão de obra
            condicao: 'Serviço com Cessão / Dedicação Exclusiva de Mão de Obra (DARF 6190 / 9,45%)',
            fundamentacao: 'Anexo I da IN RFB nº 1.234/2012 c/c DDF025 Natureza 17033'
          };
        }
      } else {
        regraTributaria = await this.identificarRegraNCM(itemInput.ncm, itemInput.condicaoEspecial, itemInput.cst);
      }

      let aliqIr = regraTributaria.aliqIr;
      let aliqCsll = regraTributaria.aliqCsll;
      let aliqCofins = regraTributaria.aliqCofins;
      let aliqPis = regraTributaria.aliqPis;

      let condicaoFinal = regraTributaria.condicao;
      let codReceitaFinal = regraTributaria.codigoReceita;
      let natReinfFinal = regraTributaria.naturezaReinf;
      let fundamentacaoItem = regraTributaria.fundamentacao;

      if (params.optanteSimples && itemInput.manualAliqIr === undefined) {
        aliqIr = 0;
        aliqCsll = 0;
        aliqCofins = 0;
        aliqPis = 0;
        condicaoFinal = 'Optante pelo Simples Nacional - Dispensa de Retenção Federal';
        codReceitaFinal = 'ISENTO';
        natReinfFinal = 'ISENTO';
        fundamentacaoItem = 'Art. 4º, Inciso XI da IN RFB nº 1.234/2012 (Dispensa de retenção federal)';
        fundSet.add(fundamentacaoItem);
      } else {
        fundSet.add(fundamentacaoItem);
      }

      // Aplicação de overrides manuais do usuário se definidos na edição inline
      if (itemInput.manualCodigoDarf) {
        codReceitaFinal = itemInput.manualCodigoDarf.trim();
        // Se o código DARF foi alterado manualmente e não houve override manual explícito de cada alíquota,
        // recalcula automaticamente as alíquotas e natureza padrão desse código:
        if (itemInput.manualAliqIr === undefined && itemInput.manualAliqCsll === undefined &&
            itemInput.manualAliqPis === undefined && itemInput.manualAliqCofins === undefined) {
          if (codReceitaFinal === '6147') {
            aliqIr = 1.20;
            aliqCsll = 1.00;
            aliqCofins = 3.00;
            aliqPis = 0.65;
            if (!itemInput.manualNaturezaReinf) natReinfFinal = ehServico ? '17003' : '17009';
            condicaoFinal = 'Mercadorias, bens em geral e serviços hospitalares/materiais (Regra 5,85%)';
            fundamentacaoItem = 'Anexo I da IN RFB nº 1.234/2012 - Código 6147';
          } else if (codReceitaFinal === '6190') {
            aliqIr = 4.80;
            aliqCsll = 1.00;
            aliqCofins = 3.00;
            aliqPis = 0.65;
            if (!itemInput.manualNaturezaReinf) natReinfFinal = '17099';
            condicaoFinal = 'Prestação de Serviços em Geral (Regra 9,45%)';
            fundamentacaoItem = 'Anexo I da IN RFB nº 1.234/2012 - Código 6190';
          } else if (codReceitaFinal === '8767') {
            aliqIr = 1.20;
            aliqCsll = 1.00;
            aliqCofins = 0.00;
            aliqPis = 0.00;
            if (!itemInput.manualNaturezaReinf) natReinfFinal = '17022';
            condicaoFinal = 'Produtos/Serviços com Alíquota Zero de PIS/COFINS (2,20%)';
            fundamentacaoItem = 'Anexo I c/c Art. 2º § 5º da IN RFB nº 1.234/2012 - Código 8767';
          } else if (codReceitaFinal === '6175') {
            aliqIr = 2.40;
            aliqCsll = 1.00;
            aliqCofins = 3.00;
            aliqPis = 0.65;
            if (!itemInput.manualNaturezaReinf) natReinfFinal = '17023';
            condicaoFinal = 'Transporte de passageiros (Passagens aéreas/rodoviárias - 7,05%)';
            fundamentacaoItem = 'Anexo I da IN RFB nº 1.234/2012 - Código 6175';
          } else if (codReceitaFinal === '8739') {
            aliqIr = 0.24;
            aliqCsll = 1.00;
            aliqCofins = 0.00;
            aliqPis = 0.00;
            if (!itemInput.manualNaturezaReinf) natReinfFinal = '17013';
            condicaoFinal = 'Combustíveis e Derivados adquiridos de varejistas/distribuidores (1,24%)';
            fundamentacaoItem = 'Anexo I da IN RFB nº 1.234/2012 - Código 8739';
          } else if (codReceitaFinal === '9060') {
            aliqIr = 0.24;
            aliqCsll = 1.00;
            aliqCofins = 3.00;
            aliqPis = 0.65;
            if (!itemInput.manualNaturezaReinf) natReinfFinal = '17013';
            condicaoFinal = 'Combustíveis adquiridos de refinarias/produtores/importadores (4,89%)';
            fundamentacaoItem = 'Anexo I da IN RFB nº 1.234/2012 - Código 9060';
          } else if (codReceitaFinal === '8850') {
            aliqIr = 2.40;
            aliqCsll = 1.00;
            aliqCofins = 0.00;
            aliqPis = 0.00;
            if (!itemInput.manualNaturezaReinf) natReinfFinal = '17024';
            condicaoFinal = 'Transporte internacional de passageiros por empresas nacionais (3,40%)';
            fundamentacaoItem = 'Anexo I da IN RFB nº 1.234/2012 - Código 8850';
          } else if (codReceitaFinal === '8863') {
            aliqIr = 0.00;
            aliqCsll = 1.00;
            aliqCofins = 3.00;
            aliqPis = 0.65;
            if (!itemInput.manualNaturezaReinf) natReinfFinal = '17025';
            condicaoFinal = 'Serviços prestados por associações e cooperativas (4,65%)';
            fundamentacaoItem = 'Anexo I da IN RFB nº 1.234/2012 - Código 8863';
          } else if (codReceitaFinal === '6188') {
            aliqIr = 2.40;
            aliqCsll = 1.00;
            aliqCofins = 3.00;
            aliqPis = 0.65;
            if (!itemInput.manualNaturezaReinf) natReinfFinal = '17026';
            condicaoFinal = 'Instituições Financeiras e Seguro Saúde (7,05%)';
            fundamentacaoItem = 'Anexo I da IN RFB nº 1.234/2012 - Código 6188';
          } else if (codReceitaFinal === 'ISENTO') {
            aliqIr = 0;
            aliqCsll = 0;
            aliqCofins = 0;
            aliqPis = 0;
            if (!itemInput.manualNaturezaReinf) natReinfFinal = 'ISENTO';
            condicaoFinal = 'Operação Isenta / Imune de Retenção Federal';
            fundamentacaoItem = 'Operação dispensada / isenta de retenção federal';
          }
        }
      }

      if (itemInput.manualAliqIr !== undefined) aliqIr = itemInput.manualAliqIr;
      if (itemInput.manualAliqCsll !== undefined) aliqCsll = itemInput.manualAliqCsll;
      if (itemInput.manualAliqCofins !== undefined) aliqCofins = itemInput.manualAliqCofins;
      if (itemInput.manualAliqPis !== undefined) aliqPis = itemInput.manualAliqPis;
      if (itemInput.manualNaturezaReinf) natReinfFinal = itemInput.manualNaturezaReinf;
      if (itemInput.manualFundamentacao) fundamentacaoItem = itemInput.manualFundamentacao;

      // 1. INSS / Contribuição Previdenciária com suporte a Abatimento de Materiais e Equipamentos (IN 2.110/2022)
      let aliqInss = 0;
      let valorInss = 0;
      let baseCalculoInss = valorBruto;
      const deduMateriaisInssItem = i === 0 ? totalMateriaisInssDeducao : 0;

      if (ehServico) {
        if (params.valorInssDestacado && params.valorInssDestacado > 0 && !params.retencaoInss) {
          valorInss = params.valorInssDestacado;
          aliqInss = valorBruto > 0 ? Number(((valorInss / valorBruto) * 100).toFixed(2)) : 0;
          fundSet.add('Art. 111 e 112 da IN RFB nº 2.110/2022 (INSS / Contribuição Previdenciária Retida)');
        } else if (params.retencaoInss || itemInput.codigoServico?.includes('MAO_OBRA') || itemInput.codigoServico?.includes('07.02') || itemInput.codigoServico?.includes('7.02')) {
          baseCalculoInss = Math.max(0, valorBruto - deduMateriaisInssItem);
          aliqInss = params.optanteCprb ? 3.50 : (params.aliqInss || 11.00);
          valorInss = Number(((baseCalculoInss * aliqInss) / 100).toFixed(2));

          const fundInss = params.optanteCprb 
            ? 'Art. 9º-A da Lei nº 12.546/2011 c/c Lei nº 14.973/2024 (CPRB - 3,5%)' 
            : (deduMateriaisInssItem > 0 
                ? `Art. 120 e 121 da IN RFB nº 2.110/2022 (INSS 11% sobre BC reduzida por materiais R$ ${deduMateriaisInssItem.toFixed(2)})` 
                : 'Art. 111 e 112 da IN RFB nº 2.110/2022 (INSS 11% Cessão Mão de Obra)');
          fundSet.add(fundInss);
        }
      }

      if (itemInput.manualAliqInss !== undefined) {
        aliqInss = itemInput.manualAliqInss;
        valorInss = Number(((baseCalculoInss * aliqInss) / 100).toFixed(2));
      }

      baseCalculoInssTotal += baseCalculoInss;

      // 2. ISSQN (Municipal com suporte à Redução de Base de Cálculo em Vitória/ES)
      let aliqIss = 0;
      let valorIss = 0;
      let baseCalculoIss = valorBruto;

      if (ehServico) {
        baseCalculoIss = Number((valorBruto * (1 - percReducaoIss / 100)).toFixed(2));
        aliqIss = params.aliqIss !== undefined ? params.aliqIss : 5.00;

        if (issRetidoTomador) {
          valorIss = Number(((baseCalculoIss * aliqIss) / 100).toFixed(2));
        }

        if (percReducaoIss > 0) {
          fundSet.add(`Redução de Base do ISSQN (${percReducaoIss}%) c/c Código Tributário de Vitória/ES (Lei Municipal nº 6.075/2003)`);
        } else {
          fundSet.add('Código Tributário de Vitória/ES (Lei Municipal nº 6.075/2003) c/c LC nº 116/2003');
        }
      }

      if (itemInput.manualAliqIss !== undefined) {
        aliqIss = itemInput.manualAliqIss;
        valorIss = Number(((baseCalculoIss * aliqIss) / 100).toFixed(2));
      }

      baseCalculoIssTotal += baseCalculoIss;

      const aliqTotalFederal = Number((aliqIr + aliqCsll + aliqCofins + aliqPis).toFixed(2));
      const aliqTotalGeral = Number((aliqTotalFederal + aliqInss + (issRetidoTomador ? aliqIss : 0)).toFixed(2));

      const valorIr = Number(((valorBruto * aliqIr) / 100).toFixed(2));
      const valorCsll = Number(((valorBruto * aliqCsll) / 100).toFixed(2));
      const valorCofins = Number(((valorBruto * aliqCofins) / 100).toFixed(2));
      const valorPis = Number(((valorBruto * aliqPis) / 100).toFixed(2));
      const valorFederalTotal = Number((valorIr + valorCsll + valorCofins + valorPis).toFixed(2));

      const valorTotalRetido = Number((valorFederalTotal + valorInss + valorIss + (i === 0 ? totalContaVinculada : 0)).toFixed(2));
      const valorLiquido = Number((valorBruto - valorTotalRetido).toFixed(2));

      totalIr += valorIr;
      totalCsll += valorCsll;
      totalCofins += valorCofins;
      totalPis += valorPis;
      totalFederal += valorFederalTotal;
      totalInss += valorInss;
      totalIss += valorIss;

      if (!params.optanteSimples && codReceitaFinal !== 'ISENTO') {
        codigosDarfMap.set(codReceitaFinal, (codigosDarfMap.get(codReceitaFinal) || 0) + valorFederalTotal);
        naturezasMap.set(natReinfFinal, {
          descricao: condicaoFinal,
          valor: (naturezasMap.get(natReinfFinal)?.valor || 0) + valorBruto
        });
      }

      // Validação de compatibilidade fiscal entre Natureza de Rendimento e Código DARF (IN 1234 e EFD-Reinf DDF025)
      const mapaNaturezaParaDarfOficial: Record<string, string> = {
        '17001': '6147', '17002': '6147', '17003': '6147', '17004': '6147', '17005': '6147', '17006': '6147', '17007': '6147', '17008': '6147', '17009': '6147',
        '17013': '8739', '17014': '8739', '17015': '8739',
        '17019': '8767', '17020': '8767', '17021': '8767', '17022': '8767',
        '17023': '6175',
        '17024': '8850',
        '17025': '8863',
        '17026': '6188', '17027': '6188',
        '17028': '6190', '17029': '6190', '17030': '6190', '17031': '6190', '17032': '6190', '17033': '6190', '17034': '6190', '17035': '6190', '17037': '6190', '17050': '6190', '17099': '6190',
        'ISENTO': 'ISENTO'
      };

      let alertaIncompatibilidadeItem: string | undefined = undefined;
      const darfEsperado = mapaNaturezaParaDarfOficial[natReinfFinal];
      if (darfEsperado && darfEsperado !== codReceitaFinal && !(darfEsperado === '8739' && codReceitaFinal === '9060')) {
        alertaIncompatibilidadeItem = `A Natureza de Rendimento ${natReinfFinal} exige o Código DARF ${darfEsperado}, mas está configurado o DARF ${codReceitaFinal}.`;
      }

      itensCalculados.push({
        numeroItem: itemInput.numeroItem || (i + 1),
        descricao: itemInput.descricao || (ehServico ? 'Serviço prestado' : 'Mercadoria adquirida'),
        ncm: itemInput.ncm || '',
        cst: itemInput.cst || '01',
        codigoServico: itemInput.codigoServico,
        valorBruto,
        condicaoAplicavel: condicaoFinal,
        codigoReceitaDarf: codReceitaFinal,
        naturezaRendimentoReinf: natReinfFinal,
        fundamentacaoLegal: fundamentacaoItem,
        alertaIncompatibilidade: alertaIncompatibilidadeItem,
        aliqIr,
        aliqCsll,
        aliqCofins,
        aliqPis,
        aliqInss,
        aliqIss,
        aliqTotalFederal,
        aliqTotalGeral,
        valorIr,
        valorCsll,
        valorCofins,
        valorPis,
        valorFederalTotal,
        valorInss,
        baseCalculoInss,
        valorMateriaisInss: deduMateriaisInssItem,
        valorIss,
        baseCalculoIss,
        valorContaVinculada: i === 0 ? totalContaVinculada : 0,
        valorTotalRetido,
        valorLiquido
      });
    }

    const totalRetidoGeral = Number((totalFederal + totalInss + totalIss + totalContaVinculada).toFixed(2));
    const valorLiquidoTotal = Number((totalBruto - totalRetidoGeral).toFixed(2));

    const naturezasEFDReinf = Array.from(naturezasMap.entries()).map(([codigo, val]) => ({
      codigo,
      descricao: val.descricao,
      valor: Number(val.valor.toFixed(2))
    }));

    const codigosReceitaDarf = Array.from(codigosDarfMap.entries()).map(([codigo, valor]) => ({
      codigo,
      valor: Number(valor.toFixed(2))
    }));

    // Auditoria e Conferência de INSS (11% oficial vs Redução de Base / CPRB)
    let auditoriaInss: ResultadoConsolidado['auditoriaInss'] = undefined;
    if (ehServico && (totalInss > 0 || params.retencaoInss || (params.valorInssDestacado && params.valorInssDestacado > 0))) {
      const aliqEsperada = params.optanteCprb ? 3.50 : 11.00;
      const valorEsperadoIntegral = Number(((totalBruto * aliqEsperada) / 100).toFixed(2));
      const aliqEfetiva = totalBruto > 0 ? Number(((totalInss / totalBruto) * 100).toFixed(2)) : 0;
      
      // Margem de tolerância de arredondamento de centavos (R$ 0,05)
      const diferencaCentavos = Math.abs(totalInss - valorEsperadoIntegral);
      const confereIntegral = diferencaCentavos <= 0.05;

      let tipoApuracao: 'CONFERE_11_PORCENTO' | 'DIVERGENCIA_BASE_OU_ALIQUOTA' | 'ISENTO_OU_NAO_DESTACADO' = 'CONFERE_11_PORCENTO';
      let mensagemAlerta: string | undefined = undefined;

      if (confereIntegral) {
        tipoApuracao = 'CONFERE_11_PORCENTO';
        mensagemAlerta = `✓ Conferência realizada: O valor destacado de INSS (R$ ${totalInss.toFixed(2)}) corresponde exatamente à alíquota oficial integral de ${aliqEsperada}% sobre o total da nota fiscal (R$ ${totalBruto.toFixed(2)}).`;
      } else {
        tipoApuracao = 'DIVERGENCIA_BASE_OU_ALIQUOTA';
        if (totalMateriaisInssDeducao > 0) {
          mensagemAlerta = `⚠️ Atenção Fiscal: O valor de INSS retido (R$ ${totalInss.toFixed(2)} • alíq. efetiva ${aliqEfetiva}%) é menor que 11% integral (R$ ${valorEsperadoIntegral.toFixed(2)}) devido à Dedução de Materiais/Equipamentos da Base de Cálculo (R$ ${totalMateriaisInssDeducao.toFixed(2)} conf. Art. 120 e 121 da IN RFB nº 2.110/2022).`;
        } else if (params.optanteCprb) {
          mensagemAlerta = `ℹ️ Empresa Optante pela CPRB: Alíquota de INSS apurada a 3,5% conforme Art. 9º-A da Lei nº 12.546/2011 (R$ ${totalInss.toFixed(2)}).`;
        } else {
          mensagemAlerta = `⚠️ Alerta de Divergência no INSS: O valor destacado na nota fiscal (R$ ${totalInss.toFixed(2)}) NÃO corresponde à alíquota de 11% integral do total da nota (R$ ${valorEsperadoIntegral.toFixed(2)}). Alíquota efetiva apurada: ${aliqEfetiva}%. Verifique se há dedução de materiais/equipamentos da base de cálculo, contrato com cessão parcial de mão de obra ou enquadramento em CPRB.`;
        }
      }

      auditoriaInss = {
        aliquotaOficialEsperada: aliqEsperada,
        aliquotaEfetivaSobreTotal: aliqEfetiva,
        valorInssEsperadoTotal: valorEsperadoIntegral,
        valorInssDestacado: totalInss,
        correspondeAliquotaOficial: confereIntegral,
        tipoApuracao,
        mensagemAlerta
      };
    }

    return {
      tipoDocumento: params.tipoDocumento,
      numeroNota: params.numeroNota,
      chaveAcesso: params.chaveAcesso,
      numeroProcesso: params.numeroProcesso,
      numeroEmpenho: params.numeroEmpenho,
      fornecedorNome: params.fornecedorNome,
      fornecedorCnpj: params.fornecedorCnpj,
      destinatarioNome: params.destinatarioNome,
      destinatarioCnpj: params.destinatarioCnpj,
      optanteSimples: params.optanteSimples,
      situacaoCadastral: params.situacaoCadastral || 'ATIVA',
      dataEmissao: params.dataEmissao || new Date().toISOString().split('T')[0],
      itens: itensCalculados,
      totalBruto: Number(totalBruto.toFixed(2)),
      totalIr: Number(totalIr.toFixed(2)),
      totalCsll: Number(totalCsll.toFixed(2)),
      totalCofins: Number(totalCofins.toFixed(2)),
      totalPis: Number(totalPis.toFixed(2)),
      totalFederal: Number(totalFederal.toFixed(2)),
      totalInss: Number(totalInss.toFixed(2)),
      baseCalculoInssTotal: Number(baseCalculoInssTotal.toFixed(2)),
      totalMateriaisInssDeducao: Number(totalMateriaisInssDeducao.toFixed(2)),
      totalIss: Number(totalIss.toFixed(2)),
      totalContaVinculada: Number(totalContaVinculada.toFixed(2)),
      baseCalculoIssTotal: Number(baseCalculoIssTotal.toFixed(2)),
      percentualReducaoIssAplicado: percReducaoIss,
      issRetidoTomador,
      totalRetidoGeral,
      valorLiquido: valorLiquidoTotal,
      naturezasEFDReinf,
      codigosReceitaDarf,
      fundamentacaoLegalResumo: Array.from(fundSet),
      alertasCriticaFiscal: itensCalculados
        .filter(it => Boolean(it.alertaIncompatibilidade))
        .map(it => `Item #${it.numeroItem}: ${it.alertaIncompatibilidade}`),
      auditoriaInss
    };
  }
}
