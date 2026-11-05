import { pool } from '../config/db';
import { HistoryService } from './historyService';
import { ResultadoConsolidado } from './taxEngine';
import { exigirUasgDaSessao, contextoAtual } from './requestContext';

export interface ProcessoConsolidadoRegistro {
  id: number;
  numeroProcesso?: string;
  documentoHabil?: string;
  numeroEmpenho?: string;
  fornecedorCnpj?: string;
  fornecedorNome?: string;
  optanteSimples?: boolean;
  temMultiplosFornecedores?: boolean;
  totalNotas: number;
  valorBruto: number;
  valorLiquido: number;
  totalRetido: number;
  dadosJson: any;
  uasg?: string;
  usuarioId?: number;
  usuarioEmail?: string;
  createdAt: Date | string;
  updatedAt?: Date | string;
}

export class ProcessoService {
  /**
   * Salva ou atualiza um processo de pagamento consolidado no banco de dados,
   * vinculando todas as notas fiscais do lote a este processo.
   */
  public static async salvarOuAtualizarProcesso(dados: any): Promise<{
    id: number;
    acao: 'CRIADO' | 'ATUALIZADO';
    numeroProcesso?: string;
    totalNotas: number;
  }> {
    const uasg = exigirUasgDaSessao();
    const ctx = contextoAtual();
    const usuarioId = ctx?.usuario?.id || null;
    const usuarioEmail = ctx?.usuario?.email || null;

    const numProcesso = (dados.numeroProcesso || '').trim() || null;
    const docHabil = (dados.documentoHabil || '').trim() || null;
    const numEmpenho = (dados.notaEmpenho || dados.numeroEmpenho || '').trim().toUpperCase() || null;

    const primeiraNota = dados.notas && dados.notas.length > 0 ? dados.notas[0] : null;
    const fornecedorCnpj = dados.fornecedorPrincipal?.cnpj || primeiraNota?.fornecedorCnpj || null;
    const fornecedorNome = dados.fornecedorPrincipal?.nome || primeiraNota?.fornecedorNome || 'Credor Identificado';
    const optanteSimples = Boolean(dados.fornecedorPrincipal?.optanteSimples || (dados.notas && dados.notas.some((n: any) => n.optanteSimples)));
    const temMultiplos = Boolean(dados.temMultiplosFornecedores);

    const totalNotas = Number(dados.resumo?.totalNotas || dados.notas?.length || 1);
    const valorBruto = Number(dados.resumo?.totalBruto || 0);
    const valorLiquido = Number(dados.resumo?.totalLiquido || 0);
    const totalRetido = Number(dados.resumo?.totalRetidoGeral || 0);

    // 1. Verifica se já existe um processo consolidado com o mesmo número de processo e fornecedor para a UASG
    let processoExistenteId: number | null = dados.id ? Number(dados.id) : null;

    if (!processoExistenteId && numProcesso) {
      try {
        const resBusca = await pool.query(
          `SELECT id FROM processos_consolidados 
           WHERE uasg = $1 AND numero_processo = $2
           LIMIT 1;`,
          [uasg, numProcesso]
        );
        if (resBusca.rows.length > 0) {
          processoExistenteId = resBusca.rows[0].id;
        }
      } catch (errBusca: any) {
        console.warn('ProcessoService: Aviso ao verificar processo existente:', errBusca?.message || errBusca);
      }
    }

    let idFinal: number;
    let acao: 'CRIADO' | 'ATUALIZADO';

    const payloadJson = JSON.stringify(dados);

    if (processoExistenteId) {
      await pool.query(
        `UPDATE processos_consolidados SET
          numero_processo = COALESCE($1, numero_processo),
          documento_habil = COALESCE($2, documento_habil),
          numero_empenho = COALESCE($3, numero_empenho),
          fornecedor_cnpj = $4,
          fornecedor_nome = $5,
          optante_simples = $6,
          tem_multiplos_fornecedores = $7,
          total_notas = $8,
          valor_bruto = $9,
          valor_liquido = $10,
          total_retido = $11,
          dados_json = $12,
          usuario_id = COALESCE($13, usuario_id),
          usuario_email = COALESCE($14, usuario_email),
          updated_at = CURRENT_TIMESTAMP
         WHERE id = $15 AND uasg = $16;`,
        [
          numProcesso,
          docHabil,
          numEmpenho,
          fornecedorCnpj,
          fornecedorNome,
          optanteSimples,
          temMultiplos,
          totalNotas,
          valorBruto,
          valorLiquido,
          totalRetido,
          payloadJson,
          usuarioId,
          usuarioEmail,
          processoExistenteId,
          uasg
        ]
      );
      idFinal = processoExistenteId;
      acao = 'ATUALIZADO';
    } else {
      const resInsert = await pool.query(
        `INSERT INTO processos_consolidados (
          numero_processo, documento_habil, numero_empenho, fornecedor_cnpj, fornecedor_nome,
          optante_simples, tem_multiplos_fornecedores, total_notas, valor_bruto, valor_liquido,
          total_retido, dados_json, uasg, usuario_id, usuario_email, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id;`,
        [
          numProcesso,
          docHabil,
          numEmpenho,
          fornecedorCnpj,
          fornecedorNome,
          optanteSimples,
          temMultiplos,
          totalNotas,
          valorBruto,
          valorLiquido,
          totalRetido,
          payloadJson,
          uasg,
          usuarioId,
          usuarioEmail
        ]
      );
      idFinal = resInsert.rows[0].id;
      acao = 'CRIADO';
    }

    // 2. Salva e vincula todas as notas individuais com o processo_consolidado_id
    if (Array.isArray(dados.notas)) {
      for (const nota of dados.notas) {
        try {
          const notaComProcesso: ResultadoConsolidado = {
            ...nota,
            numeroProcesso: numProcesso || nota.numeroProcesso,
            documentoHabil: docHabil || nota.documentoHabil,
            numeroEmpenho: numEmpenho || nota.numeroEmpenho
          };
          const resNota = await HistoryService.salvarOuAtualizarNota(notaComProcesso);

          // Atualiza o vínculo do processo_consolidado_id na tabela notas_analisadas
          await pool.query(
            `UPDATE notas_analisadas SET processo_consolidado_id = $1 WHERE id = $2 AND uasg = $3;`,
            [idFinal, resNota.id, uasg]
          );
        } catch (eNota: any) {
          console.warn('ProcessoService: Aviso ao salvar nota do lote consolidado:', eNota?.message || eNota);
        }
      }
    }

    return {
      id: idFinal,
      acao,
      numeroProcesso: numProcesso || undefined,
      totalNotas
    };
  }

