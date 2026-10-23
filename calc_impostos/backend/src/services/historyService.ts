import { pool } from '../config/db';
import { ResultadoConsolidado } from './taxEngine';

export interface NotaHistoricoRegistro {
  id: number;
  tipoDocumento: 'NFE' | 'NFSE';
  numeroNota: string;
  chaveAcesso?: string;
  fornecedorCnpj: string;
  fornecedorNome: string;
  destinatarioCnpj?: string;
  destinatarioNome?: string;
  optanteSimples: boolean;
  valorBruto: number;
  valorLiquido: number;
  totalRetido: number;
  numeroProcesso?: string;
  numeroEmpenho?: string;
  documentoHabil?: string;
  dadosJson?: any;
  createdAt: Date | string;
  updatedAt?: Date | string;
}

export class HistoryService {
  // Cache em memória resiliente para garantir cruzamento imediato mesmo se o PostgreSQL estiver offline em dev
  private static cacheMemoria: Map<string, NotaHistoricoRegistro> = new Map();
  private static proximoIdMemoria = 1;

  public static normalizarCnpj(cnpj?: string): string {
    return (cnpj || '').replace(/\D/g, '');
  }

  public static normalizarNumeroNota(num?: string): string {
    if (!num) return '';
    const limpo = num.replace(/\D/g, '');
    return limpo.replace(/^0+/, '') || limpo || num.trim();
  }

  private static gerarChavesCache(n: {
    chaveAcesso?: string;
    fornecedorCnpj?: string;
    numeroNota?: string;
    tipoDocumento?: string;
  }): string[] {
    const chaves: string[] = [];
    if (n.chaveAcesso && n.chaveAcesso.length >= 44) {
      chaves.push(`chave:${n.chaveAcesso.trim()}`);
    }
    const cnpj = this.normalizarCnpj(n.fornecedorCnpj);
    const nota = this.normalizarNumeroNota(n.numeroNota);
    const tipo = n.tipoDocumento || 'NFE';
    if (cnpj && nota) {
      chaves.push(`cnpj_nota:${tipo}:${cnpj}:${nota}`);
    }
    return chaves;
  }

  /**
   * Busca no banco de dados se a nota fiscal já passou por análise anterior
   * Utiliza a chave de acesso ou combinação (CNPJ do emitente + Número da Nota + Tipo)
   */
  public static async buscarNotaHistorico(filtro: {
    chaveAcesso?: string;
    numeroNota?: string;
    fornecedorCnpj?: string;
    tipoDocumento?: string;
  }): Promise<NotaHistoricoRegistro | null> {
    const chave = (filtro.chaveAcesso || '').replace(/\D/g, '');
    const cnpj = this.normalizarCnpj(filtro.fornecedorCnpj);
    const numNota = (filtro.numeroNota || '').trim();
    const numNotaLimpo = this.normalizarNumeroNota(numNota);
    const tipo = filtro.tipoDocumento || 'NFE';

    // 1. Tenta consulta no PostgreSQL
    try {
      if (chave && chave.length >= 44) {
        const resChave = await pool.query(
          `SELECT id, tipo_documento, numero_nota, chave_acesso, fornecedor_cnpj, fornecedor_nome,
                  destinatario_cnpj, destinatario_nome, optante_simples, valor_bruto, valor_liquido,
                  total_retido, numero_processo, numero_empenho, dados_json, created_at, updated_at
           FROM notas_analisadas
           WHERE chave_acesso = $1
           ORDER BY updated_at DESC, created_at DESC
           LIMIT 1;`,
          [chave]
        );

        if (resChave.rows.length > 0) {
          const r = resChave.rows[0];
          return this.mapearRegistro(r);
        }
      }

      if (cnpj && numNota) {
        const resCnpjNota = await pool.query(
          `SELECT id, tipo_documento, numero_nota, chave_acesso, fornecedor_cnpj, fornecedor_nome,
                  destinatario_cnpj, destinatario_nome, optante_simples, valor_bruto, valor_liquido,
                  total_retido, numero_processo, numero_empenho, dados_json, created_at, updated_at
           FROM notas_analisadas
           WHERE tipo_documento = $1
             AND regexp_replace(fornecedor_cnpj, '\\D', '', 'g') = $2
             AND (
               regexp_replace(numero_nota, '\\D', '', 'g') = $3
               OR ltrim(regexp_replace(numero_nota, '\\D', '', 'g'), '0') = $4
               OR numero_nota = $5
             )
           ORDER BY updated_at DESC, created_at DESC
           LIMIT 1;`,
          [tipo, cnpj, numNota.replace(/\D/g, ''), numNotaLimpo, numNota]
        );

        if (resCnpjNota.rows.length > 0) {
          const r = resCnpjNota.rows[0];
          return this.mapearRegistro(r);
        }
      }
    } catch (err: any) {
      console.warn('HistoryService: Consulta PostgreSQL indisponível, usando cache de memória:', err?.message || err);
    }

    // 2. Fallback de cache em memória
    const chavesBusca = this.gerarChavesCache(filtro);
    for (const k of chavesBusca) {
      if (this.cacheMemoria.has(k)) {
        return this.cacheMemoria.get(k)!;
      }
    }

    return null;
  }

