import React, { useState, useEffect } from 'react';
import { Search, FileText, Download, RefreshCw, Calendar, Building, Layers, Edit3, CheckCircle2, X } from 'lucide-react';
import { gerarNomeArquivoPdf, type ResultadoConsolidado } from './ReportPreview';
import { ProcessoConsolidadoModal, type ProcessoConsolidadoData } from './ProcessoConsolidadoModal';
import { apiFetch } from '../lib/apiFetch';

interface NotaSalvaResumo {
  id: number;
  tipo_documento: 'NFE' | 'NFSE';
  numero_nota: string;
  chave_acesso?: string;
  numero_processo?: string;
  documento_habil?: string;
  numero_empenho?: string;
  fornecedor_cnpj: string;
  fornecedor_nome: string;
  optante_simples: boolean;
  valor_bruto: number;
  valor_liquido: number;
  total_retido: number;
  dados_json?: any;
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

  // Edição rápida de Processo / NS / Empenho
  const [notaParaEditar, setNotaParaEditar] = useState<NotaSalvaResumo | null>(null);
  const [editDocHabil, setEditDocHabil] = useState('');
  const [editProcesso, setEditProcesso] = useState('');
  const [editEmpenho, setEditEmpenho] = useState('');
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [toastSucesso, setToastSucesso] = useState<string | null>(null);

  const formatBRL = (val: number) => {
    return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const carregarNotas = async (queryStr: string = '') => {
    setLoading(true);
    try {
      const data = await apiFetch<NotaSalvaResumo[]>(`/api/notas/pesquisar?q=${encodeURIComponent(queryStr)}`);
      setNotas(data || []);
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
        apiFetch<ResultadoConsolidado>(`/api/notas/${id}`)
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
      const data = await apiFetch<ResultadoConsolidado>(`/api/notas/${id}`);
      onSelectNota(data);
    } catch (e) {
      alert('Erro ao carregar os detalhes da nota salva.');
    } finally {
      setLoadingId(null);
    }
  };

  const handleDownloadPdfDirect = async (id: number, numeroNota: string, fornecedorNome?: string) => {
    try {
      const dataFull = await apiFetch<ResultadoConsolidado>(`/api/notas/${id}`);
      const resPdf = await apiFetch<Response>(`/api/gerar-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataFull)
      });

      if (resPdf.ok) {
        const blob = await resPdf.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = gerarNomeArquivoPdf(
          dataFull.numeroNota || numeroNota,
          dataFull.fornecedorNome || fornecedorNome,
          dataFull.numeroProcesso
        );
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch (e) {
      alert('Erro ao gerar PDF do histórico.');
    }
  };

  const handleAbrirEdicao = (n: NotaSalvaResumo) => {
    setNotaParaEditar(n);
    const dj = n.dados_json || {};
    setEditDocHabil(n.documento_habil || dj.documentoHabil || '');
    setEditProcesso(n.numero_processo || dj.numeroProcesso || '');
    setEditEmpenho(n.numero_empenho || dj.numeroEmpenho || '');
  };

  const handleSalvarEdicaoBasica = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notaParaEditar) return;
    setSalvandoEdicao(true);
    try {
      const res = await apiFetch<any>(`/api/notas/${notaParaEditar.id}/dados-processo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentoHabil: editDocHabil.trim() || null,
          numeroProcesso: editProcesso.trim() || null,
          numeroEmpenho: editEmpenho.trim() || null
        })
      });

      // Atualiza a nota na lista local sem recarregar a tela
      setNotas(prev => prev.map(item => {
        if (item.id === notaParaEditar.id) {
          return {
            ...item,
            documento_habil: res.documentoHabil || undefined,
            numero_processo: res.numeroProcesso || undefined,
            numero_empenho: res.numeroEmpenho || undefined,
            dados_json: {
              ...(item.dados_json || {}),
              documentoHabil: res.documentoHabil || undefined,
              numeroProcesso: res.numeroProcesso || undefined,
              numeroEmpenho: res.numeroEmpenho || undefined
            }
          };
        }
        return item;
      }));

