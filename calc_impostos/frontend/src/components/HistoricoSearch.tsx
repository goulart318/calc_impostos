import React, { useState, useEffect } from 'react';
import { Search, FileText, Download, RefreshCw, Calendar, Building, Layers } from 'lucide-react';
import { gerarNomeArquivoPdf, type ResultadoConsolidado } from './ReportPreview';
import { ProcessoConsolidadoModal, type ProcessoConsolidadoData } from './ProcessoConsolidadoModal';

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
  onConsolidarNotas?: (dadosProcesso: ProcessoConsolidadoData) => void;
}

export const HistoricoSearch: React.FC<Props> = ({ onSelectNota, onConsolidarNotas }) => {
  const [termo, setTermo] = useState('');
  const [notas, setNotas] = useState<NotaSalvaResumo[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  
  // Seleção de Múltiplas Notas para Processo Consolidado
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [consolidando, setConsolidando] = useState(false);
  const [processoModalData, setProcessoModalData] = useState<ProcessoConsolidadoData | null>(null);

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

  const handleToggleSelectNota = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (selectedIds.size === notas.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(notas.map(n => n.id)));
    }
  };

  const handleConsolidarSelecionadas = async () => {
    if (selectedIds.size === 0) return;
    try {
      setConsolidando(true);
      const ids = Array.from(selectedIds);
      const promessas = ids.map(id => 
        fetch(`http://localhost:3001/api/notas/${id}`).then(r => r.json())
      );
      const notasCompletas: ResultadoConsolidado[] = await Promise.all(promessas);

      // Calcular consolidação
      let totalBruto = 0;
      let totalRetidoGeral = 0;
      let totalLiquido = 0;
      let totalIr = 0;
      let totalCsll = 0;
      let totalCofins = 0;
      let totalPis = 0;
      let totalInss = 0;
      let totalIss = 0;
      let totalContaVinculada = 0;

      const cnpjsDistintos = new Set<string>();
      const codigosDarfMap: Record<string, { codigo: string; valor: number }> = {};

      notasCompletas.forEach(n => {
        totalBruto += Number(n.totalBruto) || 0;
        totalRetidoGeral += Number(n.totalRetidoGeral) || 0;
        totalLiquido += Number(n.valorLiquido) || 0;
        totalIr += Number(n.totalIr) || 0;
        totalCsll += Number(n.totalCsll) || 0;
        totalCofins += Number(n.totalCofins) || 0;
        totalPis += Number(n.totalPis) || 0;
        totalInss += Number(n.totalInss) || 0;
        totalIss += Number(n.totalIss) || 0;
        totalContaVinculada += Number(n.totalContaVinculada) || 0;

        if (n.fornecedorCnpj) {
          cnpjsDistintos.add(n.fornecedorCnpj.replace(/\D/g, ''));
        }

        if (Array.isArray(n.codigosReceitaDarf)) {
          n.codigosReceitaDarf.forEach(cd => {
            const cod = cd.codigo || 'OUTROS';
            if (!codigosDarfMap[cod]) {
              codigosDarfMap[cod] = { codigo: cod, valor: 0 };
            }
            codigosDarfMap[cod].valor += Number(cd.valor) || 0;
          });
        }
      });

      const primeira = notasCompletas[0];
      const dadosConsolidados: ProcessoConsolidadoData = {
        temMultiplosFornecedores: cnpjsDistintos.size > 1,
        fornecedorPrincipal: {
          nome: primeira.fornecedorNome,
          cnpj: primeira.fornecedorCnpj,
          optanteSimples: primeira.optanteSimples
        },
        notas: notasCompletas,
        resumo: {
          totalNotas: notasCompletas.length,
          totalBruto: Number(totalBruto.toFixed(2)),
          totalRetidoGeral: Number(totalRetidoGeral.toFixed(2)),
          totalLiquido: Number(totalLiquido.toFixed(2)),
          totalIr: Number(totalIr.toFixed(2)),
          totalCsll: Number(totalCsll.toFixed(2)),
          totalCofins: Number(totalCofins.toFixed(2)),
          totalPis: Number(totalPis.toFixed(2)),
          totalInss: Number(totalInss.toFixed(2)),
          totalIss: Number(totalIss.toFixed(2)),
          totalContaVinculada: Number(totalContaVinculada.toFixed(2)),
          codigosDarfAgrupados: Object.values(codigosDarfMap).map(c => ({
            ...c,
            valor: Number(c.valor.toFixed(2))
          }))
        }
      };

      if (onConsolidarNotas) {
        onConsolidarNotas(dadosConsolidados);
      } else {
        setProcessoModalData(dadosConsolidados);
      }
    } catch (e: any) {
      alert('Erro ao consolidar notas selecionadas: ' + e.message);
    } finally {
      setConsolidando(false);
    }
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

  const handleDownloadPdfDirect = async (id: number, numeroNota: string, fornecedorNome?: string) => {
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
        a.download = gerarNomeArquivoPdf(dataFull.numeroNota || numeroNota, dataFull.fornecedorNome || fornecedorNome);
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

      {/* Barra de Ações para Notas Selecionadas */}
      {selectedIds.size > 0 && (
        <div style={{
          background: '#0f172a',
          color: '#ffffff',
          borderRadius: '8px',
          padding: '12px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
          animation: 'fadeIn 0.2s ease-in'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: '#2563eb', padding: '6px', borderRadius: '6px' }}>
              <Layers size={18} color="#ffffff" />
            </div>
            <div>
              <strong style={{ fontSize: '0.9rem' }}>{selectedIds.size} nota(s) fiscal(is) selecionada(s)</strong>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                Prontas para consolidação em processo de pagamento e emissão de relatório único
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button 
              onClick={() => setSelectedIds(new Set())}
              style={{
                background: 'transparent',
                border: '1px solid #475569',
                color: '#cbd5e1',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                cursor: 'pointer'
              }}
            >
              Desmarcar Todas
            </button>

            <button 
              onClick={handleConsolidarSelecionadas}
              disabled={consolidando}
              style={{
                background: '#2563eb',
                border: 'none',
                color: '#ffffff',
                padding: '8px 16px',
                borderRadius: '6px',
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {consolidando ? <RefreshCw size={16} className="spin" /> : <Layers size={16} />}
              <span>{consolidando ? 'Consolidando Notas...' : 'Consolidar em Processo de Pagamento'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Lista de Registros */}
      <div className="card-box" style={{ background: '#ffffff', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={18} color="var(--primary)" />
            <span>Análises Gravadas no Banco de Dados ({notas.length})</span>
          </h3>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            💡 Marque os checkboxes para somar várias notas e gerar o relatório consolidado do processo no SEI.
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
                  <th style={{ width: '40px', textAlign: 'center' }}>
                    <input 
                      type="checkbox"
                      title="Selecionar / Desmarcar Todas"
                      checked={notas.length > 0 && selectedIds.size === notas.length}
                      onChange={handleToggleSelectAll}
                      style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                    />
                  </th>
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
                {notas.map((n) => {
                  const isSelected = selectedIds.has(n.id);
                  return (
                    <tr 
                      key={n.id}
                      style={{
                        backgroundColor: isSelected ? '#eff6ff' : undefined
                      }}
                    >
                      <td style={{ textAlign: 'center' }}>
                        <input 
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectNota(n.id)}
                          style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                        />
                      </td>

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
                            onClick={() => handleDownloadPdfDirect(n.id, n.numero_nota, n.fornecedor_nome)}
                            title="Baixar Relatório em PDF para o SEI"
                            style={{ padding: '6px 10px', fontSize: '0.78rem' }}
                          >
                            <Download size={14} />
                            <span>PDF SEI</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal do Processo Consolidado Aberto via Histórico */}
      {processoModalData && (
        <ProcessoConsolidadoModal 
          dados={processoModalData}
          onClose={() => setProcessoModalData(null)}
          podeSalvarNoBanco={false} // As notas já estão no banco!
        />
      )}
    </div>
  );
};

