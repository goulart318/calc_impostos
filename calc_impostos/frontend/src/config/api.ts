// Configuração centralizada da URL da API do backend
// Garante o protocolo https:// caso o Render passe apenas o host (ex: calc-impostos-backend.onrender.com)
const rawUrl = import.meta.env.VITE_API_URL;

export const API_BASE_URL = (() => {
  if (!rawUrl) return 'http://localhost:3001';
  let url = String(rawUrl).trim().replace(/\/$/, '');
  
  // Se for apenas o nome do serviço sem ponto (ex: calc-impostos-backend)
  if (!url.includes('.')) {
    url = `${url}.onrender.com`;
  }
  
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }
  return url;
})();
