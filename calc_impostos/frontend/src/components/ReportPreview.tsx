import React, { useState, useEffect } from 'react';
import { 
  Download, 
  Database, 
  CheckCircle2, 
  ShieldCheck, 
  AlertCircle, 
  Building2,
  Edit3,
  RefreshCw,
  Plus,
  Trash2,
  RotateCcw,
  Sliders,
  Check
} from 'lucide-react';
import { API_BASE_URL } from '../config/api';

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
  numeroProcesso?: string;
  numeroEmpenho?: string;
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

  auditoriaInss?: {
    aliquotaOficialEsperada: number;
    aliquotaEfetivaSobreTotal: number;
    valorInssEsperadoTotal: number;
    valorInssDestacado: number;
    correspondeAliquotaOficial: boolean;
    tipoApuracao: 'CONFERE_11_PORCENTO' | 'DIVERGENCIA_BASE_OU_ALIQUOTA' | 'ISENTO_OU_NAO_DESTACADO';
    mensagemAlerta?: string;
  };
}

export const gerarNomeArquivoPdf = (numeroNota?: string, fornecedorNome?: string): string => {
  const nota = (numeroNota || 'Fiscal').trim();
  const razaoSocial = (fornecedorNome || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s_-]/g, '')
    .replace(/\s+/g, '_')
    .toUpperCase();

  if (razaoSocial) {
    return `Relatorio_Retencao_Nota_${nota}_${razaoSocial}.pdf`;
  }
  return `Relatorio_Retencao_Nota_${nota}.pdf`;
};

interface ItemEditavel {
  id: string;
  numeroItem: number;
  descricao: string;
  ncm: string;
  codigoServico?: string;
  valorBruto: number;
  preset: string; // 'AUTO' | '6147' | '6190' | '6175' | '8767' | 'ISENTO' | 'MANUAL'
  aliqIr: number;
  aliqCsll: number;
  aliqPis: number;
  aliqCofins: number;
  aliqInss: number;
  aliqIss: number;
  codigoReceitaDarf: string;
  naturezaRendimentoReinf: string;
}

interface Props {
  data: ResultadoConsolidado;
  onUpdateData?: (newData: ResultadoConsolidado) => void;
}

