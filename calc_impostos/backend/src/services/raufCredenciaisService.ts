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
}

function segredo(): Buffer | null {
  const s = (process.env.CALC_SECRET_KEY || '').trim();
  if (s.length < 16) return null;
  return crypto.createHash('sha256').update(s).digest();
}

export function cadastroPelaTelaHabilitado(): boolean {
  return segredo() !== null && !!(process.env.CALC_ADMIN_TOKEN || '').trim();
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
      'SELECT uasg, nome_orgao, prefixo, validada_em FROM rauf_credenciais ORDER BY uasg'
    );
    return r.rows.map(x => ({
      uasg: x.uasg,
      nomeOrgao: x.nome_orgao,
      prefixo: x.prefixo,
      validadaEm: x.validada_em ? new Date(x.validada_em).toISOString() : null
    }));
  }

  static async salvar(uasg: string, nomeOrgao: string, chave: string): Promise<void> {
    await pool.query(
      `INSERT INTO rauf_credenciais (uasg, nome_orgao, prefixo, chave_cifrada, validada_em, updated_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (uasg) DO UPDATE SET nome_orgao = EXCLUDED.nome_orgao, prefixo = EXCLUDED.prefixo,
         chave_cifrada = EXCLUDED.chave_cifrada, validada_em = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`,
      [uasg, nomeOrgao, chave.slice(0, 10), cifrar(chave)]
    );
  }

  static async remover(uasg: string): Promise<boolean> {
    const r = await pool.query('DELETE FROM rauf_credenciais WHERE uasg = $1', [uasg]);
    return (r.rowCount || 0) > 0;
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
