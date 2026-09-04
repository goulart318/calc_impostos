import React, { useEffect, useState } from 'react';
import { Database, FileText } from 'lucide-react';

export const HistoryTab: React.FC = () => {
  const [notas, setNotas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [termoBusca, setTermoBusca] = useState('');

  const carregarNotas = async () => {
    try {
      setLoading(true);
      const res = await fetch('http://localhost:3001/api/notas');
      if (res.ok) {
        const data = await res.json();
        setNotas(data);
      }
    } catch (e) {
      console.warn('Erro ao carregar histórico:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarNotas();
  }, []);

  const formatBRL = (val: number) => {
    return (Number(val) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const notasFiltradas = notas.filter(n => 
    n.numero_nota?.toLowerCase().includes(termoBusca.toLowerCase()) ||
    n.fornecedor_nome?.toLowerCase().includes(termoBusca.toLowerCase()) ||
    n.fornecedor_cnpj?.includes(termoBusca)
  );

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">
            <Database size={20} color="var(--primary)" />
            Histórico de Notas Salvas no PostgreSQL
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Registros gravados no banco de dados <strong>ret_impostos</strong> acessíveis via pgAdmin.
          </p>
        </div>

        <button className="btn btn-outline" onClick={carregarNotas}>
          Atualizar Lista
        </button>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <input 
          type="text" 
          className="form-input" 
          placeholder="Pesquisar por número da nota, fornecedor ou CNPJ..." 
          value={termoBusca}
          onChange={(e) => setTermoBusca(e.target.value)}
        />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
          Carregando registros do PostgreSQL...
        </div>
      ) : notasFiltradas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '50px 20px', background: '#f8fafc', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border)' }}>
          <FileText size={40} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
          <h4 style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>Nenhuma nota salva encontrada</h4>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Faça uma análise de nota fiscal e clique em "Salvar no PostgreSQL" para registrar no histórico.
          </p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="tax-table">
            <thead>
              <tr>
                <th>TIPO</th>
                <th>Nº NOTA</th>
                <th>FORNECEDOR</th>
                <th>EMISSÃO</th>
                <th style={{ textAlign: 'right' }}>VALOR BRUTO</th>
                <th style={{ textAlign: 'right' }}>TOTAL RETIDO</th>
                <th style={{ textAlign: 'right' }}>VALOR LÍQUIDO</th>
                <th>REGIME</th>
              </tr>
            </thead>
            <tbody>
              {notasFiltradas.map((n) => (
                <tr key={n.id}>
                  <td>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: n.tipo_documento === 'NFE' ? '#eff6ff' : '#f0fdf4', color: n.tipo_documento === 'NFE' ? '#1d4ed8' : '#15803d' }}>
                      {n.tipo_documento}
                    </span>
                  </td>
                  <td style={{ fontWeight: 700 }}>{n.numero_nota}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{n.fornecedor_nome}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{n.fornecedor_cnpj}</div>
                  </td>
                  <td>{n.data_emissao ? new Date(n.data_emissao).toLocaleDateString('pt-BR') : '---'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatBRL(n.valor_bruto)}</td>
                  <td style={{ textAlign: 'right', color: '#dc2626', fontWeight: 600 }}>{formatBRL(n.total_retido_geral)}</td>
                  <td style={{ textAlign: 'right', color: '#16a34a', fontWeight: 700 }}>{formatBRL(n.valor_liquido)}</td>
                  <td>
                    {n.optante_simples ? (
                      <span className="badge-simples">SIMPLES</span>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>NORMAL</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
