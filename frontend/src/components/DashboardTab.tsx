import React, { useEffect, useState } from 'react';
import { 
  BarChart3, 
  DollarSign, 
  AlertTriangle, 
  Filter, 
  RefreshCw, 
  FileText, 
  Layers, 
  Receipt
} from 'lucide-react';

interface AnalyticsData {
  totaisPorTributo: {
    totalBrutoAcumulado: number;
    totalGeralRetido: number;
    ir: number;
    csll: number;
    pis: number;
    cofins: number;
    inss: number;
    iss: number;
  };
  totaisPorCodigoDarf: Array<{
    codigo: string;
    totalValor: number;
    count: number;
  }>;
  naturezasEFDReinf: Array<{
    codigo: string;
    descricao: string;
    totalValor: number;
    count: number;
  }>;
  alertas: Array<{
    id: number;
    numeroNota: string;
    fornecedorNome: string;
    tipo: string;
    mensagem: string;
  }>;
  totalNotasAnalisadas: number;
  notas: Array<{
    id: number;
    tipoDocumento: string;
    numeroNota: string;
    chaveAcesso?: string;
    fornecedorCnpj: string;
    fornecedorNome: string;
    destinatarioCnpj?: string;
    destinatarioNome?: string;
    optanteSimples: boolean;
    valorBruto: number;
    valorLiquido: number;
    totalRetido: number;
    createdAt: string;
    naturezasReinf: string[];
    dadosJson: any;
  }>;
}

