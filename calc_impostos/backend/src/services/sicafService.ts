export interface DadosSicafConsulta {
  encontrado: boolean;
  ativo: boolean;
  habilitadoLicitar: boolean;
  cnpj: string;
  nomeRazaoSocial?: string;
  nomeMunicipio?: string;
  ufSigla?: string;
  codigoCnae?: number;
  nomeCnae?: string;
  naturezaJuridicaNome?: string;
  porteEmpresaNome?: string;
  consultadoEm: string;
  fonteConsulta: string;
  mensagem: string;
  codigoAutenticidade?: string;
  falhaConexao?: boolean;
  status?: 'HABILITADO' | 'COM_RESTRICAO' | 'NAO_CADASTRADO' | 'INDISPONIVEL';
}

export class SicafService {
  // Cache em memória com TTL de 30 minutos para evitar chamadas redundantes e respeitar limites de taxa
  private static cacheMemoria = new Map<string, { dados: DadosSicafConsulta; expiraEm: number }>();
  private static TTL_CACHE_MS = 30 * 60 * 1000; // 30 minutos

  public static normalizarCnpj(cnpj?: string): string {
    return (cnpj || '').replace(/\D/g, '');
  }

  private static gerarHashAutenticidade(cnpj: string, timestamp: string): string {
    let hash = 0;
    const str = `${cnpj}_${timestamp}_SICAF_COMPRAS_GOV_BR`;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    const hex = Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
    return `${hex.slice(0, 4)}.${hex.slice(4, 8)}.${cnpj.slice(0, 4)}.${cnpj.slice(-4)}`;
  }

  /**
   * Consulta pública individual ao SICAF via API Oficial de Dados Abertos do Compras.gov.br
   */
  public static async consultarSicaf(cnpjRaw: string): Promise<DadosSicafConsulta> {
    const cnpj = this.normalizarCnpj(cnpjRaw);
    const agora = Date.now();
    const dataIso = new Date().toISOString();

    if (!cnpj || cnpj.length !== 14) {
      return {
        encontrado: false,
        ativo: false,
        habilitadoLicitar: false,
        status: 'NAO_CADASTRADO',
        cnpj: cnpjRaw || '',
        consultadoEm: dataIso,
        fonteConsulta: 'SICAF / Compras.gov.br',
        mensagem: 'CNPJ inválido ou não informado para consulta ao SICAF.'
      };
    }

    // Verifica cache em memória
    const cacheItem = this.cacheMemoria.get(cnpj);
    if (cacheItem && cacheItem.expiraEm > agora) {
      return cacheItem.dados;
    }

    try {
      const url = `https://dadosabertos.compras.gov.br/modulo-fornecedor/1_consultarFornecedor?ativo=true&cnpj=${cnpj}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000); // 12 segundos de timeout resiliente

      const res = await fetch(url, {
        headers: { 'accept': 'application/json' },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const json: any = await res.json();
        const lista = json.resultado || [];

        if (Array.isArray(lista) && lista.length > 0) {
          const item = lista[0];
          const hashAuth = this.gerarHashAutenticidade(cnpj, dataIso);
          const habilitado = Boolean(item.habilitadoLicitar);
          const dados: DadosSicafConsulta = {
            encontrado: true,
            ativo: Boolean(item.ativo),
            habilitadoLicitar: habilitado,
            status: habilitado ? 'HABILITADO' : 'COM_RESTRICAO',
            cnpj: item.cnpj || cnpj,
            nomeRazaoSocial: item.nomeRazaoSocialFornecedor,
            nomeMunicipio: item.nomeMunicipio,
            ufSigla: item.ufSigla,
            codigoCnae: item.codigoCnae,
            nomeCnae: item.nomeCnae,
            naturezaJuridicaNome: item.naturezaJuridicaNome,
            porteEmpresaNome: item.porteEmpresaNome,
            consultadoEm: dataIso,
            fonteConsulta: 'Dados Abertos Compras.gov.br / Sistema SICAF',
            codigoAutenticidade: hashAuth,
            mensagem: habilitado
              ? 'Fornecedor Ativo e Habilitado para Licitar / Contratar no SICAF (Sem Impedimentos)'
              : 'Fornecedor Cadastrado no SICAF com Restrição Impeditiva Operacional'
          };

          this.cacheMemoria.set(cnpj, { dados, expiraEm: agora + this.TTL_CACHE_MS });
          return dados;
        }
      }

      // Se não encontrou registro ativo
      const dadosNaoEncontrado: DadosSicafConsulta = {
        encontrado: false,
        ativo: false,
        habilitadoLicitar: false,
        status: 'NAO_CADASTRADO',
        cnpj,
        consultadoEm: dataIso,
        fonteConsulta: 'Dados Abertos Compras.gov.br / Sistema SICAF',
        codigoAutenticidade: this.gerarHashAutenticidade(cnpj, dataIso),
        mensagem: 'Fornecedor não localizado na base ativa de credenciamento do SICAF.'
      };
      this.cacheMemoria.set(cnpj, { dados: dadosNaoEncontrado, expiraEm: agora + this.TTL_CACHE_MS });
      return dadosNaoEncontrado;

    } catch (err: any) {
      console.warn(`[SICAF] Falha ou timeout na consulta do CNPJ ${cnpj}:`, err.message);
      // Não salva no cache para permitir que nova tentativa imediata funcione
      return {
        encontrado: false,
        ativo: false,
        habilitadoLicitar: false,
        falhaConexao: true,
        status: 'INDISPONIVEL',
        cnpj,
        consultadoEm: dataIso,
        fonteConsulta: 'Dados Abertos Compras.gov.br / Sistema SICAF',
        mensagem: 'Serviço de Dados Abertos do Compras.gov.br indisponível ou tempo de resposta excedido no momento.'
      };
    }
  }

  /**
   * Consulta pública em lote com paralelismo controlado (chunks de 3) para respeitar limites de taxa
   */
  public static async consultarEmLote(cnpjs: string[]): Promise<Map<string, DadosSicafConsulta>> {
    const mapa = new Map<string, DadosSicafConsulta>();
    const unicos = Array.from(new Set(cnpjs.map(c => this.normalizarCnpj(c)).filter(c => c.length === 14)));

    // Processa em blocos de 3 requisições simultâneas
    const tamanhoBloco = 3;
    for (let i = 0; i < unicos.length; i += tamanhoBloco) {
      const bloco = unicos.slice(i, i + tamanhoBloco);
      const promessas = bloco.map(cnpj => this.consultarSicaf(cnpj));
      const resultados = await Promise.allSettled(promessas);

      resultados.forEach((res, idx) => {
        const cnpjAtual = bloco[idx];
        if (res.status === 'fulfilled') {
          mapa.set(cnpjAtual, res.value);
        } else {
          mapa.set(cnpjAtual, {
            encontrado: false,
            ativo: false,
            habilitadoLicitar: false,
            cnpj: cnpjAtual,
            consultadoEm: new Date().toISOString(),
            fonteConsulta: 'Dados Abertos Compras.gov.br / Sistema SICAF',
            mensagem: 'Erro ao conectar à API do SICAF.'
          });
        }
      });
    }

    return mapa;
  }
}
