import React, { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/apiFetch';
import { useAuth } from '@/contexts/AuthContext';
import {
  UsersIcon,
  BuildingIcon,
  UserPlusIcon,
  KeyIcon,
  RefreshCwIcon,
  ShieldIcon,
  CheckCircle2Icon,
  AlertCircleIcon,
  CopyIcon,
  CheckIcon,
  XIcon,
  PlusIcon,
  CloudDownloadIcon
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';

interface UsuarioAdmin {
  id: number;
  nome: string;
  email: string;
  role: 'superadmin' | 'usuario';
  ativo: boolean;
  forca_troca_senha: boolean;
  ultimo_login: string | null;
  uasg_origem_id: number | null;
  uasg_origem: string | null;
  uasg_sigla: string | null;
}

interface UasgAdmin {
  id: number;
  uasg: string;
  sigla: string | null;
  nome: string;
  cnpj: string | null;
  municipio: string | null;
  rauf_instituicao_id: number | null;
  ativo: boolean;
}

export const AdminTab: React.FC = () => {
  const { usuario: usuarioLogado } = useAuth();
  const [subAba, setSubAba] = useState<'usuarios' | 'uasgs'>('usuarios');

  // Estados de Usuários
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([]);
  const [carregandoUsuarios, setCarregandoUsuarios] = useState(false);
  const [modalNovoUsuario, setModalNovoUsuario] = useState(false);
  const [nomeNovoUser, setNomeNovoUser] = useState('');
  const [emailNovoUser, setEmailNovoUser] = useState('');
  const [uasgNovoUser, setUasgNovoUser] = useState<string>('');
  const [senhaNovoUser, setSenhaNovoUser] = useState('');
  const [roleNovoUser, setRoleNovoUser] = useState<'usuario' | 'superadmin'>('usuario');

  // Estados de UASGs
  const [uasgs, setUasgs] = useState<UasgAdmin[]>([]);
  const [carregandoUasgs, setCarregandoUasgs] = useState(false);
  const [modalNovaUasg, setModalNovaUasg] = useState(false);
  const [codigoNovaUasg, setCodigoNovaUasg] = useState('');
  const [siglaNovaUasg, setSiglaNovaUasg] = useState('');
  const [nomeNovaUasg, setNomeNovaUasg] = useState('');
  const [cnpjNovaUasg, setCnpjNovaUasg] = useState('');
  const [municipioNovaUasg, setMunicipioNovaUasg] = useState('');

  // Modal de Exibição de Senha Temporária Gerada
  const [senhaGeradaModal, setSenhaGeradaModal] = useState<{ email: string; senha: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  // Feedback geral
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);
  const [sincronizandoRauf, setSincronizandoRauf] = useState(false);

  const carregarUsuarios = async () => {
    setCarregandoUsuarios(true);
    try {
      const data = await apiFetch<UsuarioAdmin[]>('/api/admin/usuarios');
      setUsuarios(data);
    } catch (e: any) {
      setMensagem({ tipo: 'erro', texto: e.message || 'Erro ao carregar usuários.' });
    } finally {
      setCarregandoUsuarios(false);
    }
  };

  const carregarUasgs = async () => {
    setCarregandoUasgs(true);
    try {
      const data = await apiFetch<UasgAdmin[]>('/api/admin/uasgs');
      setUasgs(data);
      if (data.length > 0 && !uasgNovoUser) {
        setUasgNovoUser(String(data[0].id));
      }
    } catch (e: any) {
      setMensagem({ tipo: 'erro', texto: e.message || 'Erro ao carregar UASGs.' });
    } finally {
      setCarregandoUasgs(false);
    }
  };

  useEffect(() => {
    carregarUsuarios();
    carregarUasgs();
  }, []);

  const handleCriarUsuario = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ id: number; senhaTemporaria: string }>('/api/admin/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: nomeNovoUser,
          email: emailNovoUser,
          uasgOrigemId: Number(uasgNovoUser),
          senha: senhaNovoUser || undefined,
          role: roleNovoUser
        })
      });

      setModalNovoUsuario(false);
      setNomeNovoUser('');
      setEmailNovoUser('');
      setSenhaNovoUser('');
      carregarUsuarios();

      setSenhaGeradaModal({
        email: emailNovoUser,
        senha: res.senhaTemporaria
      });
    } catch (e: any) {
      setMensagem({ tipo: 'erro', texto: e.message || 'Erro ao criar usuário.' });
    }
  };

  const handleResetarSenha = async (user: UsuarioAdmin) => {
    if (!confirm(`Deseja realmente redefinir a senha de ${user.nome} (${user.email})? Uma nova senha temporária será gerada.`)) {
      return;
    }
    try {
      const res = await apiFetch<{ senhaTemporaria: string }>(`/api/admin/usuarios/${user.id}/resetar-senha`, {
        method: 'POST'
      });
      setSenhaGeradaModal({
        email: user.email,
        senha: res.senhaTemporaria
      });
      carregarUsuarios();
    } catch (e: any) {
      setMensagem({ tipo: 'erro', texto: e.message || 'Erro ao resetar senha.' });
    }
  };

  const handleToggleAtivo = async (user: UsuarioAdmin) => {
    try {
      await apiFetch(`/api/admin/usuarios/${user.id}/ativo`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo: !user.ativo })
      });
      carregarUsuarios();
    } catch (e: any) {
      setMensagem({ tipo: 'erro', texto: e.message || 'Erro ao atualizar status.' });
    }
  };

  const handleCriarUasg = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/uasgs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uasg: codigoNovaUasg,
          sigla: siglaNovaUasg,
          nome: nomeNovaUasg,
          cnpj: cnpjNovaUasg,
          municipio: municipioNovaUasg
        })
      });
      setModalNovaUasg(false);
      setCodigoNovaUasg('');
      setSiglaNovaUasg('');
      setNomeNovaUasg('');
      setCnpjNovaUasg('');
      setMunicipioNovaUasg('');
      setMensagem({ tipo: 'sucesso', texto: 'UASG cadastrada com sucesso!' });
      carregarUasgs();
    } catch (e: any) {
      setMensagem({ tipo: 'erro', texto: e.message || 'Erro ao cadastrar UASG.' });
    }
  };

  const handleImportarRauf = async () => {
    setSincronizandoRauf(true);
    setMensagem(null);
    try {
      const res = await apiFetch<{ criadas: number; atualizadas: number; mensagem: string }>('/api/admin/uasgs/importar-rauf', {
        method: 'POST'
      });
      setMensagem({ tipo: 'sucesso', texto: res.mensagem });
      carregarUasgs();
    } catch (e: any) {
      setMensagem({ tipo: 'erro', texto: e.message || 'Erro ao importar órgãos do Rauf.' });
    } finally {
      setSincronizandoRauf(false);
    }
  };

  const copiarSenha = () => {
    if (senhaGeradaModal) {
      navigator.clipboard.writeText(senhaGeradaModal.senha);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner / Header da aba */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl bg-slate-900 border border-slate-800 text-white">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
            <ShieldIcon className="size-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Painel de Superadministração</h2>
            <p className="text-xs text-slate-400">
              Gerencie usuários com suas respectivas UASGs de origem e o catálogo de Unidades Gestoras.
            </p>
          </div>
        </div>

        {/* Alternador de Sub-Abas */}
        <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700/80 self-start sm:self-auto">
          <button
            onClick={() => setSubAba('usuarios')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition-all ${
              subAba === 'usuarios'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <UsersIcon className="size-4" />
            Usuários ({usuarios.length})
          </button>
          <button
            onClick={() => setSubAba('uasgs')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition-all ${
              subAba === 'uasgs'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <BuildingIcon className="size-4" />
            UASGs / Órgãos ({uasgs.length})
          </button>
        </div>
      </div>

      {mensagem && (
        <div
          className={`p-4 rounded-lg flex items-center justify-between gap-3 text-sm animate-fadeIn ${
            mensagem.tipo === 'sucesso'
              ? 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-200'
              : 'bg-red-950/60 border border-red-500/40 text-red-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {mensagem.tipo === 'sucesso' ? (
              <CheckCircle2Icon className="size-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircleIcon className="size-5 text-red-400 shrink-0" />
            )}
            <span>{mensagem.texto}</span>
          </div>
          <button onClick={() => setMensagem(null)} className="text-slate-400 hover:text-white">
            <XIcon className="size-4" />
          </button>
        </div>
      )}

      {/* ===================== SUB-ABA USUÁRIOS ===================== */}
      {subAba === 'usuarios' && (
        <div className="card space-y-4">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">Usuários Cadastrados</h3>
              <p className="text-xs text-slate-500">
                Cada usuário possui uma UASG de origem. No login, o usuário só acessa sua UASG.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={carregarUsuarios}
                disabled={carregandoUsuarios}
                className="text-xs"
              >
                <RefreshCwIcon className={`size-3.5 me-1.5 ${carregandoUsuarios ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
              <Button
                size="sm"
                onClick={() => setModalNovoUsuario(true)}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs"
              >
                <UserPlusIcon className="size-3.5 me-1.5" />
                Novo Usuário
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold">
                <tr>
                  <th className="p-3">Nome</th>
                  <th className="p-3">E-mail</th>
                  <th className="p-3">Perfil</th>
                  <th className="p-3">UASG de Origem</th>
                  <th className="p-3">Último Acesso</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {usuarios.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-slate-400">
                      Nenhum usuário cadastrado.
                    </td>
                  </tr>
                ) : (
                  usuarios.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 font-medium text-slate-900">{u.nome}</td>
                      <td className="p-3 text-slate-600 font-mono">{u.email}</td>
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${
                            u.role === 'superadmin'
                              ? 'bg-purple-100 text-purple-700 border border-purple-200'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}
                        >
                          {u.role === 'superadmin' ? 'Superadmin' : 'Usuário'}
                        </span>
                      </td>
                      <td className="p-3 text-slate-700">
                        {u.role === 'superadmin' ? (
                          <span className="text-slate-400 italic">Todas (livre escolha)</span>
                        ) : u.uasg_origem ? (
                          <span>
                            <strong>{u.uasg_sigla || u.uasg_origem}</strong> (UASG {u.uasg_origem})
                          </span>
                        ) : (
                          <span className="text-amber-600">Não vinculada</span>
                        )}
                      </td>
                      <td className="p-3 text-slate-500">
                        {u.ultimo_login ? new Date(u.ultimo_login).toLocaleString('pt-BR') : 'Nunca acessou'}
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${
                            u.ativo
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {u.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="p-3 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          onClick={() => handleResetarSenha(u)}
                          title="Redefinir Senha"
                          className="px-2 py-1 rounded text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors inline-flex items-center gap-1"
                        >
                          <KeyIcon className="size-3" />
                          Senha
                        </button>
                        {u.email !== 'ulisses.goularte@ebserh.gov.br' && u.id !== usuarioLogado?.id && (
                          <button
                            onClick={() => handleToggleAtivo(u)}
                            className={`px-2 py-1 rounded text-xs transition-colors ${
                              u.ativo
                                ? 'bg-red-50 hover:bg-red-100 text-red-600'
                                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-600'
                            }`}
                          >
                            {u.ativo ? 'Inativar' : 'Ativar'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===================== SUB-ABA UASGS ===================== */}
      {subAba === 'uasgs' && (
        <div className="card space-y-4">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">Unidades Gestoras (UASGs)</h3>
              <p className="text-xs text-slate-500">
                Catálogo de órgãos para operação isolada e identificação fiscal em notas e conciliações.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={carregarUasgs}
                disabled={carregandoUasgs}
                className="text-xs"
              >
                <RefreshCwIcon className={`size-3.5 me-1.5 ${carregandoUasgs ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleImportarRauf}
                disabled={sincronizandoRauf}
                className="text-xs border-blue-300 text-blue-700 hover:bg-blue-50"
              >
                <CloudDownloadIcon className={`size-3.5 me-1.5 ${sincronizandoRauf ? 'animate-spin' : ''}`} />
                {sincronizandoRauf ? 'Importando...' : 'Importar do Rauf'}
              </Button>
              <Button
                size="sm"
                onClick={() => setModalNovaUasg(true)}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs"
              >
                <PlusIcon className="size-3.5 me-1.5" />
                Nova UASG
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-semibold">
                <tr>
                  <th className="p-3">UASG</th>
                  <th className="p-3">Sigla / UG</th>
                  <th className="p-3">Nome Oficial / Razão Social</th>
                  <th className="p-3">CNPJ do Tomador</th>
                  <th className="p-3">Município</th>
                  <th className="p-3">Vínculo Rauf</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {uasgs.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3 font-mono font-bold text-blue-700">{u.uasg}</td>
                    <td className="p-3 font-semibold text-slate-900">{u.sigla || '—'}</td>
                    <td className="p-3 text-slate-700">{u.nome}</td>
                    <td className="p-3 font-mono text-slate-600">{u.cnpj || '—'}</td>
                    <td className="p-3 text-slate-600">{u.municipio || '—'}</td>
                    <td className="p-3 text-slate-500">
                      {u.rauf_instituicao_id ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                          <CheckCircle2Icon className="size-3" /> ID {u.rauf_instituicao_id}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Local</span>
                      )}
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${
                          u.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {u.ativo ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===================== MODAL NOVO USUÁRIO ===================== */}
      {modalNovoUsuario && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl text-slate-100 relative">
            <button
              onClick={() => setModalNovoUsuario(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <XIcon className="size-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
                <UserPlusIcon className="size-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Cadastrar Novo Usuário</h3>
                <p className="text-xs text-slate-400">Semelhante ao modelo de cadastro do Rauf</p>
              </div>
            </div>

            <form onSubmit={handleCriarUsuario} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-300">Nome Completo</label>
                <Input
                  value={nomeNovoUser}
                  onChange={(e) => setNomeNovoUser(e.target.value)}
                  placeholder="ex: João da Silva"
                  className="bg-slate-800 border-slate-700 text-white"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-300">E-mail Institucional</label>
                <Input
                  type="email"
                  value={emailNovoUser}
                  onChange={(e) => setEmailNovoUser(e.target.value)}
                  placeholder="joao.silva@ebserh.gov.br"
                  className="bg-slate-800 border-slate-700 text-white"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-300">Perfil de Acesso</label>
                <select
                  value={roleNovoUser}
                  onChange={(e) => setRoleNovoUser(e.target.value as any)}
                  className="w-full h-10 px-3 rounded-md border border-slate-700 bg-slate-800 text-white text-xs"
                >
                  <option value="usuario">Usuário Comum (vinculado a uma UASG)</option>
                  <option value="superadmin">Superadmin (acesso irrestrito e troca de UASGs)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-300">
                  UASG de Origem {roleNovoUser === 'superadmin' && '(Opcional para Superadmin)'}
                </label>
                <select
                  value={uasgNovoUser}
                  onChange={(e) => setUasgNovoUser(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-slate-700 bg-slate-800 text-white text-xs"
                  required={roleNovoUser !== 'superadmin'}
                >
                  {uasgs.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.sigla ? `${u.sigla} (UASG ${u.uasg})` : `UASG ${u.uasg}`} — {u.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-300">
                  Senha Inicial (opcional — se vazia, será gerada aleatoriamente)
                </label>
                <Input
                  type="text"
                  value={senhaNovoUser}
                  onChange={(e) => setSenhaNovoUser(e.target.value)}
                  placeholder="Deixe em branco para gerar automática"
                  className="bg-slate-800 border-slate-700 text-white font-mono"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setModalNovoUsuario(false)}
                  className="w-1/2 border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  Cancelar
                </Button>
                <Button type="submit" className="w-1/2 bg-blue-600 hover:bg-blue-500 text-white">
                  Cadastrar Usuário
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL NOVA UASG ===================== */}
      {modalNovaUasg && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl text-slate-100 relative">
            <button
              onClick={() => setModalNovaUasg(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <XIcon className="size-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
                <BuildingIcon className="size-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Cadastrar Unidade Gestora</h3>
                <p className="text-xs text-slate-400">Modo isolado ou sem conexão com o Rauf</p>
              </div>
            </div>

            <form onSubmit={handleCriarUasg} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-300">Código UASG (6 dígitos)</label>
                  <Input
                    maxLength={6}
                    value={codigoNovaUasg}
                    onChange={(e) => setCodigoNovaUasg(e.target.value.replace(/\D/g, ''))}
                    placeholder="155012"
                    className="bg-slate-800 border-slate-700 text-white font-mono"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-300">Sigla / UG</label>
                  <Input
                    value={siglaNovaUasg}
                    onChange={(e) => setSiglaNovaUasg(e.target.value.toUpperCase())}
                    placeholder="HUCAM"
                    className="bg-slate-800 border-slate-700 text-white"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-300">Nome Oficial / Razão Social</label>
                <Input
                  value={nomeNovaUasg}
                  onChange={(e) => setNomeNovaUasg(e.target.value)}
                  placeholder="Hospital Universitário..."
                  className="bg-slate-800 border-slate-700 text-white"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-300">CNPJ do Tomador</label>
                  <Input
                    value={cnpjNovaUasg}
                    onChange={(e) => setCnpjNovaUasg(e.target.value.replace(/\D/g, ''))}
                    placeholder="15126437000658"
                    className="bg-slate-800 border-slate-700 text-white font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-slate-300">Município (ISSQN)</label>
                  <Input
                    value={municipioNovaUasg}
                    onChange={(e) => setMunicipioNovaUasg(e.target.value)}
                    placeholder="Vitória"
                    className="bg-slate-800 border-slate-700 text-white"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setModalNovaUasg(false)}
                  className="w-1/2 border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  Cancelar
                </Button>
                <Button type="submit" className="w-1/2 bg-blue-600 hover:bg-blue-500 text-white">
                  Cadastrar UASG
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL SENHA GERADA (FEEDBACK) ===================== */}
      {senhaGeradaModal && (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl text-slate-100 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30">
                <KeyIcon className="size-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Senha de Acesso Gerada</h3>
                <p className="text-xs text-slate-400">{senhaGeradaModal.email}</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <span className="font-mono text-xl font-bold tracking-wider text-emerald-400 select-all">
                {senhaGeradaModal.senha}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={copiarSenha}
                className="border-slate-700 text-slate-200 hover:bg-slate-800"
              >
                {copiado ? <CheckIcon className="size-4 text-emerald-400" /> : <CopyIcon className="size-4" />}
                <span className="ms-1.5 text-xs">{copiado ? 'Copiada!' : 'Copiar'}</span>
              </Button>
            </div>

            <p className="text-xs text-amber-300 bg-amber-950/40 p-3 rounded-lg border border-amber-500/30">
              ⚠️ <strong>Importante:</strong> Esta senha só é exibida neste momento. Copie e repasse ao usuário. Ele será orientado a alterá-la no primeiro acesso.
            </p>

            <Button
              className="w-full bg-blue-600 hover:bg-blue-500 text-white"
              onClick={() => setSenhaGeradaModal(null)}
            >
              Compreendi e Copiei a Senha
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
