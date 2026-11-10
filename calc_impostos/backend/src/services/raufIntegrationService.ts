import { pool } from '../config/db';
import { ResultadoConsolidado } from './taxEngine';
import { RaufCredenciaisService } from './raufCredenciaisService';

/**
 * Integração do calc_impostos com o Rauf SaaS (somente via API REST autenticada).
 *
 * Segurança / multitenant:
 *  - Nenhum acesso direto ao banco do Rauf (a antiga RAUF_DATABASE_URL foi removida).
 *  - Cada órgão possui uma chave de API própria (gerada pelo admin do órgão no Rauf).
 *    O Rauf define o tenant e a UASG pela chave; o payload nunca decide o órgão.
 *  - Chaves ficam apenas no servidor (variáveis de ambiente), nunca no front-end:
 *      RAUF_API_KEYS="155012:rauf_xxx,155125:rauf_yyy"   (vários órgãos), ou
 *      RAUF_API_KEY="rauf_xxx"                            (instalação de um único órgão)
 *      RAUF_API_URL (padrão https://rauf-app-backend.onrender.com)
 *      CALC_UASG_PADRAO (padrão 155012 - HUCAM) usada enquanto não houver login por órgão.
 *
 * Chave de cruzamento com o Rauf: PROCESSO SEI. Chave única do registro:
 * processo + NS da liquidação (AAAANSXXXXXX) + nota fiscal + UASG.
 *
 * Resiliência: falhas de rede/5xx vão para a fila local `rauf_sync_pendentes` e são reenviadas.
 */

export interface IdentidadeOrgaoRauf {
  id: number;
  nome: string;
  cnpj: string;
  uasg: string;
  sigla: string;
  municipio?: string;
}

interface ResultadoSync {
  sucesso: boolean;
  id?: number;
  mensagem: string;
  ignorado?: boolean;
  pendente?: boolean;
  motivo?: 'SEM_PROCESSO' | 'SEM_NS' | 'CNPJ_INVALIDO' | 'SEM_CHAVE' | 'RECUSADO' | 'FILA' | 'OK';
}

export interface JobHistorico {
  uasg: string;
  apenasDiagnostico: boolean;
  concluido: boolean;
  total: number;
  processados: number;
  contagem: Record<string, number>;
  problemas: Array<{ id: number; notaFiscal: string; processo: string; documentoHabil: string; fornecedor: string; motivo: string; mensagem: string }>;
  iniciadoEm: string;
  finalizadoEm: string | null;
  erro: string | null;
}

const RE_NS = /(\d{4})\s*NS\s*0*(\d{1,6})\b/i;

export function normalizarProcessoSei(v?: string | null): string | null {
  const d = (v || '').replace(/\D/g, '');
  if (d.length !== 17) return null;
  return `${d.slice(0, 5)}.${d.slice(5, 11)}/${d.slice(11, 15)}-${d.slice(15)}`;
}

export function normalizarNS(v?: string | null): string | null {
  const m = RE_NS.exec((v || '').toUpperCase());
  if (!m || Number(m[2]) === 0) return null;
  return `${m[1]}NS${String(Number(m[2])).padStart(6, '0')}`;
}

function cnpjValido(v?: string | null): boolean {
  const d = (v || '').replace(/\D/g, '');
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const dv = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = base.split('').reduce((s, c, i) => s + Number(c) * pesos[i], 0) % 11;
    return r < 2 ? '0' : String(11 - r);
  };
  return d[12] === dv(d.slice(0, 12)) && d[13] === dv(d.slice(0, 13));
}

export class RaufIntegrationService {
  private static chavesPorUasg: Map<string, string> | null = null;

  private static getApiUrl(): string {
    return (process.env.RAUF_API_URL || 'https://rauf-app-backend.onrender.com').replace(/\/$/, '');
  }

  /** Descarta o cache de chaves (após cadastrar/remover pela tela). */
  public static invalidarChaves(): void {
    this.chavesPorUasg = null;
  }

  /** Valida uma chave no Rauf e devolve a identidade do órgão (a UASG é a informada pelo Rauf). */
  public static async validarChave(chave: string): Promise<IdentidadeOrgaoRauf> {
    return this.chamar<IdentidadeOrgaoRauf>('GET', '/retencoes/minha-instituicao', chave);
  }

  public static uasgPadrao(): string {
    return (process.env.CALC_UASG_PADRAO || '155012').replace(/\D/g, '').padStart(6, '0');
  }

