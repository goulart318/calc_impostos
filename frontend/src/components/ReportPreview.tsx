import React, { useState } from 'react';
import { Download, Database, CheckCircle2, ShieldCheck, AlertCircle, Building2 } from 'lucide-react';

export interface ItemCalculado {
  numeroItem: number;
  descricao: string;
  ncm: string;
  cst?: string;
  codigoServico?: string;
  valorBruto: number;
  condicaoAplicavel: string;
  codigoReceitaDarf: string;
  naturezaRendimentoReinf: string;
  fundamentacaoLegal: string;
  aliqIr: number;
  aliqCsll: number;
  aliqCofins: number;
  aliqPis: number;
  aliqInss: number;
  aliqIss: number;
  valorIr: number;
  valorCsll: number;
  valorCofins: number;
  valorPis: number;
  valorInss: number;
  valorIss: number;
  valorTotalRetido: number;
  valorLiquido: number;
}

export interface ResultadoConsolidado {
  tipoDocumento: 'NFE' | 'NFSE';
  numeroNota: string;
  chaveAcesso?: string;
  fornecedorNome: string;
  fornecedorCnpj: string;
  destinatarioNome?: string;
  destinatarioCnpj?: string;
  optanteSimples: boolean;
  optanteSimei?: boolean;
  dataOpcaoSimples?: string;
  situacaoCadastral: string;
  fonteConsultaCnpj?: string;
  dataEmissao: string;
  itens: ItemCalculado[];
  totalBruto: number;
  totalIr: number;
  totalCsll: number;
  totalCofins: number;
  totalPis: number;
  totalFederal: number;
  totalInss: number;
  baseCalculoInssTotal?: number;
  totalMateriaisInssDeducao?: number;
  totalIss: number;
  totalContaVinculada?: number;
  baseCalculoIssTotal?: number;
  percentualReducaoIssAplicado?: number;
  issRetidoTomador?: boolean;
  totalRetidoGeral: number;
  valorLiquido: number;
  naturezasEFDReinf: { codigo: string; descricao: string; valor: number }[];
  codigosReceitaDarf: { codigo: string; valor: number }[];
  fundamentacaoLegalResumo: string[];
}

interface Props {
  data: ResultadoConsolidado;
}