      setToastSucesso(`Lançamento da Nota Nº ${notaParaEditar.numero_nota} atualizado com sucesso no banco!`);
      setTimeout(() => setToastSucesso(null), 4000);
      setNotaParaEditar(null);
    } catch (err: any) {
      alert('Erro ao atualizar dados do lançamento: ' + err.message);
    } finally {
      setSalvandoEdicao(false);
    }
  };

  const handleExportarExcelCsv = () => {
    const notasParaExportar = selectedIds.size > 0 
      ? notas.filter(n => selectedIds.has(n.id))
      : notas;

    if (notasParaExportar.length === 0) {
      alert('Não há notas para exportar.');
      return;
    }

    const headers = [
      'ID',
      'Data da Análise',
      'Processo SEI',
      'Documento Hábil - Liquidação',
      'Nota de Empenho',
      'Tipo Documento',
      'Número da Nota',
      'Chave de Acesso',
      'CNPJ Fornecedor',
      'Razão Social Fornecedor',
      'Optante Simples',
      'Valor Bruto (R$)',
      'IR Retido (R$)',
      'CSLL Retido (R$)',
      'PIS Retido (R$)',
      'COFINS Retido (R$)',
      'INSS Retido (R$)',
      'ISS Retido (R$)',
      'Total Geral Retido (R$)',
      'Valor Líquido a Pagar (R$)',
      'Códigos DARF',
      'Naturezas EFD-Reinf'
    ];

    const escapeCsv = (str: any) => {
      if (str === null || str === undefined) return '""';
      const clean = String(str).replace(/"/g, '""');
      return `"${clean}"`;
    };

    const formatNum = (num: any) => {
      const n = parseFloat(num) || 0;
      return `"${n.toFixed(2).replace('.', ',')}"`;
    };

    const linhas = [headers.join(';')];

    notasParaExportar.forEach(n => {
      const dj = n.dados_json || {};
      const codigosDarf = Array.isArray(dj.codigosReceitaDarf) 
        ? dj.codigosReceitaDarf.map((d: any) => `${d.codigo}: R$ ${Number(d.valor || 0).toFixed(2)}`).join(' | ')
        : '';
      const naturezasReinf = Array.isArray(dj.naturezasEFDReinf)
        ? dj.naturezasEFDReinf.map((r: any) => `${r.codigo} (${r.descricao || 'Serviço'}): R$ ${Number(r.valor || 0).toFixed(2)}`).join(' | ')
        : '';

      const linha = [
        n.id,
        escapeCsv(new Date(n.created_at).toLocaleDateString('pt-BR') + ' ' + new Date(n.created_at).toLocaleTimeString('pt-BR')),
        escapeCsv(n.numero_processo || dj.numeroProcesso || 'Não informado'),
        escapeCsv(n.documento_habil || dj.documentoHabil || 'Não informado'),
        escapeCsv(n.numero_empenho || dj.numeroEmpenho || 'Não informada'),
        escapeCsv(n.tipo_documento),
        escapeCsv(n.numero_nota),
        escapeCsv(n.chave_acesso || ''),
        escapeCsv(n.fornecedor_cnpj),
        escapeCsv(n.fornecedor_nome),
        escapeCsv(n.optante_simples ? 'SIM' : 'NÃO'),
        formatNum(n.valor_bruto),
        formatNum(dj.totalIr || 0),
        formatNum(dj.totalCsll || 0),
        formatNum(dj.totalPis || 0),
        formatNum(dj.totalCofins || 0),
        formatNum(dj.totalInss || 0),
        formatNum(dj.totalIss || 0),
        formatNum(n.total_retido),
        formatNum(n.valor_liquido),
        escapeCsv(codigosDarf),
        escapeCsv(naturezasReinf)
      ];
      linhas.push(linha.join(';'));
    });

    const csvContent = '\uFEFF' + linhas.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dataHora = new Date().toISOString().slice(0, 10);
    link.setAttribute('href', url);
    link.setAttribute('download', `Relatorio_Contabil_Retencoes_${dataHora}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
              placeholder="Digite o CNPJ do Fornecedor, Nº da Nota, Chave de Acesso, Processo SEI, Doc. Hábil ou Empenho..."
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <FileText size={18} color="var(--primary)" />
              <span>Análises Gravadas no Banco de Dados ({notas.length})</span>
            </h3>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              💡 Marque os checkboxes para somar várias notas e gerar o relatório consolidado do processo no SEI.
            </span>
          </div>

          <button 
            onClick={handleExportarExcelCsv}
            className="btn-outline" 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px', 
              padding: '6px 14px', 
              fontSize: '0.82rem', 
              fontWeight: 700, 
              borderColor: '#16a34a', 
              color: '#15803d', 
              background: '#f0fdf4',
              cursor: 'pointer',
              borderRadius: '6px'
            }}
            title="Exportar notas exibidas / selecionadas para planilha Excel (formato CSV formatado para o Brasil)"
          >
            <Download size={15} />
            <span>Exportar para Excel (CSV)</span>
          </button>
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
                  const dj = n.dados_json || {};
                  const procExibir = n.numero_processo || dj.numeroProcesso;
                  const docHabilExibir = n.documento_habil || dj.documentoHabil;
                  const empExibir = n.numero_empenho || dj.numeroEmpenho;

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

                        {procExibir && (
                          <div style={{ fontSize: '0.72rem', color: '#0f172a', fontWeight: 700, marginTop: '3px', fontFamily: 'var(--font-mono)' }}>
                            <span style={{ color: '#64748b', fontWeight: 500 }}>SEI:</span> {procExibir}
                          </div>
                        )}
                        {docHabilExibir && (
                          <div style={{ fontSize: '0.72rem', color: '#0f172a', fontWeight: 700, marginTop: '1px', fontFamily: 'var(--font-mono)' }}>
                            <span style={{ color: '#64748b', fontWeight: 500 }}>DH:</span> {docHabilExibir}
                          </div>
                        )}
                        {empExibir && (
                          <div style={{ fontSize: '0.72rem', color: '#0f172a', fontWeight: 700, marginTop: '1px', fontFamily: 'var(--font-mono)' }}>
                            <span style={{ color: '#64748b', fontWeight: 500 }}>NE:</span> {empExibir}
                          </div>
                        )}
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
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', alignItems: 'center' }}>
                          <button
                            className="btn-outline"
                            onClick={() => handleAbrirEdicao(n)}
                            title="Editar Documento Hábil (NS Liquidação), Processo SEI e Empenho rapidamente"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '6px 10px',
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              borderColor: '#3b82f6',
                              color: '#1d4ed8',
                              background: '#eff6ff',
                              borderRadius: '6px',
                              cursor: 'pointer'
                            }}
                          >
                            <Edit3 size={13} />
                            <span>Editar NS / SEI</span>
                          </button>

                          <button
                            className="btn-secondary"
                            onClick={() => handleReabrirNota(n.id)}
                            disabled={loadingId === n.id}
                            title="Reabrir análise para ajustes e recálculo"
                            style={{ padding: '6px 10px', fontSize: '0.78rem' }}
                          >
                            {loadingId === n.id ? <RefreshCw size={14} className="spin" /> : <FileText size={14} />}
                            <span>Reabrir</span>
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

      {/* Toast de Confirmação */}
      {toastSucesso && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          background: '#16a34a',
          color: '#ffffff',
          padding: '12px 20px',
          borderRadius: '8px',
          boxShadow: '0 10px 15px -3px rgba(0,0,0,0.2)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '0.9rem',
          fontWeight: 700,
          zIndex: 9999,
          animation: 'fadeIn 0.2s ease-in'
        }}>
          <CheckCircle2 size={18} />
          <span>{toastSucesso}</span>
        </div>
      )}

      {/* Modal de Edição Rápida de Lançamento */}
      {notaParaEditar && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '520px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            overflow: 'hidden',
            border: '1px solid var(--border)'
          }}>
            {/* Header do Modal */}
            <div style={{
              background: 'linear-gradient(135deg, #1e293b, #0f172a)',
              color: '#ffffff',
              padding: '18px 24px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Edit3 size={18} color="#60a5fa" />
                  <span>Editar Lançamento — Nota {notaParaEditar.numero_nota}</span>
                </h3>
                <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                  {notaParaEditar.fornecedor_nome} • {notaParaEditar.tipo_documento === 'NFE' ? 'NF-e Mercadoria' : 'NFS-e Serviço'}
                </span>
              </div>
              <button 
                type="button"
                onClick={() => setNotaParaEditar(null)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
                title="Fechar"
              >
                <X size={20} />
              </button>
            </div>

            {/* Formulário */}
            <form onSubmit={handleSalvarEdicaoBasica} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '12px',
                fontSize: '0.82rem',
                color: '#475569',
                lineHeight: 1.4
              }}>
                💡 <strong>Edição Prática:</strong> Insira ou altere os dados administrativos deste lançamento. As alterações serão salvas imediatamente no banco de dados e refletidas no histórico e nos relatórios.
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: '0.82rem', color: '#1e293b', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Documento Hábil - Liquidação (NS)</span>
                  <span style={{ color: '#2563eb', fontWeight: 600 }}>Chave SIAFI / Integração</span>
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={editDocHabil}
                  onChange={(e) => setEditDocHabil(e.target.value)}
                  placeholder="Ex: 2026NS000123"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', padding: '8px 12px' }}
                  autoFocus
                />
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Número da Nota de Sistema (NS) de liquidação gerada no SIAFI/SIAFEM.
                </span>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: '0.82rem', color: '#1e293b' }}>
                  Número do Processo SEI
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={editProcesso}
                  onChange={(e) => setEditProcesso(e.target.value)}
                  placeholder="Ex: 23525.016917/2026-50"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', padding: '8px 12px' }}
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: '0.82rem', color: '#1e293b' }}>
                  Nota de Empenho (NE)
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={editEmpenho}
                  onChange={(e) => setEditEmpenho(e.target.value.toUpperCase())}
                  placeholder="Ex: 2026NE000123"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', padding: '8px 12px' }}
                />
              </div>

              {/* Botões do Rodapé */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => setNotaParaEditar(null)}
                  disabled={salvandoEdicao}
                  style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={salvandoEdicao}
                  style={{ padding: '8px 20px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  {salvandoEdicao ? <RefreshCw size={15} className="spin" /> : <CheckCircle2 size={15} />}
                  <span>{salvandoEdicao ? 'Gravando no Banco...' : 'Salvar no Banco de Dados'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