export const DashboardTab: React.FC = () => {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtroNatureza, setFiltroNatureza] = useState<string>('');

  const carregarAnalytics = async (natureza: string = '') => {
    try {
      setLoading(true);
      setError(null);
      const url = `http://localhost:3001/api/dashboard/analytics${natureza ? `?natureza=${encodeURIComponent(natureza)}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error('Falha ao carregar dados do servidor.');
      }
      const json = await res.json();
      setData(json);
    } catch (e: any) {
      console.error('Erro ao buscar dados do Dashboard:', e);
      setError(e.message || 'Erro ao carregar indicadores tributários.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarAnalytics(filtroNatureza);
  }, [filtroNatureza]);

  const formatBRL = (val: number) => {
    return (Number(val) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const calcularPorcentagem = (valor: number, total: number) => {
    if (!total || total === 0) return '0.0%';
    return `${((valor / total) * 100).toFixed(1)}%`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* CABEÇALHO DO DASHBOARD */}
      <div className="card" style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', color: '#fff', border: '1px solid #334155' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <BarChart3 size={28} color="#38bdf8" />
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
                Dashboard de Indicadores Tributários & Analytics
              </h2>
            </div>
            <p style={{ color: '#94a3b8', marginTop: '6px', fontSize: '0.9rem' }}>
              Consolidação de impostos retidos na fonte (IN 1234/2012 RFB, IN 2110/22, ISS e EFD-Reinf) a partir de dados reais do banco PostgreSQL.
            </p>
          </div>

          <button 
            className="btn"
            style={{ background: '#38bdf8', color: '#0f172a', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}
            onClick={() => carregarAnalytics(filtroNatureza)}
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
            Atualizar Dados
          </button>
        </div>
      </div>

      {loading && (
        <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
          <RefreshCw size={32} color="var(--primary)" className="spin" style={{ marginBottom: '12px' }} />
          <p style={{ color: 'var(--text-secondary)' }}>Carregando estatísticas e dados tributários do PostgreSQL...</p>
        </div>
      )}

      {error && (
        <div className="card" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertTriangle size={20} />
            <strong>Atenção:</strong> {error}
          </div>
        </div>
      )}

      {!loading && data && (
        <>
          {/* CARDS DE RESUMO GERAL */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
            
            <div className="card" style={{ borderLeft: '4px solid #3b82f6' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>TOTAL RETIDO ACUMULADO</span>
                <DollarSign size={20} color="#3b82f6" />
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '8px' }}>
                {formatBRL(data.totaisPorTributo.totalGeralRetido)}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Faturamento Bruto: {formatBRL(data.totaisPorTributo.totalBrutoAcumulado)}
              </div>
            </div>

            <div className="card" style={{ borderLeft: '4px solid #10b981' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>NOTAS FISCAIS ANALISADAS</span>
                <Receipt size={20} color="#10b981" />
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '8px' }}>
                {data.totalNotasAnalisadas} {data.totalNotasAnalisadas === 1 ? 'Nota Registrada' : 'Notas Registradas'}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Gravadas no PostgreSQL
              </div>
            </div>

            <div className="card" style={{ borderLeft: '4px solid #f59e0b' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>ALERTAS / INCONSISTÊNCIAS</span>
                <AlertTriangle size={20} color="#f59e0b" />
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: data.alertas.length > 0 ? '#d97706' : '#10b981', marginTop: '8px' }}>
                {data.alertas.length} {data.alertas.length === 1 ? 'Alerta Pendente' : 'Alertas Pendentes'}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {data.alertas.length > 0 ? 'Verifique o painel de alertas abaixo' : 'Nenhuma divergência encontrada'}
              </div>
            </div>

          </div>

          {/* PAINEL DE RETENÇÃO ACUMULADA POR TRIBUTO */}
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers size={18} color="var(--primary)" />
              Total Acumulado Retido por Tributo
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              
              {/* IR */}
              <div style={{ padding: '12px 16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 600, color: '#334155' }}>
                  <span>IRPJ (Imposto de Renda)</span>
                  <span>{formatBRL(data.totaisPorTributo.ir)}</span>
                </div>
                <div style={{ marginTop: '8px', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ 
                    height: '100%', 
                    width: calcularPorcentagem(data.totaisPorTributo.ir, data.totaisPorTributo.totalGeralRetido),
                    background: '#2563eb' 
                  }} />
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px', textAlign: 'right' }}>
                  {calcularPorcentagem(data.totaisPorTributo.ir, data.totaisPorTributo.totalGeralRetido)} do total retido
                </div>
              </div>

              {/* CSLL */}
              <div style={{ padding: '12px 16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 600, color: '#334155' }}>
                  <span>CSLL (Contribuição Social)</span>
                  <span>{formatBRL(data.totaisPorTributo.csll)}</span>
                </div>
                <div style={{ marginTop: '8px', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ 
                    height: '100%', 
                    width: calcularPorcentagem(data.totaisPorTributo.csll, data.totaisPorTributo.totalGeralRetido),
                    background: '#7c3aed' 
                  }} />
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px', textAlign: 'right' }}>
                  {calcularPorcentagem(data.totaisPorTributo.csll, data.totaisPorTributo.totalGeralRetido)} do total retido
                </div>
              </div>

              {/* PIS */}
              <div style={{ padding: '12px 16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 600, color: '#334155' }}>
                  <span>PIS / PASEP</span>
                  <span>{formatBRL(data.totaisPorTributo.pis)}</span>
                </div>
                <div style={{ marginTop: '8px', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ 
                    height: '100%', 
                    width: calcularPorcentagem(data.totaisPorTributo.pis, data.totaisPorTributo.totalGeralRetido),
                    background: '#0284c7' 
                  }} />
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px', textAlign: 'right' }}>
                  {calcularPorcentagem(data.totaisPorTributo.pis, data.totaisPorTributo.totalGeralRetido)} do total retido
                </div>
              </div>

              {/* COFINS */}
              <div style={{ padding: '12px 16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 600, color: '#334155' }}>
                  <span>COFINS</span>
                  <span>{formatBRL(data.totaisPorTributo.cofins)}</span>
                </div>
                <div style={{ marginTop: '8px', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ 
                    height: '100%', 
                    width: calcularPorcentagem(data.totaisPorTributo.cofins, data.totaisPorTributo.totalGeralRetido),
                    background: '#0d9488' 
                  }} />
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px', textAlign: 'right' }}>
                  {calcularPorcentagem(data.totaisPorTributo.cofins, data.totaisPorTributo.totalGeralRetido)} do total retido
                </div>
              </div>

              {/* INSS */}
              <div style={{ padding: '12px 16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 600, color: '#334155' }}>
                  <span>INSS (Seguridade Social)</span>
                  <span>{formatBRL(data.totaisPorTributo.inss)}</span>
                </div>
                <div style={{ marginTop: '8px', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ 
                    height: '100%', 
                    width: calcularPorcentagem(data.totaisPorTributo.inss, data.totaisPorTributo.totalGeralRetido),
                    background: '#ea580c' 
                  }} />
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px', textAlign: 'right' }}>
                  {calcularPorcentagem(data.totaisPorTributo.inss, data.totaisPorTributo.totalGeralRetido)} do total retido
                </div>
              </div>

              {/* ISS */}
              <div style={{ padding: '12px 16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', fontWeight: 600, color: '#334155' }}>
                  <span>ISS (Imposto Sobre Serviços)</span>
                  <span>{formatBRL(data.totaisPorTributo.iss)}</span>
                </div>
                <div style={{ marginTop: '8px', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ 
                    height: '100%', 
                    width: calcularPorcentagem(data.totaisPorTributo.iss, data.totaisPorTributo.totalGeralRetido),
                    background: '#16a34a' 
                  }} />
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px', textAlign: 'right' }}>
                  {calcularPorcentagem(data.totaisPorTributo.iss, data.totaisPorTributo.totalGeralRetido)} do total retido
                </div>
              </div>

            </div>
          </div>

          {/* TOTAIS POR CÓDIGO DA RECEITA DARF */}
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={18} color="var(--primary)" />
              Totais por Código da Receita DARF (IN 1234/2012)
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Valores acumulados a recolher por código de arrecadação federal DARF.
            </p>

            {data.totaisPorCodigoDarf.length === 0 ? (
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                Nenhum código DARF registrado ainda.
              </p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                {data.totaisPorCodigoDarf.map((darf) => (
                  <div key={darf.codigo} style={{ padding: '12px', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#ffffff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="badge badge-primary" style={{ fontSize: '0.85rem', padding: '4px 8px' }}>
                        Código DARF: {darf.codigo}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {darf.count} {darf.count === 1 ? 'nota' : 'notas'}
                      </span>
                    </div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '8px', color: '#1e293b' }}>
                      {formatBRL(darf.totalValor)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* PAINEL DE ALERTAS E INCONSISTÊNCIAS */}
          {data.alertas.length > 0 && (
            <div className="card" style={{ border: '1px solid #fcd34d', background: '#fffbeb' }}>
              <h3 className="card-title" style={{ color: '#b45309', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={20} color="#d97706" />
                Alertas de Divergência ou Retenção Zerada
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {data.alertas.map((alerta) => (
                  <div key={`${alerta.id}-${alerta.tipo}`} style={{ padding: '10px 14px', background: '#ffffff', border: '1px solid #fef3c7', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <AlertTriangle size={16} color="#d97706" />
                    <span style={{ fontSize: '0.85rem', color: '#92400e', fontWeight: 500 }}>
                      {alerta.mensagem}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* FILTRO E TABELA DETALHADA DAS NOTAS FISCAIS RETIDAS POR NATUREZA DO RENDIMENTO */}
          <div className="card">
            <div className="card-header">
              <div>
                <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Filter size={18} color="var(--primary)" />
                  Notas Fiscais Retidas — Consulta por Natureza do Rendimento (EFD-Reinf)
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Filtre por código de Natureza do Rendimento (Série R-4000) para visualizar as notas e valores de retenção associados.
                </p>
              </div>

              {/* SELECT FILTRO DE NATUREZA */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Natureza:</label>
                <select
                  className="form-select"
                  value={filtroNatureza}
                  onChange={(e) => setFiltroNatureza(e.target.value)}
                  style={{ minWidth: '240px' }}
                >
                  <option value="">-- Todas as Naturezas EFD-Reinf --</option>
                  {data.naturezasEFDReinf.map((n) => (
                    <option key={n.codigo} value={n.codigo}>
                      Code {n.codigo} — {n.descricao} ({n.count})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* TABELA DE NOTAS DETALHADAS */}
            {data.notas.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
                <FileText size={36} style={{ opacity: 0.5, marginBottom: '8px' }} />
                <p>Nenhuma nota fiscal encontrada no banco de dados para a natureza selecionada.</p>
              </div>
            ) : (
              <div className="table-container" style={{ marginTop: '12px' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Tipo</th>
                      <th>Nº Nota</th>
                      <th>Fornecedor / Razão Social</th>
                      <th>CNPJ</th>
                      <th>Simples?</th>
                      <th>Valor Bruto</th>
                      <th>Total Retido</th>
                      <th>Detalhamento dos Tributos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.notas.map((n) => (
                      <tr key={n.id}>
                        <td>
                          <span className={`badge ${n.tipoDocumento === 'NFE' ? 'badge-primary' : 'badge-success'}`}>
                            {n.tipoDocumento}
                          </span>
                        </td>
                        <td><strong>{n.numeroNota}</strong></td>
                        <td>{n.fornecedorNome}</td>
                        <td><code style={{ fontSize: '0.8rem' }}>{n.fornecedorCnpj}</code></td>
                        <td>
                          {n.optanteSimples ? (
                            <span className="badge badge-warning">Simples</span>
                          ) : (
                            <span className="badge badge-secondary">Não</span>
                          )}
                        </td>
                        <td>{formatBRL(n.valorBruto)}</td>
                        <td><strong style={{ color: 'var(--primary)' }}>{formatBRL(n.totalRetido)}</strong></td>
                        <td>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', fontSize: '0.75rem' }}>
                            {n.dadosJson.totalIr > 0 && <span className="badge badge-outline">IR: {formatBRL(n.dadosJson.totalIr)}</span>}
                            {n.dadosJson.totalCsll > 0 && <span className="badge badge-outline">CSLL: {formatBRL(n.dadosJson.totalCsll)}</span>}
                            {n.dadosJson.totalPis > 0 && <span className="badge badge-outline">PIS: {formatBRL(n.dadosJson.totalPis)}</span>}
                            {n.dadosJson.totalCofins > 0 && <span className="badge badge-outline">COFINS: {formatBRL(n.dadosJson.totalCofins)}</span>}
                            {n.dadosJson.totalInss > 0 && <span className="badge badge-outline">INSS: {formatBRL(n.dadosJson.totalInss)}</span>}
                            {n.dadosJson.totalIss > 0 && <span className="badge badge-outline">ISS: {formatBRL(n.dadosJson.totalIss)}</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          </div>

        </>
      )}

    </div>
  );
};
