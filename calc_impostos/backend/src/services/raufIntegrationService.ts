import { Pool } from 'pg';
import { pool as defaultPool } from '../config/db';
import { ResultadoConsolidado } from './taxEngine';

/**
 * Serviço de Integração Direta com o banco de dados / API do Rauf_App.
 * Executa gravação na tabela 'retencoes_calc_impostos' para que o Rauf_App
 * possa realizar a conciliação documental entre a Ordem Bancária (OB),
 * o Documento Hábil (DH/NS/NL) e a Memória de Cálculo de Retenções do SEI.
 * 
 * Arquitetura Híbrida Resiliente:
 * 1. Suporta conexão direta com o PostgreSQL do Supabase (via RAUF_DATABASE_URL).
 * 2. Suporta conexão via API REST do Rauf SaaS (via RAUF_API_URL / Render).
 */
export class RaufIntegrationService {
  private static raufPool: Pool | null = null;

  private static getApiUrl(): string {
    return (process.env.RAUF_API_URL || 'https://rauf-app-backend.onrender.com').replace(/\/$/, '');
  }

  /**
   * Obtém a conexão com o banco de dados do Rauf_App.
   * Se RAUF_DATABASE_URL estiver configurada no .env (ex: Supabase do Rauf), utiliza essa conexão direta.
   */
  private static getPool(): Pool | null {
    if (process.env.RAUF_DATABASE_URL) {
      if (!this.raufPool) {
        this.raufPool = new Pool({
          connectionString: process.env.RAUF_DATABASE_URL,
          ssl: { rejectUnauthorized: false },
          max: 5,
          idleTimeoutMillis: 30000,
        });
        console.log(' Conexão dedicada configurada para o banco do Rauf_App (Supabase/PostgreSQL).');
      }
      return this.raufPool;
    }
    return null;
  }

