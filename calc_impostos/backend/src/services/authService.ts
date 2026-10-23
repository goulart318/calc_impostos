import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { pool } from '../config/db';
import { UasgSessao, UsuarioSessao, ContextoSessao } from './requestContext';

export const MASTER_EMAIL = 'ulisses.goularte@ebserh.gov.br';
const MASTER_SENHA_INICIAL = 'admin123';
const MASTER_NOME = 'Ulisses Goularte';

const TOKEN_VALIDADE = '8h';
const MAX_TENTATIVAS = 5;
const BLOQUEIO_MINUTOS = 15;
export const SENHA_MIN_CARACTERES = 8;

let jwtSecretCache: string | null = null;
function jwtSecret(): string {
  if (jwtSecretCache) return jwtSecretCache;
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 16) {
    jwtSecretCache = process.env.JWT_SECRET;
  } else {
    // Sem JWT_SECRET configurado: segredo efêmero (sessões caem a cada reinício do servidor).
    jwtSecretCache = crypto.randomBytes(48).toString('hex');
    console.warn('⚠️ JWT_SECRET não definido (ou < 16 caracteres). Usando segredo temporário: as sessões serão invalidadas a cada reinício. Defina JWT_SECRET no .env / Render.');
  }
  return jwtSecretCache;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

interface TokenPayload {
  sub: number;
  uasgAtiva: number;
}

function mapUasg(r: any): UasgSessao {
  return {
    id: r.id,
    uasg: r.uasg,
    sigla: r.sigla,
    nome: r.nome,
    cnpj: r.cnpj,
    municipio: r.municipio,
    raufInstituicaoId: r.rauf_instituicao_id ?? null
  };
}

function mapUsuario(r: any): UsuarioSessao {
  return {
    id: r.id,
    nome: r.nome,
    email: r.email,
    role: r.role,
    uasgOrigemId: r.uasg_origem_id ?? null,
    forcaTrocaSenha: !!r.forca_troca_senha
  };
}

export class AuthService {
  /** Cria o superadmin master (idempotente). Chamado após a carga do schema. */
  static async garantirMaster(): Promise<void> {
    const existe = await pool.query('SELECT id FROM usuarios_calc WHERE email = $1', [MASTER_EMAIL]);
    if (existe.rows.length > 0) return;
    const hash = await bcrypt.hash(MASTER_SENHA_INICIAL, 10);
    await pool.query(
      `INSERT INTO usuarios_calc (nome, email, senha_hash, role, uasg_origem_id, ativo, forca_troca_senha)
       VALUES ($1, $2, $3, 'superadmin', NULL, TRUE, FALSE)`,
      [MASTER_NOME, MASTER_EMAIL, hash]
    );
    console.log(`👤 Superadmin master criado: ${MASTER_EMAIL}`);
  }

  static validarSenhaNova(senha: string): void {
    if (typeof senha !== 'string' || senha.length < SENHA_MIN_CARACTERES) {
      throw new AuthError(`A senha deve ter no mínimo ${SENHA_MIN_CARACTERES} caracteres.`);
    }
  }

  static gerarSenhaAleatoria(tamanho = 10): string {
    const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const bytes = crypto.randomBytes(tamanho);
    let s = '';
    for (let i = 0; i < tamanho; i++) s += alfabeto[bytes[i] % alfabeto.length];
    return s;
  }

  static async hashSenha(senha: string): Promise<string> {
    return bcrypt.hash(senha, 10);
  }

  static emitirToken(usuarioId: number, uasgAtivaId: number): string {
    const payload: TokenPayload = { sub: usuarioId, uasgAtiva: uasgAtivaId };
    return jwt.sign(payload, jwtSecret(), { expiresIn: TOKEN_VALIDADE });
  }

