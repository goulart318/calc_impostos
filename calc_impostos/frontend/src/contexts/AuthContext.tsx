import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiFetch, salvarToken, obterToken } from '../lib/apiFetch';

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

interface AuthContextType {
  usuario: UsuarioSessao | null;
  uasg: UasgSessao | null;
  carregando: boolean;
  modalSenhaAberto: boolean;
  senhaObrigatoria: boolean;
  login: (uasgId: number, email: string, senha: string) => Promise<void>;
  logout: () => void;
  trocarUasg: (uasgId: number) => Promise<void>;
  alterarSenha: (senhaAtual: string, senhaNova: string) => Promise<void>;
  abrirModalSenha: (obrigatoria?: boolean) => void;
  fecharModalSenha: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [usuario, setUsuario] = useState<UsuarioSessao | null>(null);
  const [uasg, setUasg] = useState<UasgSessao | null>(null);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [modalSenhaAberto, setModalSenhaAberto] = useState<boolean>(false);
  const [senhaObrigatoria, setSenhaObrigatoria] = useState<boolean>(false);

  const carregarSessao = useCallback(async () => {
    const token = obterToken();
    if (!token) {
      setUsuario(null);
      setUasg(null);
      setCarregando(false);
      return;
    }

    try {
      const data = await apiFetch<{ usuario: UsuarioSessao; uasg: UasgSessao }>('/api/auth/me');
      setUsuario(data.usuario);
      setUasg(data.uasg);
      if (data.usuario.forcaTrocaSenha) {
        setSenhaObrigatoria(true);
        setModalSenhaAberto(true);
      }
    } catch (err) {
      console.warn('Sessão expirada ou inválida:', err);
      salvarToken(null);
      setUsuario(null);
      setUasg(null);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregarSessao();

    const handleUnauthorized = () => {
      setUsuario(null);
      setUasg(null);
      setCarregando(false);
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, [carregarSessao]);

  const login = async (uasgId: number, email: string, senha: string) => {
    const resp = await apiFetch<{ token: string; usuario: UsuarioSessao; uasg: UasgSessao }>('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uasgId, email, senha })
    });

    salvarToken(resp.token);
    setUsuario(resp.usuario);
    setUasg(resp.uasg);

    if (resp.usuario.forcaTrocaSenha) {
      setSenhaObrigatoria(true);
      setModalSenhaAberto(true);
    }
  };

  const logout = () => {
    salvarToken(null);
    setUsuario(null);
    setUasg(null);
  };

  const trocarUasg = async (novaUasgId: number) => {
    const resp = await apiFetch<{ token: string; uasg: UasgSessao }>('/api/auth/trocar-uasg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uasgId: novaUasgId })
    });

    salvarToken(resp.token);
    setUasg(resp.uasg);
  };

  const alterarSenha = async (senhaAtual: string, senhaNova: string) => {
    await apiFetch('/api/auth/alterar-senha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senhaAtual, senhaNova })
    });

    setModalSenhaAberto(false);
    setSenhaObrigatoria(false);
    if (usuario) {
      setUsuario({ ...usuario, forcaTrocaSenha: false });
    }
  };

  const abrirModalSenha = (obrigatoria = false) => {
    setSenhaObrigatoria(obrigatoria);
    setModalSenhaAberto(true);
  };

  const fecharModalSenha = () => {
    if (senhaObrigatoria) return; // Não fecha se for obrigatória
    setModalSenhaAberto(false);
  };

  return (
    <AuthContext.Provider
      value={{
        usuario,
        uasg,
        carregando,
        modalSenhaAberto,
        senhaObrigatoria,
        login,
        logout,
        trocarUasg,
        alterarSenha,
        abrirModalSenha,
        fecharModalSenha
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
};
