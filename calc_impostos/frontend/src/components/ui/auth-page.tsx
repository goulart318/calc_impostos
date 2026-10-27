import React, { useState, useEffect } from 'react';
import { Building2Icon, ShieldCheckIcon, FileSearchIcon, LayersIcon } from 'lucide-react';
import { SignInPage, GlassInputWrapper } from './sign-in';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/apiFetch';
import heroImage from '@/assets/login-hero.jpg';

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

  const campoUasg = (
    <div>
      <label htmlFor="uasg-select" className="text-sm font-medium text-slate-400">
        Unidade Gestora (UASG)
      </label>
      <GlassInputWrapper>
        <select
          id="uasg-select"
          value={uasgId}
          onChange={(e) => setUasgId(e.target.value)}
          disabled={carregandoUasgs || submetendo}
          className="w-full bg-transparent text-sm text-white p-4 rounded-2xl focus:outline-none disabled:opacity-60 cursor-pointer"
        >
          {carregandoUasgs ? (
            <option value="" className="bg-slate-900">Carregando Unidades Gestoras...</option>
          ) : uasgs.length === 0 ? (
            <option value="" className="bg-slate-900">Nenhuma UASG ativa disponível</option>
          ) : (
            uasgs.map((u) => (
              <option key={u.id} value={u.id} className="bg-slate-900 text-white">
                {u.sigla ? `${u.sigla} (UASG ${u.uasg})` : `UASG ${u.uasg}`} — {u.nome}
              </option>
            ))
          )}
        </select>
      </GlassInputWrapper>
      <p className="mt-1.5 text-[11px] leading-snug text-slate-500">
        Usuários convencionais são vinculados à sua UASG de atuação cadastrada.
      </p>
    </div>
  );

  return (
    <SignInPage
      brand={
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-blue-600 text-white shadow-xl shadow-blue-600/30 ring-1 ring-blue-400/40">
            <Building2Icon className="size-6" />
          </div>
          <div>
            <p className="text-lg font-bold tracking-tight text-white leading-tight">Retenções Tributárias</p>
            <p className="text-[11px] text-blue-400 font-medium tracking-wide uppercase">
              Matriz Fiscal &amp; Liquidações SIAFI
            </p>
          </div>
        </div>
      }
      title={<span className="font-light text-white tracking-tighter">Acesse sua conta</span>}
      description="Insira suas credenciais institucionais para acessar o painel de retenções fiscais."
      heroImageSrc={heroImage}
      highlights={[
        {
          icon: <ShieldCheckIcon className="size-5" />,
          title: 'IN RFB nº 1.234/2012',
          text: 'Retenções federais por NCM e código de serviço, com fundamentação legal.',
        },
        {
          icon: <FileSearchIcon className="size-5" />,
          title: 'NF-e e NFS-e',
          text: 'Leitura automática de XML e PDF e relatório individualizado para o SEI.',
        },
        {
          icon: <LayersIcon className="size-5" />,
          title: 'Isolamento por UASG',
          text: 'Notas, memória tributária e histórico separados por unidade gestora.',
        },
      ]}
      extraFields={campoUasg}
      email={email}
      password={senha}
      onEmailChange={setEmail}
      onPasswordChange={setSenha}
      onSignIn={handleSubmit}
      loading={submetendo}
      submitDisabled={carregandoUasgs}
      error={erro}
      submitLabel="Entrar na Plataforma"
      loadingLabel="Autenticando credenciais..."
      footer={
        <div className="border-t border-slate-800 pt-5 text-center space-y-1.5">
          <p className="text-xs text-slate-400">
            Acesso exclusivo a servidores e auditores autorizados da EBSERH e instituições integradas.
          </p>
          <p className="text-[11px] text-slate-500 font-mono">
            v1.2.0 • Sistema Integrado de Retenções Tributárias (SIAFI / SEI)
          </p>
        </div>
      }
    />
  );
}