  /** Valida o token e reconstrói o contexto lendo usuário/UASG atuais do banco (reflete inativações imediatamente). */
  static async contextoDoToken(token: string): Promise<ContextoSessao> {
    let payload: any;
    try {
      payload = jwt.verify(token, jwtSecret());
    } catch {
      throw new AuthError('Sessão expirada ou inválida. Faça login novamente.', 401);
    }
    const u = await pool.query('SELECT * FROM usuarios_calc WHERE id = $1', [payload.sub]);
    if (u.rows.length === 0 || !u.rows[0].ativo) {
      throw new AuthError('Usuário inativo ou inexistente.', 401);
    }
    const usuario = mapUsuario(u.rows[0]);
    const ua = await pool.query('SELECT * FROM uasgs WHERE id = $1', [payload.uasgAtiva]);
    if (ua.rows.length === 0 || !ua.rows[0].ativo) {
      throw new AuthError('UASG da sessão inativa ou inexistente.', 401);
    }
    // Usuário comum só pode operar na UASG de origem
    if (usuario.role !== 'superadmin' && usuario.uasgOrigemId !== ua.rows[0].id) {
      throw new AuthError('UASG não autorizada para este usuário.', 401);
    }
    return { usuario, uasg: mapUasg(ua.rows[0]) };
  }

  // Controle em memória de tentativas falhas por IP (máximo 10 falhas a cada 15 min)
  private static tentativasPorIp: Map<string, { falhas: number; bloqueadoAte?: number }> = new Map();

  private static verificarIpBloqueado(ip?: string): void {
    if (!ip) return;
    const registro = this.tentativasPorIp.get(ip);
    if (!registro) return;
    const agora = Date.now();
    if (registro.bloqueadoAte && registro.bloqueadoAte > agora) {
      const min = Math.ceil((registro.bloqueadoAte - agora) / 60000);
      throw new AuthError(`Muitas tentativas a partir deste IP. Tente novamente em ${min} minuto(s).`, 429);
    }
    if (registro.bloqueadoAte && registro.bloqueadoAte <= agora) {
      this.tentativasPorIp.delete(ip);
    }
  }

  private static registrarFalhaIp(ip?: string): void {
    if (!ip) return;
    const agora = Date.now();
    const registro = this.tentativasPorIp.get(ip) || { falhas: 0 };
    registro.falhas += 1;
    if (registro.falhas >= 10) {
      registro.bloqueadoAte = agora + 15 * 60 * 1000;
    }
    this.tentativasPorIp.set(ip, registro);
  }

  private static limparFalhasIp(ip?: string): void {
    if (ip) this.tentativasPorIp.delete(ip);
  }

  static async listarUasgsPublicas() {
    try {
      const r = await pool.query('SELECT id, uasg, sigla, nome FROM uasgs WHERE ativo = TRUE ORDER BY sigla NULLS LAST, uasg');
      if (r.rows && r.rows.length > 0) return r.rows;
    } catch (err: any) {
      console.warn('Aviso ao consultar UASGs públicas (usando semente segura):', err?.message || err);
    }
    return [
      { id: 1, uasg: '155012', sigla: 'HUCAM', nome: 'Hospital Universitário Cassiano Antônio Moraes' }
    ];
  }

