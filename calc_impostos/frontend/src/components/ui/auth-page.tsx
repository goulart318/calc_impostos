import React, { useState, useEffect } from 'react';
import { Button } from './button';
import { Input } from './input';
import {
  AtSignIcon,
  LockIcon,
  Building2Icon,
  ShieldCheckIcon,
  EyeIcon,
  EyeOffIcon,
  Loader2Icon,
  AlertCircleIcon,
  CheckCircle2Icon
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/apiFetch';

interface UasgItem {
  id: number;
  uasg: string;
  sigla: string | null;
  nome: string;
}

export function AuthPage() {
  const { login } = useAuth();
  const [uasgs, setUasgs] = useState<UasgItem[]>([]);
  const [carregandoUasgs, setCarregandoUasgs] = useState(true);

  const [uasgId, setUasgId] = useState<string>('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);

  const [submetendo, setSubmetendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    async function carregar() {
      try {
        const lista = await apiFetch<UasgItem[]>('/api/auth/uasgs');
        if (ativo) {
          setUasgs(lista);
          if (lista.length > 0) {
            const padrao = lista.find(u => u.uasg === '155012') || lista[0];
            setUasgId(String(padrao.id));
          }
        }
      } catch (e: any) {
        if (ativo) {
          setErro('Não foi possível carregar a lista de UASGs do servidor.');
        }
      } finally {
        if (ativo) setCarregandoUasgs(false);
      }
    }
    carregar();
    return () => {
      ativo = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);

    if (!uasgId) {
      setErro('Selecione a Unidade Gestora (UASG).');
      return;
    }
    if (!email.trim()) {
      setErro('Informe o seu e-mail institucional.');
      return;
    }
    if (!senha) {
      setErro('Informe a sua senha.');
      return;
    }

    setSubmetendo(true);
    try {
      await login(Number(uasgId), email.trim(), senha);
    } catch (err: any) {
      setErro(err?.message || 'Falha ao autenticar. Verifique seus dados.');
    } finally {
      setSubmetendo(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#0a0f1d] text-slate-100 flex flex-col lg:grid lg:grid-cols-2 relative">
      {/* Coluna Esquerda: Branding Institucional (Exibida em telas grandes) */}
      <div className="hidden lg:flex relative flex-col justify-between p-12 bg-gradient-to-br from-slate-950 via-[#0b1329] to-[#0a0f1d] border-r border-slate-800/80 overflow-hidden">
        {/* Padrão geométrico suave de fundo em SVG estático (sem carga de GPU) */}
        <div className="absolute inset-0 opacity-15 pointer-events-none">
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
            <defs>
              <pattern id="grid-pattern" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(59, 130, 246, 0.4)" strokeWidth="0.8" />
              </pattern>
              <radialGradient id="grad-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid-pattern)" />
            <circle cx="20%" cy="30%" r="280" fill="url(#grad-glow)" />
          </svg>
        </div>

        {/* Topo: Logo e Nome do Sistema */}
        <div className="relative z-10 flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-blue-600 text-white shadow-xl shadow-blue-600/30 ring-1 ring-blue-400/40">
            <Building2Icon className="size-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white leading-tight">Retenções Tributárias</h1>
            <p className="text-xs text-blue-400 font-medium tracking-wide uppercase">Matriz Fiscal & Liquidações SIAFI</p>
          </div>
        </div>

        {/* Centro / Base: Destaques de Compliance */}
        <div className="relative z-10 space-y-6 max-w-lg">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-300 border border-blue-500/25">
            <ShieldCheckIcon className="size-4 text-blue-400" />
            Conformidade com a IN RFB nº 1.234/2012 e LC nº 116/2003
          </div>

          <div className="space-y-3">
            <blockquote className="text-lg text-slate-200 font-light leading-relaxed">
              &ldquo;Sistema automatizado para análise de notas fiscais (NF-e de compras/materiais e NFS-e de serviços), aplicação automática das regras de retenção tributária federal (IN RFB nº 1.234/2012 por NCM ou código de serviço), previdenciária (IN RFB nº 2.110/2022 / CPRB) e geração de relatório individualizado detalhado para inserção no SEI..&rdquo;
            </blockquote>
            <p className="text-xs font-mono text-slate-400">
              
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
              <div className="flex items-center gap-2 font-semibold text-slate-200 mb-1">
                <CheckCircle2Icon className="size-4 text-emerald-400" />
                Multi-Tenant Real
              </div>
              <p className="text-slate-400 text-[11px] leading-snug">
                Isolamento estrito de notas, memórias tributárias e histórico por UASG.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
              <div className="flex items-center gap-2 font-semibold text-slate-200 mb-1">
                <CheckCircle2Icon className="size-4 text-blue-400" />
                
              </div>
              <p className="text-slate-400 text-[11px] leading-snug">
               
              </p>
            </div>
          </div>
        </div>

        {/* Rodapé institucional */}
        <div className="relative z-10 text-xs text-slate-500 font-mono">
          Ambiente Corporativo Seguro •
        </div>
      </div>

      {/* Coluna Direita: Formulário de Autenticação Estável */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 lg:p-14 relative bg-[#0a0f1d]">
        <div className="w-full max-w-md mx-auto space-y-6">
          {/* Header Mobile com Identidade */}
          <div className="flex items-center gap-3 lg:hidden pb-3 border-b border-slate-800/60">
            <div className="p-2.5 rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
              <Building2Icon className="size-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Retenções Tributárias</h2>
              <p className="text-xs text-blue-400 font-medium">Matriz Fiscal & Liquidações SIAFI</p>
            </div>
          </div>

          {/* Título do Card */}
          <div className="space-y-1.5">
            <h2 className="text-2xl font-bold tracking-tight text-white">
              Acesse sua conta
            </h2>
            <p className="text-sm text-slate-400">
              Selecione sua UASG de atuação e insira suas credenciais corporativas.
            </p>
          </div>

          {/* Mensagem de Erro (se houver) */}
          {erro && (
            <div className="p-3.5 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-sm flex items-start gap-2.5">
              <AlertCircleIcon className="size-5 text-red-400 shrink-0 mt-0.5" />
              <span className="leading-snug">{erro}</span>
            </div>
          )}

          {/* Formulário */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Seletor de UASG */}
            <div className="space-y-1.5">
              <label htmlFor="uasg-select" className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                Unidade Gestora (UASG)
              </label>
              <div className="relative">
                <select
                  id="uasg-select"
                  value={uasgId}
                  onChange={(e) => setUasgId(e.target.value)}
                  disabled={carregandoUasgs || submetendo}
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-700 bg-slate-900/95 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:opacity-60 cursor-pointer"
                >
                  {carregandoUasgs ? (
                    <option value="">Carregando Unidades Gestoras...</option>
                  ) : uasgs.length === 0 ? (
                    <option value="">Nenhuma UASG ativa disponível</option>
                  ) : (
                    uasgs.map((u) => (
                      <option key={u.id} value={u.id} className="bg-slate-900 text-white py-1">
                        {u.sigla ? `${u.sigla} (UASG ${u.uasg})` : `UASG ${u.uasg}`} — {u.nome}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>

            {/* E-mail Institucional */}
            <div className="space-y-1.5">
              <label htmlFor="email-input" className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                E-mail Institucional
              </label>
              <div className="relative">
                <Input
                  id="email-input"
                  placeholder="usuario@ebserh.gov.br"
                  className="ps-10 h-11 bg-slate-900/95 border-slate-700 rounded-xl text-white placeholder:text-slate-500 focus-visible:ring-blue-500"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={submetendo}
                  required
                />
                <div className="text-slate-400 pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3.5">
                  <AtSignIcon className="size-4" aria-hidden="true" />
                </div>
              </div>
            </div>

            {/* Senha */}
            <div className="space-y-1.5">
              <label htmlFor="password-input" className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                Senha de Acesso
              </label>
              <div className="relative">
                <Input
                  id="password-input"
                  placeholder="••••••••"
                  className="ps-10 pe-10 h-11 bg-slate-900/95 border-slate-700 rounded-xl text-white placeholder:text-slate-500 focus-visible:ring-blue-500"
                  type={mostrarSenha ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  disabled={submetendo}
                  required
                />
                <div className="text-slate-400 pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3.5">
                  <LockIcon className="size-4" aria-hidden="true" />
                </div>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setMostrarSenha(!mostrarSenha)}
                  className="absolute inset-y-0 end-0 flex items-center pe-3.5 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                  title={mostrarSenha ? 'Ocultar senha' : 'Ver senha'}
                >
                  {mostrarSenha ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                </button>
              </div>
            </div>

            {/* Botão de Login */}
            <Button
              type="submit"
              disabled={submetendo || carregandoUasgs}
              className="w-full h-11 bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm rounded-xl shadow-lg shadow-blue-600/20 transition-all mt-2 cursor-pointer"
            >
              {submetendo ? (
                <>
                  <Loader2Icon className="size-4 animate-spin me-2" />
                  Autenticando...
                </>
              ) : (
                'Entrar na Plataforma'
              )}
            </Button>
          </form>

          {/* Rodapé do Form */}
          <div className="pt-4 border-t border-slate-800/80 text-center space-y-1">
            <p className="text-xs text-slate-400">
              Acesso exclusivo a servidores e colaboradores autorizados.
            </p>
            <p className="text-[11px] text-slate-500 font-mono">
              v1.2.0 • Sistema Integrado de Retenções Tributárias
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
