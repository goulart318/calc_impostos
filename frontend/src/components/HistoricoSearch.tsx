import React, { useState, useEffect } from 'react';
import { Search, FileText, Download, RefreshCw, Calendar, Building } from 'lucide-react';
import type { ResultadoConsolidado } from './ReportPreview';

interface NotaSalvaResumo {
  id: number;
  tipo_documento: 'NFE' | 'NFSE';
  numero_nota: string;
  chave_acesso?: string;
  fornecedor_cnpj: string;
  fornecedor_nome: string;
  optante_simples: boolean;
  valor_bruto: number;
  valor_liquido: number;
  total_retido: number;
  created_at: string;
}

interface Props {
  onSelectNota: (resultado: ResultadoConsolidado) => void;
}

export const HistoricoSearch: React.FC<Props> = ({ onSelectNota }) => {
  const [termo, setTermo] = useState('');
  const [notas, setNotas] = useState<NotaSalvaResumo[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingId, setLoadingId] = useState<number | null>(null);

  const formatBRL = (val: number) => {
    return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const carregarNotas = async (queryStr: string = '') => {
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:3001/api/notas/pesquisar?q=${encodeURIComponent(queryStr)}`);
      if (res.ok) {
        const data = await res.json();
        setNotas(data);
      }
    } catch (e) {
      console.error('Erro ao buscar histórico:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarNotas();
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    carregarNotas(termo);
  };

  const handleReabrirNota = async (id: number) => {
    setLoadingId(id);
    try {
      const res = await fetch(`http://localhost:3001/api/notas/${id}`);
      if (res.ok) {
        const data: ResultadoConsolidado = await res.json();
        onSelectNota(data);
      }
    } catch (e) {
      alert('Erro ao carregar os detalhes da nota salva.');
    } finally {
      setLoadingId(null);
    }
  };

  const handleDownloadPdfDirect = async (id: number, numeroNota: string) => {
    try {
      const resNota = await fetch(`http://localhost:3001/api/notas/${id}`);
      if (!resNota.ok) return;
      const dataFull: ResultadoConsolidado = await resNota.json();

      const resPdf = await fetch('http://localhost:3001/api/gerar-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataFull)
      });

      if (resPdf.ok) {
        const blob = await resPdf.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `relatorio_retencao_nota_${numeroNota || id}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch (e) {
      alert('Erro ao gerar PDF do histórico.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Barra de Pesquisa */}
      <div className="card-box" style={{ background: '#ffffff', border: '1px solid var(--border)' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: '40px', fontSize: '0.95rem' }}
              placeholder="Digite o CNPJ do Fornecedor, Número da Nota Fiscal ou Chave de Acesso..."
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
            />
          </div>
          <button type="submit" className="btn-primary" disabled={loading} style={{ whiteSpace: 'nowrap' }}>
            {loading ? <RefreshCw size={16} className="spin" /> : <Search size={16} />}
            <span>Pesquisar Histórico</span>
          </button>
        </form>
      </div>

      {/* Lista de Registros */}
      <div className="card-box" style={{ background: '#ffffff', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={18} color="var(--primary)" />
            <span>Análises Gravadas no Banco de Dados ({notas.length})</span>
          </h3>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            💡 Clique em "Reabrir & Ajustar" para modificar qualquer parâmetro antes de anexar ao SEI.
          </span>
        </div>

        {notas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
            {loading ? 'Buscando registros...' : 'Nenhuma análise encontrada no banco de dados para a busca realizada.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tax-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>DATA / REGISTRO</th>
                  <th>NOTA FISCAL</th>
                  <th>FORNECEDOR (RAZÃO SOCIAL / CNPJ)</th>
                  <th style={{ textAlign: 'right' }}>VALOR BRUTO</th>
                  <th style={{ textAlign: 'right' }}>TOTAL RETIDO</th>
                  <th style={{ textAlign: 'right' }}>LÍQUIDO A PAGAR</th>
                  <th style={{ textAlign: 'center' }}>AÇÕES DA ANÁLISE</th>
                </tr>
              </thead>
              <tbody>
                {notas.map((n) => (
                  <tr key={n.id}>
                    <td>
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Calendar size={13} color="var(--text-muted)" />
                        {new Date(n.created_at).toLocaleDateString('pt-BR')}
                      </div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {new Date(n.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </td>

                    <td>
                      <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--primary)' }}>
                        Nº {n.numero_nota}
                      </div>
                      <span style={{ fontSize: '0.7rem', fontWeight: 600, color: n.tipo_documento === 'NFE' ? '#2563eb' : '#9333ea' }}>
                        {n.tipo_documento === 'NFE' ? 'NF-e Mercadoria' : 'NFS-e Serviço'}
                      </span>
                    </td>

                    <td>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {n.fornecedor_nome}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Building size={12} />
                        {n.fornecedor_cnpj}
                        {n.optante_simples && <span style={{ color: '#d97706', fontWeight: 700 }}>[SIMPLES]</span>}
                      </div>
                    </td>

                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatBRL(n.valor_bruto)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>{formatBRL(n.total_retido)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: '#16a34a' }}>{formatBRL(n.valor_liquido)}</td>

                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <button
                          className="btn-secondary"
                          onClick={() => handleReabrirNota(n.id)}
                          disabled={loadingId === n.id}
                          title="Reabrir análise para ajustes e recálculo"
                          style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                        >
                          {loadingId === n.id ? <RefreshCw size={14} className="spin" /> : <FileText size={14} />}
                          <span>Reabrir & Ajustar</span>
                        </button>

                        <button
                          className="btn-primary"
                          onClick={() => handleDownloadPdfDirect(n.id, n.numero_nota)}
                          title="Baixar Relatório em PDF para o SEI"
                          style={{ padding: '6px 10px', fontSize: '0.78rem' }}
                        >
                          <Download size={14} />
                          <span>PDF SEI</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