  /** Mapa UASG -> chave de API (somente servidor). */
  private static async carregarChaves(): Promise<Map<string, string>> {
    if (this.chavesPorUasg) return this.chavesPorUasg;
    const mapa = new Map<string, string>();
    // Chaves cadastradas pela tela (cifradas no banco); o ambiente tem precedência em caso de conflito
    for (const [uasg, chave] of await RaufCredenciaisService.chavesDecifradas()) mapa.set(uasg, chave);
    for (const par of (process.env.RAUF_API_KEYS || '').split(/[,;]/)) {
      const [uasg, chave] = par.split(':').map(s => (s || '').trim());
      if (uasg && chave) mapa.set(uasg.replace(/\D/g, '').padStart(6, '0'), chave);
    }
    const unica = (process.env.RAUF_API_KEY || '').trim();
    if (unica) {
      try {
        const ident = await this.chamar<IdentidadeOrgaoRauf>('GET', '/retencoes/minha-instituicao', unica);
        if (ident?.uasg) mapa.set(ident.uasg.padStart(6, '0'), unica);
      } catch (e: any) {
        console.warn('⚠️ [Rauf] RAUF_API_KEY não pôde ser validada:', e?.message || e);
      }
    }
    // Só memoriza se encontrou algo (evita travar em falha momentânea de rede)
    if (mapa.size > 0) this.chavesPorUasg = mapa;
    return mapa;
  }

