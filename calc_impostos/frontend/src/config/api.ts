// Configuração centralizada da URL da API do backend
// Permite definir via VITE_API_URL em produção (ex: no Render) ou fallback para localhost em desenvolvimento local
export const API_BASE_URL = import.meta.env.VITE_API_URL 
  ? (import.meta.env.VITE_API_URL as string).replace(/\/$/, '') 
  : 'http://localhost:3001';
