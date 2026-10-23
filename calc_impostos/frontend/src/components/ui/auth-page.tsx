import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
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
  AlertCircleIcon
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
            // Seleciona preferencialmente a 155012 ou a primeira
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
    <main
      style={{
        minHeight: '100vh',
        backgroundColor: '#0f172a',
        color: '#f8fafc',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
        position: 'relative',
        overflow: 'hidden'
      }}
      className="relative min-h-screen lg:grid lg:grid-cols-2 bg-slate-900 text-slate-100"
    >
      {/* Coluna Esquerda: Institucional / Branding com FloatingPaths */}
      <div
        style={{
          position: 'relative',
          padding: '2.5rem',
          backgroundColor: 'rgba(2, 6, 23, 0.7)',
          borderRight: '1px solid #1e293b',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          overflow: 'hidden',
          minHeight: '260px'
        }}
        className="relative hidden h-full flex-col border-r border-slate-800 bg-slate-950/70 p-10 lg:flex overflow-hidden"
      >
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'linear-gradient(to top, #020617, transparent)' }} className="from-slate-950 absolute inset-0 z-10 bg-gradient-to-t to-transparent pointer-events-none" />
        
        <div style={{ position: 'relative', zIndex: 20, display: 'flex', alignItems: 'center', gap: '0.75rem' }} className="z-20 flex items-center gap-3">
          <div style={{ padding: '0.625rem', borderRadius: '0.75rem', backgroundColor: '#2563eb', color: '#ffffff' }} className="p-2.5 rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-500/20">
            <Building2Icon className="size-6" />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#ffffff' }} className="text-xl font-bold tracking-tight text-white">Retenções Tributárias</p>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#60a5fa', fontWeight: 500 }} className="text-xs text-blue-400 font-medium">Matriz Fiscal & Liquidações SIAFI</p>
          </div>
        </div>

        <div style={{ position: 'relative', zIndex: 20, marginTop: 'auto', maxWidth: '32rem', display: 'flex', flexDirection: 'column', gap: '1rem' }} className="z-20 mt-auto space-y-4 max-w-lg">
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 500, backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#93c5fd', border: '1px solid rgba(59, 130, 246, 0.2)', width: 'fit-content' }}>
            <ShieldCheckIcon className="size-4" />
            Em conformidade com a IN RFB nº 1.234/2012
          </div>
          <blockquote style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <p style={{ margin: 0, fontSize: '1.15rem', color: '#e2e8f0', fontWeight: 300, lineHeight: 1.6 }}>
              &ldquo;Instrução e auditoria automatizada de retenções federais (IR, CSLL, PIS, COFINS, INSS e ISS) para notas fiscais de bens e serviços com integração ao SIAFI.&rdquo;
            </p>
            <footer style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#94a3b8' }}>
              Hospital Universitário Cassiano Antônio Moraes — HUCAM/EBSERH
            </footer>
          </blockquote>
        </div>

        <div style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          <FloatingPaths position={1} />
          <FloatingPaths position={-1} />
        </div>
      </div>

      {/* Coluna Direita: Formulário de Autenticação */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          minHeight: '100vh',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '2rem 1.5rem',
          backgroundColor: '#0f172a',
          zIndex: 20
        }}
        className="relative flex min-h-screen flex-col justify-center p-6 md:p-12 bg-slate-900"
      >
        <div
          aria-hidden
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.4 }}
          className="absolute inset-0 isolate contain-strict -z-10 opacity-40 pointer-events-none"
        >
          <div className="bg-[radial-gradient(50%_50%_at_50%_50%,rgba(37,99,235,0.15)_0,transparent_100%)] absolute top-0 right-0 h-[500px] w-[500px] -translate-y-1/2 rounded-full" />
        </div>

        <div style={{ width: '100%', maxWidth: '24rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }} className="mx-auto w-full max-w-sm space-y-6">
          {/* Header Mobile */}
          <div className="flex items-center gap-3 lg:hidden mb-2">
            <div className="p-2 rounded-lg bg-blue-600 text-white">
              <Building2Icon className="size-5" />
            </div>
            <div>
              <p className="text-lg font-bold text-white">Retenções Tributárias</p>
              <p className="text-xs text-blue-400">Plataforma de Matriz Fiscal</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Acesse sua conta
            </h1>
            <p className="text-sm text-slate-400">
              Selecione sua UASG de atuação e insira suas credenciais.
            </p>
          </div>

          {erro && (
            <div className="p-3.5 rounded-lg bg-red-950/60 border border-red-500/40 text-red-200 text-sm flex items-start gap-2.5 animate-fadeIn">
              <AlertCircleIcon className="size-5 text-red-400 shrink-0 mt-0.5" />
              <span>{erro}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Seletor de UASG */}
            <div className="space-y-1.5">
              <label htmlFor="uasg-select" className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Unidade Gestora (UASG)
              </label>
              <div className="relative">
                <select
                  id="uasg-select"
                  value={uasgId}
                  onChange={(e) => setUasgId(e.target.value)}
                  disabled={carregandoUasgs || submetendo}
                  className="w-full h-11 px-3.5 rounded-lg border border-slate-700 bg-slate-800/90 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:opacity-60"
                >
                  {carregandoUasgs ? (
                    <option value="">Carregando UASGs...</option>
                  ) : uasgs.length === 0 ? (
                    <option value="">Nenhuma UASG ativa</option>
                  ) : (
                    uasgs.map((u) => (
                      <option key={u.id} value={u.id} className="bg-slate-900 text-white">
                        {u.sigla ? `${u.sigla} (UASG ${u.uasg})` : `UASG ${u.uasg}`} — {u.nome}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>

            {/* E-mail */}
            <div className="space-y-1.5">
              <label htmlFor="email-input" className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                E-mail Institucional
              </label>
              <div className="relative">
                <Input
                  id="email-input"
                  placeholder="usuario@ebserh.gov.br"
                  className="peer ps-10 h-11 bg-slate-800/90 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-blue-500"
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
              <label htmlFor="password-input" className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Senha
              </label>
              <div className="relative">
                <Input
                  id="password-input"
                  placeholder="••••••••"
                  className="peer ps-10 pe-10 h-11 bg-slate-800/90 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-blue-500"
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
                  className="absolute inset-y-0 end-0 flex items-center pe-3.5 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  {mostrarSenha ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={submetendo || carregandoUasgs}
              className="w-full h-11 bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm rounded-lg shadow-md transition-all mt-2"
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

          <div className="pt-4 border-t border-slate-800/80 text-center">
            <p className="text-xs text-slate-500">
              Acesso exclusivo a servidores e auditores autorizados.
            </p>
            <p className="text-[11px] text-slate-600 mt-1">
              v1.2.0 &bull; Sistema Integrado de Retenções Tributárias
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

function FloatingPaths({ position }: { position: number }) {
  const paths = Array.from({ length: 36 }, (_, i) => ({
    id: i,
    d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${
      380 - i * 5 * position
    } -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${
      152 - i * 5 * position
    } ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${
      684 - i * 5 * position
    } ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
    color: `rgba(59, 130, 246, ${0.08 + i * 0.02})`,
    width: 0.5 + i * 0.03,
  }));

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', width: '100%', height: '100%', overflow: 'hidden' }} className="pointer-events-none absolute inset-0">
      <svg
        style={{ width: '100%', height: '100%', display: 'block' }}
        className="h-full w-full text-blue-500/20"
        viewBox="0 0 696 316"
        fill="none"
      >
        <title>Linhas de Conexão</title>
        {paths.map((path) => (
          <motion.path
            key={path.id}
            d={path.d}
            stroke="currentColor"
            strokeWidth={path.width}
            strokeOpacity={0.15 + path.id * 0.02}
            initial={{ pathLength: 0.3, opacity: 0.6 }}
            animate={{
              pathLength: 1,
              opacity: [0.3, 0.7, 0.3],
              pathOffset: [0, 1, 0],
            }}
            transition={{
              duration: 20 + Math.random() * 10,
              repeat: Number.POSITIVE_INFINITY,
              ease: 'linear',
            }}
          />
        ))}
      </svg>
    </div>
  );
}
