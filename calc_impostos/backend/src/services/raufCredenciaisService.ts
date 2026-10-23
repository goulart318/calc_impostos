import crypto from 'crypto';
import { pool } from '../config/db';

/**
 * Armazenamento das chaves de integração do Rauf recebidas pela tela do calc_impostos.
 *
 * - A chave é cifrada (AES-256-GCM) com CALC_SECRET_KEY antes de ir ao banco e nunca é devolvida à tela.
 * - A UASG do registro é a que o PRÓPRIO Rauf informa ao validar a chave; o usuário não escolhe.
 * - Sem CALC_SECRET_KEY o cadastro pela tela fica desabilitado (use RAUF_API_KEYS no ambiente).
 */

export interface CredencialRauf {
  uasg: string;
  nomeOrgao: string;
  prefixo: string;
  validadaEm: string | null;
  cadastradoPorEmail?: string | null;
}

export interface AuditoriaChaveRauf {
  id: number;
  uasg: string;
  nomeOrgao?: string;
  acao: 'CADASTRO' | 'REMOCAO';
  usuarioId?: number | null;
  usuarioEmail?: string | null;
  ipOrigem?: string | null;
  createdAt: string;
}

function segredo(): Buffer | null {
  const s = (process.env.CALC_SECRET_KEY || '').trim();
  if (s.length < 16) return null;
  return crypto.createHash('sha256').update(s).digest();
}

export function cadastroPelaTelaHabilitado(): boolean {
  // Acesso às rotas é controlado pelo login (superadmin); basta o segredo de cifra das chaves.
  return segredo() !== null;
}

function cifrar(texto: string): string {
  const k = segredo();
  if (!k) throw new Error('CALC_SECRET_KEY não configurada.');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', k, iv);
  const enc = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map(b => b.toString('base64')).join('.');
}

function decifrar(valor: string): string | null {
  const k = segredo();
  if (!k) return null;
  try {
    const [iv, tag, enc] = valor.split('.').map(p => Buffer.from(p, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', k, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** Comparação em tempo constante do token de administração do servidor. */
export function tokenAdminValido(informado?: string): boolean {
  const esperado = (process.env.CALC_ADMIN_TOKEN || '').trim();
  if (!esperado || !informado) return false;
  const a = crypto.createHash('sha256').update(informado).digest();
  const b = crypto.createHash('sha256').update(esperado).digest();
  return crypto.timingSafeEqual(a, b);
}

export class RaufCredenciaisService {
  static async listar(): Promise<CredencialRauf[]> {
    const r = await pool.query(
      'SELECT uasg, nome_orgao, prefixo, validada_em, cadastrado_por_email FROM rauf_credenciais ORDER BY uasg'
    );
    return r.rows.map(x => ({
      uasg: x.uasg,
      nomeOrgao: x.nome_orgao,
      prefixo: x.prefixo,
      validadaEm: x.validada_em ? new Date(x.validada_em).toISOString() : null,
      cadastradoPorEmail: x.cadastrado_por_email || null
    }));
  }

  static async salvar(
    uasg: string,
    nomeOrgao: string,
    chave: string,
    usuarioId?: number | null,
    usuarioEmail?: string | null,
    ipOrigem?: string | null
  ): Promise<void> {
    await pool.query(
      `INSERT INTO rauf_credenciais (uasg, nome_orgao, prefixo, chave_cifrada, validada_em, cadastrado_por_id, cadastrado_por_email, updated_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5, $6, CURRENT_TIMESTAMP)
       ON CONFLICT (uasg) DO UPDATE SET nome_orgao = EXCLUDED.nome_orgao, prefixo = EXCLUDED.prefixo,
         chave_cifrada = EXCLUDED.chave_cifrada, validada_em = CURRENT_TIMESTAMP,
         cadastrado_por_id = EXCLUDED.cadastrado_por_id, cadastrado_por_email = EXCLUDED.cadastrado_por_email,
         updated_at = CURRENT_TIMESTAMP`,
      [uasg, nomeOrgao, chave.slice(0, 10), cifrar(chave), usuarioId || null, usuarioEmail || null]
    );

    // Grava histórico de auditoria
    try {
      await pool.query(
        `INSERT INTO auditoria_chaves_rauf (uasg, nome_orgao, acao, usuario_id, usuario_email, ip_origem, created_at)
         VALUES ($1, $2, 'CADASTRO', $3, $4, $5, CURRENT_TIMESTAMP);`,
        [uasg, nomeOrgao, usuarioId || null, usuarioEmail || null, ipOrigem || null]
      );
    } catch (err: any) {
      console.warn('Aviso ao registrar auditoria de cadastro de chave Rauf:', err?.message || err);
    }
  }

  static async remover(
    uasg: string,
    usuarioId?: number | null,
    usuarioEmail?: string | null,
    ipOrigem?: string | null
  ): Promise<boolean> {
    let nomeOrgao = '';
    try {
      const info = await pool.query('SELECT nome_orgao FROM rauf_credenciais WHERE uasg = $1;', [uasg]);
      if (info.rows.length > 0) {
        nomeOrgao = info.rows[0].nome_orgao;
      }
    } catch {
      /* ignora erro de leitura prévia */
    }

    const r = await pool.query('DELETE FROM rauf_credenciais WHERE uasg = $1', [uasg]);
    const removido = (r.rowCount || 0) > 0;

    if (removido) {
      try {
        await pool.query(
          `INSERT INTO auditoria_chaves_rauf (uasg, nome_orgao, acao, usuario_id, usuario_email, ip_origem, created_at)
           VALUES ($1, $2, 'REMOCAO', $3, $4, $5, CURRENT_TIMESTAMP);`,
          [uasg, nomeOrgao || null, usuarioId || null, usuarioEmail || null, ipOrigem || null]
        );
      } catch (err: any) {
        console.warn('Aviso ao registrar auditoria de remoção de chave Rauf:', err?.message || err);
      }
    }

    return removido;
  }

  static async listarAuditoria(uasg?: string): Promise<AuditoriaChaveRauf[]> {
    try {
      let query = 'SELECT id, uasg, nome_orgao, acao, usuario_id, usuario_email, ip_origem, created_at FROM auditoria_chaves_rauf';
      const params: any[] = [];
      if (uasg) {
        query += ' WHERE uasg = $1';
        params.push(uasg.replace(/\D/g, '').padStart(6, '0'));
      }
      query += ' ORDER BY created_at DESC LIMIT 100;';
      const r = await pool.query(query, params);
      return r.rows.map(x => ({
        id: x.id,
        uasg: x.uasg,
        nomeOrgao: x.nome_orgao,
        acao: x.acao,
        usuarioId: x.usuario_id,
        usuarioEmail: x.usuario_email,
        ipOrigem: x.ip_origem,
        createdAt: x.created_at ? new Date(x.created_at).toISOString() : new Date().toISOString()
      }));
    } catch {
      return [];
    }
  }

  /** Mapa UASG -> chave em texto puro (uso interno do servidor). */
  static async chavesDecifradas(): Promise<Map<string, string>> {
    const mapa = new Map<string, string>();
    try {
      const r = await pool.query('SELECT uasg, chave_cifrada FROM rauf_credenciais');
      for (const x of r.rows) {
        const chave = decifrar(x.chave_cifrada);
        if (chave) mapa.set(x.uasg, chave);
      }
    } catch {
      /* tabela ainda não criada ou banco indisponível */
    }
    return mapa;
  }
}
