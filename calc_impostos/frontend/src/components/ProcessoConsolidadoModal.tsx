import React, { useState } from 'react';
import { 
  X, 
  AlertTriangle, 
  CheckCircle2, 
  Database, 
  Layers, 
  FileSpreadsheet,
  Printer
} from 'lucide-react';
import { type ResultadoConsolidado } from './ReportPreview';

export interface ProcessoConsolidadoData {
  numeroProcesso?: string;
  notaEmpenho?: string;
  observacoes?: string;
  temMultiplosFornecedores: boolean;
  fornecedorPrincipal?: {
    nome?: string;
    cnpj?: string;
    optanteSimples?: boolean;
  };
  notas: ResultadoConsolidado[];
  resumo: {
    totalNotas: number;
    totalBruto: number;
    totalRetidoGeral: number;
    totalLiquido: number;
    totalIr: number;
    totalCsll: number;
    totalCofins: number;
    totalPis: number;
    totalInss: number;
    totalIss: number;
    totalContaVinculada?: number;
    codigosDarfAgrupados?: Array<{ codigo: string; valor: number }>;
  };
}

interface Props {
  dados: ProcessoConsolidadoData;
  onClose: () => void;
  podeSalvarNoBanco?: boolean;
}

export const ProcessoConsolidadoModal: React.FC<Props> = ({ 
  dados, 
  onClose,
  podeSalvarNoBanco = true 
}) => {
  const [numeroProcesso, setNumeroProcesso] = useState(dados.numeroProcesso || '');
  const [notaEmpenho, setNotaEmpenho] = useState(dados.notaEmpenho || '');
  const [observacoes, setObservacoes] = useState(dados.observacoes || '');
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [salvoSucesso, setSalvoSucesso] = useState(false);

  // Formata o número do processo no padrão SEI: xxxxx.yyyyyy/aaaa-dd
  const formatarProcessoSei = (val: string) => {
    const limpo = val.replace(/\D/g, '').slice(0, 17);
    if (limpo.length <= 5) return limpo;
    if (limpo.length <= 11) return `${limpo.slice(0, 5)}.${limpo.slice(5)}`;
    if (limpo.length <= 15) return `${limpo.slice(0, 5)}.${limpo.slice(5, 11)}/${limpo.slice(11)}`;
    return `${limpo.slice(0, 5)}.${limpo.slice(5, 11)}/${limpo.slice(11, 15)}-${limpo.slice(15)}`;
  };

  const formatBRL = (val: number) => {
    return (Number(val) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const totalFederais = (dados.resumo.totalIr || 0) + 
                        (dados.resumo.totalCsll || 0) + 
                        (dados.resumo.totalCofins || 0) + 
                        (dados.resumo.totalPis || 0);

  const handleDownloadPdf = async () => {
    try {
      setGerandoPdf(true);
      const payload = {
        ...dados,
        numeroProcesso: numeroProcesso.trim() || undefined,
        notaEmpenho: notaEmpenho.trim() || undefined,
        observacoes: observacoes.trim() || undefined
      };

      const res = await fetch('http://localhost:3001/api/processo/gerar-pdf-consolidado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error('Falha ao gerar o PDF consolidado do processo.');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const procNome = (numeroProcesso || 'Pagamento').replace(/[^a-zA-Z0-9_-]/g, '_');
      a.download = `Relatorio_Consolidado_Processo_${procNome}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert('Erro ao exportar PDF: ' + err.message);
    } finally {
      setGerandoPdf(false);
    }
  };

  const handleSalvarTodasNoBanco = async () => {
    try {
      setSalvando(true);
      let salvas = 0;
      for (const nota of dados.notas) {
        const res = await fetch('http://localhost:3001/api/notas/salvar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(nota)
        });
        if (res.ok) salvas++;
      }
      setSalvoSucesso(true);
      alert(`✅ ${salvas} nota(s) fiscal(is) gravada(s) com sucesso no histórico do PostgreSQL!`);
    } catch (err: any) {
      alert('Erro ao salvar notas no banco de dados: ' + err.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px'
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '1150px',
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        overflow: 'hidden',
        border: '1px solid #cbd5e1'
      }}>
        {/* Cabeçalho do Modal */}
        <div style={{
          padding: '18px 24px',
          background: '#0f172a',
          color: '#ffffff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid #334155'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              background: '#2563eb',
              borderRadius: '8px',
              padding: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Layers size={22} color="#ffffff" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>
                Processo de Pagamento — Relatório Consolidado
              </h2>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '2px 0 0 0' }}>
                Consolidação de {dados.resumo.totalNotas} nota(s) fiscal(is) com memória de cálculo unificada (IN 1.234/2012)
              </p>
            </div>
          </div>

          <button 
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Fechar"
          >
            <X size={22} />
          </button>
        </div>

        {/* Corpo com Scroll */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {/* Metadados do Processo (SEI e Empenho) */}
          <div style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '20px'
          }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#334155', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileSpreadsheet size={18} color="#2563eb" />
              Identificação do Processo Administrativo
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              <div>
                <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  <span>NÚMERO DO PROCESSO SEI:</span>
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Padrão: xxxxx.yyyyyy/aaaa-dd</span>
                </label>
                <input 
                  type="text"
                  className="form-input"
                  placeholder="Ex: 23068.012345/2026-99"
                  value={numeroProcesso}
                  onChange={(e) => setNumeroProcesso(formatarProcessoSei(e.target.value))}
                  style={{ width: '100%', fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  NOTA DE EMPENHO / CONTRATO:
                </label>
                <input 
                  type="text"
                  className="form-input"
                  placeholder="Ex: 2026NE000123 / Contrato 45/2025"
                  value={notaEmpenho}
                  onChange={(e) => setNotaEmpenho(e.target.value)}
                  style={{ width: '100%', fontSize: '0.85rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  CREDOR / FORNECEDOR:
                </label>
                <div style={{
                  padding: '8px 12px',
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: '#1e293b'
                }}>
                  {dados.temMultiplosFornecedores 
                    ? '⚠️ Múltiplos Credores no Lote' 
                    : `${dados.fornecedorPrincipal?.nome || 'Fornecedor Identificado'} (${dados.fornecedorPrincipal?.cnpj || 'CNPJ n/d'})`}
                </div>
              </div>
            </div>

            <div style={{ marginTop: '12px' }}>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                OBSERVAÇÕES DO PROCESSO (OPCIONAL):
              </label>
              <input 
                type="text"
                className="form-input"
                placeholder="Ex: Pagamento referente à medição de serviços de limpeza / Aquisição de insumos hospitalares"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                style={{ width: '100%', fontSize: '0.85rem' }}
              />
            </div>

            {dados.temMultiplosFornecedores && (
              <div style={{
                marginTop: '12px',
                padding: '10px 14px',
                background: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '0.8rem',
                color: '#b45309'
              }}>
                <AlertTriangle size={18} color="#d97706" />
                <span>
                  <strong>Atenção:</strong> Foram identificados CNPJs de fornecedores distintos neste lote. Os totais financeiros foram calculados, mas certifique-se de que a liquidação conjunta é aplicável a este processo.
                </span>
              </div>
            )}
          </div>

          {/* Cards de Síntese Financeira */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '14px',
            marginBottom: '20px'
          }}>
            <div style={{
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              padding: '14px'
            }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>VALOR BRUTO TOTAL</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
                {formatBRL(dados.resumo.totalBruto)}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
                Soma de {dados.resumo.totalNotas} nota(s) fiscal(is)
              </div>
            </div>

            <div style={{
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: '8px',
              padding: '14px'
            }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1e40af' }}>RETENÇÃO FEDERAL (DARF)</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#1d4ed8', marginTop: '4px' }}>
                {formatBRL(totalFederais)}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#60a5fa', marginTop: '2px' }}>
                IR + CSLL + COFINS + PIS
              </div>
            </div>

            <div style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              padding: '14px'
            }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#991b1b' }}>TOTAL RETIDO GERAL</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#b91c1c', marginTop: '4px' }}>
                {formatBRL(dados.resumo.totalRetidoGeral)}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#f87171', marginTop: '2px' }}>
                Federais + INSS + ISSQN
              </div>
            </div>

            <div style={{
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: '8px',
              padding: '14px'
            }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#166534' }}>VALOR LÍQUIDO A PAGAR</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#15803d', marginTop: '4px' }}>
                {formatBRL(dados.resumo.totalLiquido)}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#4ade80', marginTop: '2px' }}>
                Valor líquido após retenções
              </div>
            </div>
          </div>

          {/* Tabela Analítica das Notas */}
          <div style={{
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            overflow: 'hidden',
            marginBottom: '20px'
          }}>
            <div style={{
              padding: '12px 16px',
              background: '#f8fafc',
              borderBottom: '1px solid #cbd5e1',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <strong style={{ fontSize: '0.85rem', color: '#1e293b' }}>
                Demonstrativo Analítico Nota a Nota
              </strong>
              <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                {dados.notas.length} notas no processo
              </span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ background: '#0f172a', color: '#ffffff' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left' }}>Nº NOTA</th>
                    <th style={{ padding: '10px 8px', textAlign: 'left' }}>TIPO</th>
                    <th style={{ padding: '10px 8px', textAlign: 'left' }}>EMISSÃO</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>VALOR BRUTO</th>
                    <th style={{ padding: '10px 10px', textAlign: 'right' }}>FEDERAIS (DARF)</th>
                    <th style={{ padding: '10px 8px', textAlign: 'right' }}>INSS</th>
                    <th style={{ padding: '10px 8px', textAlign: 'right' }}>ISS</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>TOTAL RETIDO</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>LÍQUIDO A PAGAR</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.notas.map((n, idx) => {
                    const fedNota = (n.totalIr || 0) + (n.totalCsll || 0) + (n.totalCofins || 0) + (n.totalPis || 0);
                    return (
                      <tr 
                        key={idx}
                        style={{
                          background: idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                          borderBottom: '1px solid #e2e8f0'
                        }}
                      >
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0f172a' }}>
                          {n.numeroNota || 'S/N'}
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          <span style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: n.tipoDocumento === 'NFE' ? '#eff6ff' : '#f0fdf4',
                            color: n.tipoDocumento === 'NFE' ? '#1d4ed8' : '#15803d'
                          }}>
                            {n.tipoDocumento}
                          </span>
                        </td>
                        <td style={{ padding: '10px 8px', color: '#64748b' }}>
                          {n.dataEmissao || '---'}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>
                          {formatBRL(n.totalBruto)}
                        </td>
                        <td style={{ padding: '10px 10px', textAlign: 'right', color: '#1d4ed8', fontWeight: 600 }}>
                          {formatBRL(fedNota)}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', color: '#d97706' }}>
                          {formatBRL(n.totalInss || 0)}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', color: '#4338ca' }}>
                          {formatBRL(n.totalIss || 0)}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#b91c1c', fontWeight: 700 }}>
                          {formatBRL(n.totalRetidoGeral)}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#15803d', fontWeight: 700 }}>
                          {formatBRL(n.valorLiquido)}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Linha Final de TOTAIS */}
                  <tr style={{ background: '#e2e8f0', borderTop: '2px solid #94a3b8', fontWeight: 800 }}>
                    <td colSpan={3} style={{ padding: '12px', color: '#0f172a' }}>
                      TOTAIS CONSOLIDADOS DO PROCESSO
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', color: '#0f172a' }}>
                      {formatBRL(dados.resumo.totalBruto)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', color: '#1d4ed8' }}>
                      {formatBRL(totalFederais)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', color: '#d97706' }}>
                      {formatBRL(dados.resumo.totalInss)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', color: '#4338ca' }}>
                      {formatBRL(dados.resumo.totalIss)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', color: '#b91c1c', fontSize: '0.85rem' }}>
                      {formatBRL(dados.resumo.totalRetidoGeral)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', color: '#15803d', fontSize: '0.85rem' }}>
                      {formatBRL(dados.resumo.totalLiquido)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Quadro de Códigos DARF e Guias de Arrecadação */}
          <div style={{
            background: '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '10px'
          }}>
            <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '10px' }}>
              🏛️ Resumo para Emissão de Guias de Recolhimento
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
              <div style={{ background: '#ffffff', padding: '10px 14px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b' }}>GUIA DARF (TRIBUTOS FEDERAIS)</div>
                {dados.resumo.codigosDarfAgrupados && dados.resumo.codigosDarfAgrupados.length > 0 ? (
                  dados.resumo.codigosDarfAgrupados.map((c, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '0.82rem' }}>
                      <span>Código Receita <strong>{c.codigo}</strong>:</span>
                      <strong style={{ color: '#1d4ed8' }}>{formatBRL(c.valor)}</strong>
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: '0.82rem', color: '#94a3b8', marginTop: '4px' }}>Sem retenções federais</div>
                )}
              </div>

              <div style={{ background: '#ffffff', padding: '10px 14px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b' }}>GUIA PREVIDENCIÁRIA (INSS)</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '0.82rem' }}>
                  <span>Total INSS (Art. 120/121 IN 2110):</span>
                  <strong style={{ color: '#d97706' }}>{formatBRL(dados.resumo.totalInss)}</strong>
                </div>
              </div>

              <div style={{ background: '#ffffff', padding: '10px 14px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b' }}>GUIA MUNICIPAL (ISSQN)</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '0.82rem' }}>
                  <span>Total ISSQN (Vitória/ES):</span>
                  <strong style={{ color: '#4338ca' }}>{formatBRL(dados.resumo.totalIss)}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Rodapé com Botões de Ação */}
        <div style={{
          padding: '16px 24px',
          background: '#f8fafc',
          borderTop: '1px solid #cbd5e1',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <button 
            className="btn btn-outline"
            onClick={onClose}
            style={{ fontSize: '0.85rem' }}
          >
            Fechar
          </button>

          <div style={{ display: 'flex', gap: '10px' }}>
            {podeSalvarNoBanco && (
              <button 
                className="btn btn-outline"
                onClick={handleSalvarTodasNoBanco}
                disabled={salvando || salvoSucesso}
                style={{
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: salvoSucesso ? '#ecfdf5' : undefined,
                  borderColor: salvoSucesso ? '#10b981' : undefined,
                  color: salvoSucesso ? '#047857' : undefined
                }}
              >
                {salvoSucesso ? <CheckCircle2 size={16} /> : <Database size={16} />}
                {salvando ? 'Salvando...' : salvoSucesso ? 'Notas Salvas no Banco' : 'Salvar Todas no PostgreSQL'}
              </button>
            )}

            <button 
              className="btn-primary"
              onClick={handleDownloadPdf}
              disabled={gerandoPdf}
              style={{
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
                background: '#1d4ed8'
              }}
            >
              <Printer size={18} />
              {gerandoPdf ? 'Gerando Relatório Oficial...' : 'Baixar Relatório Consolidado (PDF SEI)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