  /**
   * Lista as instituições cadastradas no Rauf SaaS (Supabase).
   * 1º Tenta via conexão PostgreSQL direta (se RAUF_DATABASE_URL estiver presente).
   * 2º Tenta via API REST pública do Rauf (/retencoes/instituicoes).
   * 3º Fallback de contingência caso os canais estejam temporariamente inacessíveis.
   */
  public static async listarInstituicoesRauf(): Promise<Array<{
    id: number;
    nome: string;
    cnpj: string;
    uasg: string;
    sigla: string;
    municipio?: string;
  }>> {
    // 1. Tentativa via banco direto
    const activePool = this.getPool();
    if (activePool) {
      try {
        const res = await activePool.query(
          `SELECT id, nome, cnpj, uasg, sigla 
           FROM instituicoes 
           ORDER BY nome ASC;`
        );
        if (res.rows && res.rows.length > 0) {
          return res.rows.map(r => ({
            id: r.id,
            nome: r.nome || '',
            cnpj: r.cnpj || '',
            uasg: r.uasg || '',
            sigla: r.sigla || '',
            municipio: 'Vitória'
          }));
        }
      } catch (err: any) {
        console.warn('⚠️ [RaufIntegrationService] Falha na consulta direta via DB:', err.message || err);
      }
    }

    // 2. Tentativa via API REST do Rauf SaaS (Render)
    const apiUrl = this.getApiUrl();
    try {
      const resp = await fetch(`${apiUrl}/retencoes/instituicoes`, {
        signal: AbortSignal.timeout(8000)
      });
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data) && data.length > 0) {
          return data.map((r: any) => ({
            id: r.id,
            nome: r.nome || '',
            cnpj: r.cnpj || '',
            uasg: r.uasg || '',
            sigla: r.sigla || '',
            municipio: r.municipio || 'Vitória'
          }));
        }
      }
    } catch (apiErr: any) {
      console.warn('⚠️ [RaufIntegrationService] Falha na consulta via API REST do Rauf:', apiErr.message || apiErr);
    }

    // 3. Fallback de contingência padrão
    return [
      {
        id: 1,
        nome: 'EMPRESA BRASILEIRA DE SERVICOS HOSPITALARES - EBSERH',
        cnpj: '15.126.437/0006-58',
        uasg: '155007',
        sigla: 'HUCAM-UFES',
        municipio: 'Vitória'
      }
    ];
  }

  /**
   * Insere ou atualiza o registro de retenções na tabela 'retencoes_calc_impostos'.
   * Chave composta: (numero_processo, documento_habil, numero_nota).
   * Registra instituicao_id e uasg para isolamento multi-tenant no Rauf SaaS.
   */
  public static async inserirOuAtualizarRetencao(r: ResultadoConsolidado): Promise<{
    sucesso: boolean;
    id?: number;
    mensagem: string;
    ignorado?: boolean;
  }> {
    const proc = (r.numeroProcesso || '').trim();
    const docHab = (r.documentoHabil || '').trim();
    const nota = (r.numeroNota || '').trim();

    // Requer ao menos processo e documento hábil preenchidos para compor a chave com o Rauf
    if (!proc || !docHab) {
      return {
        sucesso: false,
        ignorado: true,
        mensagem: 'Nota fiscal sem Número do Processo ou Documento Hábil preenchido. Integração com Rauf_App pendente.'
      };
    }

    const detalhamento = {
      ir: Number(r.totalIr) || 0,
      csll: Number(r.totalCsll) || 0,
      cofins: Number(r.totalCofins) || 0,
      pis: Number(r.totalPis) || 0,
      inss: Number(r.totalInss) || 0,
      iss: Number(r.totalIss) || 0,
      totalContaVinculada: Number(r.totalContaVinculada) || 0,
      codigosReceitaDarf: r.codigosReceitaDarf || [],
      naturezasEFDReinf: r.naturezasEFDReinf || [],
      fundamentacaoLegal: r.fundamentacaoLegalResumo || [],
      optanteSimples: Boolean(r.optanteSimples),
      dataEmissao: r.dataEmissao || null,
      tipoDocumento: r.tipoDocumento,
      itensResumo: (r.itens || []).map(it => ({
        numeroItem: it.numeroItem,
        descricao: it.descricao,
        ncm: it.ncm,
        valorBruto: it.valorBruto,
        valorRetido: it.valorTotalRetido,
        darf: it.codigoReceitaDarf
      }))
    };

    // 1. Tenta inserção direta via PostgreSQL (se RAUF_DATABASE_URL estiver disponível)
    const activePool = this.getPool();
    if (activePool) {
      const query = `
        INSERT INTO retencoes_calc_impostos (
          instituicao_id,
          uasg,
          numero_processo,
          documento_habil,
          numero_empenho,
          numero_nota,
          chave_acesso,
          fornecedor_cnpj,
          fornecedor_nome,
          valor_bruto,
          total_retido,
          valor_liquido,
          valor_ir,
          valor_csll,
          valor_cofins,
          valor_pis,
          valor_inss,
          valor_iss,
          detalhamento_json,
          status_conciliacao,
          origem_sistema,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, 'PENDENTE', 'calc_impostos', CURRENT_TIMESTAMP
        )
        ON CONFLICT (numero_processo, documento_habil, numero_nota) DO UPDATE SET
          instituicao_id = COALESCE(EXCLUDED.instituicao_id, retencoes_calc_impostos.instituicao_id),
          uasg = COALESCE(EXCLUDED.uasg, retencoes_calc_impostos.uasg),
          numero_empenho = COALESCE(EXCLUDED.numero_empenho, retencoes_calc_impostos.numero_empenho),
          chave_acesso = COALESCE(EXCLUDED.chave_acesso, retencoes_calc_impostos.chave_acesso),
          fornecedor_cnpj = EXCLUDED.fornecedor_cnpj,
          fornecedor_nome = EXCLUDED.fornecedor_nome,
          valor_bruto = EXCLUDED.valor_bruto,
          total_retido = EXCLUDED.total_retido,
          valor_liquido = EXCLUDED.valor_liquido,
          valor_ir = EXCLUDED.valor_ir,
          valor_csll = EXCLUDED.valor_csll,
          valor_cofins = EXCLUDED.valor_cofins,
          valor_pis = EXCLUDED.valor_pis,
          valor_inss = EXCLUDED.valor_inss,
          valor_iss = EXCLUDED.valor_iss,
          detalhamento_json = EXCLUDED.detalhamento_json,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id, instituicao_id, uasg, numero_processo, documento_habil, status_conciliacao;
      `;

      const values = [
        r.instituicaoId ? Number(r.instituicaoId) : null,
        (r.uasg || '').trim() || null,
        proc,
        docHab,
        (r.numeroEmpenho || '').trim() || null,
        nota || 'S/N',
        (r.chaveAcesso || '').trim() || null,
        (r.fornecedorCnpj || '').replace(/\D/g, '') || '00000000000000',
        (r.fornecedorNome || '').trim() || 'Fornecedor',
        Number(Number(r.totalBruto || 0).toFixed(2)),
        Number(Number(r.totalRetidoGeral || 0).toFixed(2)),
        Number(Number(r.valorLiquido || 0).toFixed(2)),
        detalhamento.ir,
        detalhamento.csll,
        detalhamento.cofins,
        detalhamento.pis,
        detalhamento.inss,
        detalhamento.iss,
        JSON.stringify(detalhamento)
      ];

      try {
        const res = await activePool.query(query, values);
        const inserted = res.rows[0];
        return {
          sucesso: true,
          id: inserted?.id,
          mensagem: `Registro de retenção integrado com sucesso no Supabase do Rauf_App (ID: ${inserted?.id}, Inst: ${inserted?.instituicao_id || 'N/A'}, UASG: ${inserted?.uasg || 'N/A'}, Proc: ${proc}, DH: ${docHab}).`
        };
      } catch (err: any) {
        console.warn('⚠️ [RaufIntegrationService] Falha no pool direto, tentando via API REST:', err.message || err);
      }
    }

    // 2. Fallback via API REST do Rauf SaaS
    const apiUrl = this.getApiUrl();
    try {
      const payloadRest = {
        instituicaoId: r.instituicaoId ? Number(r.instituicaoId) : null,
        uasg: (r.uasg || '').trim() || null,
        siglaOrgao: (r.siglaOrgao || '').trim() || null,
        numeroProcesso: proc,
        documentoHabil: docHab,
        numeroEmpenho: (r.numeroEmpenho || '').trim() || null,
        numeroNota: nota || 'S/N',
        chaveAcesso: (r.chaveAcesso || '').trim() || null,
        fornecedorCnpj: (r.fornecedorCnpj || '').replace(/\D/g, '') || '00000000000000',
        fornecedorNome: (r.fornecedorNome || '').trim() || 'Fornecedor',
        valorBruto: Number(Number(r.totalBruto || 0).toFixed(2)),
        totalRetido: Number(Number(r.totalRetidoGeral || 0).toFixed(2)),
        valorLiquido: Number(Number(r.valorLiquido || 0).toFixed(2)),
        detalhamento
      };

      const resp = await fetch(`${apiUrl}/retencoes/sincronizar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadRest),
        signal: AbortSignal.timeout(10000)
      });

      if (resp.ok) {
        const resJson = await resp.json();
        return {
          sucesso: true,
          id: resJson.id,
          mensagem: `Retenção sincronizada com sucesso na nuvem do Rauf SaaS via API (ID: ${resJson.id}, Ação: ${resJson.acao}).`
        };
      } else {
        const errText = await resp.text();
        return {
          sucesso: false,
          mensagem: `Aviso na sincronização via API do Rauf (HTTP ${resp.status}): ${errText}`
        };
      }
    } catch (apiErr: any) {
      return {
        sucesso: false,
        mensagem: `Aviso na conexão com a API do Rauf: ${apiErr.message || apiErr}`
      };
    }
  }

  /**
   * Consulta o registro de retenções associado a um Processo e Documento Hábil.
   */
  public static async consultarRetencaoPorChave(numeroProcesso: string, documentoHabil: string) {
    const activePool = this.getPool();
    if (activePool) {
      try {
        const res = await activePool.query(
          `SELECT id, instituicao_id, uasg, numero_processo, documento_habil, numero_empenho, numero_nota, fornecedor_cnpj, fornecedor_nome,
                  valor_bruto, total_retido, valor_liquido, valor_ir, valor_csll, valor_cofins, valor_pis, valor_inss, valor_iss,
                  detalhamento_json, status_conciliacao, created_at, updated_at
           FROM retencoes_calc_impostos
           WHERE numero_processo = $1 AND documento_habil = $2
           ORDER BY id DESC;`,
          [numeroProcesso.trim(), documentoHabil.trim()]
        );
        return res.rows;
      } catch (err: any) {
        console.warn('Erro ao consultar retencao no banco do Rauf:', err.message || err);
      }
    }

    // Consulta via API
    try {
      const apiUrl = this.getApiUrl();
      const resp = await fetch(`${apiUrl}/retencoes/por-documento-habil/${encodeURIComponent(documentoHabil.trim())}`);
      if (resp.ok) {
        return await resp.json();
      }
    } catch (e) {}

    return [];
  }
}
