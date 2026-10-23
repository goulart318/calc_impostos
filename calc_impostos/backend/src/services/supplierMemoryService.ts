import { pool } from '../config/db';
import { uasgDaSessao } from './requestContext';

export interface MemoriaFornecedorInput {
  fornecedorCnpj: string;
  fornecedorNome?: string;
  ncmPadrao?: string;
  descricaoPadrao?: string;
  codigoReceitaDarf: string;
  naturezaReinf: string;
  aliqIr: number;
  aliqCsll: number;
  aliqCofins: number;
  aliqPis: number;
  aliqInss?: number;
  aliqIss?: number;
  condicaoAplicavel?: string;
  fundamentacao?: string;
  observacoes?: string;
}

export interface MemoriaFornecedorRegistro {
  id: number;
  fornecedorCnpj: string;
  fornecedorNome?: string;
  ncmPadrao?: string;
  descricaoPadrao?: string;
  codigoReceitaDarf: string;
  naturezaReinf: string;
  aliqIr: number;
  aliqCsll: number;
  aliqCofins: number;
  aliqPis: number;
  aliqInss?: number;
  aliqIss?: number;
  condicaoAplicavel?: string;
  fundamentacao?: string;
  observacoes?: string;
  totalAplicacoes: number;
  createdAt: string;
  updatedAt: string;
}

export class SupplierMemoryService {
  private static normalizarCnpj(cnpj?: string): string {
    return (cnpj || '').replace(/\D/g, '');
  }

  private static normalizarNcm(ncm?: string): string {
    return (ncm || '').replace(/\D/g, '');
  }

  /**
   * Busca no banco a regra de memória mais específica para o CNPJ do fornecedor e NCM (se houver)
   */
  public static async buscarMemoria(cnpjRaw: string, ncmRaw?: string): Promise<MemoriaFornecedorRegistro | null> {
    const cnpj = this.normalizarCnpj(cnpjRaw);
    if (!cnpj) return null;

    const ncm = this.normalizarNcm(ncmRaw);
    const uasg = (uasgDaSessao() || '155012').replace(/\D/g, '').padStart(6, '0');

    try {
      // 1) Busca regra exata com o NCM especificado
      if (ncm) {
        const queryExata = `
          SELECT * FROM memoria_tributaria_fornecedores
          WHERE REPLACE(REPLACE(REPLACE(fornecedor_cnpj, '.', ''), '/', ''), '-', '') = $1
            AND ncm_padrao = $2
            AND uasg = $3
          ORDER BY updated_at DESC
          LIMIT 1;
        `;
        const resExata = await pool.query(queryExata, [cnpj, ncm, uasg]);
        if (resExata.rows.length > 0) {
          const r = resExata.rows[0];
          return this.mapearLinha(r);
        }
      }

      // 2) Busca regra geral do fornecedor (sem NCM fixado ou NCM vazio)
      const queryGeral = `
        SELECT * FROM memoria_tributaria_fornecedores
        WHERE REPLACE(REPLACE(REPLACE(fornecedor_cnpj, '.', ''), '/', ''), '-', '') = $1
          AND (ncm_padrao IS NULL OR ncm_padrao = '' OR ncm_padrao = 'GERAL')
          AND uasg = $2
        ORDER BY updated_at DESC
        LIMIT 1;
      `;
      const resGeral = await pool.query(queryGeral, [cnpj, uasg]);
      if (resGeral.rows.length > 0) {
        return this.mapearLinha(resGeral.rows[0]);
      }

      return null;
    } catch (err: any) {
      console.warn('Erro ao consultar memória tributária do fornecedor:', err.message);
      return null;
    }
  }

