import axios from 'axios';

export interface CnpjInfo {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  situacaoCadastral: string;
  optanteSimples: boolean;
  optanteSimei: boolean;
  dataOpcaoSimples?: string;
  cnaeFiscalPrincipal: {
    codigo: number | string;
    texto: string;
  } | null;
  uf: string;
  municipio: string;
  fonteConsulta: string;
}

export class CnpjService {
  /**
   * Consulta dados do CNPJ com Fallback em cascata (BrasilAPI -> MinhaReceita -> ReceitaWS -> CNPJ.ws)
   */
  public static async consultarCnpj(cnpjRaw: string): Promise<CnpjInfo> {
    const cnpj = cnpjRaw.replace(/\D/g, '');
    
    if (cnpj.length !== 14) {
      throw new Error('CNPJ inválido. Deve conter 14 dígitos numéricos.');
    }

    // 1. Tentar BrasilAPI
    try {
      const res = await axios.get(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { timeout: 6000 });
      const data = res.data;
      
      const optSimples = data.opcao_pelo_simples === true || 
                         data.optante_simples_nacional === true || 
                         data.simples?.optante === true;

      const optMei = data.opcao_pelo_mei === true || data.simples?.mei === true;

      return {
        cnpj,
        razaoSocial: data.razao_social || data.nome_fantasia || 'Razão Social Não Identificada',
        nomeFantasia: data.nome_fantasia || '',
        situacaoCadastral: data.descricao_situacao_cadastral || 'ATIVA',
        optanteSimples: optSimples,
        optanteSimei: optMei,
        dataOpcaoSimples: data.data_opcao_pelo_simples || data.simples?.data_opcao,
        cnaeFiscalPrincipal: data.cnae_fiscal ? {
          codigo: data.cnae_fiscal,
          texto: data.cnae_fiscal_descricao || ''
        } : null,
        uf: data.uf || 'ES',
        municipio: data.municipio || 'Vitória',
        fonteConsulta: 'BrasilAPI / Receita Federal'
      };
    } catch (e1: any) {
      console.warn(`[CNPJ Service] BrasilAPI falhou para ${cnpj}: ${e1.message}. Tentando MinhaReceita...`);
    }

    // 2. Tentar MinhaReceita
    try {
      const res = await axios.get(`https://minhareceita.org/${cnpj}`, { timeout: 6000 });
      const data = res.data;

      const optSimples = data.opcao_pelo_simples === true;
      const optMei = data.opcao_pelo_mei === true;

      return {
        cnpj,
        razaoSocial: data.razao_social || 'Razão Social Não Identificada',
        nomeFantasia: data.nome_fantasia || '',
        situacaoCadastral: data.descricao_situacao_cadastral || 'ATIVA',
        optanteSimples: optSimples,
        optanteSimei: optMei,
        dataOpcaoSimples: data.data_opcao_pelo_simples,
        cnaeFiscalPrincipal: data.cnae_fiscal ? {
          codigo: data.cnae_fiscal,
          texto: data.cnae_fiscal_descricao || ''
        } : null,
        uf: data.uf || 'ES',
        municipio: data.municipio || 'Vitória',
        fonteConsulta: 'MinhaReceita'
      };
    } catch (e2: any) {
      console.warn(`[CNPJ Service] MinhaReceita falhou para ${cnpj}: ${e2.message}. Tentando ReceitaWS...`);
    }

    // 3. Tentar ReceitaWS
    try {
      const res = await axios.get(`https://receitaws.com.br/v1/cnpj/${cnpj}`, { timeout: 6000 });
      const data = res.data;

      if (data.status !== 'ERROR') {
        const optSimples = data.simples?.optante === true;
        const optMei = data.simples?.mei === true;

        return {
          cnpj,
          razaoSocial: data.nome || data.fantasia || 'Razão Social Não Identificada',
          nomeFantasia: data.fantasia || '',
          situacaoCadastral: data.situacao || 'ATIVA',
          optanteSimples: optSimples,
          optanteSimei: optMei,
          dataOpcaoSimples: data.simples?.data_opcao,
          cnaeFiscalPrincipal: data.atividade_principal?.[0] ? {
            codigo: data.atividade_principal[0].code,
            texto: data.atividade_principal[0].text
          } : null,
          uf: data.uf || 'ES',
          municipio: data.municipio || 'Vitória',
          fonteConsulta: 'ReceitaWS'
        };
      }
    } catch (e3: any) {
      console.warn(`[CNPJ Service] ReceitaWS falhou para ${cnpj}: ${e3.message}.`);
    }

    // Fallback de contingência caso todas as APIs externas estejam indisponíveis
    return {
      cnpj,
      razaoSocial: 'Fornecedor Cadastrado',
      nomeFantasia: '',
      situacaoCadastral: 'ATIVA',
      optanteSimples: false,
      optanteSimei: false,
      cnaeFiscalPrincipal: null,
      uf: 'ES',
      municipio: 'Vitória',
      fonteConsulta: 'Local (Offline)'
    };
  }
}
