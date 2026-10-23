import { Pool } from 'pg';
import { pool as defaultPool } from '../config/db';
import { ResultadoConsolidado } from './taxEngine';

/**
 * Serviço de Integração Direta com o banco de dados do Rauf_App.
 * Executa INSERT / UPSERT na tabela 'retencoes_calc_impostos' para que o Rauf_App
 * possa realizar a conciliação documental entre a Ordem Bancária (OB),
 * o Documento Hábil (DH/NS/NL) e a Memória de Cálculo de Retenções do SEI.
 */
export class RaufIntegrationService {
  private static raufPool: Pool | null = null;

  /**
   * Obtém a conexão com o banco de dados do Rauf_App.
   * Se RAUF_DATABASE_URL estiver configurada no .env (ex: Supabase do Rauf), utiliza essa conexão direta.
   * Caso contrário, utiliza o pool padrão do sistema.
   */
  private static getPool(): Pool {
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
    return defaultPool;
  }

  /**
   * Insere ou atualiza o registro de retenções na tabela 'retencoes_calc_impostos'.
   * Chave composta: (numero_processo, documento_habil, numero_nota).
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

    const query = `
      INSERT INTO retencoes_calc_impostos (
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
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'PENDENTE', 'calc_impostos', CURRENT_TIMESTAMP
      )
      ON CONFLICT (numero_processo, documento_habil, numero_nota) DO UPDATE SET
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
      RETURNING id, numero_processo, documento_habil, status_conciliacao;
    `;

    const values = [
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
      const activePool = this.getPool();
      const res = await activePool.query(query, values);
      const inserted = res.rows[0];

      return {
        sucesso: true,
        id: inserted?.id,
        mensagem: `Registro de retenção integrado com sucesso no banco do Rauf_App (ID: ${inserted?.id}, Proc: ${proc}, DH: ${docHab}).`
      };
    } catch (err: any) {
      console.warn('⚠️ [RaufIntegrationService] Aviso ao inserir no banco do Rauf_App:', err.message || err);
      return {
        sucesso: false,
        mensagem: `Aviso na integração com Rauf_App: ${err.message || err}`
      };
    }
  }

  /**
   * Consulta o registro de retenções associado a um Processo e Documento Hábil.
   */
  public static async consultarRetencaoPorChave(numeroProcesso: string, documentoHabil: string) {
    try {
      const activePool = this.getPool();
      const res = await activePool.query(
        `SELECT id, numero_processo, documento_habil, numero_empenho, numero_nota, fornecedor_cnpj, fornecedor_nome,
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
      return [];
    }
  }
}