  /**
   * Grava ou atualiza a regra na memória tributária do fornecedor
   */
  public static async salvarOuAtualizarMemoria(input: MemoriaFornecedorInput): Promise<MemoriaFornecedorRegistro> {
    const cnpj = this.normalizarCnpj(input.fornecedorCnpj);
    const ncm = this.normalizarNcm(input.ncmPadrao) || null;
    const uasg = (uasgDaSessao() || '155012').replace(/\D/g, '').padStart(6, '0');

    // Verifica se já existe registro equivalente para a mesma UASG
    const queryExistente = `
      SELECT id, total_aplicacoes FROM memoria_tributaria_fornecedores
      WHERE REPLACE(REPLACE(REPLACE(fornecedor_cnpj, '.', ''), '/', ''), '-', '') = $1
        AND (ncm_padrao = $2 OR ($2 IS NULL AND (ncm_padrao IS NULL OR ncm_padrao = '')))
        AND uasg = $3
      LIMIT 1;
    `;
    const resExistente = await pool.query(queryExistente, [cnpj, ncm, uasg]);

    if (resExistente.rows.length > 0) {
      const id = resExistente.rows[0].id;
      const totalAtual = (resExistente.rows[0].total_aplicacoes || 1) + 1;

      const updateQuery = `
        UPDATE memoria_tributaria_fornecedores SET
          fornecedor_nome = COALESCE($1, fornecedor_nome),
          descricao_padrao = COALESCE($2, descricao_padrao),
          codigo_receita_darf = $3,
          natureza_reinf = $4,
          aliq_ir = $5,
          aliq_csll = $6,
          aliq_cofins = $7,
          aliq_pis = $8,
          aliq_inss = COALESCE($9, aliq_inss),
          aliq_iss = COALESCE($10, aliq_iss),
          condicao_aplicavel = $11,
          fundamentacao = $12,
          observacoes = COALESCE($13, observacoes),
          total_aplicacoes = $14,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $15
        RETURNING *;
      `;
      const resUpdate = await pool.query(updateQuery, [
        input.fornecedorNome || null,
        input.descricaoPadrao || null,
        input.codigoReceitaDarf,
        input.naturezaReinf,
        input.aliqIr,
        input.aliqCsll,
        input.aliqCofins,
        input.aliqPis,
        input.aliqInss ?? 0,
        input.aliqIss ?? 0,
        input.condicaoAplicavel || 'Regra Memorizada pelo Auditor',
        input.fundamentacao || 'Memória Tributária Ativa do Fornecedor',
        input.observacoes || null,
        totalAtual,
        id
      ]);
      return this.mapearLinha(resUpdate.rows[0]);
    } else {
      const insertQuery = `
        INSERT INTO memoria_tributaria_fornecedores (
          fornecedor_cnpj, fornecedor_nome, ncm_padrao, descricao_padrao,
          codigo_receita_darf, natureza_reinf, aliq_ir, aliq_csll, aliq_cofins, aliq_pis,
          aliq_inss, aliq_iss, condicao_aplicavel, fundamentacao, observacoes, total_aplicacoes, uasg
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 1, $16)
        RETURNING *;
      `;
      const resInsert = await pool.query(insertQuery, [
        input.fornecedorCnpj,
        input.fornecedorNome || null,
        ncm,
        input.descricaoPadrao || null,
        input.codigoReceitaDarf,
        input.naturezaReinf,
        input.aliqIr,
        input.aliqCsll,
        input.aliqCofins,
        input.aliqPis,
        input.aliqInss ?? 0,
        input.aliqIss ?? 0,
        input.condicaoAplicavel || 'Regra Memorizada pelo Auditor',
        input.fundamentacao || 'Memória Tributária Ativa do Fornecedor',
        input.observacoes || null,
        uasg
      ]);
      return this.mapearLinha(resInsert.rows[0]);
    }
  }

  /**
   * Lista regras da memória para um CNPJ específico
   */
  public static async listarPorCnpj(cnpjRaw: string): Promise<MemoriaFornecedorRegistro[]> {
    const cnpj = this.normalizarCnpj(cnpjRaw);
    if (!cnpj) return [];
    const uasg = (uasgDaSessao() || '155012').replace(/\D/g, '').padStart(6, '0');
    try {
      const q = `
        SELECT * FROM memoria_tributaria_fornecedores
        WHERE REPLACE(REPLACE(REPLACE(fornecedor_cnpj, '.', ''), '/', ''), '-', '') = $1
          AND uasg = $2
        ORDER BY updated_at DESC;
      `;
      const res = await pool.query(q, [cnpj, uasg]);
      return res.rows.map(r => this.mapearLinha(r));
    } catch (e: any) {
      console.warn('Erro ao listar memórias por CNPJ:', e.message);
      return [];
    }
  }

  /**
   * Lista todas as memórias salvas no sistema
   */
  public static async listarTodas(): Promise<MemoriaFornecedorRegistro[]> {
    const uasg = (uasgDaSessao() || '155012').replace(/\D/g, '').padStart(6, '0');
    try {
      const q = `
        SELECT * FROM memoria_tributaria_fornecedores
        WHERE uasg = $1
        ORDER BY updated_at DESC;
      `;
      const res = await pool.query(q, [uasg]);
      return res.rows.map(r => this.mapearLinha(r));
    } catch (e: any) {
      console.warn('Erro ao listar todas as memórias:', e.message);
      return [];
    }
  }

  /**
   * Remove uma regra memorizada por ID
   */
  public static async excluir(id: number): Promise<boolean> {
    const uasg = (uasgDaSessao() || '155012').replace(/\D/g, '').padStart(6, '0');
    try {
      const q = `DELETE FROM memoria_tributaria_fornecedores WHERE id = $1 AND uasg = $2;`;
      const res = await pool.query(q, [id, uasg]);
      return (res.rowCount || 0) > 0;
    } catch (e: any) {
      console.warn('Erro ao excluir regra da memória:', e.message);
      return false;
    }
  }

  private static mapearLinha(row: any): MemoriaFornecedorRegistro {
    return {
      id: row.id,
      fornecedorCnpj: row.fornecedor_cnpj,
      fornecedorNome: row.fornecedor_nome,
      ncmPadrao: row.ncm_padrao,
      descricaoPadrao: row.descricao_padrao,
      codigoReceitaDarf: row.codigo_receita_darf,
      naturezaReinf: row.natureza_reinf,
      aliqIr: parseFloat(row.aliq_ir || '0'),
      aliqCsll: parseFloat(row.aliq_csll || '0'),
      aliqCofins: parseFloat(row.aliq_cofins || '0'),
      aliqPis: parseFloat(row.aliq_pis || '0'),
      aliqInss: parseFloat(row.aliq_inss || '0'),
      aliqIss: parseFloat(row.aliq_iss || '0'),
      condicaoAplicavel: row.condicao_aplicavel,
      fundamentacao: row.fundamentacao,
      observacoes: row.observacoes,
      totalAplicacoes: parseInt(row.total_aplicacoes || '1', 10),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
