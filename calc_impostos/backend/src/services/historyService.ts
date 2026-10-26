import { pool } from '../config/db';
import { ResultadoConsolidado } from './taxEngine';
import { RaufIntegrationService } from './raufIntegrationService';
import { uasgDaSessao, exigirUasgDaSessao, contextoAtual } from './requestContext';

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
  uasg?: string;
  usuarioId?: number;
  usuarioEmail?: string;
  dadosJson?: any;
  createdAt: Date | string;
  updatedAt?: Date | string;
}

export class HistoryService {
  /**
   * Cache em memória estritamente segregado por UASG (Map<UASG, Map<Chave, Registro>>)
   * Garante isolamento total entre órgãos mesmo se o banco estiver indisponível.
   */
  private static cacheMemoriaPorUasg: Map<string, Map<string, NotaHistoricoRegistro>> = new Map();
  private static proximoIdMemoria = 1;

  public static normalizarCnpj(cnpj?: string): string {
    return (cnpj || '').replace(/\D/g, '');
  }

  public static normalizarNumeroNota(num?: string): string {
    if (!num) return '';
    const limpo = num.replace(/\D/g, '');
    return limpo.replace(/^0+/, '') || limpo || num.trim();
  }

  private static obterMapaUasg(uasgInformada?: string): Map<string, NotaHistoricoRegistro> {
    const uasg = uasgInformada ? uasgInformada.replace(/\D/g, '').padStart(6, '0') : exigirUasgDaSessao();
    let mapa = this.cacheMemoriaPorUasg.get(uasg);
    if (!mapa) {
      mapa = new Map<string, NotaHistoricoRegistro>();
      this.cacheMemoriaPorUasg.set(uasg, mapa);
    }
    return mapa;
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
   * Utiliza o ID do registro (quando já existente), chave de acesso ou combinação (CNPJ do emitente + Número da Nota + Tipo)
   */
  public static async buscarNotaHistorico(filtro: {
    id?: number;
    chaveAcesso?: string;
    numeroNota?: string;
    fornecedorCnpj?: string;
    tipoDocumento?: string;
  }): Promise<NotaHistoricoRegistro | null> {
    const uasg = exigirUasgDaSessao();

    // 0. Busca prioritária por ID se fornecido
    const idBusca = filtro.id ? Number(filtro.id) : undefined;
    if (idBusca && !isNaN(idBusca) && idBusca > 0) {
      try {
        const resId = await pool.query(
          `SELECT id, tipo_documento, numero_nota, chave_acesso, fornecedor_cnpj, fornecedor_nome,
                  destinatario_cnpj, destinatario_nome, optante_simples, valor_bruto, valor_liquido,
                  total_retido, numero_processo, numero_empenho, documento_habil, uasg, dados_json, created_at, updated_at
           FROM notas_analisadas
           WHERE id = $1 AND uasg = $2
           LIMIT 1;`,
          [idBusca, uasg]
        );
        if (resId.rows.length > 0) {
          return this.mapearRegistro(resId.rows[0]);
        }
      } catch (err: any) {
        console.warn('HistoryService: Consulta PostgreSQL por ID indisponível:', err?.message || err);
      }
    }

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
                  total_retido, numero_processo, numero_empenho, documento_habil, uasg, dados_json, created_at, updated_at
           FROM notas_analisadas
           WHERE chave_acesso = $1 AND uasg = $2
           ORDER BY updated_at DESC, created_at DESC
           LIMIT 1;`,
          [chave, uasg]
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
                  total_retido, numero_processo, numero_empenho, documento_habil, uasg, dados_json, created_at, updated_at
           FROM notas_analisadas
           WHERE tipo_documento = $1
             AND uasg = $6
             AND regexp_replace(fornecedor_cnpj, '\\D', '', 'g') = $2
             AND (
               regexp_replace(numero_nota, '\\D', '', 'g') = $3
               OR ltrim(regexp_replace(numero_nota, '\\D', '', 'g'), '0') = $4
               OR numero_nota = $5
             )
           ORDER BY updated_at DESC, created_at DESC
           LIMIT 1;`,
          [tipo, cnpj, numNota.replace(/\D/g, ''), numNotaLimpo, numNota, uasg]
        );

        if (resCnpjNota.rows.length > 0) {
          const r = resCnpjNota.rows[0];
          return this.mapearRegistro(r);
        }
      }
    } catch (err: any) {
      console.warn('HistoryService: Consulta PostgreSQL indisponível, usando cache de memória:', err?.message || err);
    }

    // 2. Fallback de cache em memória estritamente segregado por UASG
    const mapaUasg = this.obterMapaUasg(uasg);
    const chavesBusca = this.gerarChavesCache(filtro);
    for (const k of chavesBusca) {
      if (mapaUasg.has(k)) {
        return mapaUasg.get(k)!;
      }
    }

    return null;
  }

  /**
   * Salva ou atualiza a análise de uma nota fiscal evitando qualquer duplicidade.
   * Se a nota já existir, faz UPDATE atualizando dados e mesclando Processo SEI, Documento Hábil e Empenho.
   * Registra auditoria do usuário que analisou a nota.
   * Prioridade absoluta da UASG da sessão autenticada.
   */
  public static async salvarOuAtualizarNota(resultado: ResultadoConsolidado): Promise<{
    id: number;
    acao: 'CRIADA' | 'ATUALIZADA';
    numeroProcesso?: string;
    numeroEmpenho?: string;
    documentoHabil?: string;
  }> {
    // A UASG da sessão autenticada tem prioridade absoluta sobre qualquer campo vindo no JSON
    const uasgEfetiva = exigirUasgDaSessao();
    resultado.uasg = uasgEfetiva;

    const notaExistente = await this.buscarNotaHistorico({
      id: (resultado as any).id,
      chaveAcesso: resultado.chaveAcesso,
      numeroNota: resultado.numeroNota,
      fornecedorCnpj: resultado.fornecedorCnpj,
      tipoDocumento: resultado.tipoDocumento
    });

    // Se o valor foi informado na requisição atual (mesmo string preenchida ou alterada), usa-o;
    // Se for undefined ou vazio na requisição, preserva o valor que já estava gravado no histórico
    const processoFinal = (resultado.numeroProcesso !== undefined && resultado.numeroProcesso !== null && String(resultado.numeroProcesso).trim() !== '')
      ? String(resultado.numeroProcesso).trim()
      : ((notaExistente?.numeroProcesso || '').trim() || null);

    const empenhoFinal = (resultado.numeroEmpenho !== undefined && resultado.numeroEmpenho !== null && String(resultado.numeroEmpenho).trim() !== '')
      ? String(resultado.numeroEmpenho).trim().toUpperCase()
      : ((notaExistente?.numeroEmpenho || '').trim() || null);

    const docHabilFinal = (resultado.documentoHabil !== undefined && resultado.documentoHabil !== null && String(resultado.documentoHabil).trim() !== '')
      ? String(resultado.documentoHabil).trim()
      : ((notaExistente?.documentoHabil || '').trim() || null);

    // Atualiza o próprio objeto resultado com os dados consolidados
    resultado.numeroProcesso = processoFinal || undefined;
    resultado.numeroEmpenho = empenhoFinal || undefined;
    resultado.documentoHabil = docHabilFinal || undefined;

    const ctx = contextoAtual();
    const usuarioId = ctx?.usuario?.id || null;
    const usuarioEmail = ctx?.usuario?.email || null;

    const payloadJson = JSON.stringify(resultado);
    let idFinal = notaExistente ? notaExistente.id : this.proximoIdMemoria++;
    let acaoFinal: 'CRIADA' | 'ATUALIZADA' = notaExistente ? 'ATUALIZADA' : 'CRIADA';

    try {
      if (notaExistente) {
        // UPDATE no PostgreSQL com filtro estrito por ID e UASG
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
            numero_processo = $13,
            numero_empenho = $14,
            documento_habil = $15,
            usuario_id = COALESCE($16, usuario_id),
            usuario_email = COALESCE($17, usuario_email),
            updated_at = CURRENT_TIMESTAMP
           WHERE id = $18 AND uasg = $19;`,
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
            usuarioId,
            usuarioEmail,
            notaExistente.id,
            uasgEfetiva
          ]
        );
        idFinal = notaExistente.id;
        acaoFinal = 'ATUALIZADA';
      } else {
        // INSERT no PostgreSQL com auditoria de usuário e UASG
        const insertRes = await pool.query(
          `INSERT INTO notas_analisadas (
            tipo_documento, numero_nota, chave_acesso, fornecedor_cnpj, fornecedor_nome,
            destinatario_cnpj, destinatario_nome, optante_simples, valor_bruto,
            valor_liquido, total_retido, dados_json, numero_processo, numero_empenho, documento_habil, uasg,
            usuario_id, usuario_email, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
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
            docHabilFinal,
            uasgEfetiva,
            usuarioId,
            usuarioEmail
          ]
        );
        idFinal = insertRes.rows[0].id;
        acaoFinal = 'CRIADA';
      }
    } catch (err: any) {
      console.warn('HistoryService: Persistência PostgreSQL em fallback:', err?.message || err);
    }

    // Registra e sincroniza no cache de memória exclusivo da UASG
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
      uasg: uasgEfetiva,
      usuarioId: usuarioId || undefined,
      usuarioEmail: usuarioEmail || undefined,
      dadosJson: resultado,
      createdAt: notaExistente?.createdAt || new Date(),
      updatedAt: new Date()
    };

    const mapaUasg = this.obterMapaUasg(uasgEfetiva);
    const chaves = this.gerarChavesCache(resultado);
    for (const k of chaves) {
      mapaUasg.set(k, regMemoria);
    }

    // Integração automática direta com a tabela retencoes_calc_impostos do Rauf_App
    try {
      const resultadoComChaves: ResultadoConsolidado = {
        ...resultado,
        numeroProcesso: processoFinal || resultado.numeroProcesso,
        documentoHabil: docHabilFinal || resultado.documentoHabil,
        numeroEmpenho: empenhoFinal || resultado.numeroEmpenho
      };
      await RaufIntegrationService.inserirOuAtualizarRetencao(resultadoComChaves);
    } catch (eRauf: any) {
      console.warn('Aviso na sincronização de retenções com Rauf_App:', eRauf?.message || eRauf);
    }

    return {
      id: idFinal,
      acao: acaoFinal,
      numeroProcesso: processoFinal || undefined,
      numeroEmpenho: empenhoFinal || undefined,
      documentoHabil: docHabilFinal || undefined
    };
  }

  /**
   * Atualização direta e prática dos dados básicos do processo (SEI, Documento Hábil / NS Liquidação, Nota de Empenho)
   * sem necessidade de reprocessar cálculos fiscais.
   */
  public static async atualizarDadosProcesso(
    id: number,
    dados: {
      numeroProcesso?: string | null;
      documentoHabil?: string | null;
      numeroEmpenho?: string | null;
    }
  ): Promise<{
    id: number;
    numeroProcesso?: string | null;
    documentoHabil?: string | null;
    numeroEmpenho?: string | null;
  }> {
    const uasg = exigirUasgDaSessao();
    
    // 1. Busca a nota existente para obter o dados_json atual
    const res = await pool.query(
      `SELECT id, dados_json, numero_processo, documento_habil, numero_empenho, tipo_documento,
              numero_nota, chave_acesso, fornecedor_cnpj, fornecedor_nome, destinatario_cnpj,
              destinatario_nome, optante_simples, valor_bruto, valor_liquido, total_retido, created_at
       FROM notas_analisadas
       WHERE id = $1 AND uasg = $2;`,
      [id, uasg]
    );

    if (res.rows.length === 0) {
      throw new Error(`Análise nº ${id} não encontrada para a UASG ${uasg}.`);
    }

    const row = res.rows[0];
    const dadosJson = row.dados_json || {};

    const processoFinal = dados.numeroProcesso !== undefined 
      ? (dados.numeroProcesso ? String(dados.numeroProcesso).trim() : null) 
      : row.numero_processo;
      
    const docHabilFinal = dados.documentoHabil !== undefined 
      ? (dados.documentoHabil ? String(dados.documentoHabil).trim() : null) 
      : row.documento_habil;
      
    const empenhoFinal = dados.numeroEmpenho !== undefined 
      ? (dados.numeroEmpenho ? String(dados.numeroEmpenho).trim().toUpperCase() : null) 
      : row.numero_empenho;

    // Atualiza dentro do JSON também para integridade completa
    dadosJson.numeroProcesso = processoFinal || undefined;
    dadosJson.documentoHabil = docHabilFinal || undefined;
    dadosJson.numeroEmpenho = empenhoFinal || undefined;

    await pool.query(
      `UPDATE notas_analisadas SET
        numero_processo = $1,
        documento_habil = $2,
        numero_empenho = $3,
        dados_json = $4,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $5 AND uasg = $6;`,
      [processoFinal, docHabilFinal, empenhoFinal, JSON.stringify(dadosJson), id, uasg]
    );

    // Sincroniza em cache de memória
    const regMemoria: NotaHistoricoRegistro = {
      id,
      tipoDocumento: row.tipo_documento,
      numeroNota: row.numero_nota,
      chaveAcesso: row.chave_acesso,
      fornecedorCnpj: row.fornecedor_cnpj,
      fornecedorNome: row.fornecedor_nome,
      destinatarioCnpj: row.destinatario_cnpj,
      destinatarioNome: row.destinatario_nome,
      optanteSimples: row.optante_simples,
      valorBruto: parseFloat(row.valor_bruto) || 0,
      valorLiquido: parseFloat(row.valor_liquido) || 0,
      totalRetido: parseFloat(row.total_retido) || 0,
      numeroProcesso: processoFinal || undefined,
      numeroEmpenho: empenhoFinal || undefined,
      documentoHabil: docHabilFinal || undefined,
      uasg,
      dadosJson,
      createdAt: row.created_at,
      updatedAt: new Date()
    };
    const mapaUasg = this.obterMapaUasg(uasg);
    const chaves = this.gerarChavesCache(regMemoria);
    for (const k of chaves) {
      mapaUasg.set(k, regMemoria);
    }

    // Dispara sincronização com Rauf App
    try {
      const resultadoComChaves = {
        ...dadosJson,
        numeroProcesso: processoFinal || dadosJson.numeroProcesso,
        documentoHabil: docHabilFinal || dadosJson.documentoHabil,
        numeroEmpenho: empenhoFinal || dadosJson.numeroEmpenho
      };
      await RaufIntegrationService.inserirOuAtualizarRetencao(resultadoComChaves);
    } catch (eRauf: any) {
      console.warn('Aviso na sincronização de retenções com Rauf_App:', eRauf?.message || eRauf);
    }

    return {
      id,
      numeroProcesso: processoFinal,
      documentoHabil: docHabilFinal,
      numeroEmpenho: empenhoFinal
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
      uasg: r.uasg || undefined,
      usuarioId: r.usuario_id || undefined,
      usuarioEmail: r.usuario_email || undefined,
      dadosJson: r.dados_json,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  }
}
