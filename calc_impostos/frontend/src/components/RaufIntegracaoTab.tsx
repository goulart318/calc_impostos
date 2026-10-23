import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, Trash2, ShieldCheck, Loader2, Link2 } from 'lucide-react';
import { API_BASE_URL } from '../config/api';

interface Credencial {
  uasg: string;
  nomeOrgao: string;
  prefixo: string;
  validadaEm: string | null;
}

/**
 * Tela para cadastrar a chave de integração do Rauf (gerada pelo administrador do órgão no Rauf,
 * em Configurações > Chaves de Integração). A chave vai direto ao servidor, é validada no Rauf e
 * guardada cifrada; nunca volta para o navegador. O órgão (UASG) é definido pelo próprio Rauf.
 */
export const RaufIntegracaoTab: React.FC = () => {
  const [habilitado, setHabilitado] = useState<boolean | null>(null);
  const [tokenAdmin, setTokenAdmin] = useState('');
  const [chave, setChave] = useState('');
  const [credenciais, setCredenciais] = useState<Credencial[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  const headers = useCallback(
    () => ({ 'Content-Type': 'application/json', 'x-admin-token': tokenAdmin }),
    [tokenAdmin]
  );

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/integracao/rauf/credenciais/status`)
      .then(r => r.json())
      .then(d => setHabilitado(Boolean(d.habilitado)))
      .catch(() => setHabilitado(false));
  }, []);

  const carregar = useCallback(async () => {
    if (!tokenAdmin) return;
    const r = await fetch(`${API_BASE_URL}/api/integracao/rauf/credenciais`, { headers: headers() });
    if (r.ok) {
      setCredenciais(await r.json());
      setMsg(null);
    } else {
      const d = await r.json().catch(() => ({}));
      setCredenciais([]);
      setMsg({ tipo: 'erro', texto: d.error || 'Falha ao consultar credenciais.' });
    }
  }, [tokenAdmin, headers]);

  const salvar = async () => {
    setSalvando(true);
    setMsg(null);
    try {
      const r = await fetch(`${API_BASE_URL}/api/integracao/rauf/credenciais`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ chave: chave.trim() })
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setChave('');
        setMsg({ tipo: 'ok', texto: `Chave validada: ${d.orgao?.nome} (UASG ${d.orgao?.uasg}). Sincronização com o Rauf ativada.` });
        await carregar();
      } else {
        setMsg({ tipo: 'erro', texto: d.error || 'Não foi possível salvar a chave.' });
      }
    } catch (e: any) {
      setMsg({ tipo: 'erro', texto: e?.message || 'Erro de comunicação com o servidor.' });
    } finally {
      setSalvando(false);
    }
  };

  const remover = async (c: Credencial) => {
    if (!window.confirm(`Remover a chave do órgão ${c.nomeOrgao} (UASG ${c.uasg})? A sincronização com o Rauf será interrompida.`)) return;
    const r = await fetch(`${API_BASE_URL}/api/integracao/rauf/credenciais/${c.uasg}`, { method: 'DELETE', headers: headers() });
    if (r.ok) await carregar();
    else setMsg({ tipo: 'erro', texto: 'Não foi possível remover a chave.' });
  };

  const caixa: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 12, padding: 20, marginBottom: 16 };
  const campo: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(148,163,184,0.3)', background: 'rgba(15,23,42,0.4)', color: 'inherit' };

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <div style={caixa}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 6px' }}>
          <Link2 size={18} /> Integração com o Rauf
        </h3>
        <p style={{ margin: 0, fontSize: 13, opacity: 0.85 }}>
          Cole abaixo a chave gerada pelo administrador do seu órgão no Rauf (<b>Configurações → Chaves de Integração</b>).
          Com ela, as retenções calculadas aqui seguem automaticamente para o painel de conferência de pagamentos do Rauf.
        </p>
      </div>

      {habilitado === null && <Loader2 className="animate-spin" />}

      {habilitado === false && (
        <div style={{ ...caixa, borderColor: '#f59e0b' }}>
          O cadastro pela tela está desabilitado neste servidor. Defina as variáveis <code>CALC_ADMIN_TOKEN</code> e{' '}
          <code>CALC_SECRET_KEY</code> (mínimo 16 caracteres) e reinicie. Alternativa: configurar <code>RAUF_API_KEYS</code> diretamente no ambiente.
        </div>
      )}

      {habilitado && (
        <>
          <div style={caixa}>
            <label style={{ fontSize: 13, fontWeight: 600 }}>Token de administração do servidor</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <input
                type="password" style={campo} autoComplete="off" placeholder="CALC_ADMIN_TOKEN"
                value={tokenAdmin} onChange={e => setTokenAdmin(e.target.value)}
              />
              <button className="btn btn-secondary" onClick={carregar} disabled={!tokenAdmin}>Entrar</button>
            </div>
            <p style={{ fontSize: 12, opacity: 0.7, margin: '6px 0 0' }}>
              Proteção temporária até o login por usuário. O token não é guardado no navegador.
            </p>
          </div>

          <div style={caixa}>
            <label style={{ fontSize: 13, fontWeight: 600 }}><KeyRound size={14} /> Chave de integração do órgão</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <input
                type="password" style={campo} autoComplete="off" placeholder="rauf_…"
                value={chave} onChange={e => setChave(e.target.value)}
              />
              <button className="btn btn-primary" onClick={salvar} disabled={salvando || !tokenAdmin || chave.trim().length < 20}>
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
              <p style={{ fontSize: 13, opacity: 0.7, margin: '8px 0 0' }}>
                {tokenAdmin ? 'Nenhuma chave cadastrada pela tela.' : 'Informe o token de administração para listar.'}
              </p>
            ) : (
              credenciais.map(c => (
                <div key={c.uasg} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: '1px solid rgba(148,163,184,0.15)', marginTop: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}><ShieldCheck size={14} color="#10b981" /> {c.nomeOrgao}</div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      UASG {c.uasg} · chave {c.prefixo}… · validada em {c.validadaEm ? new Date(c.validadaEm).toLocaleString('pt-BR') : '—'}
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
