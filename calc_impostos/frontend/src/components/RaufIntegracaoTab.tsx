import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, Trash2, ShieldCheck, Loader2, Link2 } from 'lucide-react';
import { apiFetch } from '../lib/apiFetch';

interface Credencial {
  uasg: string;
  nomeOrgao: string;
  prefixo: string;
  validadaEm: string | null;
  cadastradoPorEmail?: string | null;
}

/**
 * Cadastro da chave de integração do Rauf (gerada pelo administrador do órgão no Rauf,
 * em Configurações > Chaves de Integração). Acesso restrito ao superadmin logado.
 * A chave vai ao servidor, é validada no Rauf e guardada cifrada; nunca volta ao navegador.
 * A UASG do registro é a que o próprio Rauf informa ao validar a chave.
 */
export const RaufIntegracaoTab: React.FC = () => {
  const [habilitado, setHabilitado] = useState<boolean | null>(null);
  const [chave, setChave] = useState('');
  const [credenciais, setCredenciais] = useState<Credencial[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  const carregar = useCallback(async () => {
    try {
      setCredenciais(await apiFetch<Credencial[]>('/api/integracao/rauf/credenciais'));
    } catch (e: any) {
      setCredenciais([]);
      setMsg({ tipo: 'erro', texto: e?.message || 'Falha ao consultar credenciais.' });
    }
  }, []);

  useEffect(() => {
    apiFetch<{ habilitado: boolean }>('/api/integracao/rauf/credenciais/status')
      .then(d => {
        setHabilitado(Boolean(d.habilitado));
        if (d.habilitado) carregar();
      })
      .catch(() => setHabilitado(false));
  }, [carregar]);

  const salvar = async () => {
    setSalvando(true);
    setMsg(null);
    try {
      const d = await apiFetch<any>('/api/integracao/rauf/credenciais', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chave: chave.trim() })
      });
      setChave('');
      setMsg({ tipo: 'ok', texto: `Chave validada: ${d.orgao?.nome} (UASG ${d.orgao?.uasg}). Sincronização com o Rauf ativada.` });
      await carregar();
    } catch (e: any) {
      setMsg({ tipo: 'erro', texto: e?.message || 'Não foi possível salvar a chave.' });
    } finally {
      setSalvando(false);
    }
  };

  const remover = async (c: Credencial) => {
    if (!window.confirm(`Remover a chave do órgão ${c.nomeOrgao} (UASG ${c.uasg})? A sincronização com o Rauf será interrompida.`)) return;
    try {
      await apiFetch(`/api/integracao/rauf/credenciais/${c.uasg}`, { method: 'DELETE' });
      await carregar();
    } catch (e: any) {
      setMsg({ tipo: 'erro', texto: e?.message || 'Não foi possível remover a chave.' });
    }
  };

  const caixa: React.CSSProperties = { background: '#fff', border: '1px solid rgba(148,163,184,0.35)', borderRadius: 12, padding: 20, marginBottom: 16 };
  const campo: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(148,163,184,0.5)' };

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <div style={caixa}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 6px' }}>
          <Link2 size={18} /> Integração com o Rauf
        </h3>
        <p style={{ margin: 0, fontSize: 13, opacity: 0.85 }}>
          Cole abaixo a chave gerada pelo administrador do órgão no Rauf (<b>Configurações → Chaves de Integração</b>).
          Com ela, as retenções calculadas aqui seguem automaticamente para o painel de conferência de pagamentos do Rauf.
        </p>
      </div>

      {habilitado === null && <Loader2 className="animate-spin" />}

      {habilitado === false && (
        <div style={{ ...caixa, borderColor: '#f59e0b' }}>
          O servidor não consegue cifrar chaves: defina a variável <code>CALC_SECRET_KEY</code> (mínimo 16 caracteres) no backend e reinicie.
          Se você já definiu e reiniciou e esta mensagem persiste, a sessão pode ter expirado: saia e entre novamente.
        </div>
      )}

      {habilitado && (
        <>
          <div style={caixa}>
            <label style={{ fontSize: 13, fontWeight: 600 }}><KeyRound size={14} /> Chave de integração do órgão</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <input
                type="password" style={campo} autoComplete="off" placeholder="rauf_…"
                value={chave} onChange={e => setChave(e.target.value)}
              />
              <button className="btn btn-primary" onClick={salvar} disabled={salvando || chave.trim().length < 20}>
                {salvando ? <Loader2 size={16} className="animate-spin" /> : 'Validar e salvar'}
              </button>
            </div>
            {msg && (
              <p style={{ marginTop: 10, fontSize: 13, fontWeight: 600, color: msg.tipo === 'ok' ? '#10b981' : '#ef4444' }}>
                {msg.texto}
              </p>
            )}
          </div>

          <div style={caixa}>
            <b style={{ fontSize: 13 }}>Órgãos conectados</b>
            {credenciais.length === 0 ? (
              <p style={{ fontSize: 13, opacity: 0.7, margin: '8px 0 0' }}>Nenhuma chave cadastrada pela tela.</p>
            ) : (
              credenciais.map(c => (
                <div key={c.uasg} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: '1px solid rgba(148,163,184,0.25)', marginTop: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}><ShieldCheck size={14} color="#10b981" /> {c.nomeOrgao}</div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      UASG {c.uasg} · chave {c.prefixo}… · validada em {c.validadaEm ? new Date(c.validadaEm).toLocaleString('pt-BR') : '—'}
                      {c.cadastradoPorEmail ? ` · por ${c.cadastradoPorEmail}` : ''}
                    </div>
                  </div>
                  <button className="btn btn-secondary" onClick={() => remover(c)}><Trash2 size={14} /> Remover</button>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
};