export const ReportPreview: React.FC<Props> = ({ data, onUpdateData }) => {
  const [currentData, setCurrentData] = useState<ResultadoConsolidado>(data);
  const [dadosOriginais, setDadosOriginais] = useState<ResultadoConsolidado>(data);
  const [modoEdicao, setModoEdicao] = useState(false);
  const [modificado, setModificado] = useState(false);
  const [recalculando, setRecalculando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [baixandoPdf, setBaixandoPdf] = useState(false);

  const itemParaEditavel = (item: ItemCalculado, idx: number): ItemEditavel => {
    let preset = 'AUTO';
    if (item.codigoReceitaDarf === 'ISENTO') preset = 'ISENTO';
    else if (item.codigoReceitaDarf === '6147') preset = '6147';
    else if (item.codigoReceitaDarf === '6190') preset = '6190';
    else if (item.codigoReceitaDarf === '6175') preset = '6175';
    else if (item.codigoReceitaDarf === '8767' || item.codigoReceitaDarf === '6188') preset = '8767';

    return {
      id: `item-${idx}-${Date.now()}-${Math.random()}`,
      numeroItem: item.numeroItem || (idx + 1),
      descricao: item.descricao || '',
      ncm: item.ncm || '',
      codigoServico: item.codigoServico || '',
      valorBruto: item.valorBruto || 0,
      preset,
      aliqIr: item.aliqIr || 0,
      aliqCsll: item.aliqCsll || 0,
      aliqPis: item.aliqPis || 0,
      aliqCofins: item.aliqCofins || 0,
      aliqInss: item.aliqInss || 0,
      aliqIss: item.aliqIss || 0,
      codigoReceitaDarf: item.codigoReceitaDarf || '6147',
      naturezaRendimentoReinf: item.naturezaRendimentoReinf || '17099'
    };
  };

  const [itensEditados, setItensEditados] = useState<ItemEditavel[]>(() => 
    (data.itens || []).map(itemParaEditavel)
  );

  // Sincroniza se a prop data mudar externamente (ex: carregamento de nova nota, alteração de processo/empenho ou recálculo no formulário principal)
  useEffect(() => {
    setCurrentData(data);
    setDadosOriginais(data);
    setItensEditados((data.itens || []).map(itemParaEditavel));
    setModificado(false);
  }, [
    data.numeroNota, 
    data.chaveAcesso, 
    data.numeroProcesso,
    data.numeroEmpenho,
    data.fornecedorCnpj, 
    data.totalBruto, 
    data.totalContaVinculada, 
    data.totalRetidoGeral, 
    data.valorLiquido,
    data.totalInss,
    data.totalIss
  ]);

  const formatBRL = (val: number) => {
    return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const handleMudarPreset = (index: number, novoPreset: string) => {
    setItensEditados(prev => {
      const clone = [...prev];
      const it = { ...clone[index], preset: novoPreset };

      if (novoPreset === '6147') {
        it.aliqIr = 1.2;
        it.aliqCsll = 1.0;
        it.aliqPis = 0.65;
        it.aliqCofins = 3.0;
        it.codigoReceitaDarf = '6147';
        it.naturezaRendimentoReinf = '17009'; // DDF025: Mercadorias e bens em geral
      } else if (novoPreset === '6190') {
        it.aliqIr = 4.8;
        it.aliqCsll = 1.0;
        it.aliqPis = 0.65;
        it.aliqCofins = 3.0;
        it.codigoReceitaDarf = '6190';
        it.naturezaRendimentoReinf = '17099'; // DDF025: Demais serviços
      } else if (novoPreset === '6175') {
        it.aliqIr = 2.4;
        it.aliqCsll = 1.0;
        it.aliqPis = 0.65;
        it.aliqCofins = 3.0;
        it.codigoReceitaDarf = '6175';
        it.naturezaRendimentoReinf = '17023'; // DDF025: Passagens e transporte
      } else if (novoPreset === '8767') {
        it.aliqIr = 1.2;
        it.aliqCsll = 1.0;
        it.aliqPis = 0.0;
        it.aliqCofins = 0.0;
        it.codigoReceitaDarf = '8767';
        it.naturezaRendimentoReinf = '17022'; // DDF025: Isenção/alíquota zero PIS/COFINS (§ 5º art. 2º)
      } else if (novoPreset === 'ISENTO') {
        it.aliqIr = 0;
        it.aliqCsll = 0;
        it.aliqPis = 0;
        it.aliqCofins = 0;
        it.codigoReceitaDarf = 'ISENTO';
        it.naturezaRendimentoReinf = 'ISENTO';
      }

      clone[index] = it;
      return clone;
    });
    setModificado(true);
  };

  const handleAtualizarCampo = (index: number, campo: keyof ItemEditavel, valor: any) => {
    setItensEditados(prev => {
      const clone = [...prev];
      clone[index] = { ...clone[index], [campo]: valor };
      return clone;
    });
    setModificado(true);
  };

  const handleAdicionarItem = () => {
    const novoNum = itensEditados.length + 1;
    const isNfse = currentData.tipoDocumento === 'NFSE';
    const novoItem: ItemEditavel = {
      id: `item-${Date.now()}-${Math.random()}`,
      numeroItem: novoNum,
      descricao: isNfse ? `Novo Item de Serviço ${novoNum}` : `Novo Item de Mercadoria ${novoNum}`,
      ncm: isNfse ? '' : '00000000',
      codigoServico: isNfse ? '6190' : '',
      valorBruto: 0,
      preset: isNfse ? '6190' : '6147',
      aliqIr: isNfse ? 4.8 : 1.2,
      aliqCsll: 1.0,
      aliqPis: 0.65,
      aliqCofins: 3.0,
      aliqInss: isNfse ? 11.0 : 0,
      aliqIss: isNfse ? 5.0 : 0,
      codigoReceitaDarf: isNfse ? '6190' : '6147',
      naturezaRendimentoReinf: isNfse ? '17099' : '17009'
    };
    setItensEditados(prev => [...prev, novoItem]);
    setModificado(true);
  };

  const handleRemoverItem = (index: number) => {
    if (itensEditados.length <= 1) {
      alert('A nota fiscal deve conter pelo menos 1 item.');
      return;
    }
    setItensEditados(prev => 
      prev.filter((_, i) => i !== index).map((item, i) => ({
        ...item,
        numeroItem: i + 1
      }))
    );
    setModificado(true);
  };

  const handleRestaurarOriginais = () => {
    if (!confirm('Deseja descartar as alterações e restaurar os dados originais da nota fiscal?')) return;
    setCurrentData(dadosOriginais);
    setItensEditados(dadosOriginais.itens.map(itemParaEditavel));
    setModificado(false);
    if (onUpdateData) {
      onUpdateData(dadosOriginais);
    }
  };

  const handleRecalcular = async () => {
    try {
      setRecalculando(true);
      const payload = {
        tipoDocumento: currentData.tipoDocumento,
        numeroNota: currentData.numeroNota,
        chaveAcesso: currentData.chaveAcesso,
        numeroProcesso: currentData.numeroProcesso,
        numeroEmpenho: currentData.numeroEmpenho,
        fornecedorNome: currentData.fornecedorNome,
        fornecedorCnpj: currentData.fornecedorCnpj,
        destinatarioNome: currentData.destinatarioNome,
        destinatarioCnpj: currentData.destinatarioCnpj,
        optanteSimples: currentData.optanteSimples,
        optanteSimei: currentData.optanteSimei,
        dataOpcaoSimples: currentData.dataOpcaoSimples,
        situacaoCadastral: currentData.situacaoCadastral,
        fonteConsultaCnpj: currentData.fonteConsultaCnpj,
        dataEmissao: currentData.dataEmissao,
        codigoServicoPadrao: currentData.tipoDocumento === 'NFSE' ? '6190' : undefined,
        percentualReducaoIss: currentData.percentualReducaoIssAplicado,
        retencaoIss: currentData.issRetidoTomador,
        valorMateriaisInss: currentData.totalMateriaisInssDeducao,
        valorContaVinculada: currentData.totalContaVinculada,
        itens: itensEditados.map(item => ({
          numeroItem: item.numeroItem,
          descricao: item.descricao,
          ncm: item.ncm,
          codigoServico: item.codigoServico,
          valorBruto: Number(item.valorBruto) || 0,
          condicaoEspecial: (item.preset !== 'MANUAL' && item.preset !== 'AUTO') ? item.preset : undefined,
          manualAliqIr: item.preset === 'MANUAL' ? item.aliqIr : undefined,
          manualAliqCsll: item.preset === 'MANUAL' ? item.aliqCsll : undefined,
          manualAliqPis: item.preset === 'MANUAL' ? item.aliqPis : undefined,
          manualAliqCofins: item.preset === 'MANUAL' ? item.aliqCofins : undefined,
          manualAliqInss: item.preset === 'MANUAL' ? item.aliqInss : undefined,
          manualAliqIss: item.preset === 'MANUAL' ? item.aliqIss : undefined,
          manualCodigoDarf: item.codigoReceitaDarf ? item.codigoReceitaDarf.trim() : undefined,
          manualNaturezaReinf: item.naturezaRendimentoReinf ? item.naturezaRendimentoReinf.trim() : undefined,
        }))
      };

      const res = await fetch(`${API_BASE_URL}/api/recalcular`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Falha ao recalcular retenções');
      }

      const resultadoNovo: ResultadoConsolidado = await res.json();
      setCurrentData(resultadoNovo);
      setModificado(true);
      if (onUpdateData) {
        onUpdateData(resultadoNovo);
      }
    } catch (e: any) {
      alert('Erro ao recalcular nota: ' + e.message);
    } finally {
      setRecalculando(false);
    }
  };

  const handleDownloadPdf = async () => {
    try {
      setBaixandoPdf(true);
      const response = await fetch(`${API_BASE_URL}/api/gerar-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentData)
      });

      if (!response.ok) throw new Error('Falha ao gerar PDF');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = gerarNomeArquivoPdf(currentData.numeroNota, currentData.fornecedorNome);
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
      const response = await fetch(`${API_BASE_URL}/api/notas/salvar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentData)
      });

      if (!response.ok) {
        let errMsg = 'Erro ao salvar no PostgreSQL';
        try {
          const errJson = await response.json();
          errMsg = errJson.error || errMsg;
        } catch {
          const txt = await response.text().catch(() => '');
          errMsg = `Erro ${response.status}: ${txt.substring(0, 120)}`;
        }
        throw new Error(errMsg);
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
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            className={`btn ${modoEdicao ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setModoEdicao(!modoEdicao)}
            type="button"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
          >
            {modoEdicao ? <Check size={16} /> : <Edit3 size={16} />}
            {modoEdicao ? 'Concluir Edição de Itens' : 'Editar Itens / Ajuste Manual'}
          </button>

          {modificado && (
            <span className="badge badge-warning" style={{ fontSize: '0.78rem', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              ✏️ Ajustes Manuais pelo Auditor
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
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
      </div>

      {/* Painel do Modo de Edição Inline */}
      {modoEdicao && (
        <div style={{ 
          padding: '14px 18px', 
          background: '#f0f9ff', 
          border: '1px solid #bae6fd', 
          borderRadius: 'var(--radius-md)', 
          marginBottom: '18px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Sliders size={20} color="#0284c7" />
            <div>
              <strong style={{ fontSize: '0.9rem', color: '#0369a1', display: 'block' }}>
                Painel de Edição de Itens e Recálculo Reativo
              </strong>
              <span style={{ fontSize: '0.78rem', color: '#0284c7' }}>
                Edite os campos dos itens abaixo ou altere as regras da IN 1.234/2012 e clique em "Recalcular Retenções".
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            {currentData.tipoDocumento === 'NFSE' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#ffffff', padding: '4px 10px', borderRadius: '6px', border: '1px solid #bae6fd' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0369a1' }}>🏦 Conta Vinculada (R$):</span>
                <input 
                  type="number"
                  step="0.01"
                  min="0"
                  className="form-input"
                  value={currentData.totalContaVinculada || ''}
                  placeholder="0,00"
                  onChange={(e) => {
                    const novoVal = parseFloat(e.target.value) || 0;
                    setCurrentData(prev => ({
                      ...prev,
                      totalContaVinculada: novoVal,
                      totalRetidoGeral: Number(((prev.totalFederal + prev.totalInss + prev.totalIss + novoVal)).toFixed(2)),
                      valorLiquido: Number((prev.totalBruto - (prev.totalFederal + prev.totalInss + prev.totalIss + novoVal)).toFixed(2))
                    }));
                    setModificado(true);
                  }}
                  style={{ width: '110px', padding: '4px 6px', fontSize: '0.8rem', fontWeight: 700, color: '#b45309' }}
                />
              </div>
            )}

            <button
              className="btn btn-outline"
              style={{ fontSize: '0.82rem', padding: '6px 12px', background: '#ffffff', borderColor: '#38bdf8', color: '#0369a1' }}
              onClick={handleAdicionarItem}
              type="button"
            >
              <Plus size={15} /> Adicionar Item
            </button>

            <button
              className="btn"
              style={{ fontSize: '0.82rem', padding: '6px 16px', background: '#0284c7', color: '#ffffff', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}
              onClick={handleRecalcular}
              disabled={recalculando}
              type="button"
            >
              <RefreshCw size={15} className={recalculando ? 'spin' : ''} />
              {recalculando ? 'Recalculando...' : 'Recalcular Retenções'}
            </button>

            {modificado && (
              <button
                className="btn btn-outline"
                style={{ fontSize: '0.82rem', padding: '6px 12px', background: '#ffffff', color: '#64748b' }}
                onClick={handleRestaurarOriginais}
                type="button"
                title="Descartar edições e restaurar valores originais do XML/PDF"
              >
                <RotateCcw size={15} /> Restaurar Originais
              </button>
            )}
          </div>
        </div>
      )}

      {/* Documento Visual Idêntico ao Modelo do SEI */}
      <div className="report-document">
        
        {/* Cabeçalho */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {currentData.tipoDocumento === 'NFE' ? 'Nota fiscal de compra — NF-e' : 'Nota fiscal de serviço — NFS-e'}
            </h2>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {currentData.itens.length} {currentData.itens.length === 1 ? 'item analisado' : 'itens analisados'} • Processo Digital SEI (Vitória/ES)
            </span>
          </div>

          <div className="report-badge">
            {currentData.tipoDocumento === 'NFE' ? 'NF-e: Compra / Mercadoria' : 'NFS-e: Prestação de Serviço'}
          </div>
        </div>

        {/* Informações da Nota, Processo SEI e Fornecedor */}
        <div className="report-header-box">
          <div style={{ display: 'grid', gridTemplateColumns: '130px 180px 140px 1fr', gap: '16px', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>NÚMERO DA NOTA</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>{currentData.numeroNota || '---'}</div>
            </div>

            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>PROCESSO SEI Nº</div>
              {modoEdicao ? (
                <input
                  type="text"
                  className="form-input"
                  value={currentData.numeroProcesso || ''}
                  onChange={(e) => {
                    const novoProcesso = e.target.value;
                    const atualizado = { ...currentData, numeroProcesso: novoProcesso };
                    setCurrentData(atualizado);
                    setModificado(true);
                    if (onUpdateData) onUpdateData(atualizado);
                  }}
                  placeholder="Ex: 23068.012345/2026-99"
                  style={{ fontSize: '0.8rem', padding: '3px 6px', fontFamily: 'var(--font-mono)', width: '100%', marginTop: '2px' }}
                />
              ) : (
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: currentData.numeroProcesso ? 'var(--text-primary)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {currentData.numeroProcesso || 'Não informado'}
                </div>
              )}
            </div>

            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>NOTA DE EMPENHO</div>
              {modoEdicao ? (
                <input
                  type="text"
                  className="form-input"
                  value={currentData.numeroEmpenho || ''}
                  onChange={(e) => {
                    const novoEmpenho = e.target.value.toUpperCase();
                    const atualizado = { ...currentData, numeroEmpenho: novoEmpenho };
                    setCurrentData(atualizado);
                    setModificado(true);
                    if (onUpdateData) onUpdateData(atualizado);
                  }}
                  placeholder="Ex: 2026NE000123"
                  style={{ fontSize: '0.8rem', padding: '3px 6px', fontFamily: 'var(--font-mono)', width: '100%', marginTop: '2px' }}
                />
              ) : (
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: currentData.numeroEmpenho ? 'var(--text-primary)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {currentData.numeroEmpenho || 'Não informada'}
                </div>
              )}
            </div>

            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>FORNECEDOR (EMITENTE)</div>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span>{currentData.fornecedorNome}</span>
                {currentData.fornecedorCnpj && <span style={{ color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.78rem' }}>({currentData.fornecedorCnpj})</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Quadro de Auditoria do Simples Nacional / Receita Federal */}
        <div style={{ 
          margin: '0 0 20px 0', 
          padding: '12px 16px', 
          borderRadius: 'var(--radius-md)', 
          border: currentData.optanteSimples ? '1px solid #fde68a' : '1px solid #bfdbfe',
          background: currentData.optanteSimples ? '#fffbeb' : '#eff6ff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ 
              width: '38px', 
              height: '38px', 
              borderRadius: '50%', 
              background: currentData.optanteSimples ? '#fef3c7' : '#dbeafe', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center' 
            }}>
              {currentData.optanteSimples ? <AlertCircle size={20} color="#d97706" /> : <Building2 size={20} color="#2563eb" />}
            </div>
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 800, color: currentData.optanteSimples ? '#92400e' : '#1e40af' }}>
                {currentData.optanteSimples ? 'EMPRESA OPTANTE PELO SIMPLES NACIONAL' : 'EMPRESA NÃO OPTANTE PELO SIMPLES NACIONAL'}
              </div>
              <div style={{ fontSize: '0.75rem', color: currentData.optanteSimples ? '#b45309' : '#1d4ed8' }}>
                {currentData.optanteSimples 
                  ? 'Aplicação do Art. 4º, Inciso XI da IN RFB nº 1.234/2012 (Dispensa de Retenção de Tributos Federais).' 
                  : 'Sujeito à Retenção Ampla de IR, CSLL, COFINS e PIS/PASEP conforme a IN RFB nº 1.234/2012.'}
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, display: 'block', color: 'var(--text-muted)' }}>SITUAÇÃO CADASTRAL</span>
            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: currentData.situacaoCadastral === 'ATIVA' ? '#16a34a' : '#dc2626' }}>
              {currentData.situacaoCadastral || 'ATIVA'}
            </span>
          </div>
        </div>

        {/* LISTA DE ITENS: MODO VISUALIZAÇÃO vs MODO EDIÇÃO */}
        {!modoEdicao ? (
          /* Modo Somente Leitura */
          currentData.itens.map((item, idx) => (
            <div key={idx} className="item-card">
              <div className="item-header">
                <div>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--primary)' }}>
                    {currentData.tipoDocumento === 'NFE' ? 'CRITÉRIO NCM & CST' : 'CÓDIGO SERVIÇO'}
                  </span>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>
                    {currentData.tipoDocumento === 'NFE' 
                      ? `NCM ${item.ncm || 'Geral'} ${item.cst ? `• CST: ${item.cst}` : ''}` 
                      : `Cód. ${item.codigoServico || '6190'}`}
                  </div>
                  {item.descricao && (
                    <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '2px' }}>
                      {item.descricao}
                    </div>
                  )}
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
          ))
        ) : (
          /* Modo Edição Inline Interativo */
          itensEditados.map((item, index) => (
            <div key={item.id} className="item-card" style={{ border: '2px solid #93c5fd', background: '#f8fafc', padding: '16px' }}>
              
              {/* Linha 1: Item nº, Descrição, NCM/Serviço, Valor Bruto, Excluir */}
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 140px 160px 40px', gap: '12px', alignItems: 'center' }}>
                <div>
                  <span className="badge badge-primary" style={{ width: '100%', textAlign: 'center', display: 'block', padding: '6px 4px' }}>
                    Item #{item.numeroItem}
                  </span>
                </div>

                <div>
                  <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                    DESCRIÇÃO DO ITEM / SERVIÇO
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={item.descricao}
                    onChange={(e) => handleAtualizarCampo(index, 'descricao', e.target.value)}
                    style={{ padding: '6px 10px', fontSize: '0.85rem' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                    {currentData.tipoDocumento === 'NFE' ? 'NCM (8 Dígitos)' : 'CÓD. SERVIÇO'}
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={currentData.tipoDocumento === 'NFE' ? item.ncm : (item.codigoServico || '')}
                    onChange={(e) => handleAtualizarCampo(index, currentData.tipoDocumento === 'NFE' ? 'ncm' : 'codigoServico', e.target.value)}
                    style={{ padding: '6px 10px', fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                    VALOR BRUTO (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="form-input"
                    value={item.valorBruto}
                    onChange={(e) => handleAtualizarCampo(index, 'valorBruto', parseFloat(e.target.value) || 0)}
                    style={{ padding: '6px 10px', fontSize: '0.85rem', fontWeight: 700, textAlign: 'right' }}
                  />
                </div>

                <div style={{ textAlign: 'center', paddingTop: '16px' }}>
                  <button
                    type="button"
                    onClick={() => handleRemoverItem(index)}
                    style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                    title="Remover este item"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>

              {/* Linha 2: Presets Rápidos e Alíquotas */}
              <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: '260px 1fr', gap: '12px', alignItems: 'center' }}>
                <div>
                  <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#0369a1', display: 'block', marginBottom: '4px' }}>
                    REGRA TRIBUTÁRIA / PRESET:
                  </label>
                  <select
                    className="form-select"
                    value={item.preset}
                    onChange={(e) => handleMudarPreset(index, e.target.value)}
                    style={{ fontSize: '0.85rem', padding: '6px 8px', borderColor: '#38bdf8', fontWeight: 600 }}
                  >
                    <option value="AUTO">🔍 Automático (Regras NCM/Serviço)</option>
                    <option value="6147">🏢 5,85% — Bens / Obras (DARF 6147)</option>
                    <option value="6190">💼 9,45% — Serviços em Geral (DARF 6190)</option>
                    <option value="6175">🚚 7,05% — Transporte (DARF 6175)</option>
                    <option value="8767">💊 2,20% — Medicamentos (DARF 8767)</option>
                    <option value="ISENTO">🟢 0,00% — Isenção / Alíquota Zero</option>
                    <option value="MANUAL">✏️ Personalizado (Alíquotas Livres)</option>
                  </select>
                </div>

                {/* Inputs de Alíquotas */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' }}>
                  <div>
                    <label style={{ fontSize: '0.65rem', fontWeight: 700, color: '#475569', display: 'block' }}>IR (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-input"
                      value={item.aliqIr}
                      disabled={item.preset !== 'MANUAL'}
                      onChange={(e) => handleAtualizarCampo(index, 'aliqIr', parseFloat(e.target.value) || 0)}
                      style={{ padding: '4px 6px', fontSize: '0.8rem', textAlign: 'right' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.65rem', fontWeight: 700, color: '#475569', display: 'block' }}>CSLL (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-input"
                      value={item.aliqCsll}
                      disabled={item.preset !== 'MANUAL'}
                      onChange={(e) => handleAtualizarCampo(index, 'aliqCsll', parseFloat(e.target.value) || 0)}
                      style={{ padding: '4px 6px', fontSize: '0.8rem', textAlign: 'right' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.65rem', fontWeight: 700, color: '#475569', display: 'block' }}>PIS (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-input"
                      value={item.aliqPis}
                      disabled={item.preset !== 'MANUAL'}
                      onChange={(e) => handleAtualizarCampo(index, 'aliqPis', parseFloat(e.target.value) || 0)}
                      style={{ padding: '4px 6px', fontSize: '0.8rem', textAlign: 'right' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.65rem', fontWeight: 700, color: '#475569', display: 'block' }}>COFINS (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-input"
                      value={item.aliqCofins}
                      disabled={item.preset !== 'MANUAL'}
                      onChange={(e) => handleAtualizarCampo(index, 'aliqCofins', parseFloat(e.target.value) || 0)}
                      style={{ padding: '4px 6px', fontSize: '0.8rem', textAlign: 'right' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.65rem', fontWeight: 700, color: '#475569', display: 'block' }}>INSS (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-input"
                      value={item.aliqInss}
                      disabled={item.preset !== 'MANUAL'}
                      onChange={(e) => handleAtualizarCampo(index, 'aliqInss', parseFloat(e.target.value) || 0)}
                      style={{ padding: '4px 6px', fontSize: '0.8rem', textAlign: 'right' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.65rem', fontWeight: 700, color: '#475569', display: 'block' }}>ISS (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-input"
                      value={item.aliqIss}
                      disabled={item.preset !== 'MANUAL'}
                      onChange={(e) => handleAtualizarCampo(index, 'aliqIss', parseFloat(e.target.value) || 0)}
                      style={{ padding: '4px 6px', fontSize: '0.8rem', textAlign: 'right' }}
                    />
                  </div>
                </div>
              </div>

              {/* Linha 3: Códigos de Retenção e Classificação Fiscal (DARF e EFD-REINF) sempre editáveis */}
              <div style={{ 
                marginTop: '12px', 
                padding: '10px 14px',
                borderRadius: '6px',
                background: '#ffffff',
                border: '1px solid #bae6fd',
                display: 'grid', 
                gridTemplateColumns: '1fr 1fr', 
                gap: '14px' 
              }}>
                <div>
                  <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#0369a1', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                    🏷️ CÓDIGO DA RECEITA DARF (RFB):
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      className="form-input"
                      value={item.codigoReceitaDarf}
                      onChange={(e) => {
                        handleAtualizarCampo(index, 'codigoReceitaDarf', e.target.value.toUpperCase());
                        if (item.preset !== 'MANUAL') handleAtualizarCampo(index, 'preset', 'MANUAL');
                      }}
                      placeholder="Ex: 6147, 6190, 8767, ISENTO"
                      style={{ padding: '6px 10px', fontSize: '0.85rem', fontFamily: 'var(--font-mono)', fontWeight: 700, width: '130px' }}
                    />
                    <select
                      className="form-select"
                      value={['6147', '6190', '6175', '8767', 'ISENTO'].includes(item.codigoReceitaDarf) ? item.codigoReceitaDarf : 'OUTRO'}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val !== 'OUTRO') {
                          handleAtualizarCampo(index, 'codigoReceitaDarf', val);
                          if (item.preset !== 'MANUAL') handleAtualizarCampo(index, 'preset', 'MANUAL');
                        }
                      }}
                      style={{ fontSize: '0.8rem', padding: '4px 6px', flex: 1, borderColor: '#cbd5e1' }}
                    >
                      <option value="6147">6147 — Mercadorias / Bens / Obras (5,85%)</option>
                      <option value="6190">6190 — Prestação de Serviços em Geral (9,45%)</option>
                      <option value="6175">6175 — Transporte de Passageiros / Cargas (7,05%)</option>
                      <option value="8767">8767 — Medicamentos / Monofásicos PIS/COFINS (2,20%)</option>
                      <option value="ISENTO">ISENTO — Dispensa / Imune de Retenção Federal (0%)</option>
                      <option value="OUTRO">Outro Código (digitar ao lado)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#0369a1', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                    📌 NATUREZA DE RENDIMENTO (EFD-REINF R-4020):
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      className="form-input"
                      value={item.naturezaRendimentoReinf}
                      onChange={(e) => {
                        handleAtualizarCampo(index, 'naturezaRendimentoReinf', e.target.value.toUpperCase());
                        if (item.preset !== 'MANUAL') handleAtualizarCampo(index, 'preset', 'MANUAL');
                      }}
                      placeholder="Ex: 17009, 17022, 17099, 17033"
                      style={{ padding: '6px 10px', fontSize: '0.85rem', fontFamily: 'var(--font-mono)', fontWeight: 700, width: '130px' }}
                    />
                    <select
                      className="form-select"
                      value={['17009', '17022', '17099', '17033', '17023', '17002', 'ISENTO'].includes(item.naturezaRendimentoReinf) ? item.naturezaRendimentoReinf : 'OUTRO'}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val !== 'OUTRO') {
                          handleAtualizarCampo(index, 'naturezaRendimentoReinf', val);
                          if (item.preset !== 'MANUAL') handleAtualizarCampo(index, 'preset', 'MANUAL');
                        }
                      }}
                      style={{ fontSize: '0.8rem', padding: '4px 6px', flex: 1, borderColor: '#cbd5e1' }}
                    >
                      <option value="17009">17009 — Bens / Mercadorias para Consumo ou Revenda</option>
                      <option value="17022">17022 — Medicamentos / Produtos com Alíquota Zero PIS/COFINS</option>
                      <option value="17099">17099 — Demais Serviços sujeitos à retenção de tributos</option>
                      <option value="17033">17033 — Locação / Cessão de mão de obra (dedicação exclusiva)</option>
                      <option value="17023">17023 — Serviços de transporte de passageiros</option>
                      <option value="17002">17002 — Energia Elétrica</option>
                      <option value="ISENTO">ISENTO — Rendimento não sujeito a retenção</option>
                      <option value="OUTRO">Outra Natureza (digitar ao lado)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}

        {/* Consolidado do Lote / Memória de Cálculo */}
        <div style={{ marginTop: '24px' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📊</span> Consolidado do Lote / Memória de Cálculo
          </h3>

          {/* Quadro de Deduções da Base de Cálculo (Materiais / Obras) */}
          {(Boolean(currentData.totalMateriaisInssDeducao && currentData.totalMateriaisInssDeducao > 0) || Boolean(currentData.percentualReducaoIssAplicado && currentData.percentualReducaoIssAplicado > 0)) && (
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
                <div><strong>Valor Bruto da Nota:</strong> {formatBRL(currentData.totalBruto)}</div>
                {Boolean(currentData.totalMateriaisInssDeducao && currentData.totalMateriaisInssDeducao > 0) && (
                  <div>
                    <strong>(-) Abatimento de Materiais e Equipamentos (IN RFB nº 2.110/2022):</strong> {formatBRL(currentData.totalMateriaisInssDeducao || 0)}
                    <span style={{ marginLeft: '8px', fontWeight: 700, color: '#b45309' }}>
                      ➔ Base de Cálculo do INSS (11%): {formatBRL(currentData.baseCalculoInssTotal || 0)}
                    </span>
                  </div>
                )}
                {Boolean(currentData.percentualReducaoIssAplicado && currentData.percentualReducaoIssAplicado > 0) && (
                  <div>
                    <strong>(-) Redução da Base do ISSQN ({currentData.percentualReducaoIssAplicado}% - Lei Municipal nº 6.075/2003):</strong> {formatBRL(currentData.totalBruto - (currentData.baseCalculoIssTotal || 0))}
                    <span style={{ marginLeft: '8px', fontWeight: 700, color: '#b45309' }}>
                      ➔ Base de Cálculo do ISSQN (5%): {formatBRL(currentData.baseCalculoIssTotal || 0)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="consolidado-box">
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
              {Boolean(currentData.totalContaVinculada && currentData.totalContaVinculada > 0)
                ? 'TOTAL RETIDO E DESCONTADO DO PAGAMENTO (TRIBUTOS FEDERAIS + INSS + ISS + CONTA VINCULADA)'
                : 'TOTAL A RETER, INCLUINDO INSS E ISS'}
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#1e40af', marginTop: '2px' }}>
              {formatBRL(currentData.totalRetidoGeral)}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              sobre o valor bruto de {formatBRL(currentData.totalBruto)}
              {Boolean(currentData.totalContaVinculada && currentData.totalContaVinculada > 0) && (
                <span style={{ marginLeft: '8px', color: '#b45309', fontWeight: 600 }}>
                  (sendo {formatBRL(currentData.totalRetidoGeral - currentData.totalContaVinculada!)} retenções fiscais + {formatBRL(currentData.totalContaVinculada!)} depósito em conta vinculada)
                </span>
              )}
            </div>
          </div>

          {/* Tabela de Tributos Detalhados */}
          <table className="tax-table">
            <thead>
              <tr>
                <th>TRIBUTO / RETENÇÃO / DESCONTO</th>
                <th>ALÍQUOTA MÉDIA</th>
                <th>LEGISLAÇÃO APLICÁVEL</th>
                <th style={{ textAlign: 'right' }}>VALOR RETIDO / DESCONTADO</th>
              </tr>
            </thead>
            <tbody>
              {/* Linha Consolidada Agrupada para Lançamento e Conferência com o SIAFI */}
              {(() => {
                const aliqFederalAcumulada = currentData.totalBruto > 0 
                  ? ((currentData.totalFederal / currentData.totalBruto) * 100).toFixed(2) 
                  : '0,00';
                return (
                  <tr style={{ background: '#f0fdf4', borderBottom: '2px solid #86efac' }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ 
                          background: '#166534', 
                          color: '#ffffff', 
                          fontSize: '0.68rem', 
                          fontWeight: 800, 
                          padding: '2px 6px', 
                          borderRadius: '4px',
                          letterSpacing: '0.5px' 
                        }}>
                          SIAFI
                        </span>
                        <div>
                          <strong style={{ color: '#166534', fontSize: '0.9rem' }}>
                            TRIBUTOS FEDERAIS AGREGADOS (IR + CSLL + COFINS + PIS)
                          </strong>
                          <div style={{ fontSize: '0.72rem', color: '#15803d', marginTop: '1px' }}>
                            Alíquota conjunta para conferência e apropriação direta no SIAFI
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ color: '#166534', fontWeight: 800, fontSize: '0.92rem' }}>
                      {aliqFederalAcumulada}%
                    </td>
                    <td style={{ color: '#166534', fontSize: '0.8rem', fontWeight: 600 }}>
                      IN RFB nº 1.234/2012
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: '#166534', fontSize: '1rem' }}>
                      {formatBRL(currentData.totalFederal)}
                    </td>
                  </tr>
                );
              })()}

              <tr style={{ background: '#fafafa' }}>
                <td style={{ paddingLeft: '28px' }}>
                  <span style={{ color: '#64748b', marginRight: '6px' }}>↳</span>
                  <strong>IR</strong> — Imposto de Renda
                </td>
                <td>{currentData.totalBruto > 0 ? `${((currentData.totalIr / currentData.totalBruto) * 100).toFixed(2)}%` : '0,00%'}</td>
                <td style={{ fontSize: '0.78rem', color: '#64748b' }}>IN RFB nº 1.234/2012</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatBRL(currentData.totalIr)}</td>
              </tr>
              <tr style={{ background: '#fafafa' }}>
                <td style={{ paddingLeft: '28px' }}>
                  <span style={{ color: '#64748b', marginRight: '6px' }}>↳</span>
                  <strong>CSLL</strong> — Contribuição Social s/ Lucro
                </td>
                <td>{currentData.totalBruto > 0 ? `${((currentData.totalCsll / currentData.totalBruto) * 100).toFixed(2)}%` : '0,00%'}</td>
                <td style={{ fontSize: '0.78rem', color: '#64748b' }}>IN RFB nº 1.234/2012</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatBRL(currentData.totalCsll)}</td>
              </tr>
              <tr style={{ background: '#fafafa' }}>
                <td style={{ paddingLeft: '28px' }}>
                  <span style={{ color: '#64748b', marginRight: '6px' }}>↳</span>
                  <strong>COFINS</strong> — Seguridade Social
                </td>
                <td>{currentData.totalBruto > 0 ? `${((currentData.totalCofins / currentData.totalBruto) * 100).toFixed(2)}%` : '0,00%'}</td>
                <td style={{ fontSize: '0.78rem', color: '#64748b' }}>IN RFB nº 1.234/2012</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatBRL(currentData.totalCofins)}</td>
              </tr>
              <tr style={{ background: '#fafafa' }}>
                <td style={{ paddingLeft: '28px' }}>
                  <span style={{ color: '#64748b', marginRight: '6px' }}>↳</span>
                  <strong>PIS/PASEP</strong> — Integração Social
                </td>
                <td>{currentData.totalBruto > 0 ? `${((currentData.totalPis / currentData.totalBruto) * 100).toFixed(2)}%` : '0,00%'}</td>
                <td style={{ fontSize: '0.78rem', color: '#64748b' }}>IN RFB nº 1.234/2012</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatBRL(currentData.totalPis)}</td>
              </tr>
              <tr style={{ background: currentData.auditoriaInss?.correspondeAliquotaOficial ? '#f8fafc' : (currentData.auditoriaInss?.tipoApuracao === 'DIVERGENCIA_BASE_OU_ALIQUOTA' ? '#fffbeb' : undefined) }}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <strong>INSS</strong> — Retenção Previdenciária
                    {currentData.auditoriaInss?.correspondeAliquotaOficial && (
                      <span style={{ background: '#dcfce7', color: '#15803d', fontSize: '0.68rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px' }}>
                        ✓ 11% CONFERE
                      </span>
                    )}
                    {currentData.auditoriaInss && !currentData.auditoriaInss.correspondeAliquotaOficial && (
                      <span style={{ background: '#fef3c7', color: '#b45309', fontSize: '0.68rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px' }}>
                        ⚠️ ALÍQUOTA EFETIVA {currentData.auditoriaInss.aliquotaEfetivaSobreTotal}%
                      </span>
                    )}
                  </div>
                  {Boolean(currentData.totalMateriaisInssDeducao && currentData.totalMateriaisInssDeducao > 0) && (
                    <div style={{ fontSize: '0.7rem', color: '#475569', marginTop: '2px' }}>
                      (BC Mão de Obra: {formatBRL(currentData.baseCalculoInssTotal || 0)} - Abatimento de Materiais: {formatBRL(currentData.totalMateriaisInssDeducao || 0)})
                    </div>
                  )}
                  {currentData.auditoriaInss?.mensagemAlerta && (
                    <div style={{ 
                      marginTop: '4px', 
                      fontSize: '0.73rem', 
                      lineHeight: 1.35, 
                      color: currentData.auditoriaInss.correspondeAliquotaOficial ? '#166534' : '#92400e',
                      fontWeight: 500
                    }}>
                      {currentData.auditoriaInss.mensagemAlerta}
                    </div>
                  )}
                </td>
                <td>{currentData.totalBruto > 0 ? `${((currentData.totalInss / currentData.totalBruto) * 100).toFixed(2)}%` : '0,00%'}</td>
                <td>IN RFB nº 2.110/2022 / CPRB</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatBRL(currentData.totalInss)}</td>
              </tr>
              <tr>
                <td><strong>ISSQN</strong> — Imposto Municipal (Vitória/ES)</td>
                <td>{currentData.totalBruto > 0 ? `${((currentData.totalIss / currentData.totalBruto) * 100).toFixed(2)}%` : '0,00%'}</td>
                <td>Lei Municipal nº 6.075/2003 c/c LC 116</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatBRL(currentData.totalIss)}</td>
              </tr>
              {Boolean(currentData.totalContaVinculada && currentData.totalContaVinculada > 0) && (
                <tr style={{ background: '#fffbeb', borderLeft: '4px solid #f59e0b' }}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ background: '#b45309', color: '#ffffff', fontSize: '0.68rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px' }}>
                        CONTA VINCULADA
                      </span>
                      <strong>Retenção / Desconto para Conta-Depósito Vinculada</strong>
                    </div>
                    <div style={{ fontSize: '0.73rem', color: '#92400e', marginTop: '2px' }}>
                      Provisões de encargos trabalhistas (férias, 13º salário e rescisão) retidas do pagamento e depositadas em conta vinculada do contrato
                    </div>
                  </td>
                  <td>{currentData.totalBruto > 0 ? `${((currentData.totalContaVinculada! / currentData.totalBruto) * 100).toFixed(2)}%` : '---'}</td>
                  <td style={{ fontSize: '0.8rem', color: '#78350f', fontWeight: 600 }}>
                    IN SEGES/ME nº 5/2017
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: '#b45309', fontSize: '0.95rem' }}>
                    {formatBRL(currentData.totalContaVinculada!)}
                  </td>
                </tr>
              )}
              <tr className="liquid-row">
                <td colSpan={3}>VALOR LÍQUIDO A PAGAR AO FORNECEDOR</td>
                <td style={{ textAlign: 'right' }}>{formatBRL(currentData.valorLiquido)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Rodapé de Auditoria Documental e SEI */}
        <div style={{ marginTop: '20px', padding: '12px 16px', background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', display: 'flex', gap: '10px', alignItems: 'center' }}>
          <ShieldCheck size={20} color="var(--primary)" />
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <strong>Auditoria Documental SEI:</strong> Retenções calculadas em estrita observância à IN RFB nº 1.234/2012 (com as regras de NCM do art. 4º), IN RFB nº 2.110/2022 e Código Tributário de Vitória/ES (Lei nº 6.075/2003). Consulta do Simples Nacional via {currentData.fonteConsultaCnpj || 'Receita Federal'}.
          </div>
        </div>

      </div>
    </div>
  );
};
