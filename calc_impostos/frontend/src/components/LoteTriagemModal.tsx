import React, { useState, useMemo } from 'react';
import { 
  Layers, 
  X, 
  ArrowLeft, 
  ArrowRight, 
  CheckCircle2, 
  Printer, 
  Database, 
  Building2, 
  Sliders, 
  FolderPlus,
  CheckSquare,
  Square,
  Download
} from 'lucide-react';
import { type ResultadoConsolidado, ReportPreview, gerarNomeArquivoPdf } from './ReportPreview';
import { ModalPromptProcesso } from './ModalPromptProcesso';
import { API_BASE_URL } from '../config/api';

export interface LoteTriagemModalProps {
  notasIniciais: ResultadoConsolidado[];
  onClose: () => void;
  onSalvarNota?: (nota: ResultadoConsolidado) => Promise<boolean>;
}

export const LoteTriagemModal: React.FC<LoteTriagemModalProps> = ({
  notasIniciais,
  onClose
}) => {
  // Lista mutável de notas em memória no lote
  const [notas, setNotas] = useState<ResultadoConsolidado[]>(notasIniciais);
  // Visão atual: 'triagem' (agrupado por fornecedor) ou 'conferencia' (nota a nota)
  const [visao, setVisao] = useState<'triagem' | 'conferencia'>('triagem');
  // Índice da nota ativa na conferência
  const [indiceNotaAtiva, setIndiceNotaAtiva] = useState<number>(0);

  // Seleção de notas por fornecedor para aglutinação (CNPJ -> Set de índices no array de notas)
  const [selecionadasPorCnpj, setSelecionadasPorCnpj] = useState<Record<string, number[]>>({});

  // Controle do Prompt Modal de Processo SEI
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptTitulo, setPromptTitulo] = useState('Informe o Número do Processo');
  const [promptSubtitulo, setPromptSubtitulo] = useState('Obrigatório para emissão do relatório oficial');
  const [promptValorProcesso, setPromptValorProcesso] = useState('');
  const [promptValorDocumentoHabil, setPromptValorDocumentoHabil] = useState('');
  const [promptValorEmpenho, setPromptValorEmpenho] = useState('');
  const [promptOnConfirmCallback, setPromptOnConfirmCallback] = useState<((proc: string, emp: string, docHab?: string) => void) | null>(null);

  // Estados de loading / salvamento
  const [salvandoNota, setSalvandoNota] = useState(false);
  const [salvandoLote, setSalvandoLote] = useState(false);
  const [baixandoPdf, setBaixandoPdf] = useState(false);
  const [msgSucesso, setMsgSucesso] = useState<string | null>(null);

  const formatBRL = (val: number) => {
    return (Number(val) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const formatarCnpj = (cnpjRaw: string) => {
    const limpo = (cnpjRaw || '').replace(/\D/g, '');
    if (limpo.length !== 14) return cnpjRaw || 'S/ CNPJ';
    return `${limpo.slice(0, 2)}.${limpo.slice(2, 5)}.${limpo.slice(5, 8)}/${limpo.slice(8, 12)}-${limpo.slice(12)}`;
  };

  // Agrupamento computado por Fornecedor
  const fornecedores = useMemo(() => {
    const mapa = new Map<string, {
      cnpjLimpo: string;
      cnpjFormatado: string;
      nome: string;
      optanteSimples: boolean;
      cidadeUf?: string;
      indices: number[];
      totalBruto: number;
      totalRetido: number;
      totalLiquido: number;
    }>();

    notas.forEach((n, idx) => {
      const cnpjL = (n.fornecedorCnpj || 'SEM_CNPJ').replace(/\D/g, '');
      if (!mapa.has(cnpjL)) {
        mapa.set(cnpjL, {
          cnpjLimpo: cnpjL,
          cnpjFormatado: formatarCnpj(n.fornecedorCnpj),
          nome: n.fornecedorNome || 'Fornecedor Não Informado',
          optanteSimples: Boolean(n.optanteSimples),
          cidadeUf: n.fornecedorMunicipio ? `${n.fornecedorMunicipio}${n.fornecedorUf ? `/${n.fornecedorUf}` : ''}` : undefined,
          indices: [],
          totalBruto: 0,
          totalRetido: 0,
          totalLiquido: 0
        });
      }
      const item = mapa.get(cnpjL)!;
      item.indices.push(idx);
      item.totalBruto += Number(n.totalBruto) || 0;
      item.totalRetido += Number(n.totalRetidoGeral) || 0;
      item.totalLiquido += Number(n.valorLiquido) || 0;
    });

    return Array.from(mapa.values());
  }, [notas]);

  // Atualiza uma nota após recálculo no ReportPreview
  const handleAtualizarNota = (indice: number, novaNota: ResultadoConsolidado) => {
    setNotas(prev => {
      const clone = [...prev];
      clone[indice] = novaNota;
      return clone;
    });
  };

  // Toggle seleção de uma nota dentro de um fornecedor
  const handleToggleSelecaoNota = (cnpjLimpo: string, indiceNota: number) => {
    setSelecionadasPorCnpj(prev => {
      const atuais = prev[cnpjLimpo] || [];
      const existe = atuais.includes(indiceNota);
      const novos = existe ? atuais.filter(i => i !== indiceNota) : [...atuais, indiceNota];
      return { ...prev, [cnpjLimpo]: novos };
    });
  };

  // Marcar ou Desmarcar todas as notas de um fornecedor
  const handleToggleTodasDoFornecedor = (cnpjLimpo: string, indices: number[]) => {
    setSelecionadasPorCnpj(prev => {
      const atuais = prev[cnpjLimpo] || [];
      const todasMarcadas = indices.every(i => atuais.includes(i));
      return { ...prev, [cnpjLimpo]: todasMarcadas ? [] : [...indices] };
    });
  };

  // Abrir conferência em uma nota específica
  const handleIniciarConferenciaNota = (indice: number) => {
    setIndiceNotaAtiva(indice);
    setVisao('conferencia');
  };

  // Aglutinar notas selecionadas sob um mesmo processo
  const handleAglutinarSelecionadas = (cnpjLimpo: string) => {
    const indices = selecionadasPorCnpj[cnpjLimpo] || [];
    if (indices.length === 0) {
      alert('Por favor, selecione ao menos uma nota fiscal para vincular ao processo.');
      return;
    }

    // Pega o processo da primeira nota como padrão, se existir
    const procAtual = notas[indices[0]]?.numeroProcesso || '';
    const empAtual = notas[indices[0]]?.numeroEmpenho || '';

    setPromptTitulo(`Vincular Processo às ${indices.length} Notas Selecionadas`);
    setPromptSubtitulo('As notas selecionadas deste fornecedor serão unificadas sob o mesmo Processo e Empenho');
    setPromptValorProcesso(procAtual);
    setPromptValorEmpenho(empAtual);
    setPromptOnConfirmCallback(() => (proc: string, emp: string) => {
      setNotas(prev => {
        const clone = [...prev];
        indices.forEach(idx => {
          clone[idx] = {
            ...clone[idx],
            numeroProcesso: proc || undefined,
            numeroEmpenho: emp || undefined
          };
        });
        return clone;
      });
      setPromptOpen(false);
      setMsgSucesso(`✓ Processo "${proc}" vinculado com sucesso às ${indices.length} notas fiscais selecionadas!`);
      setTimeout(() => setMsgSucesso(null), 5000);
    });
    setPromptOpen(true);
  };

  // Baixar relatório individual da nota ativa
  const handleDownloadPdfNotaIndividual = async (notaAlvo: ResultadoConsolidado, indiceAlvo: number) => {
    const executarDownload = async (procDefinido: string, empDefinido?: string) => {
      try {
        setBaixandoPdf(true);
        const notaComProcesso = {
          ...notaAlvo,
          numeroProcesso: procDefinido.trim() || undefined,
          numeroEmpenho: empDefinido?.trim() || notaAlvo.numeroEmpenho
        };

        // Atualiza a nota no estado do lote
        handleAtualizarNota(indiceAlvo, notaComProcesso);

        const res = await fetch(`${API_BASE_URL}/api/gerar-pdf`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(notaComProcesso)
        });

        if (!res.ok) {
          throw new Error('Falha ao gerar o relatório individual em PDF.');
        }

        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = gerarNomeArquivoPdf(
          notaComProcesso.numeroNota, 
          notaComProcesso.fornecedorNome, 
          notaComProcesso.numeroProcesso || procDefinido
        );
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        // Gravação automática no banco de dados ao baixar o PDF individual
        try {
          await fetch(`${API_BASE_URL}/api/notas/salvar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(notaComProcesso)
          });
          setMsgSucesso(`✓ NF ${notaComProcesso.numeroNota || ''} baixada e salva automaticamente no banco de dados!`);
          setTimeout(() => setMsgSucesso(null), 5000);
        } catch (saveErr) {
          console.warn('Gravação automática após download falhou:', saveErr);
        }
      } catch (err: any) {
        alert('Erro ao baixar PDF: ' + err.message);
      } finally {
        setBaixandoPdf(false);
      }
    };

    if (!notaAlvo.numeroProcesso || !notaAlvo.numeroProcesso.trim()) {
      setPromptTitulo(`Número do Processo da NF ${notaAlvo.numeroNota || ''}`);
      setPromptSubtitulo('Informe o Número do Processo SEI para constar no relatório oficial');
      setPromptValorProcesso('');
      setPromptValorEmpenho(notaAlvo.numeroEmpenho || '');
      setPromptOnConfirmCallback(() => (proc: string, emp: string) => {
        if (!proc.trim()) {
          alert('O Número do Processo SEI é obrigatório para gerar o relatório.');
          return;
        }
        setPromptOpen(false);
        executarDownload(proc, emp);
      });
      setPromptOpen(true);
    } else {
      executarDownload(notaAlvo.numeroProcesso, notaAlvo.numeroEmpenho);
    }
  };

  // Baixar relatório consolidado de um grupo de notas (do mesmo fornecedor / processo)
  const handleDownloadPdfConsolidadoGrupo = async (indicesGrupo: number[]) => {
    const notasGrupo = indicesGrupo.map(i => notas[i]);
    if (notasGrupo.length === 0) return;

    const primeira = notasGrupo[0];
    const procAtual = primeira.numeroProcesso || '';
    const docHabilAtual = primeira.documentoHabil || '';
    const empAtual = primeira.numeroEmpenho || '';

    const executarDownloadConsolidado = async (proc: string, emp?: string, docHab?: string) => {
      try {
        setBaixandoPdf(true);
        // Atualiza o processo e documento habil nas notas do grupo
        const notasAtualizadas = notasGrupo.map(n => ({
          ...n,
          numeroProcesso: proc.trim() || undefined,
          documentoHabil: docHab?.trim() || n.documentoHabil,
          numeroEmpenho: emp?.trim() || n.numeroEmpenho
        }));

        // Consolida os totais do grupo
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
        const codigosDarfMap: Record<string, { codigo: string; valor: number }> = {};

        notasAtualizadas.forEach(n => {
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

          if (Array.isArray(n.codigosReceitaDarf)) {
            n.codigosReceitaDarf.forEach(cd => {
              const cod = cd.codigo || 'OUTROS';
              if (!codigosDarfMap[cod]) codigosDarfMap[cod] = { codigo: cod, valor: 0 };
              codigosDarfMap[cod].valor += Number(cd.valor) || 0;
            });
          }
        });

        const payload = {
          numeroProcesso: proc.trim() || undefined,
          documentoHabil: docHab?.trim() || undefined,
          notaEmpenho: emp?.trim() || undefined,
          temMultiplosFornecedores: false,
          fornecedorPrincipal: {
            nome: primeira.fornecedorNome,
            cnpj: primeira.fornecedorCnpj,
            optanteSimples: primeira.optanteSimples
          },
          notas: notasAtualizadas,
          resumo: {
            totalNotas: notasAtualizadas.length,
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
            codigosDarfAgrupados: Object.values(codigosDarfMap)
          }
        };

        const res = await fetch(`${API_BASE_URL}/api/processo/gerar-pdf-consolidado`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          throw new Error('Falha ao gerar PDF consolidado do lote.');
        }

        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const nomeArq = (proc || 'Consolidado').replace(/[^a-zA-Z0-9_-]/g, '_');
        a.download = `Relatorio_Consolidado_Processo_${nomeArq}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        // Gravação automática de todas as notas do grupo consolidado no banco de dados
        try {
          for (const n of notasAtualizadas) {
            await fetch(`${API_BASE_URL}/api/notas/salvar`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(n)
            });
          }
          setMsgSucesso(`✓ Relatório consolidado baixado e as ${notasAtualizadas.length} notas salvas no banco de dados!`);
          setTimeout(() => setMsgSucesso(null), 5000);
        } catch (saveErr) {
          console.warn('Gravação automática do grupo consolidado falhou:', saveErr);
        }
      } catch (err: any) {
        alert('Erro ao gerar relatório consolidado: ' + err.message);
      } finally {
        setBaixandoPdf(false);
      }
    };

    if (!procAtual || !procAtual.trim()) {
      setPromptTitulo(`Processo Consolidado (${notasGrupo.length} Notas Fiscais)`);
      setPromptSubtitulo('Informe o Número do Processo SEI para gerar o Relatório Consolidado Unificado');
      setPromptValorProcesso('');
      setPromptValorDocumentoHabil(docHabilAtual);
      setPromptValorEmpenho(empAtual);
      setPromptOnConfirmCallback(() => (proc: string, emp: string, docHab?: string) => {
        if (!proc.trim()) {
          alert('O Número do Processo SEI é obrigatório para gerar o relatório consolidado.');
          return;
        }
        setPromptOpen(false);
        executarDownloadConsolidado(proc, emp, docHab);
      });
      setPromptOpen(true);
    } else {
      executarDownloadConsolidado(procAtual, empAtual, docHabilAtual);
    }
  };

  // Salvar nota individual no PostgreSQL
  const handleSalvarNotaIndividual = async (nota: ResultadoConsolidado) => {
    try {
      setSalvandoNota(true);
      const res = await fetch(`${API_BASE_URL}/api/notas/salvar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nota)
      });
      if (!res.ok) throw new Error('Erro ao salvar no banco');
      setMsgSucesso(`✓ Nota Fiscal ${nota.numeroNota || ''} gravada com sucesso no histórico PostgreSQL!`);
      setTimeout(() => setMsgSucesso(null), 5000);
    } catch (e: any) {
      alert('Erro ao salvar no banco: ' + e.message);
    } finally {
      setSalvandoNota(false);
    }
  };

  // Salvar todas as notas no banco
  const handleSalvarTodasLote = async () => {
    if (!confirm(`Deseja salvar todas as ${notas.length} notas do lote no banco de dados PostgreSQL?`)) return;
    try {
      setSalvandoLote(true);
      let salvas = 0;
      for (const nota of notas) {
        const res = await fetch(`${API_BASE_URL}/api/notas/salvar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(nota)
        });
        if (res.ok) salvas++;
      }
      setMsgSucesso(`✅ ${salvas} de ${notas.length} notas foram gravadas com sucesso no histórico PostgreSQL!`);
      setTimeout(() => setMsgSucesso(null), 6000);
    } catch (e: any) {
      alert('Erro ao salvar lote no banco: ' + e.message);
    } finally {
      setSalvandoLote(false);
    }
  };

  // Nota ativa para a visualização da conferência
  const notaAtiva = notas[indiceNotaAtiva] || notas[0];
  const totalNotas = notas.length;

  // Encontra quais outras notas pertencem ao mesmo fornecedor da nota ativa
  const notasMesmoFornecedor = useMemo(() => {
    if (!notaAtiva) return [];
    const cnpjAtivo = (notaAtiva.fornecedorCnpj || '').replace(/\D/g, '');
    return notas
      .map((n, i) => ({ n, i }))
      .filter(item => (item.n.fornecedorCnpj || '').replace(/\D/g, '') === cnpjAtivo);
  }, [notaAtiva, notas]);

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.85)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9998,
      padding: '16px'
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '14px',
        width: '100%',
        maxWidth: '1240px',
        height: '94vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
        overflow: 'hidden',
        border: '1px solid #cbd5e1'
      }}>
        {/* TOPO / HEADER PRINCIPAL */}
        <div style={{
          padding: '14px 22px',
          background: '#0f172a',
          color: '#ffffff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid #334155'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              background: 'linear-gradient(135deg, #2563eb, #3b82f6)',
              borderRadius: '10px',
              padding: '9px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 10px rgba(37, 99, 235, 0.3)'
            }}>
              <Layers size={22} color="#ffffff" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>
                  Central de Lote — Análise & Retenções Fiscais
                </h2>
                <span style={{
                  background: '#1e293b',
                  color: '#93c5fd',
                  padding: '3px 8px',
                  borderRadius: '12px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  border: '1px solid #3b82f6'
                }}>
                  {totalNotas} {totalNotas === 1 ? 'Nota' : 'Notas'} • {fornecedores.length} {fornecedores.length === 1 ? 'Fornecedor' : 'Fornecedores'}
                </span>
              </div>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '3px 0 0 0' }}>
                {visao === 'triagem' 
                  ? 'Triagem por fornecedor: selecione as notas do mesmo processo para aglutinar ou confira individualmente' 
                  : `Conferência Individual: Nota Fiscal ${notaAtiva?.numeroNota || ''} • ${notaAtiva?.fornecedorNome || ''}`}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {visao === 'conferencia' && (
              <button
                onClick={() => setVisao('triagem')}
                style={{
                  background: '#1e293b',
                  color: '#e2e8f0',
                  border: '1px solid #475569',
                  borderRadius: '8px',
                  padding: '7px 14px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <ArrowLeft size={16} />
                Voltar à Triagem
              </button>
            )}

            {visao === 'triagem' && (
              <button
                onClick={() => {
                  setIndiceNotaAtiva(0);
                  setVisao('conferencia');
                }}
                style={{
                  background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 6px rgba(37, 99, 235, 0.3)'
                }}
              >
                <Sliders size={16} />
                Iniciar Conferência Paginada
              </button>
            )}

            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '6px'
              }}
              title="Fechar Central de Lote"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* FEEDBACK DE MENSAGEM */}
        {msgSucesso && (
          <div style={{
            background: '#ecfdf5',
            color: '#065f46',
            borderBottom: '1px solid #a7f3d0',
            padding: '10px 22px',
            fontSize: '0.875rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            <CheckCircle2 size={18} color="#059669" />
            {msgSucesso}
          </div>
        )}

        {/* CORPO PRINCIPAL COM CONTEÚDO (TRIAGEM OU CONFERÊNCIA) */}
        <div style={{ flex: 1, overflowY: 'auto', background: '#f8fafc' }}>
          
          {/* ========================================================= */}
          {/* VISÃO 1: CENTRAL DE TRIAGEM POR FORNECEDOR */}
          {/* ========================================================= */}
          {visao === 'triagem' && (
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '22px' }}>
              
              {/* Barra de Resumo Global do Lote */}
              <div style={{
                background: '#ffffff',
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                padding: '16px 20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
              }}>
                <div style={{ display: 'flex', gap: '28px', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Total de Arquivos</span>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>{totalNotas} Notas Fiscais</div>
                  </div>
                  <div style={{ height: '36px', width: '1px', background: '#e2e8f0' }} />
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Fornecedores Distintos</span>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#2563eb' }}>{fornecedores.length} Credores</div>
                  </div>
                  <div style={{ height: '36px', width: '1px', background: '#e2e8f0' }} />
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Valor Bruto Total</span>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
                      {formatBRL(notas.reduce((acc, n) => acc + (Number(n.totalBruto) || 0), 0))}
                    </div>
                  </div>
                  <div style={{ height: '36px', width: '1px', background: '#e2e8f0' }} />
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Total Retido Estimado</span>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#dc2626' }}>
                      {formatBRL(notas.reduce((acc, n) => acc + (Number(n.totalRetidoGeral) || 0), 0))}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={handleSalvarTodasLote}
                    disabled={salvandoLote}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      color: '#0f172a',
                      borderRadius: '8px',
                      padding: '8px 14px',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <Database size={16} color="#059669" />
                    {salvandoLote ? 'Gravando...' : 'Gravar Todas no Banco'}
                  </button>
                </div>
              </div>

              {/* Lista de Fornecedores e suas notas */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {fornecedores.map((forn) => {
                  const selecionadas = selecionadasPorCnpj[forn.cnpjLimpo] || [];
                  const temSelecionadas = selecionadas.length > 0;
                  const todasMarcadas = forn.indices.length > 0 && forn.indices.every(i => selecionadas.includes(i));

                  return (
                    <div 
                      key={forn.cnpjLimpo}
                      style={{
                        background: '#ffffff',
                        borderRadius: '12px',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                        overflow: 'hidden'
                      }}
                    >
                      {/* Header do Card do Fornecedor */}
                      <div style={{
                        padding: '14px 20px',
                        background: '#f1f5f9',
                        borderBottom: '1px solid #e2e8f0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <button
                            onClick={() => handleToggleTodasDoFornecedor(forn.cnpjLimpo, forn.indices)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '2px',
                              display: 'flex',
                              alignItems: 'center',
                              color: todasMarcadas ? '#2563eb' : '#64748b'
                            }}
                            title={todasMarcadas ? 'Desmarcar todas deste fornecedor' : 'Selecionar todas deste fornecedor'}
                          >
                            {todasMarcadas ? <CheckSquare size={20} /> : <Square size={20} />}
                          </button>

                          <div style={{
                            background: '#e0e7ff',
                            color: '#3730a3',
                            borderRadius: '8px',
                            padding: '6px 8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <Building2 size={18} />
                          </div>

                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
                                {forn.nome}
                              </h4>
                              <span style={{ fontSize: '0.85rem', color: '#475569', fontWeight: 600 }}>
                                CNPJ: {forn.cnpjFormatado}
                              </span>
                              {forn.optanteSimples ? (
                                <span style={{
                                  background: '#fef3c7',
                                  color: '#92400e',
                                  fontSize: '0.7rem',
                                  fontWeight: 700,
                                  padding: '2px 6px',
                                  borderRadius: '6px',
                                  border: '1px solid #fde68a'
                                }}>
                                  SIMPLES NACIONAL (Dispensa IR/CSLL/PIS/COFINS)
                                </span>
                              ) : (
                                <span style={{
                                  background: '#dbeafe',
                                  color: '#1e40af',
                                  fontSize: '0.7rem',
                                  fontWeight: 700,
                                  padding: '2px 6px',
                                  borderRadius: '6px',
                                  border: '1px solid #bfdbfe'
                                }}>
                                  REGIME NORMAL (IN 1.234/2012)
                                </span>
                              )}
                            </div>
                            {forn.cidadeUf && (
                              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                Localidade: {forn.cidadeUf}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Totais do Fornecedor e Ação de Aglutinação */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                              {forn.indices.length} {forn.indices.length === 1 ? 'Nota' : 'Notas'} • Bruto: {formatBRL(forn.totalBruto)}
                            </div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#dc2626' }}>
                              Retenções: {formatBRL(forn.totalRetido)}
                            </div>
                          </div>

                          {temSelecionadas && (
                            <button
                              onClick={() => handleAglutinarSelecionadas(forn.cnpjLimpo)}
                              style={{
                                background: '#2563eb',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '7px',
                                padding: '6px 12px',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)'
                              }}
                            >
                              <FolderPlus size={15} />
                              Aglutinar ({selecionadas.length}) em Processo
                            </button>
                          )}

                          {forn.indices.length > 1 && (
                            <button
                              onClick={() => handleDownloadPdfConsolidadoGrupo(
                                temSelecionadas ? selecionadas : forn.indices
                              )}
                              disabled={baixandoPdf}
                              style={{
                                background: '#ffffff',
                                color: '#0f172a',
                                border: '1px solid #cbd5e1',
                                borderRadius: '7px',
                                padding: '6px 12px',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                              }}
                              title="Baixar Relatório Consolidado deste Fornecedor"
                            >
                              <Printer size={15} color="#2563eb" />
                              Relatório Consolidado ({temSelecionadas ? selecionadas.length : forn.indices.length} NFs)
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Tabela de Notas Fiscais do Fornecedor */}
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                          <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', textAlign: 'left' }}>
                              <th style={{ padding: '10px 16px', width: '40px' }}></th>
                              <th style={{ padding: '10px 12px' }}>Documento</th>
                              <th style={{ padding: '10px 12px' }}>Emissão</th>
                              <th style={{ padding: '10px 12px' }}>Processo / Empenho</th>
                              <th style={{ padding: '10px 12px', textAlign: 'right' }}>Valor Bruto</th>
                              <th style={{ padding: '10px 12px', textAlign: 'right' }}>Retenções Federais</th>
                              <th style={{ padding: '10px 12px', textAlign: 'right' }}>INSS</th>
                              <th style={{ padding: '10px 12px', textAlign: 'right' }}>ISS</th>
                              <th style={{ padding: '10px 12px', textAlign: 'right' }}>Total Retido</th>
                              <th style={{ padding: '10px 12px', textAlign: 'right' }}>Líquido</th>
                              <th style={{ padding: '10px 16px', textAlign: 'center', width: '190px' }}>Ações</th>
                            </tr>
                          </thead>
                          <tbody>
                            {forn.indices.map((idxNota) => {
                              const n = notas[idxNota];
                              const isChecked = selecionadas.includes(idxNota);
                              const totalFederais = (Number(n.totalIr) || 0) + (Number(n.totalCsll) || 0) + (Number(n.totalCofins) || 0) + (Number(n.totalPis) || 0);

                              return (
                                <tr 
                                  key={idxNota}
                                  style={{
                                    borderBottom: '1px solid #f1f5f9',
                                    background: isChecked ? '#eff6ff' : '#ffffff',
                                    transition: 'background-color 0.15s ease'
                                  }}
                                >
                                  {/* Checkbox */}
                                  <td style={{ padding: '10px 16px' }}>
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => handleToggleSelecaoNota(forn.cnpjLimpo, idxNota)}
                                      style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                                    />
                                  </td>

                                  {/* Nº Nota e Tipo */}
                                  <td style={{ padding: '10px 12px' }}>
                                    <div style={{ fontWeight: 600, color: '#0f172a' }}>
                                      NF {n.numeroNota || 'S/N'}
                                    </div>
                                    <span style={{
                                      fontSize: '0.7rem',
                                      fontWeight: 700,
                                      color: n.tipoDocumento === 'NFSE' ? '#7c3aed' : '#2563eb'
                                    }}>
                                      {n.tipoDocumento === 'NFSE' ? 'NFS-e (Serviços)' : 'NF-e (Mercadorias/Bens)'}
                                    </span>
                                  </td>

                                  {/* Emissão */}
                                  <td style={{ padding: '10px 12px', color: '#475569' }}>
                                    {n.dataEmissao ? new Date(n.dataEmissao).toLocaleDateString('pt-BR') : '—'}
                                  </td>

                                  {/* Processo / Empenho */}
                                  <td style={{ padding: '10px 12px' }}>
                                    {n.numeroProcesso ? (
                                      <span style={{
                                        background: '#ecfdf5',
                                        color: '#065f46',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        fontSize: '0.75rem',
                                        fontWeight: 600,
                                        display: 'inline-block'
                                      }}>
                                        SEI: {n.numeroProcesso}
                                      </span>
                                    ) : (
                                      <span style={{ color: '#94a3b8', fontSize: '0.75rem', fontStyle: 'italic' }}>
                                        Não informado
                                      </span>
                                    )}
                                    {n.numeroEmpenho && (
                                      <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                        NE: {n.numeroEmpenho}
                                      </div>
                                    )}
                                  </td>

                                  {/* Valor Bruto */}
                                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#0f172a' }}>
                                    {formatBRL(n.totalBruto)}
                                  </td>

                                  {/* Retenções Federais */}
                                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#475569' }}>
                                    {formatBRL(totalFederais)}
                                  </td>

                                  {/* INSS */}
                                  <td style={{ padding: '10px 12px', textAlign: 'right', color: Number(n.totalInss) > 0 ? '#b91c1c' : '#94a3b8' }}>
                                    {formatBRL(n.totalInss || 0)}
                                  </td>

                                  {/* ISS */}
                                  <td style={{ padding: '10px 12px', textAlign: 'right', color: Number(n.totalIss) > 0 ? '#b91c1c' : '#94a3b8' }}>
                                    {formatBRL(n.totalIss || 0)}
                                  </td>

                                  {/* Total Retido */}
                                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>
                                    {formatBRL(n.totalRetidoGeral)}
                                  </td>

                                  {/* Líquido */}
                                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#059669' }}>
                                    {formatBRL(n.valorLiquido)}
                                  </td>

                                  {/* Ações da linha */}
                                  <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                      <button
                                        onClick={() => handleIniciarConferenciaNota(idxNota)}
                                        style={{
                                          background: '#2563eb',
                                          color: '#ffffff',
                                          border: 'none',
                                          borderRadius: '6px',
                                          padding: '5px 10px',
                                          fontSize: '0.75rem',
                                          fontWeight: 600,
                                          cursor: 'pointer',
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '4px'
                                        }}
                                        title="Conferir e ajustar itens desta nota"
                                      >
                                        <Sliders size={13} />
                                        Conferir
                                      </button>

                                      <button
                                        onClick={() => handleDownloadPdfNotaIndividual(n, idxNota)}
                                        disabled={baixandoPdf}
                                        style={{
                                          background: '#ffffff',
                                          color: '#0f172a',
                                          border: '1px solid #cbd5e1',
                                          borderRadius: '6px',
                                          padding: '5px 8px',
                                          fontSize: '0.75rem',
                                          fontWeight: 600,
                                          cursor: 'pointer',
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '4px'
                                        }}
                                        title="Baixar Relatório desta Nota em PDF"
                                      >
                                        <Download size={13} color="#2563eb" />
                                        PDF
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* VISÃO 2: MODO CONFERÊNCIA PAGINADA (STEPPER NOTA A NOTA) */}
          {/* ========================================================= */}
          {visao === 'conferencia' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              
              {/* Barra de Navegação Superior (Stepper) */}
              <div style={{
                background: '#ffffff',
                borderBottom: '1px solid #cbd5e1',
                padding: '10px 22px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
                position: 'sticky',
                top: 0,
                zIndex: 10
              }}>
                {/* Navegador Anterior / Próxima */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      onClick={() => setIndiceNotaAtiva(prev => Math.max(0, prev - 1))}
                      disabled={indiceNotaAtiva === 0}
                      style={{
                        background: indiceNotaAtiva === 0 ? '#f1f5f9' : '#ffffff',
                        color: indiceNotaAtiva === 0 ? '#94a3b8' : '#0f172a',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        padding: '6px 12px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: indiceNotaAtiva === 0 ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <ArrowLeft size={14} />
                      Anterior
                    </button>

                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', padding: '0 8px' }}>
                      Nota {indiceNotaAtiva + 1} de {totalNotas}
                    </span>

                    <button
                      onClick={() => setIndiceNotaAtiva(prev => Math.min(totalNotas - 1, prev + 1))}
                      disabled={indiceNotaAtiva >= totalNotas - 1}
                      style={{
                        background: indiceNotaAtiva >= totalNotas - 1 ? '#f1f5f9' : '#ffffff',
                        color: indiceNotaAtiva >= totalNotas - 1 ? '#94a3b8' : '#0f172a',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        padding: '6px 12px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: indiceNotaAtiva >= totalNotas - 1 ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      Próxima
                      <ArrowRight size={14} />
                    </button>
                  </div>

                  {/* Seletor dropdown para pular direto */}
                  <select
                    value={indiceNotaAtiva}
                    onChange={(e) => setIndiceNotaAtiva(Number(e.target.value))}
                    style={{
                      padding: '6px 10px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      color: '#334155',
                      outline: 'none',
                      background: '#f8fafc',
                      maxWidth: '320px'
                    }}
                  >
                    {notas.map((n, i) => (
                      <option key={i} value={i}>
                        NF #{n.numeroNota || 'S/N'} — {n.fornecedorNome?.slice(0, 25)} ({formatBRL(n.totalBruto)})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Badge do Fornecedor & Processo */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>
                      {notaAtiva.fornecedorNome}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      CNPJ: {formatarCnpj(notaAtiva.fornecedorCnpj)} • {notaAtiva.optanteSimples ? 'Simples Nacional' : 'Regime Normal'}
                    </div>
                  </div>

                  {notaAtiva.numeroProcesso && (
                    <span style={{
                      background: '#ecfdf5',
                      color: '#065f46',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      border: '1px solid #a7f3d0'
                    }}>
                      Proc: {notaAtiva.numeroProcesso}
                    </span>
                  )}
                </div>

                {/* Ações da Nota Ativa */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    onClick={() => handleSalvarNotaIndividual(notaAtiva)}
                    disabled={salvandoNota}
                    style={{
                      background: '#ffffff',
                      color: '#065f46',
                      border: '1px solid #a7f3d0',
                      borderRadius: '6px',
                      padding: '7px 12px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                    title="Salvar esta nota individual no PostgreSQL"
                  >
                    <Database size={15} color="#059669" />
                    {salvandoNota ? 'Gravando...' : 'Salvar no Banco'}
                  </button>

                  <button
                    onClick={() => handleDownloadPdfNotaIndividual(notaAtiva, indiceNotaAtiva)}
                    disabled={baixandoPdf}
                    style={{
                      background: '#2563eb',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '7px 14px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)'
                    }}
                  >
                    <Download size={15} />
                    {baixandoPdf ? 'Gerando...' : 'Baixar PDF Desta Nota'}
                  </button>

                  {/* Se houver mais de uma nota deste fornecedor, botão de consolidar */}
                  {notasMesmoFornecedor.length > 1 && (
                    <button
                      onClick={() => handleDownloadPdfConsolidadoGrupo(
                        notasMesmoFornecedor.map(x => x.i)
                      )}
                      disabled={baixandoPdf}
                      style={{
                        background: '#1e293b',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '7px 12px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}
                      title="Gerar PDF com todas as notas deste mesmo fornecedor"
                    >
                      <Printer size={15} color="#60a5fa" />
                      PDF Consolidado ({notasMesmoFornecedor.length} NFs)
                    </button>
                  )}
                </div>
              </div>

              {/* Área do Relatório de Conferência e Ajustes da Nota Ativa */}
              <div style={{ flex: 1, padding: '20px 24px' }}>
                <ReportPreview 
                  key={`nota-conferencia-${indiceNotaAtiva}`}
                  data={notaAtiva} 
                  onUpdateData={(notaRecalculada) => handleAtualizarNota(indiceNotaAtiva, notaRecalculada)}
                />
              </div>
            </div>
          )}

        </div>
      </div>

      {/* DIÁLOGO / MODAL PROMPT DO NÚMERO DO PROCESSO */}
      <ModalPromptProcesso
        isOpen={promptOpen}
        titulo={promptTitulo}
        subtitulo={promptSubtitulo}
        valorInicialProcesso={promptValorProcesso}
        valorInicialDocumentoHabil={promptValorDocumentoHabil}
        valorInicialEmpenho={promptValorEmpenho}
        onConfirm={(proc, emp, docHab) => {
          if (promptOnConfirmCallback) {
            promptOnConfirmCallback(proc, emp, docHab);
          } else {
            setPromptOpen(false);
          }
        }}
        onCancel={() => setPromptOpen(false)}
      />
    </div>
  );
};
