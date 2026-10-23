import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { LockIcon, EyeIcon, EyeOffIcon, AlertCircleIcon, CheckCircle2Icon, Loader2Icon, XIcon } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';

export const ModalAlterarSenha: React.FC = () => {
  const { modalSenhaAberto, senhaObrigatoria, alterarSenha, fecharModalSenha, usuario } = useAuth();

  const [senhaAtual, setSenhaAtual] = useState('');
  const [senhaNova, setSenhaNova] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [mostrarSenhas, setMostrarSenhas] = useState(false);

  const [submetendo, setSubmetendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  if (!modalSenhaAberto) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);

    if (!senhaAtual) {
      setErro('Informe sua senha atual.');
      return;
    }
    if (senhaNova.length < 8) {
      setErro('A nova senha deve ter no mínimo 8 caracteres.');
      return;
    }
    if (senhaNova !== confirmarSenha) {
      setErro('A confirmação da nova senha não confere.');
      return;
    }
    if (senhaNova === senhaAtual) {
      setErro('A nova senha deve ser diferente da senha atual.');
      return;
    }

    setSubmetendo(true);
    try {
      await alterarSenha(senhaAtual, senhaNova);
      setSucesso(true);
      setTimeout(() => {
        setSucesso(false);
        setSenhaAtual('');
        setSenhaNova('');
        setConfirmarSenha('');
      }, 1500);
    } catch (err: any) {
      setErro(err?.message || 'Falha ao alterar senha.');
    } finally {
      setSubmetendo(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl text-slate-100 relative">
        {!senhaObrigatoria && (
          <button
            onClick={fecharModalSenha}
            className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
          >
            <XIcon className="size-5" />
          </button>
        )}

        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
            <LockIcon className="size-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Alterar Senha de Acesso</h3>
            <p className="text-xs text-slate-400">{usuario?.email}</p>
          </div>
        </div>

        {senhaObrigatoria && (
          <div className="mb-4 p-3 rounded-lg bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs">
            <strong>Primeiro Acesso:</strong> Por segurança, é obrigatório redefinir sua senha inicial antes de prosseguir.
          </div>
        )}

        {erro && (
          <div className="mb-4 p-3 rounded-lg bg-red-950/60 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
            <AlertCircleIcon className="size-4 shrink-0" />
            <span>{erro}</span>
          </div>
        )}

        {sucesso ? (
          <div className="py-6 text-center space-y-2">
            <CheckCircle2Icon className="size-12 text-green-400 mx-auto animate-bounce" />
            <p className="text-sm font-semibold text-white">Senha alterada com sucesso!</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Senha Atual</label>
              <div className="relative">
                <Input
                  type={mostrarSenhas ? 'text' : 'password'}
                  value={senhaAtual}
                  onChange={(e) => setSenhaAtual(e.target.value)}
                  placeholder="••••••••"
                  className="bg-slate-800 border-slate-700 text-white pe-10"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Nova Senha (mínimo 8 caracteres)</label>
              <div className="relative">
                <Input
                  type={mostrarSenhas ? 'text' : 'password'}
                  value={senhaNova}
                  onChange={(e) => setSenhaNova(e.target.value)}
                  placeholder="••••••••"
                  className="bg-slate-800 border-slate-700 text-white pe-10"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">Confirmar Nova Senha</label>
              <div className="relative">
                <Input
                  type={mostrarSenhas ? 'text' : 'password'}
                  value={confirmarSenha}
                  onChange={(e) => setConfirmarSenha(e.target.value)}
                  placeholder="••••••••"
                  className="bg-slate-800 border-slate-700 text-white pe-10"
                  required
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setMostrarSenhas(!mostrarSenhas)}
                  className="absolute inset-y-0 end-0 flex items-center pe-3 text-slate-400 hover:text-slate-200"
                >
                  {mostrarSenhas ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                </button>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              {!senhaObrigatoria && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={fecharModalSenha}
                  disabled={submetendo}
                  className="w-1/2 border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  Cancelar
                </Button>
              )}
              <Button
                type="submit"
                disabled={submetendo}
                className={`bg-blue-600 hover:bg-blue-500 text-white ${senhaObrigatoria ? 'w-full' : 'w-1/2'}`}
              >
                {submetendo ? (
                  <>
                    <Loader2Icon className="size-4 animate-spin me-2" />
                    Salvando...
                  </>
                ) : (
                  'Salvar Nova Senha'
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