  /**
   * Lista os processos consolidados com paginação e pesquisa inteligente
   */
  public static async listarProcessos(params: {
    q?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    items: ProcessoConsolidadoRegistro[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const uasg = exigirUasgDaSessao();
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 15));
    const offset = (page - 1) * limit;
    const q = (params.q || '').trim();

    const conditions: string[] = ['uasg = $1'];
    const queryParams: any[] = [uasg];

    if (q) {
      queryParams.push(`%${q}%`);
      const idxTermo = queryParams.length;
      const qDigits = q.replace(/\D/g, '');

      let filtroSql = `(
        numero_processo ILIKE $${idxTermo}
        OR documento_habil ILIKE $${idxTermo}
        OR numero_empenho ILIKE $${idxTermo}
        OR fornecedor_nome ILIKE $${idxTermo}
        OR fornecedor_cnpj ILIKE $${idxTermo}
        OR dados_json::text ILIKE $${idxTermo}
      `;

      if (qDigits && qDigits.length >= 3) {
        queryParams.push(`%${qDigits}%`);
        const idxDigits = queryParams.length;
        filtroSql += `
          OR regexp_replace(COALESCE(fornecedor_cnpj, ''), '\\D', '', 'g') LIKE $${idxDigits}
          OR regexp_replace(COALESCE(numero_processo, ''), '\\D', '', 'g') LIKE $${idxDigits}
          OR regexp_replace(COALESCE(documento_habil, ''), '\\D', '', 'g') LIKE $${idxDigits}
        `;
      }

      filtroSql += ')';
      conditions.push(filtroSql);
    }

    const whereClause = conditions.join(' AND ');

    // 1. Contagem total
    const countSql = `SELECT COUNT(*) AS total FROM processos_consolidados WHERE ${whereClause};`;
    const countRes = await pool.query(countSql, queryParams);
    const total = parseInt(countRes.rows[0]?.total || '0', 10);

    // 2. Itens paginados
    const itemsSql = `
      SELECT id, numero_processo, documento_habil, numero_empenho, fornecedor_cnpj, fornecedor_nome,
             optante_simples, tem_multiplos_fornecedores, total_notas, valor_bruto, valor_liquido,
             total_retido, dados_json, uasg, usuario_id, usuario_email, created_at, updated_at
      FROM processos_consolidados
      WHERE ${whereClause}
      ORDER BY updated_at DESC, created_at DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2};
    `;

    const itemsRes = await pool.query(itemsSql, [...queryParams, limit, offset]);

    const items: ProcessoConsolidadoRegistro[] = itemsRes.rows.map(r => ({
      id: r.id,
      numeroProcesso: r.numero_processo,
      documentoHabil: r.documento_habil,
      numeroEmpenho: r.numero_empenho,
      fornecedorCnpj: r.fornecedor_cnpj,
      fornecedorNome: r.fornecedor_nome,
      optanteSimples: r.optante_simples,
      temMultiplosFornecedores: r.tem_multiplos_fornecedores,
      totalNotas: parseInt(r.total_notas || '1', 10),
      valorBruto: parseFloat(r.valor_bruto) || 0,
      valorLiquido: parseFloat(r.valor_liquido) || 0,
      totalRetido: parseFloat(r.total_retido) || 0,
      dadosJson: r.dados_json,
      uasg: r.uasg,
      usuarioId: r.usuario_id,
      usuarioEmail: r.usuario_email,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit))
    };
  }

