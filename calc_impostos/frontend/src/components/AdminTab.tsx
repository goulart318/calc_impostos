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
  CloudDownloadIcon,
  MailIcon,
  UserIcon,
  SparklesIcon,
  LockIcon,
  InfoIcon,
  SearchIcon
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

  // Estados de busca instantânea
  const [buscaUsuario, setBuscaUsuario] = useState('');
  const [buscaUasg, setBuscaUasg] = useState('');

  const usuariosFiltrados = usuarios.filter((u) => {
    const termo = buscaUsuario.toLowerCase();
    return (
      u.nome.toLowerCase().includes(termo) ||
      u.email.toLowerCase().includes(termo) ||
      (u.uasg_origem && u.uasg_origem.includes(termo)) ||
      (u.uasg_sigla && u.uasg_sigla.toLowerCase().includes(termo))
    );
  });

  const uasgsFiltradas = uasgs.filter((u) => {
    const termo = buscaUasg.toLowerCase();
    return (
      u.uasg.includes(termo) ||
      (u.sigla && u.sigla.toLowerCase().includes(termo)) ||
      u.nome.toLowerCase().includes(termo) ||
      (u.cnpj && u.cnpj.includes(termo)) ||
      (u.municipio && u.municipio.toLowerCase().includes(termo))
    );
  });

  const totalUsuariosAtivos = usuarios.filter((u) => u.ativo).length;
  const totalSuperadmins = usuarios.filter((u) => u.role === 'superadmin').length;
  const totalUasgsAtivas = uasgs.filter((u) => u.ativo).length;
  const totalUasgsRauf = uasgs.filter((u) => u.rauf_instituicao_id).length;

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

  const gerarSenhaAleatoria = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*';
    let pass = 'Ebserh#';
    for (let i = 0; i < 6; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setSenhaNovoUser(pass);
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
    <div className="space-y-6 w-full pb-10">
      {/* Banner / Header Principal da Aba */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 p-6 sm:p-7 rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 border border-slate-800 text-white shadow-lg">
        <div className="flex items-center gap-4">
          <div className="p-3.5 rounded-2xl bg-blue-600/20 text-blue-400 border border-blue-500/30 shadow-inner">
            <ShieldIcon className="size-8 text-blue-400" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                Painel de Superadministração
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30">
                Acesso Master
              </span>
            </div>
            <p className="text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
              Controle central de usuários, vinculações institucionais de origem e governança multi-UASG.
            </p>
          </div>
        </div>

        {/* Alternador de Sub-Abas */}
        <div className="flex bg-slate-800/90 p-1.5 rounded-xl border border-slate-700/80 self-start lg:self-auto shadow-inner">
          <button
            onClick={() => setSubAba('usuarios')}
            className={`flex items-center gap-2.5 px-5 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              subAba === 'usuarios'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <UsersIcon className="size-4" />
            <span>Usuários Cadastrados</span>
            <span className="px-2 py-0.5 rounded-full text-[11px] bg-slate-900/60 font-mono">
              {usuarios.length}
            </span>
          </button>
          <button
            onClick={() => setSubAba('uasgs')}
            className={`flex items-center gap-2.5 px-5 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              subAba === 'uasgs'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <BuildingIcon className="size-4" />
            <span>Unidades Gestoras (UASGs)</span>
            <span className="px-2 py-0.5 rounded-full text-[11px] bg-slate-900/60 font-mono">
              {uasgs.length}
            </span>
          </button>
        </div>
      </div>

      {/* Grid de Cards de Estatísticas e Métricas (KPIs) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Usuários Ativos</p>
            <p className="text-3xl font-extrabold text-slate-900 mt-1">
              {totalUsuariosAtivos} <span className="text-sm font-normal text-slate-400">/ {usuarios.length}</span>
            </p>
            <p className="text-xs text-emerald-600 font-medium mt-1">Contas operacionais liberadas</p>
          </div>
          <div className="p-3 rounded-2xl bg-blue-50 text-blue-600 border border-blue-100">
            <UsersIcon className="size-6" />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Superadministradores</p>
            <p className="text-3xl font-extrabold text-purple-700 mt-1">{totalSuperadmins}</p>
            <p className="text-xs text-purple-600 font-medium mt-1">Acesso global a todas as UASGs</p>
          </div>
          <div className="p-3 rounded-2xl bg-purple-50 text-purple-600 border border-purple-100">
            <ShieldIcon className="size-6" />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Unidades Gestoras</p>
            <p className="text-3xl font-extrabold text-slate-900 mt-1">
              {totalUasgsAtivas} <span className="text-sm font-normal text-slate-400">/ {uasgs.length}</span>
            </p>
            <p className="text-xs text-slate-500 font-medium mt-1">Órgãos com suporte a isolamento</p>
          </div>
          <div className="p-3 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100">
            <BuildingIcon className="size-6" />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Integradas ao Rauf</p>
            <p className="text-3xl font-extrabold text-blue-600 mt-1">{totalUasgsRauf}</p>
            <p className="text-xs text-blue-600 font-medium mt-1">Sincronizadas com o Rauf_App</p>
          </div>
          <div className="p-3 rounded-2xl bg-cyan-50 text-cyan-600 border border-cyan-100">
            <CloudDownloadIcon className="size-6" />
          </div>
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
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 sm:p-8 space-y-5 min-h-[520px]">
          {/* Barra de Ferramentas: Título + Busca + Ações */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-200">
            <div>
              <h3 className="text-xl font-bold text-slate-900 tracking-tight">Gestão de Usuários & Acessos</h3>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Cada usuário é vinculado obrigatoriamente a uma UASG de origem. No login, o acesso é restrito ao respectivo órgão.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* Campo de Busca Rápida */}
              <div className="relative w-full sm:w-72">
                <Input
                  value={buscaUsuario}
                  onChange={(e) => setBuscaUsuario(e.target.value)}
                  placeholder="Filtrar por nome, e-mail..."
                  className="ps-9 h-11 bg-slate-50 border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 text-sm focus-visible:ring-blue-500"
                />
                <div className="text-slate-400 pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3">
                  <SearchIcon className="size-4" />
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={carregarUsuarios}
                  disabled={carregandoUsuarios}
                  className="h-11 px-4 rounded-xl border-slate-300 text-slate-700 hover:bg-slate-100 text-sm cursor-pointer"
                  title="Atualizar lista"
                >
                  <RefreshCwIcon className={`size-4 me-2 ${carregandoUsuarios ? 'animate-spin' : ''}`} />
                  Atualizar
                </Button>
                <Button
                  onClick={() => setModalNovoUsuario(true)}
                  className="h-11 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm shadow-md shadow-blue-600/20 flex items-center gap-2 cursor-pointer"
                >
                  <UserPlusIcon className="size-4" />
                  Novo Usuário
                </Button>
              </div>
            </div>
          </div>

          {/* Tabela de Usuários Ampla */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-xs">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-700 uppercase font-bold text-xs tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Nome Completo</th>
                  <th className="py-3.5 px-4">E-mail Institucional</th>
                  <th className="py-3.5 px-4">Perfil</th>
                  <th className="py-3.5 px-4">UASG de Origem</th>
                  <th className="py-3.5 px-4">Último Acesso</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {usuariosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      {buscaUsuario
                        ? `Nenhum usuário localizado com o termo "${buscaUsuario}".`
                        : 'Nenhum usuário cadastrado no sistema.'}
                    </td>
                  </tr>
                ) : (
                  usuariosFiltrados.map((u) => (
                    <tr key={u.id} className="hover:bg-blue-50/40 transition-colors">
                      <td className="py-4 px-4 font-semibold text-slate-900">
                        {u.nome}
                        {u.id === usuarioLogado?.id && (
                          <span className="ms-2 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">
                            Você
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-4 font-mono text-xs text-slate-600">{u.email}</td>
                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                            u.role === 'superadmin'
                              ? 'bg-purple-100 text-purple-700 border border-purple-200'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}
                        >
                          {u.role === 'superadmin' ? (
                            <>
                              <ShieldIcon className="size-3 text-purple-600" /> Superadmin
                            </>
                          ) : (
                            'Usuário'
                          )}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        {u.role === 'superadmin' ? (
                          <span className="text-purple-700 font-medium text-xs">
                            Todas (Acesso Livre)
                          </span>
                        ) : u.uasg_origem ? (
                          <span className="font-medium text-slate-800">
                            {u.uasg_sigla ? `${u.uasg_sigla} (UASG ${u.uasg_origem})` : `UASG ${u.uasg_origem}`}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">—</span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-xs text-slate-500 font-mono">
                        {u.ultimo_login
                          ? new Date(u.ultimo_login).toLocaleString('pt-BR', {
                              dateStyle: 'short',
                              timeStyle: 'short'
                            })
                          : 'Nunca acessou'}
                      </td>
                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            u.ativo
                              ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                              : 'bg-red-100 text-red-700 border border-red-200'
                          }`}
                        >
                          <span
                            className={`size-1.5 rounded-full ${
                              u.ativo ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'
                            }`}
                          />
                          {u.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right space-x-2 whitespace-nowrap">
                        <button
                          onClick={() => handleResetarSenha(u)}
                          title="Gerar nova senha temporária de acesso"
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors inline-flex items-center gap-1.5 border border-slate-200 cursor-pointer"
                        >
                          <KeyIcon className="size-3.5 text-slate-500" />
                          Redefinir Senha
                        </button>
                        {u.email !== 'ulisses.goularte@ebserh.gov.br' && u.id !== usuarioLogado?.id && (
                          <button
                            onClick={() => handleToggleAtivo(u)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border cursor-pointer ${
                              u.ativo
                                ? 'bg-red-50 hover:bg-red-100 text-red-700 border-red-200'
                                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                            }`}
                          >
                            {u.ativo ? 'Desativar' : 'Reativar'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 pt-2 font-mono">
            <span>
              Exibindo {usuariosFiltrados.length} de {usuarios.length} usuários cadastrados
            </span>
            <span>Total ativo: {totalUsuariosAtivos}</span>
          </div>
        </div>
      )}

      {/* ===================== SUB-ABA UASGS ===================== */}
      {subAba === 'uasgs' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 sm:p-8 space-y-5 min-h-[520px]">
          {/* Barra de Ferramentas: Título + Busca + Ações */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-200">
            <div>
              <h3 className="text-xl font-bold text-slate-900 tracking-tight">Catálogo de Unidades Gestoras (UASGs)</h3>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Órgãos e instituições cadastrados para isolamento de dados fiscais e parametrização municipal de ISSQN.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* Campo de Busca Rápida */}
              <div className="relative w-full sm:w-72">
                <Input
                  value={buscaUasg}
                  onChange={(e) => setBuscaUasg(e.target.value)}
                  placeholder="Filtrar por código, sigla ou nome..."
                  className="ps-9 h-11 bg-slate-50 border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 text-sm focus-visible:ring-blue-500"
                />
                <div className="text-slate-400 pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3">
                  <SearchIcon className="size-4" />
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={carregarUasgs}
                  disabled={carregandoUasgs}
                  className="h-11 px-4 rounded-xl border-slate-300 text-slate-700 hover:bg-slate-100 text-sm cursor-pointer"
                  title="Atualizar catálogo"
                >
                  <RefreshCwIcon className={`size-4 me-2 ${carregandoUasgs ? 'animate-spin' : ''}`} />
                  Atualizar
                </Button>
                <Button
                  variant="outline"
                  onClick={handleImportarRauf}
                  disabled={sincronizandoRauf}
                  className="h-11 px-4 rounded-xl border-blue-300 text-blue-700 hover:bg-blue-50 text-sm font-medium cursor-pointer"
                >
                  <CloudDownloadIcon className={`size-4 me-2 ${sincronizandoRauf ? 'animate-spin' : ''}`} />
                  {sincronizandoRauf ? 'Sincronizando...' : 'Importar do Rauf'}
                </Button>
                <Button
                  onClick={() => setModalNovaUasg(true)}
                  className="h-11 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm shadow-md shadow-blue-600/20 flex items-center gap-2 cursor-pointer"
                >
                  <PlusIcon className="size-4" />
                  Nova UASG
                </Button>
              </div>
            </div>
          </div>

          {/* Tabela de UASGs Ampla */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-xs">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-700 uppercase font-bold text-xs tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Código UASG</th>
                  <th className="py-3.5 px-4">Sigla / UG</th>
                  <th className="py-3.5 px-4">Nome Oficial / Razão Social</th>
                  <th className="py-3.5 px-4">CNPJ do Tomador</th>
                  <th className="py-3.5 px-4">Município (ISSQN)</th>
                  <th className="py-3.5 px-4">Vínculo Rauf</th>
                  <th className="py-3.5 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {uasgsFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      {buscaUasg
                        ? `Nenhuma UASG localizada com o termo "${buscaUasg}".`
                        : 'Nenhuma UASG cadastrada no sistema.'}
                    </td>
                  </tr>
                ) : (
                  uasgsFiltradas.map((u) => (
                    <tr key={u.id} className="hover:bg-blue-50/40 transition-colors">
                      <td className="py-4 px-4 font-mono font-bold text-blue-700">
                        <span className="px-2.5 py-1 rounded-md bg-blue-50 border border-blue-200 text-xs font-bold">
                          {u.uasg}
                        </span>
                      </td>
                      <td className="py-4 px-4 font-bold text-slate-900">{u.sigla || '—'}</td>
                      <td className="py-4 px-4 text-slate-700 font-medium">{u.nome}</td>
                      <td className="py-4 px-4 font-mono text-xs text-slate-600">{u.cnpj || '—'}</td>
                      <td className="py-4 px-4 text-slate-600">{u.municipio || '—'}</td>
                      <td className="py-4 px-4">
                        {u.rauf_instituicao_id ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2Icon className="size-3.5 text-emerald-600" /> Rauf ID {u.rauf_instituicao_id}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-500 font-medium">
                            Cadastro Local
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-right">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            u.ativo
                              ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                              : 'bg-red-100 text-red-700 border border-red-200'
                          }`}
                        >
                          <span
                            className={`size-1.5 rounded-full ${
                              u.ativo ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'
                            }`}
                          />
                          {u.ativo ? 'Ativa' : 'Inativa'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 pt-2 font-mono">
            <span>
              Exibindo {uasgsFiltradas.length} de {uasgs.length} Unidades Gestoras
            </span>
            <span>Sincronizadas com Rauf: {totalUasgsRauf}</span>
          </div>
        </div>
      )}

      {/* ===================== MODAL NOVO USUÁRIO ===================== */}
      {modalNovoUsuario && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-xl p-7 shadow-2xl shadow-black/80 text-slate-100 relative">
            <button
              onClick={() => setModalNovoUsuario(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              title="Fechar"
            >
              <XIcon className="size-5" />
            </button>

            {/* Cabeçalho */}
            <div className="flex items-center gap-3.5 mb-6 pb-4 border-b border-slate-800">
              <div className="p-3 rounded-2xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
                <UserPlusIcon className="size-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white tracking-tight">Cadastrar Novo Usuário</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Criação de credenciais de acesso e vinculação institucional multi-UASG
                </p>
              </div>
            </div>

            <form onSubmit={handleCriarUsuario} className="space-y-4">
              {/* Nome Completo */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Nome Completo <span className="text-blue-400">*</span>
                </label>
                <div className="relative">
                  <Input
                    value={nomeNovoUser}
                    onChange={(e) => setNomeNovoUser(e.target.value)}
                    placeholder="Ex: Carlos Eduardo de Oliveira"
                    className="ps-10 h-11 bg-slate-800/90 border-slate-700 rounded-xl text-white placeholder:text-slate-500 focus-visible:ring-blue-500 text-sm"
                    required
                  />
                  <div className="text-slate-400 pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3.5">
                    <UserIcon className="size-4" aria-hidden="true" />
                  </div>
                </div>
              </div>

              {/* Grid: E-mail e Perfil */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                    E-mail Institucional <span className="text-blue-400">*</span>
                  </label>
                  <div className="relative">
                    <Input
                      type="email"
                      value={emailNovoUser}
                      onChange={(e) => setEmailNovoUser(e.target.value)}
                      placeholder="usuario@ebserh.gov.br"
                      className="ps-10 h-11 bg-slate-800/90 border-slate-700 rounded-xl text-white placeholder:text-slate-500 focus-visible:ring-blue-500 text-sm"
                      required
                    />
                    <div className="text-slate-400 pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3.5">
                      <MailIcon className="size-4" aria-hidden="true" />
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Perfil de Acesso
                  </label>
                  <div className="relative">
                    <select
                      value={roleNovoUser}
                      onChange={(e) => setRoleNovoUser(e.target.value as any)}
                      className="w-full h-11 px-3.5 rounded-xl border border-slate-700 bg-slate-800/90 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all cursor-pointer"
                    >
                      <option value="usuario">Usuário Comum (vinculado à UASG)</option>
                      <option value="superadmin">Superadmin (Acesso irrestrito a todas)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* UASG de Origem */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                    UASG de Origem {roleNovoUser === 'superadmin' ? '(Padrão Inicial)' : <span className="text-blue-400">*</span>}
                  </label>
                  {roleNovoUser === 'superadmin' && (
                    <span className="text-[11px] text-blue-400 font-medium">Superadmin pode alternar entre todas</span>
                  )}
                </div>
                <div className="relative">
                  <select
                    value={uasgNovoUser}
                    onChange={(e) => setUasgNovoUser(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-700 bg-slate-800/90 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all cursor-pointer"
                    required={roleNovoUser !== 'superadmin'}
                  >
                    {uasgs.map((u) => (
                      <option key={u.id} value={u.id} className="bg-slate-900 text-white">
                        {u.sigla ? `${u.sigla} (UASG ${u.uasg})` : `UASG ${u.uasg}`} — {u.nome}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Senha Inicial */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Senha Inicial (Opcional)
                  </label>
                  <button
                    type="button"
                    onClick={gerarSenhaAleatoria}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
                  >
                    <SparklesIcon className="size-3.5" />
                    Gerar senha segura
                  </button>
                </div>
                <div className="relative">
                  <Input
                    type="text"
                    value={senhaNovoUser}
                    onChange={(e) => setSenhaNovoUser(e.target.value)}
                    placeholder="Deixe em branco para gerar aleatoriamente"
                    className="ps-10 h-11 bg-slate-800/90 border-slate-700 rounded-xl text-white placeholder:text-slate-500 font-mono text-sm focus-visible:ring-blue-500"
                  />
                  <div className="text-slate-400 pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3.5">
                    <LockIcon className="size-4" aria-hidden="true" />
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-1">
                  <InfoIcon className="size-3.5 text-slate-500 shrink-0" />
                  Se deixar em branco, o sistema gerará uma senha temporária que será exibida para cópia ao salvar.
                </p>
              </div>

              {/* Botões de Ação */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setModalNovoUsuario(false)}
                  className="px-5 h-11 rounded-xl border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white transition-all cursor-pointer"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="px-6 h-11 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-lg shadow-blue-600/25 transition-all flex items-center gap-2 cursor-pointer"
                >
                  <UserPlusIcon className="size-4" />
                  Cadastrar Usuário
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL NOVA UASG ===================== */}
      {modalNovaUasg && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-lg p-7 shadow-2xl shadow-black/80 text-slate-100 relative">
            <button
              onClick={() => setModalNovaUasg(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              title="Fechar"
            >
              <XIcon className="size-5" />
            </button>

            <div className="flex items-center gap-3.5 mb-6 pb-4 border-b border-slate-800">
              <div className="p-3 rounded-2xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
                <BuildingIcon className="size-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white tracking-tight">Cadastrar Unidade Gestora</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Cadastro manual para operação isolada ou filiais descentralizadas
                </p>
              </div>
            </div>

            <form onSubmit={handleCriarUasg} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Código UASG (6 dígitos) <span className="text-blue-400">*</span>
                  </label>
                  <Input
                    maxLength={6}
                    value={codigoNovaUasg}
                    onChange={(e) => setCodigoNovaUasg(e.target.value.replace(/\D/g, ''))}
                    placeholder="155012"
                    className="h-11 bg-slate-800/90 border-slate-700 rounded-xl text-white font-mono text-sm focus-visible:ring-blue-500"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Sigla / Unidade
                  </label>
                  <Input
                    value={siglaNovaUasg}
                    onChange={(e) => setSiglaNovaUasg(e.target.value.toUpperCase())}
                    placeholder="HUCAM"
                    className="h-11 bg-slate-800/90 border-slate-700 rounded-xl text-white text-sm focus-visible:ring-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Nome Oficial / Razão Social <span className="text-blue-400">*</span>
                </label>
                <Input
                  value={nomeNovaUasg}
                  onChange={(e) => setNomeNovaUasg(e.target.value)}
                  placeholder="Hospital Universitário Cassiano Antônio Moraes"
                  className="h-11 bg-slate-800/90 border-slate-700 rounded-xl text-white text-sm focus-visible:ring-blue-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                    CNPJ do Tomador
                  </label>
                  <Input
                    value={cnpjNovaUasg}
                    onChange={(e) => setCnpjNovaUasg(e.target.value.replace(/\D/g, ''))}
                    placeholder="15126437000658"
                    className="h-11 bg-slate-800/90 border-slate-700 rounded-xl text-white font-mono text-sm focus-visible:ring-blue-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Município (ISSQN)
                  </label>
                  <Input
                    value={municipioNovaUasg}
                    onChange={(e) => setMunicipioNovaUasg(e.target.value)}
                    placeholder="Vitória"
                    className="h-11 bg-slate-800/90 border-slate-700 rounded-xl text-white text-sm focus-visible:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setModalNovaUasg(false)}
                  className="px-5 h-11 rounded-xl border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white transition-all cursor-pointer"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="px-6 h-11 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-lg shadow-blue-600/25 transition-all flex items-center gap-2 cursor-pointer"
                >
                  <BuildingIcon className="size-4" />
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