export const ReportPreview: React.FC<Props> = ({ data }) => {
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [baixandoPdf, setBaixandoPdf] = useState(false);

  const formatBRL = (val: number) => {
    return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const handleDownloadPdf = async () => {
    try {
      setBaixandoPdf(true);
      const response = await fetch('http://localhost:3001/api/gerar-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (!response.ok) throw new Error('Falha ao gerar PDF');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Relatorio_Retencao_Nota_${data.numeroNota || 'Fiscal'}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err: any) {
      alert('Erro ao baixar PDF: ' + err.message);
    } finally {
      setBaixandoPdf(false);
    }
  };

  const handleSalvarPostgres = async () => {
    try {
      setSalvando(true);
      const response = await fetch('http://localhost:3001/api/salvar-nota', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.error || 'Erro ao salvar no PostgreSQL');
      }

      setSalvo(true);
      setTimeout(() => setSalvo(false), 4000);
    } catch (err: any) {
      alert('Erro ao salvar no PostgreSQL: ' + err.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div>
      {/* Barra de Ações Rápidas */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', justifyContent: 'flex-end' }}>
        <button 
          className="btn btn-outline" 
          onClick={handleSalvarPostgres}
          disabled={salvando}
        >
          {salvo ? <CheckCircle2 size={16} color="#16a34a" /> : <Database size={16} />}
          {salvo ? 'Salvo no PostgreSQL!' : salvando ? 'Gravando...' : 'Salvar no PostgreSQL'}
        </button>

        <button 
          className="btn btn-primary" 
          onClick={handleDownloadPdf}
          disabled={baixandoPdf}
        >
          <Download size={16} />
          {baixandoPdf ? 'Gerando PDF...' : 'Baixar Relatório para o SEI (PDF)'}
        </button>
      </div>

      {/* Documento Visual Idêntico ao Modelo do SEI */}
      <div className="report-document">
        
        {/* Cabeçalho */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {data.tipoDocumento === 'NFE' ? 'Nota fiscal de compra — NF-e' : 'Nota fiscal de serviço — NFS-e'}
            </h2>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {data.itens.length} {data.itens.length === 1 ? 'item analisado' : 'itens analisados'} • Processo Digital SEI (Vitória/ES)
            </span>
          </div>

          <div className="report-badge">
            {data.tipoDocumento === 'NFE' ? 'NF-e: Compra / Mercadoria' : 'NFS-e: Prestação de Serviço'}
          </div>
        </div>

        {/* Informações da Nota e Fornecedor */}
        <div className="report-header-box">
          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>NÚMERO DA NOTA</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>{data.numeroNota || '---'}</div>
            </div>

            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>FORNECEDOR (EMITENTE)</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {data.fornecedorNome}
                {data.fornecedorCnpj && <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>({data.fornecedorCnpj})</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Quadro de Auditoria do Simples Nacional / Receita Federal */}
        <div style={{ 
          margin: '0 0 20px 0', 
          padding: '12px 16px', 
          borderRadius: 'var(--radius-md)', 
          border: data.optanteSimples ? '1px solid #fde68a' : '1px solid #bfdbfe',
          background: data.optanteSimples ? '#fffbeb' : '#eff6ff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {data.optanteSimples ? <AlertCircle size={20} color="#d97706" /> : <Building2 size={20} color="#2563eb" />}
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: data.optanteSimples ? '#92400e' : '#1e40af' }}>
                {data.optanteSimples 
                  ? `FORNECEDOR OPTANTE PELO SIMPLES NACIONAL ${data.optanteSimei ? '(MEI)' : ''}` 
                  : 'FORNECEDOR REGIME NORMAL (NÃO OPTANTE PELO SIMPLES NACIONAL)'}
              </div>
              <div style={{ fontSize: '0.75rem', color: data.optanteSimples ? '#b45309' : '#1d4ed8' }}>
                {data.optanteSimples 
                  ? 'Aplicação do Art. 4º, Inciso XI da IN RFB nº 1.234/2012 (Dispensa de Retenção de Tributos Federais).' 
                  : 'Sujeito à Retenção Ampla de IR, CSLL, COFINS e PIS/PASEP conforme a IN RFB nº 1.234/2012.'}
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, display: 'block', color: 'var(--text-muted)' }}>SITUAÇÃO CADASTRAL</span>
            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: data.situacaoCadastral === 'ATIVA' ? '#16a34a' : '#dc2626' }}>
              {data.situacaoCadastral || 'ATIVA'}
            </span>
          </div>
        </div>

        {/* Lista de Itens Analisados (Critério NCM ou Serviço) */}
        {data.itens.map((item, idx) => (
          <div key={idx} className="item-card">
            <div className="item-header">
              <div>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--primary)' }}>
                  {data.tipoDocumento === 'NFE' ? 'CRITÉRIO NCM & CST' : 'CÓDIGO SERVIÇO'}
                </span>
                <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>
                  {data.tipoDocumento === 'NFE' 
                    ? `NCM ${item.ncm || 'Geral'} ${item.cst ? `• CST: ${item.cst}` : ''}` 
                    : `Cód. ${item.codigoServico || '6190'}`}
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>VALOR BRUTO</span>
                <div style={{ fontSize: '1.05rem', fontWeight: 800 }}>{formatBRL(item.valorBruto)}</div>
              </div>
            </div>

            {/* Destaque para Natureza de Rendimento EFD-Reinf e Código DARF */}
            <div style={{ 
              marginTop: '10px', 
              padding: '10px 14px', 
              borderRadius: '6px', 
              background: '#f0f9ff', 
              border: '1px solid #bae6fd',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              alignItems: 'center'
            }}>
              <div>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', display: 'block' }}>
                  📌 NATUREZA DE RENDIMENTO (EFD-REINF R-4020)
                </span>
                <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0c4a6e' }}>
                  {item.naturezaRendimentoReinf}
                </span>
              </div>

              <div>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', display: 'block' }}>
                  🏷️ CÓDIGO DA RECEITA DARF (RFB)
                </span>
                <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0c4a6e' }}>
                  {item.codigoReceitaDarf}
                </span>
              </div>
            </div>

            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '6px' }}>
              ⚖️ <strong>Fundamentação Legal:</strong> {item.fundamentacaoLegal}
            </div>
          </div>
        ))}

        {/* Consolidado do Lote / Memória de Cálculo */}
        <div style={{ marginTop: '24px' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📊</span> Consolidado do Lote / Memória de Cálculo
          </h3>

          {/* Quadro de Deduções da Base de Cálculo (Materiais / Obras) */}
          {(Boolean(data.totalMateriaisInssDeducao && data.totalMateriaisInssDeducao > 0) || Boolean(data.percentualReducaoIssAplicado && data.percentualReducaoIssAplicado > 0)) && (
            <div style={{ 
              margin: '16px 0', 
              padding: '12px 16px', 
              borderRadius: 'var(--radius-md)', 
              border: '1px solid #fde68a',
              background: '#fffbeb'
            }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#92400e', marginBottom: '6px' }}>
                📐 MEMÓRIA DE DEDUÇÕES DA BASE DE CÁLCULO (INSS / ISSQN):
              </div>
              <div style={{ fontSize: '0.8rem', color: '#78350f', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div><strong>Valor Bruto da Nota:</strong> {formatBRL(data.totalBruto)}</div>
                {Boolean(data.totalMateriaisInssDeducao && data.totalMateriaisInssDeducao > 0) && (
                  <div>
                    <strong>(-) Abatimento de Materiais e Equipamentos (IN RFB nº 2.110/2022):</strong> {formatBRL(data.totalMateriaisInssDeducao || 0)}
                    <span style={{ marginLeft: '8px', fontWeight: 700, color: '#b45309' }}>
                      ➔ Base de Cálculo do INSS (11%): {formatBRL(data.baseCalculoInssTotal || 0)}
                    </span>
                  </div>
                )}
                {Boolean(data.percentualReducaoIssAplicado && data.percentualReducaoIssAplicado > 0) && (
                  <div>
                    <strong>(-) Redução da Base do ISSQN ({data.percentualReducaoIssAplicado}% - Lei Municipal nº 6.075/2003):</strong> {formatBRL(data.totalBruto - (data.baseCalculoIssTotal || 0))}
                    <span style={{ marginLeft: '8px', fontWeight: 700, color: '#b45309' }}>
                      ➔ Base de Cálculo do ISSQN (5%): {formatBRL(data.baseCalculoIssTotal || 0)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="consolidado-box">
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
              TOTAL A RETER, INCLUINDO INSS E ISS
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#1e40af', marginTop: '2px' }}>
              {formatBRL(data.totalRetidoGeral)}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              sobre o valor bruto de {formatBRL(data.totalBruto)}
            </div>
          </div>

          {/* Tabela de Tributos Detalhados */}
          <table className="tax-table">
            <thead>
              <tr>
                <th>TRIBUTO / RETENÇÃO</th>
                <th>ALÍQUOTA</th>
                <th>LEGISLAÇÃO APLICÁVEL</th>
                <th style={{ textAlign: 'right' }}>VALOR RETIDO</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>IR</strong> — Imposto de Renda</td>
                <td>{data.itens[0]?.aliqIr ? `${data.itens[0].aliqIr.toFixed(2)}%` : '0,00%'}</td>
                <td>IN RFB nº 1.234/2012</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatBRL(data.totalIr)}</td>
              </tr>
              <tr>
                <td><strong>CSLL</strong> — Contribuição Social s/ Lucro</td>
                <td>{data.itens[0]?.aliqCsll ? `${data.itens[0].aliqCsll.toFixed(2)}%` : '0,00%'}</td>
                <td>IN RFB nº 1.234/2012</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatBRL(data.totalCsll)}</td>
              </tr>
              <tr>
                <td><strong>COFINS</strong> — Seguridade Social</td>
                <td>{data.itens[0]?.aliqCofins ? `${data.itens[0].aliqCofins.toFixed(2)}%` : '0,00%'}</td>
                <td>IN RFB nº 1.234/2012</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatBRL(data.totalCofins)}</td>
              </tr>
              <tr>
                <td><strong>PIS/PASEP</strong> — Integração Social</td>
                <td>{data.itens[0]?.aliqPis ? `${data.itens[0].aliqPis.toFixed(2)}%` : '0,00%'}</td>
                <td>IN RFB nº 1.234/2012</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatBRL(data.totalPis)}</td>
              </tr>
              <tr>
                <td>
                  <strong>INSS</strong> — Retenção Previdenciária
                  {Boolean(data.totalMateriaisInssDeducao && data.totalMateriaisInssDeducao > 0) && (
                    <div style={{ fontSize: '0.7rem', color: '#475569', marginTop: '2px' }}>
                      (BC Mão de Obra: {formatBRL(data.baseCalculoInssTotal || 0)} - Abatimento de Materiais: {formatBRL(data.totalMateriaisInssDeducao || 0)})
                    </div>
                  )}
                </td>
                <td>{data.itens[0]?.aliqInss ? `${data.itens[0].aliqInss.toFixed(2)}%` : '11,00%'}</td>
                <td>IN RFB nº 2.110/2022 / CPRB</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatBRL(data.totalInss)}</td>
              </tr>
              <tr>
                <td><strong>ISSQN</strong> — Imposto Municipal (Vitória/ES)</td>
                <td>{data.itens[0]?.aliqIss ? `${data.itens[0].aliqIss.toFixed(2)}%` : '0,00%'}</td>
                <td>Lei Municipal nº 6.075/2003 c/c LC 116</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatBRL(data.totalIss)}</td>
              </tr>
              {Boolean(data.totalContaVinculada && data.totalContaVinculada > 0) && (
                <tr style={{ background: '#fffbeb' }}>
                  <td><strong>CONTA VINCULADA</strong> — Provisões Trabalhistas</td>
                  <td>---</td>
                  <td>IN SEGES/ME nº 5/2017 (Conta-Depósito Vinculada)</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: '#b45309' }}>{formatBRL(data.totalContaVinculada!)}</td>
                </tr>
              )}
              <tr className="liquid-row">
                <td colSpan={3}>VALOR LÍQUIDO A PAGAR AO FORNECEDOR</td>
                <td style={{ textAlign: 'right' }}>{formatBRL(data.valorLiquido)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Rodapé de Auditoria Documental e SEI */}
        <div style={{ marginTop: '20px', padding: '12px 16px', background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', display: 'flex', gap: '10px', alignItems: 'center' }}>
          <ShieldCheck size={20} color="var(--primary)" />
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <strong>Auditoria Documental SEI:</strong> Retenções calculadas em estrita observância à IN RFB nº 1.234/2012 (com as regras de NCM do art. 4º), IN RFB nº 2.110/2022 e Código Tributário de Vitória/ES (Lei nº 6.075/2003). Consulta do Simples Nacional via {data.fonteConsultaCnpj || 'Receita Federal'}.
          </div>
        </div>

      </div>
    </div>
  );
};
