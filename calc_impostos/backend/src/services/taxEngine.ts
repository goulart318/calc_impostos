import { pool } from '../config/db';

export interface ItemAnaliseInput {
  numeroItem: number;
  descricao: string;
  ncm?: string;
  cst?: string;
  codigoServico?: string;
  valorBruto: number;
  condicaoEspecial?: string;
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

    if (codigoForcado === '8767') {
      return {
        codigoReceita: '8767',
        naturezaReinf: '17022',
        condicao: 'Produtos com Alíquota Zero / Monofásico de PIS e COFINS (Art. 2º § 5º IN 1234/2012)',
        aliqIr: 1.20,
        aliqCsll: 1.00,
        aliqCofins: 0.00,
        aliqPis: 0.00,
        fundamentacao: 'Art. 2º § 5º da IN RFB nº 1.234/2012 c/c Lei 10.147/2000 (Código 8767)'
      };
    }

    if (codigoForcado === '6147') {
      return {
        codigoReceita: '6147',
        naturezaReinf: '17099',
        condicao: 'Mercadorias e bens em geral (Regra Geral 5,85% com PIS/COFINS)',
        aliqIr: 1.20,
        aliqCsll: 1.00,
        aliqCofins: 3.00,
        aliqPis: 0.65,
        fundamentacao: 'Anexo I da IN RFB nº 1.234/2012 - Código 6147'
      };
    }

    const fallbackRegraGeral = {
      codigoReceita: '6147',
      naturezaReinf: '17099',
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
    const ehCateterAgulhaSeringa = ncm.startsWith('901831') || ncm.startsWith('901832') || ncm.startsWith('901839');

    if (ehMedicamentoOuVacina || ehCateterAgulhaSeringa) {
      return {
        codigoReceita: '8767',
        naturezaReinf: '17022',
        condicao: 'Medicamentos / Cateteres / Materiais de Alíquota Zero PIS/COFINS (Lei 10.147/2000)',
        aliqIr: 1.20,
        aliqCsll: 1.00,
        aliqCofins: 0.00,
        aliqPis: 0.00,
        fundamentacao: 'Art. 2º § 5º da IN RFB nº 1.234/2012 c/c Lei 10.147/2000 (Código 8767)'
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

    if (cod === '6147' || cod === '07.02' || cod === '7.02') {
      return {
        codigoReceita: '6147',
        naturezaReinf: '17099',
        condicao: 'Serviços de Engenharia / Construção com Emprego de Materiais (5,85%)',
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
        naturezaReinf: '17009',
        condicao: 'Transporte de passageiros (7,05%)',
        aliqIr: 2.40,
        aliqCsll: 1.00,
        aliqCofins: 3.00,
        aliqPis: 0.65,
        fundamentacao: 'Anexo I da IN RFB nº 1.234/2012 - Código 6175'
      };
    }

    return {
      codigoReceita: '6190',
      naturezaReinf: '17006',
      condicao: 'Prestação de Serviços em Geral (Regra Padrão 9,45%)',
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

      if (params.optanteSimples) {
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

      baseCalculoIssTotal += baseCalculoIss;

      const aliqTotalFederal = aliqIr + aliqCsll + aliqCofins + aliqPis;
      const aliqTotalGeral = aliqTotalFederal + aliqInss + (issRetidoTomador ? aliqIss : 0);

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

    return {
      tipoDocumento: params.tipoDocumento,
      numeroNota: params.numeroNota,
      chaveAcesso: params.chaveAcesso,
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
      fundamentacaoLegalResumo: Array.from(fundSet)
    };
  }
}
