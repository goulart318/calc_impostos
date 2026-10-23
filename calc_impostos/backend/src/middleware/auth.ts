import { Request, Response, NextFunction } from 'express';
import { AuthService, AuthError } from '../services/authService';
import { contextoStorage, ContextoSessao } from '../services/requestContext';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      sessao?: ContextoSessao;
    }
  }
}

/** Exige token JWT válido e injeta o contexto (usuário + UASG ativa) na requisição e no AsyncLocalStorage. */
export async function autenticar(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) {
      return res.status(401).json({ error: 'Autenticação necessária.' });
    }
    const sessao = await AuthService.contextoDoToken(token);
    req.sessao = sessao;
    contextoStorage.run(sessao, () => next());
  } catch (err: any) {
    if (err instanceof AuthError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('Erro no middleware de autenticação:', err);
    return res.status(500).json({ error: 'Erro ao validar a sessão.' });
  }
}

export function exigirSuperadmin(req: Request, res: Response, next: NextFunction) {
  if (req.sessao?.usuario.role !== 'superadmin') {
    return res.status(403).json({ error: 'Acesso restrito ao superadmin.' });
  }
  next();
}

/**
 * Reentra no contexto da sessão após callbacks de streams (ex.: multer), onde o AsyncLocalStorage
 * pode ser perdido.
 */
export function reentrarContexto(req: Request, fn: () => void) {
  if (req.sessao) contextoStorage.run(req.sessao, fn);
  else fn();
}