  private static async chamar<T = any>(metodo: 'GET' | 'POST', caminho: string, chave: string, corpo?: unknown): Promise<T> {
    const resp = await fetch(`${this.getApiUrl()}${caminho}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', 'X-API-Key': chave },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: AbortSignal.timeout(15000)
    });
    if (!resp.ok) {
      const erro: any = new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
      erro.status = resp.status;
      throw erro;
    }
    return (await resp.json()) as T;
  }

  /**
   * Órgãos para os quais ESTE servidor possui chave de integração (nunca lista órgãos de terceiros).
   * Cada identidade vem do próprio Rauf (/retencoes/minha-instituicao), validando a chave.
   */
  public static async listarInstituicoesRauf(): Promise<IdentidadeOrgaoRauf[]> {
    const chaves = await this.carregarChaves();
    const out: IdentidadeOrgaoRauf[] = [];
    for (const [, chave] of chaves) {
      try {
        const i = await this.chamar<IdentidadeOrgaoRauf>('GET', '/retencoes/minha-instituicao', chave);
        out.push({ id: i.id, nome: i.nome || '', cnpj: i.cnpj || '', uasg: i.uasg || '', sigla: i.sigla || '', municipio: i.municipio || '' });
      } catch (e: any) {
        console.warn('⚠️ [Rauf] Falha ao validar uma chave de integração:', e?.message || e);
      }
    }
    return out;
  }

  private static montarPayload(r: ResultadoConsolidado, uasg: string, processo: string, ns: string) {
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
    return {
      uasg,
      numeroProcesso: processo,
      documentoHabil: ns,
      numeroEmpenho: (r.numeroEmpenho || '').trim() || null,
      numeroNota: (r.numeroNota || '').trim() || 'S/N',
      chaveAcesso: (r.chaveAcesso || '').trim() || null,
      fornecedorCnpj: (r.fornecedorCnpj || '').replace(/\D/g, ''),
      fornecedorNome: (r.fornecedorNome || '').trim() || 'Fornecedor',
      valorBruto: Number(Number(r.totalBruto || 0).toFixed(2)),
      totalRetido: Number(Number(r.totalRetidoGeral || 0).toFixed(2)),
      valorLiquido: Number(Number(r.valorLiquido || 0).toFixed(2)),
      optanteSimples: Boolean(r.optanteSimples),
      detalhamento
    };
  }

  private static async enfileirar(uasg: string, payload: any, erro: string): Promise<void> {
    const chave = `${payload.numeroProcesso}|${payload.documentoHabil}|${payload.numeroNota}|${uasg}`;
    try {
      await pool.query(
        `INSERT INTO rauf_sync_pendentes (uasg, chave, payload, tentativas, ultimo_erro)
         VALUES ($1, $2, $3, 0, $4)
         ON CONFLICT (chave) DO UPDATE SET payload = EXCLUDED.payload, ultimo_erro = EXCLUDED.ultimo_erro, updated_at = CURRENT_TIMESTAMP`,
        [uasg, chave, JSON.stringify(payload), erro.slice(0, 500)]
      );
    } catch (e: any) {
      console.warn('⚠️ [Rauf] Não foi possível enfileirar a sincronização pendente:', e?.message || e);
    }
  }

  /**
   * Envia (insere/atualiza) a retenção da nota no Rauf. O órgão é decidido pela UASG -> chave de API.
   */
  public static async inserirOuAtualizarRetencao(r: ResultadoConsolidado): Promise<ResultadoSync> {
    const processo = normalizarProcessoSei(r.numeroProcesso);
    const ns = normalizarNS(r.documentoHabil);

    if (!processo || !ns) {
      return {
        sucesso: false,
        ignorado: true,
        motivo: !processo ? 'SEM_PROCESSO' : 'SEM_NS',
        mensagem: !processo
          ? 'Integração com o Rauf pendente: informe o Nº do processo SEI completo (NNNNN.NNNNNN/AAAA-DD).'
          : 'Integração com o Rauf pendente: informe a NS da liquidação no padrão AAAANSXXXXXX (ex.: 2026NS001313).'
      };
    }
    if (!cnpjValido(r.fornecedorCnpj)) {
      return { sucesso: false, ignorado: true, motivo: 'CNPJ_INVALIDO', mensagem: 'Integração com o Rauf pendente: CNPJ do fornecedor inválido.' };
    }

    const uasg = ((r.uasg || '').replace(/\D/g, '') || this.uasgPadrao()).padStart(6, '0');
    const chaves = await this.carregarChaves();
    const chave = chaves.get(uasg);
    if (!chave) {
      return {
        sucesso: false,
        ignorado: true,
        motivo: 'SEM_CHAVE',
        mensagem: `Sem chave de integração do Rauf configurada para a UASG ${uasg}. Peça ao administrador do órgão para gerar uma chave no Rauf e configure RAUF_API_KEYS.`
      };
    }

    const payload = this.montarPayload(r, uasg, processo, ns);
    try {
      const j = await this.chamar<{ id: number; acao: string }>('POST', '/retencoes/sincronizar', chave, payload);
      await pool.query('DELETE FROM rauf_sync_pendentes WHERE chave = $1', [`${processo}|${ns}|${payload.numeroNota}|${uasg}`]).catch(() => undefined);
      return { sucesso: true, motivo: 'OK', id: j.id, mensagem: `Retenção sincronizada com o Rauf (ID ${j.id}, ${j.acao}).` };
    } catch (e: any) {
      const status = e?.status as number | undefined;
      const transitorio = !status || status >= 500 || status === 429;
      if (transitorio) {
        await this.enfileirar(uasg, payload, e?.message || 'falha de rede');
        return { sucesso: false, pendente: true, motivo: 'FILA', mensagem: `Rauf indisponível; a sincronização ficou na fila e será reenviada (${e?.message || e}).` };
      }
      return { sucesso: false, motivo: 'RECUSADO', mensagem: `Rauf recusou a sincronização: ${e?.message || e}` };
    }
  }

  // ───────────── Reenvio do histórico (notas já calculadas e salvas antes da integração) ─────────────
  private static jobsHistorico: Map<string, JobHistorico> = new Map();

  public static statusJobHistorico(uasg: string): JobHistorico | null {
    return this.jobsHistorico.get(uasg) || null;
  }

  /**
   * Lê as notas salvas da UASG e envia ao Rauf as que tiverem processo SEI completo e NS válida.
   * `apenasDiagnostico` só classifica (não envia). Roda em segundo plano; acompanhe por statusJobHistorico.
   */
  public static iniciarReenvioHistorico(uasgBruta: string, apenasDiagnostico: boolean): JobHistorico {
    const uasg = (uasgBruta || '').replace(/\D/g, '').padStart(6, '0');
    const atual = this.jobsHistorico.get(uasg);
    if (atual && !atual.concluido) return atual;

    const job: JobHistorico = {
      uasg, apenasDiagnostico, concluido: false, total: 0, processados: 0,
      contagem: {}, problemas: [], iniciadoEm: new Date().toISOString(), finalizadoEm: null, erro: null
    };
    this.jobsHistorico.set(uasg, job);

    (async () => {
      try {
        const r = await pool.query(
          `SELECT id, numero_nota, numero_processo, documento_habil, numero_empenho, fornecedor_nome, dados_json
             FROM notas_analisadas WHERE uasg = $1 ORDER BY id ASC`, [uasg]);
        job.total = r.rows.length;
        for (const row of r.rows) {
          const dados: any = typeof row.dados_json === 'string' ? JSON.parse(row.dados_json) : (row.dados_json || {});
          const nota = {
            ...dados,
            uasg,
            numeroProcesso: row.numero_processo || dados.numeroProcesso,
            documentoHabil: row.documento_habil || dados.documentoHabil,
            numeroEmpenho: row.numero_empenho || dados.numeroEmpenho
          } as ResultadoConsolidado;

          let motivo: string;
          let mensagem = '';
          if (apenasDiagnostico) {
            const proc = normalizarProcessoSei(nota.numeroProcesso);
            const ns = normalizarNS(nota.documentoHabil);
            const chaves = await this.carregarChaves();
            motivo = !proc ? 'SEM_PROCESSO' : !ns ? 'SEM_NS' : !cnpjValido(nota.fornecedorCnpj) ? 'CNPJ_INVALIDO'
              : !chaves.get(uasg) ? 'SEM_CHAVE' : 'PRONTA';
          } else {
            const res = await this.inserirOuAtualizarRetencao(nota);
            motivo = res.motivo || (res.sucesso ? 'OK' : 'RECUSADO');
            mensagem = res.mensagem;
          }
          job.contagem[motivo] = (job.contagem[motivo] || 0) + 1;
          if (!['OK', 'PRONTA'].includes(motivo) && job.problemas.length < 300) {
            job.problemas.push({
              id: row.id, notaFiscal: row.numero_nota, processo: row.numero_processo || '',
              documentoHabil: row.documento_habil || '', fornecedor: row.fornecedor_nome, motivo, mensagem
            });
          }
          job.processados++;
        }
      } catch (e: any) {
        job.erro = e?.message || String(e);
      } finally {
        job.concluido = true;
        job.finalizadoEm = new Date().toISOString();
      }
    })();
    return job;
  }

  /** Reenvia a fila local. Chamado periodicamente pelo servidor ou sob demanda pelo usuário. */
  public static async reenviarPendentes(limite = 50, uasgFiltro?: string): Promise<{ enviados: number; restantes: number }> {
    let enviados = 0;
    let linhas: any[] = [];
    const uasgNormalizada = uasgFiltro ? uasgFiltro.replace(/\D/g, '').padStart(6, '0') : undefined;

    try {
      if (uasgNormalizada) {
        linhas = (await pool.query(
          'SELECT id, uasg, chave, payload FROM rauf_sync_pendentes WHERE uasg = $2 ORDER BY id ASC LIMIT $1',
          [limite, uasgNormalizada]
        )).rows;
      } else {
        linhas = (await pool.query(
          'SELECT id, uasg, chave, payload FROM rauf_sync_pendentes ORDER BY id ASC LIMIT $1', [limite]
        )).rows;
      }
    } catch {
      return { enviados: 0, restantes: 0 };
    }

    const chaves = await this.carregarChaves();
    for (const l of linhas) {
      const apiKey = chaves.get(l.uasg);
      if (!apiKey) continue;
      try {
        await this.chamar('POST', '/retencoes/sincronizar', apiKey, l.payload);
        await pool.query('DELETE FROM rauf_sync_pendentes WHERE id = $1', [l.id]);
        enviados++;
      } catch (e: any) {
        const definitivo = e?.status && e.status < 500 && e.status !== 429;
        await pool.query(
          'UPDATE rauf_sync_pendentes SET tentativas = tentativas + 1, ultimo_erro = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
          [l.id, String(e?.message || e).slice(0, 500)]
        ).catch(() => undefined);
        if (definitivo) console.warn(`⚠️ [Rauf] Pendência ${l.chave} recusada definitivamente: ${e?.message}`);
      }
    }

    const countSql = uasgNormalizada
      ? 'SELECT count(*) FROM rauf_sync_pendentes WHERE uasg = $1'
      : 'SELECT count(*) FROM rauf_sync_pendentes';
    const countParams = uasgNormalizada ? [uasgNormalizada] : [];
    const restantes = Number((await pool.query(countSql, countParams).catch(() => ({ rows: [{ count: 0 }] }))).rows[0].count);
    return { enviados, restantes };
  }

  /** Consulta (somente do órgão da UASG informada) as retenções de um processo. */
  public static async consultarRetencaoPorChave(numeroProcesso: string, documentoHabil?: string, uasgInformada?: string) {
    const uasg = ((uasgInformada || '').replace(/\D/g, '') || this.uasgPadrao()).padStart(6, '0');
    const chave = (await this.carregarChaves()).get(uasg);
    if (!chave) return [];
    const qs = new URLSearchParams({ processo: numeroProcesso.trim() });
    if (documentoHabil) qs.set('documento_habil', documentoHabil.trim());
    try {
      return await this.chamar<any[]>('GET', `/retencoes/integracao/consultar?${qs.toString()}`, chave);
    } catch (e: any) {
      console.warn('Erro ao consultar retenções no Rauf:', e?.message || e);
      return [];
    }
  }
}