  /**
   * Obtém um processo consolidado pelo ID
   */
  public static async obterProcessoPorId(id: number): Promise<any | null> {
    const uasg = exigirUasgDaSessao();
    const res = await pool.query(
      `SELECT id, numero_processo, documento_habil, numero_empenho, fornecedor_cnpj, fornecedor_nome,
              optante_simples, tem_multiplos_fornecedores, total_notas, valor_bruto, valor_liquido,
              total_retido, dados_json, uasg, usuario_id, usuario_email, created_at, updated_at
       FROM processos_consolidados
       WHERE id = $1 AND uasg = $2;`,
      [id, uasg]
    );

    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      ...r.dados_json,
      id: r.id,
      numeroProcesso: r.numero_processo || r.dados_json?.numeroProcesso,
      documentoHabil: r.documento_habil || r.dados_json?.documentoHabil,
      notaEmpenho: r.numero_empenho || r.dados_json?.notaEmpenho,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  }

  /**
   * Sincronização retroativa inteligente:
   * Verifica se há grupos de notas em `notas_analisadas` com o mesmo processo SEI que ainda não
   * foram consolidados em `processos_consolidados`, criando a consolidação automaticamente.
   */
  public static async autoConsolidarNotasExistentes(): Promise<number> {
    const uasg = exigirUasgDaSessao();
    try {
      // Busca processos que têm 2 ou mais notas na UASG e ainda não estão em processos_consolidados
      const gruposRes = await pool.query(
        `SELECT numero_processo, COUNT(*) as qtd
         FROM notas_analisadas
         WHERE uasg = $1
           AND numero_processo IS NOT NULL
           AND TRIM(numero_processo) != ''
           AND numero_processo NOT IN (
             SELECT numero_processo FROM processos_consolidados WHERE uasg = $1 AND numero_processo IS NOT NULL
           )
         GROUP BY numero_processo
         HAVING COUNT(*) >= 2;`,
        [uasg]
      );

      let criados = 0;
      for (const row of gruposRes.rows) {
        const proc = row.numero_processo;
        const notasRes = await pool.query(
          `SELECT id, dados_json, documento_habil, numero_empenho, fornecedor_cnpj, fornecedor_nome,
                  valor_bruto, valor_liquido, total_retido, optante_simples
           FROM notas_analisadas
           WHERE uasg = $1 AND numero_processo = $2
           ORDER BY created_at ASC;`,
          [uasg, proc]
        );

        if (notasRes.rows.length >= 2) {
          const notasCompletas = notasRes.rows.map(r => r.dados_json || r);
          let totalBruto = 0;
          let totalRetido = 0;
          let totalLiquido = 0;
          let totalIr = 0;
          let totalCsll = 0;
          let totalCofins = 0;
          let totalPis = 0;
          let totalInss = 0;
          let totalIss = 0;

          const cnpjs = new Set<string>();
          notasCompletas.forEach((n: any) => {
            totalBruto += Number(n.totalBruto) || 0;
            totalRetido += Number(n.totalRetidoGeral) || 0;
            totalLiquido += Number(n.valorLiquido) || 0;
            totalIr += Number(n.totalIr) || 0;
            totalCsll += Number(n.totalCsll) || 0;
            totalCofins += Number(n.totalCofins) || 0;
            totalPis += Number(n.totalPis) || 0;
            totalInss += Number(n.totalInss) || 0;
            totalIss += Number(n.totalIss) || 0;
            if (n.fornecedorCnpj) cnpjs.add(n.fornecedorCnpj);
          });

          const primeira = notasCompletas[0];
          const docHabils = Array.from(new Set(notasRes.rows.map(r => r.documento_habil).filter(Boolean)));
          const empenhos = Array.from(new Set(notasRes.rows.map(r => r.numero_empenho).filter(Boolean)));

          const payloadProcesso = {
            numeroProcesso: proc,
            documentoHabil: docHabils.join(', ') || undefined,
            notaEmpenho: empenhos.join(', ') || undefined,
            temMultiplosFornecedores: cnpjs.size > 1,
            fornecedorPrincipal: {
              nome: primeira.fornecedorNome,
              cnpj: primeira.fornecedorCnpj,
              optanteSimples: primeira.optanteSimples
            },
            notas: notasCompletas,
            resumo: {
              totalNotas: notasCompletas.length,
              totalBruto: Number(totalBruto.toFixed(2)),
              totalRetidoGeral: Number(totalRetido.toFixed(2)),
              totalLiquido: Number(totalLiquido.toFixed(2)),
              totalIr: Number(totalIr.toFixed(2)),
              totalCsll: Number(totalCsll.toFixed(2)),
              totalCofins: Number(totalCofins.toFixed(2)),
              totalPis: Number(totalPis.toFixed(2)),
              totalInss: Number(totalInss.toFixed(2)),
              totalIss: Number(totalIss.toFixed(2))
            }
          };

          await ProcessoService.salvarOuAtualizarProcesso(payloadProcesso);
          criados++;
        }
      }
      return criados;
    } catch (err: any) {
      console.warn('ProcessoService: Aviso na auto-consolidação de notas existentes:', err?.message || err);
      return 0;
    }
  }
}
