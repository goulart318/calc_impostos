import { API_BASE_URL } from '../config/api';

const TOKEN_KEY = 'calc_token';

export function obterToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function salvarToken(token: string | null): void {
  try {
    if (token) {
      sessionStorage.setItem(TOKEN_KEY, token);
    } else {
      sessionStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // sessionStorage indisponível
  }
}

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(message: string, status: number, data?: any) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

/**
 * Wrapper de fetch que anexa automaticamente o token JWT no cabeçalho Authorization
 * para requisições direcionadas à API do backend.
 */
export async function apiFetch<T = any>(
  input: string | URL,
  init?: RequestInit
): Promise<T> {
  const urlStr = typeof input === 'string' ? input : input.toString();
  const ehApiLocal = urlStr.startsWith(API_BASE_URL) || urlStr.startsWith('/api') || !urlStr.startsWith('http');
  
  const headers = new Headers(init?.headers || {});
  
  if (ehApiLocal) {
    const token = obterToken();
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  const finalUrl = urlStr.startsWith('http')
    ? urlStr
    : `${API_BASE_URL}${urlStr.startsWith('/') ? '' : '/'}${urlStr}`;

  const response = await fetch(finalUrl, {
    ...init,
    headers
  });

  if (response.status === 401 && ehApiLocal) {
    salvarToken(null);
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
  }

  // Resposta não-JSON (ex: PDF download)
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    if (!response.ok) {
      const text = await response.text();
      throw new ApiError(text || `Erro HTTP ${response.status}`, response.status);
    }
    return response as unknown as T;
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const msg = data?.error || data?.message || `Erro HTTP ${response.status}`;
    throw new ApiError(msg, response.status, data);
  }

  return data as T;
}