  static async login(uasgId: number, emailRaw: string, senha: string, ipOrigem?: string) {
    if (ipOrigem) this.verificarIpBloqueado(ipOrigem);

    const msgGenerica = 'UASG, e-mail ou senha inválidos.';
    const email = String(emailRaw || '').trim().toLowerCase();
    if (!email || !senha || !uasgId) {
      if (ipOrigem) this.registrarFalhaIp(ipOrigem);
      throw new AuthError(msgGenerica, 401);
    }

    const r = await pool.query('SELECT * FROM usuarios_calc WHERE email = $1', [email]);
    if (r.rows.length === 0) {
      if (ipOrigem) this.registrarFalhaIp(ipOrigem);
      throw new AuthError(msgGenerica, 401);
    }
    const row = r.rows[0];

    // Mensagem genérica impede saber se a conta existe, está inativa ou bloqueada (anti-enumeração)
    if (!row.ativo) {
      if (ipOrigem) this.registrarFalhaIp(ipOrigem);
      throw new AuthError(msgGenerica, 401);
    }

    if (row.bloqueado_ate && new Date(row.bloqueado_ate) > new Date()) {
      if (ipOrigem) this.registrarFalhaIp(ipOrigem);
      throw new AuthError(msgGenerica, 401);
    }

    const senhaOk = await bcrypt.compare(senha, row.senha_hash);
    if (!senhaOk) {
      if (ipOrigem) this.registrarFalhaIp(ipOrigem);
      const tentativas = (row.tentativas_falhas || 0) + 1;
      if (tentativas >= MAX_TENTATIVAS) {
        await pool.query(
          `UPDATE usuarios_calc SET tentativas_falhas = 0, bloqueado_ate = NOW() + ($2 || ' minutes')::interval WHERE id = $1`,
          [row.id, String(BLOQUEIO_MINUTOS)]
        );
      } else {
        await pool.query('UPDATE usuarios_calc SET tentativas_falhas = $2 WHERE id = $1', [row.id, tentativas]);
      }
      throw new AuthError(msgGenerica, 401);
    }

    // UASG escolhida: usuário comum só entra na UASG de origem; superadmin em qualquer UASG ativa
    const ua = await pool.query('SELECT * FROM uasgs WHERE id = $1 AND ativo = TRUE', [uasgId]);
    if (ua.rows.length === 0) {
      if (ipOrigem) this.registrarFalhaIp(ipOrigem);
      throw new AuthError(msgGenerica, 401);
    }
    if (row.role !== 'superadmin' && row.uasg_origem_id !== ua.rows[0].id) {
      if (ipOrigem) this.registrarFalhaIp(ipOrigem);
      throw new AuthError(msgGenerica, 401);
    }

    if (ipOrigem) this.limparFalhasIp(ipOrigem);
    await pool.query('UPDATE usuarios_calc SET tentativas_falhas = 0, bloqueado_ate = NULL, ultimo_login = NOW() WHERE id = $1', [row.id]);
    console.log(`🔐 Login: ${row.email} (${row.role}) na UASG ${ua.rows[0].uasg}`);

    return {
      token: this.emitirToken(row.id, ua.rows[0].id),
      usuario: mapUsuario(row),
      uasg: mapUasg(ua.rows[0])
    };
  }

  static async trocarUasg(usuarioId: number, uasgId: number) {
    const ua = await pool.query('SELECT * FROM uasgs WHERE id = $1 AND ativo = TRUE', [uasgId]);
    if (ua.rows.length === 0) throw new AuthError('UASG inexistente ou inativa.', 404);
    console.log(`🔁 Superadmin ${usuarioId} trocou a UASG de trabalho para ${ua.rows[0].uasg}`);
    return { token: this.emitirToken(usuarioId, uasgId), uasg: mapUasg(ua.rows[0]) };
  }

  static async alterarSenha(usuarioId: number, senhaAtual: string, senhaNova: string) {
    this.validarSenhaNova(senhaNova);
    const r = await pool.query('SELECT senha_hash FROM usuarios_calc WHERE id = $1', [usuarioId]);
    if (r.rows.length === 0) throw new AuthError('Usuário não encontrado.', 404);
    if (!(await bcrypt.compare(senhaAtual || '', r.rows[0].senha_hash))) {
      throw new AuthError('Senha atual incorreta.', 400);
    }
    if (senhaAtual === senhaNova) {
      throw new AuthError('A nova senha deve ser diferente da senha atual.');
    }
    const hash = await bcrypt.hash(senhaNova, 10);
    await pool.query('UPDATE usuarios_calc SET senha_hash = $2, forca_troca_senha = FALSE, updated_at = NOW() WHERE id = $1', [usuarioId, hash]);
  }

  // ----------------------- Administração (superadmin) -----------------------

  static async listarUsuarios() {
    const r = await pool.query(
      `SELECT u.id, u.nome, u.email, u.role, u.ativo, u.forca_troca_senha, u.ultimo_login, u.uasg_origem_id,
              ua.uasg AS uasg_origem, ua.sigla AS uasg_sigla
         FROM usuarios_calc u LEFT JOIN uasgs ua ON ua.id = u.uasg_origem_id
        ORDER BY u.role DESC, u.nome`
    );
    return r.rows;
  }