  /**
   * Salva ou atualiza a análise de uma nota fiscal evitando qualquer duplicidade.
   * Se a nota já existir, faz UPDATE preservando e mesclando o número do processo e nota de empenho.
   */
  public static async salvarOuAtualizarNota(resultado: ResultadoConsolidado): Promise<{
    id: number;
    acao: 'CRIADA' | 'ATUALIZADA';
    numeroProcesso?: string;
    numeroEmpenho?: string;
    documentoHabil?: string;
  }> {
    const notaExistente = await this.buscarNotaHistorico({
      chaveAcesso: resultado.chaveAcesso,
      numeroNota: resultado.numeroNota,
      fornecedorCnpj: resultado.fornecedorCnpj,
      tipoDocumento: resultado.tipoDocumento
    });

    // Mescla dados de processo: se a requisição atual não trouxe, preserva o do histórico anterior
    const processoFinal = (resultado.numeroProcesso || '').trim() || (notaExistente?.numeroProcesso || '').trim() || null;
    const empenhoFinal = (resultado.numeroEmpenho || '').trim() || (notaExistente?.numeroEmpenho || '').trim() || null;
    const docHabilFinal = (resultado.documentoHabil || '').trim() || (notaExistente?.documentoHabil || '').trim() || null;

    // Atualiza o próprio objeto resultado com os dados mesclados
    if (processoFinal) resultado.numeroProcesso = processoFinal;
    if (empenhoFinal) resultado.numeroEmpenho = empenhoFinal;
    if (docHabilFinal) resultado.documentoHabil = docHabilFinal;

    const payloadJson = JSON.stringify(resultado);
    let idFinal = notaExistente ? notaExistente.id : this.proximoIdMemoria++;
    let acaoFinal: 'CRIADA' | 'ATUALIZADA' = notaExistente ? 'ATUALIZADA' : 'CRIADA';

    try {
      if (notaExistente) {
        // UPDATE no PostgreSQL
        await pool.query(
          `UPDATE notas_analisadas SET
            tipo_documento = $1,
            numero_nota = $2,
            chave_acesso = COALESCE($3, chave_acesso),
            fornecedor_cnpj = $4,
            fornecedor_nome = $5,
            destinatario_cnpj = COALESCE($6, destinatario_cnpj),
            destinatario_nome = COALESCE($7, destinatario_nome),
            optante_simples = $8,
            valor_bruto = $9,
            valor_liquido = $10,
            total_retido = $11,
            dados_json = $12,
            numero_processo = COALESCE($13, numero_processo),
            numero_empenho = COALESCE($14, numero_empenho),
            documento_habil = COALESCE($15, documento_habil),
            updated_at = CURRENT_TIMESTAMP
           WHERE id = $16;`,
          [
            resultado.tipoDocumento,
            resultado.numeroNota || 'S/N',
            resultado.chaveAcesso || null,
            resultado.fornecedorCnpj,
            resultado.fornecedorNome,
            resultado.destinatarioCnpj || null,
            resultado.destinatarioNome || null,
            resultado.optanteSimples,
            resultado.totalBruto,
            resultado.valorLiquido,
            resultado.totalRetidoGeral,
            payloadJson,
            processoFinal,
            empenhoFinal,
            docHabilFinal,
            notaExistente.id
          ]
        );
        idFinal = notaExistente.id;
        acaoFinal = 'ATUALIZADA';
      } else {
        // INSERT no PostgreSQL
        const insertRes = await pool.query(
          `INSERT INTO notas_analisadas (
            tipo_documento, numero_nota, chave_acesso, fornecedor_cnpj, fornecedor_nome,
            destinatario_cnpj, destinatario_nome, optante_simples, valor_bruto,
            valor_liquido, total_retido, dados_json, numero_processo, numero_empenho, documento_habil,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          RETURNING id;`,
          [
            resultado.tipoDocumento,
            resultado.numeroNota || 'S/N',
            resultado.chaveAcesso || null,
            resultado.fornecedorCnpj,
            resultado.fornecedorNome,
            resultado.destinatarioCnpj || null,
            resultado.destinatarioNome || null,
            resultado.optanteSimples,
            resultado.totalBruto,
            resultado.valorLiquido,
            resultado.totalRetidoGeral,
            payloadJson,
            processoFinal,
            empenhoFinal,
            docHabilFinal
          ]
        );
        idFinal = insertRes.rows[0].id;
        acaoFinal = 'CRIADA';
      }
    } catch (err: any) {
      console.warn('HistoryService: Persistência PostgreSQL em fallback:', err?.message || err);
    }

    // Registra e sincroniza no cache de memória
    const regMemoria: NotaHistoricoRegistro = {
      id: idFinal,
      tipoDocumento: resultado.tipoDocumento,
      numeroNota: resultado.numeroNota,
      chaveAcesso: resultado.chaveAcesso,
      fornecedorCnpj: resultado.fornecedorCnpj,
      fornecedorNome: resultado.fornecedorNome,
      destinatarioCnpj: resultado.destinatarioCnpj,
      destinatarioNome: resultado.destinatarioNome,
      optanteSimples: resultado.optanteSimples,
      valorBruto: resultado.totalBruto,
      valorLiquido: resultado.valorLiquido,
      totalRetido: resultado.totalRetidoGeral,
      numeroProcesso: processoFinal || undefined,
      numeroEmpenho: empenhoFinal || undefined,
      documentoHabil: docHabilFinal || undefined,
      dadosJson: resultado,
      createdAt: notaExistente?.createdAt || new Date(),
      updatedAt: new Date()
    };

    const chaves = this.gerarChavesCache(resultado);
    for (const k of chaves) {
      this.cacheMemoria.set(k, regMemoria);
    }

    return {
      id: idFinal,
      acao: acaoFinal,
      numeroProcesso: processoFinal || undefined,
      numeroEmpenho: empenhoFinal || undefined,
      documentoHabil: docHabilFinal || undefined
    };
  }

  private static mapearRegistro(r: any): NotaHistoricoRegistro {
    return {
      id: r.id,
      tipoDocumento: r.tipo_documento,
      numeroNota: r.numero_nota,
      chaveAcesso: r.chave_acesso,
      fornecedorCnpj: r.fornecedor_cnpj,
      fornecedorNome: r.fornecedor_nome,
      destinatarioCnpj: r.destinatario_cnpj,
      destinatarioNome: r.destinatario_nome,
      optanteSimples: r.optante_simples,
      valorBruto: parseFloat(r.valor_bruto) || 0,
      valorLiquido: parseFloat(r.valor_liquido) || 0,
      totalRetido: parseFloat(r.total_retido) || 0,
      numeroProcesso: r.numero_processo || undefined,
      numeroEmpenho: r.numero_empenho || undefined,
      documentoHabil: r.documento_habil || undefined,
      dadosJson: r.dados_json,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  }
}
