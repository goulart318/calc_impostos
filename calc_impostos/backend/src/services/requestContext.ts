import { AsyncLocalStorage } from 'async_hooks';

/** Dados da UASG ativa na sessão (a UASG de trabalho do usuário autenticado). */
export interface UasgSessao {
  id: number;
  uasg: string;
  sigla: string | null;
  nome: string;
  cnpj: string | null;
  municipio: string | null;
  raufInstituicaoId: number | null;
}

export interface UsuarioSessao {
  id: number;
  nome: string;
  email: string;
  role: 'superadmin' | 'usuario';
  uasgOrigemId: number | null;
  forcaTrocaSenha: boolean;
}

export interface ContextoSessao {
  usuario: UsuarioSessao;
  uasg: UasgSessao;
}

/**
 * Contexto da requisição (isolamento multi-UASG). Preenchido pelo middleware `autenticar`
 * e lido pelos serviços (histórico, memória tributária, dashboard) sem precisar alterar suas assinaturas.
 */
export const contextoStorage = new AsyncLocalStorage<ContextoSessao>();

export function contextoAtual(): ContextoSessao | undefined {
  return contextoStorage.getStore();
}

/** UASG (código de 6 dígitos) da sessão atual, ou undefined fora de uma requisição autenticada. */
export function uasgDaSessao(): string | undefined {
  return contextoStorage.getStore()?.uasg.uasg;
}

/**
 * Aplica a identidade do órgão (UASG da sessão) ao resultado de uma análise: a UASG/instituição/sigla
 * sempre vêm da sessão autenticada (nunca do corpo da requisição), evitando adulteração entre órgãos.
 * Para NFS-e, o município do tomador também usa o município da UASG quando não informado.
 */
export function aplicarIdentidadeOrgao<T extends Record<string, any>>(resultado: T): T {
  const ctx = contextoStorage.getStore();
  if (!ctx) return resultado;
  const { uasg } = ctx;
  (resultado as any).uasg = uasg.uasg;
  (resultado as any).siglaOrgao = uasg.sigla || undefined;
  if (uasg.raufInstituicaoId != null) (resultado as any).instituicaoId = uasg.raufInstituicaoId;
  if (!(resultado as any).municipioTomador && uasg.municipio) (resultado as any).municipioTomador = uasg.municipio;
  return resultado;
}