  static async criarUsuario(dados: { nome: string; email: string; uasgOrigemId: number; senha?: string; role?: string }) {
    const nome = String(dados.nome || '').trim();
    const email = String(dados.email || '').trim().toLowerCase();
    if (!nome) throw new AuthError('Informe o nome do usuário.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AuthError('E-mail inválido.');
    if (!dados.uasgOrigemId) throw new AuthError('Selecione a UASG de origem do usuário.');
    const ua = await pool.query('SELECT id FROM uasgs WHERE id = $1', [dados.uasgOrigemId]);
    if (ua.rows.length === 0) throw new AuthError('UASG de origem inexistente.');
    const dup = await pool.query('SELECT id FROM usuarios_calc WHERE email = $1', [email]);
    if (dup.rows.length > 0) throw new AuthError('Já existe um usuário com este e-mail.', 409);

    const senha = dados.senha && dados.senha.trim() ? dados.senha : this.gerarSenhaAleatoria();
    this.validarSenhaNova(senha);
    const role = dados.role === 'superadmin' ? 'superadmin' : 'usuario';
    const hash = await bcrypt.hash(senha, 10);
    const ins = await pool.query(
      `INSERT INTO usuarios_calc (nome, email, senha_hash, role, uasg_origem_id, forca_troca_senha)
       VALUES ($1,$2,$3,$4,$5,TRUE) RETURNING id`,
      [nome, email, hash, role, role === 'superadmin' ? null : dados.uasgOrigemId]
    );
    console.log(`👤 Usuário criado: ${email} (${role})`);
    return { id: ins.rows[0].id, senhaTemporaria: senha };
  }

  static async atualizarUsuario(id: number, dados: { nome?: string; email?: string; uasgOrigemId?: number }) {
    const r = await pool.query('SELECT * FROM usuarios_calc WHERE id = $1', [id]);
    if (r.rows.length === 0) throw new AuthError('Usuário não encontrado.', 404);
    const atual = r.rows[0];
    const nome = dados.nome !== undefined ? String(dados.nome).trim() : atual.nome;
    const email = dados.email !== undefined ? String(dados.email).trim().toLowerCase() : atual.email;
    if (!nome) throw new AuthError('Informe o nome do usuário.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AuthError('E-mail inválido.');
    if (atual.email === MASTER_EMAIL && email !== MASTER_EMAIL) {
      throw new AuthError('O e-mail do superadmin master não pode ser alterado.', 403);
    }
    if (email !== atual.email) {
      const dup = await pool.query('SELECT id FROM usuarios_calc WHERE email = $1 AND id <> $2', [email, id]);
      if (dup.rows.length > 0) throw new AuthError('Já existe um usuário com este e-mail.', 409);
    }
    let uasgOrigem = atual.uasg_origem_id;
    if (atual.role !== 'superadmin' && dados.uasgOrigemId) {
      const ua = await pool.query('SELECT id FROM uasgs WHERE id = $1', [dados.uasgOrigemId]);
      if (ua.rows.length === 0) throw new AuthError('UASG de origem inexistente.');
      uasgOrigem = dados.uasgOrigemId;
    }
    await pool.query('UPDATE usuarios_calc SET nome=$2, email=$3, uasg_origem_id=$4, updated_at=NOW() WHERE id=$1', [id, nome, email, uasgOrigem]);
  }

  static async resetarSenha(id: number) {
    const r = await pool.query('SELECT id, email FROM usuarios_calc WHERE id = $1', [id]);
    if (r.rows.length === 0) throw new AuthError('Usuário não encontrado.', 404);
    const senha = this.gerarSenhaAleatoria();
    const hash = await bcrypt.hash(senha, 10);
    await pool.query(
      'UPDATE usuarios_calc SET senha_hash=$2, forca_troca_senha = (email <> $3), tentativas_falhas=0, bloqueado_ate=NULL, updated_at=NOW() WHERE id=$1',
      [id, hash, MASTER_EMAIL]
    );
    console.log(`🔑 Senha redefinida para o usuário ${r.rows[0].email}`);
    return { senhaTemporaria: senha };
  }

  static async definirAtivo(id: number, ativo: boolean, solicitanteId: number) {
    const r = await pool.query('SELECT email FROM usuarios_calc WHERE id = $1', [id]);
    if (r.rows.length === 0) throw new AuthError('Usuário não encontrado.', 404);
    if (r.rows[0].email === MASTER_EMAIL && !ativo) throw new AuthError('O superadmin master não pode ser inativado.', 403);
    if (id === solicitanteId && !ativo) throw new AuthError('Você não pode inativar o próprio usuário.', 403);
    await pool.query('UPDATE usuarios_calc SET ativo=$2, updated_at=NOW() WHERE id=$1', [id, ativo]);
  }

  static async listarUasgsAdmin() {
    const r = await pool.query('SELECT * FROM uasgs ORDER BY ativo DESC, sigla NULLS LAST, uasg');
    return r.rows;
  }

  private static normalizarUasg(dados: any) {
    const uasg = String(dados.uasg || '').replace(/\D/g, '');
    if (uasg.length !== 6) throw new AuthError('A UASG deve ter exatamente 6 dígitos numéricos.');
    const nome = String(dados.nome || '').trim();
    if (!nome) throw new AuthError('Informe o nome oficial do órgão.');
    const cnpj = String(dados.cnpj || '').replace(/\D/g, '');
    if (cnpj && cnpj.length !== 14) throw new AuthError('CNPJ inválido (informe 14 dígitos).');
    return {
      uasg,
      sigla: String(dados.sigla || '').trim() || null,
      nome,
      cnpj: cnpj || null,
      municipio: String(dados.municipio || '').trim() || null
    };
  }

  static async criarUasg(dados: any) {
    const d = this.normalizarUasg(dados);
    const dup = await pool.query('SELECT id FROM uasgs WHERE uasg = $1', [d.uasg]);
    if (dup.rows.length > 0) throw new AuthError('Já existe uma UASG cadastrada com este código.', 409);
    const ins = await pool.query(
      'INSERT INTO uasgs (uasg, sigla, nome, cnpj, municipio) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [d.uasg, d.sigla, d.nome, d.cnpj, d.municipio]
    );
    return { id: ins.rows[0].id };
  }

  static async atualizarUasg(id: number, dados: any) {
    const d = this.normalizarUasg(dados);
    const dup = await pool.query('SELECT id FROM uasgs WHERE uasg = $1 AND id <> $2', [d.uasg, id]);
    if (dup.rows.length > 0) throw new AuthError('Já existe outra UASG com este código.', 409);
    const ativo = dados.ativo === undefined ? null : !!dados.ativo;
    const r = await pool.query(
      `UPDATE uasgs SET uasg=$2, sigla=$3, nome=$4, cnpj=$5, municipio=$6, ativo=COALESCE($7, ativo), updated_at=NOW() WHERE id=$1`,
      [id, d.uasg, d.sigla, d.nome, d.cnpj, d.municipio, ativo]
    );
    if (r.rowCount === 0) throw new AuthError('UASG não encontrada.', 404);
  }

  /** Upsert de UASGs vindas do Rauf (por código da UASG). */
  static async importarUasgsRauf(instituicoes: Array<{ id: number; uasg: string; sigla?: string; nome: string; cnpj?: string; municipio?: string }>) {
    let criadas = 0;
    let atualizadas = 0;
    for (const i of instituicoes) {
      const uasg = String(i.uasg || '').replace(/\D/g, '');
      if (uasg.length !== 6) continue;
      const cnpj = String(i.cnpj || '').replace(/\D/g, '') || null;
      const ex = await pool.query('SELECT id FROM uasgs WHERE uasg = $1', [uasg]);
      if (ex.rows.length > 0) {
        await pool.query(
          `UPDATE uasgs SET rauf_instituicao_id=$2, sigla=COALESCE(NULLIF($3,''), sigla), nome=COALESCE(NULLIF($4,''), nome),
             cnpj=COALESCE($5, cnpj), municipio=COALESCE(NULLIF($6,''), municipio), updated_at=NOW() WHERE id=$1`,
          [ex.rows[0].id, i.id, i.sigla || '', i.nome || '', cnpj, i.municipio || '']
        );
        atualizadas++;
      } else {
        await pool.query(
          'INSERT INTO uasgs (uasg, sigla, nome, cnpj, municipio, rauf_instituicao_id) VALUES ($1,$2,$3,$4,$5,$6)',
          [uasg, i.sigla || null, i.nome, cnpj, i.municipio || null, i.id]
        );
        criadas++;
      }
    }
    return { criadas, atualizadas };
  }
}
