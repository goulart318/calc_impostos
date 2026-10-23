import { useState } from 'react';
import { 
  UploadCloud, 
  Search, 
  Calculator, 
  FileText, 
  Database, 
  BookOpen, 
  Layers, 
  Building2, 
  ShieldCheck,
  Percent,
  Plus,
  Trash2,
  RotateCcw,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  BarChart3
} from 'lucide-react';
import { ReportPreview, type ResultadoConsolidado, type DadosSicafConsulta } from './components/ReportPreview';
import { SicafCard } from './components/SicafCard';
import { HistoricoSearch } from './components/HistoricoSearch';
import { Anexo1Tab } from './components/Anexo1Tab';
import { NcmMatrixTab } from './components/NcmMatrixTab';
import { DashboardTab } from './components/DashboardTab';
import { ProcessoConsolidadoModal, type ProcessoConsolidadoData } from './components/ProcessoConsolidadoModal';
import { LoteTriagemModal } from './components/LoteTriagemModal';
import { API_BASE_URL } from './config/api';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'analise' | 'historico' | 'anexo1' | 'ncm'>('analise');
  
  // Estado do formulário de análise (100% limpo inicialmente)
  const [tipoDocumento, setTipoDocumento] = useState<'NFE' | 'NFSE'>('NFE');
  const [numeroNota, setNumeroNota] = useState('');
  const [chaveAcesso, setChaveAcesso] = useState('');
  const [numeroProcesso, setNumeroProcesso] = useState('');
  const [documentoHabil, setDocumentoHabil] = useState('');
  const [numeroEmpenho, setNumeroEmpenho] = useState('');
  const [fornecedorCnpj, setFornecedorCnpj] = useState('');
  const [fornecedorNome, setFornecedorNome] = useState('');
  const [fornecedorCidadeUf, setFornecedorCidadeUf] = useState('');
  const [optanteSimples, setOptanteSimples] = useState(false);
  const [situacaoCadastral, setSituacaoCadastral] = useState('ATIVA');
  const [consultandoCnpj, setConsultandoCnpj] = useState(false);
  const [sicafData, setSicafData] = useState<DadosSicafConsulta | null>(null);
  const [consultandoSicaf, setConsultandoSicaf] = useState(false);

  const reconsultarSicaf = async (cnpjAlvo?: string) => {
    const raw = cnpjAlvo || fornecedorCnpj;
    const cnpjLimpo = (raw || '').replace(/\D/g, '');
    if (!cnpjLimpo) return;
    setConsultandoSicaf(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/sicaf/consultar/${cnpjLimpo}`);
      if (res.ok) {
        const dados: DadosSicafConsulta = await res.json();
        setSicafData(dados);
        if (resultado) {
          setResultado(prev => prev ? { ...prev, sicaf: dados } : null);
        }
      }
    } catch (err) {
      console.warn('Erro ao consultar SICAF:', err);
    } finally {
      setConsultandoSicaf(false);
    }
  };

  // Formata o número do processo no padrão SEI: xxxxx.yyyyyy/aaaa-dd
  const formatarProcessoSei = (val: string) => {
    // Se o usuário digitou ou colou já com pontuação, mantemos ou normalizamos
    const limpo = val.replace(/\D/g, '').slice(0, 17);
    if (limpo.length <= 5) return limpo;
    if (limpo.length <= 11) return `${limpo.slice(0, 5)}.${limpo.slice(5)}`;
    if (limpo.length <= 15) return `${limpo.slice(0, 5)}.${limpo.slice(5, 11)}/${limpo.slice(11)}`;
    return `${limpo.slice(0, 5)}.${limpo.slice(5, 11)}/${limpo.slice(11, 15)}-${limpo.slice(15)}`;
  };

  // CNPJ e Município do Órgão do Usuário (Configuráveis e Salvos em LocalStorage)
  const [cnpjMeuEstabelecimento, setCnpjMeuEstabelecimento] = useState<string>(() => {
    return localStorage.getItem('cnpj_orgao_configurado') || '15.126.437/0006-58';
  });

  const [municipioMeuOrgao, setMunicipioMeuOrgao] = useState<string>(() => {
    return localStorage.getItem('municipio_orgao_configurado') || 'Vitória';
  });

  const [localPrestacaoServico, setLocalPrestacaoServico] = useState<string>('Vitória');

  const handleSalvarCnpjConfigurado = async (val: string) => {
    setCnpjMeuEstabelecimento(val);
    localStorage.setItem('cnpj_orgao_configurado', val);

    // Consulta automática da cidade do órgão via API da Receita Federal
    const cnpjLimpo = val.replace(/\D/g, '');
    if (cnpjLimpo.length === 14) {
      try {
        const res = await fetch(`${API_BASE_URL}/api/consultar-cnpj/${cnpjLimpo}`);
        if (res.ok) {
          const d = await res.json();
          if (d.municipio) {
            setMunicipioMeuOrgao(d.municipio);
            localStorage.setItem('municipio_orgao_configurado', d.municipio);
          }
        }
      } catch (e) {
        // Silencioso
      }
    }
  };

  const handleSalvarMunicipioConfigurado = (cidade: string) => {
    setMunicipioMeuOrgao(cidade);
    localStorage.setItem('municipio_orgao_configurado', cidade);
  };

  // Dados do Destinatário/Tomador da Nota Fiscal Lido do Documento
  const [destinatarioCnpj, setDestinatarioCnpj] = useState<string>('');
  const [destinatarioNome, setDestinatarioNome] = useState<string>('');

  // Itens (Vazio por padrão)
  const [itens, setItens] = useState<any[]>([]);

  // Estados de NFS-e (Serviços)
  const [percentualReducaoIss, setPercentualReducaoIss] = useState<number>(0);
  const [retencaoIss, setRetencaoIss] = useState<boolean>(true); // DEFAULT = TRUE para tomador público
  const [aliquotaIssPersonalizada, setAliquotaIssPersonalizada] = useState<number>(5.0);
  const [habilitarAliquotaPersonalizadaIss, setHabilitarAliquotaPersonalizadaIss] = useState<boolean>(false);
  const [valorInssDestacado, setValorInssDestacado] = useState<number>(0);
  const [valorMateriaisInss, setValorMateriaisInss] = useState<number>(0);
  const [valorContaVinculada, setValorContaVinculada] = useState<number>(0);
  const [retencaoInss, setRetencaoInss] = useState<boolean>(false);
  const [optanteCprb, setOptanteCprb] = useState(false);

  // Estado de Drag and Drop e Upload
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loteProgresso, setLoteProgresso] = useState<string>('');
  const [processoModalData, setProcessoModalData] = useState<ProcessoConsolidadoData | null>(null);
  const [loteTriagemNotas, setLoteTriagemNotas] = useState<ResultadoConsolidado[] | null>(null);
  const [loteTriagemAberto, setLoteTriagemAberto] = useState<boolean>(false);

  // Resultado do Cálculo (Vazio por padrão)
  const [resultado, setResultado] = useState<ResultadoConsolidado | null>(null);

  const cnpjConfigClean = cnpjMeuEstabelecimento.replace(/\D/g, '');
  const destCnpjClean = destinatarioCnpj.replace(/\D/g, '');
  const temDivergenciaDestinatario = Boolean(
    destCnpjClean && cnpjConfigClean && destCnpjClean !== cnpjConfigClean
  );

  const limparFormulario = () => {
    setNumeroNota('');
    setChaveAcesso('');
    setNumeroProcesso('');
    setDocumentoHabil('');
    setNumeroEmpenho('');
    setFornecedorCnpj('');
    setFornecedorNome('');
    setFornecedorCidadeUf('');
    setOptanteSimples(false);
    setSituacaoCadastral('ATIVA');
    setDestinatarioCnpj('');
    setDestinatarioNome('');
    setPercentualReducaoIss(0);
    setRetencaoIss(true);
    setAliquotaIssPersonalizada(5.0);
    setHabilitarAliquotaPersonalizadaIss(false);
    setValorInssDestacado(0);
    setValorMateriaisInss(0);
    setValorContaVinculada(0);
    setRetencaoInss(false);
    setOptanteCprb(false);
    setItens([]);
    setResultado(null);
    setSicafData(null);
  };

  const [calculando, setCalculando] = useState(false);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);

  const calcularRetencoes = async () => {
    if (temDivergenciaDestinatario) {
      alert('⚠️ A emissão do relatório foi bloqueada pois a nota fiscal pertence a outro CNPJ!');
      return;
    }

    if (!numeroNota && itens.length === 0) {
      alert('Por favor, envie um arquivo (PDF/XML) ou adicione itens com valores para calcular.');
      return;
    }

    try {
      setCalculando(true);
      const payload = {
        tipoDocumento,
        numeroNota: numeroNota || 'S/N',
        chaveAcesso,
        numeroProcesso: numeroProcesso || undefined,
        documentoHabil: documentoHabil || undefined,
        numeroEmpenho: numeroEmpenho || undefined,
        fornecedorNome: fornecedorNome || 'Fornecedor Não Informado',
        fornecedorCnpj: fornecedorCnpj || '',
        fornecedorMunicipio: fornecedorCidadeUf ? fornecedorCidadeUf.split('/')[0].trim() : undefined,
        fornecedorUf: fornecedorCidadeUf && fornecedorCidadeUf.includes('/') ? fornecedorCidadeUf.split('/')[1].trim() : undefined,
        destinatarioNome,
        destinatarioCnpj,
        optanteSimples,
        percentualReducaoIss,
        retencaoIss,
        aliqIss: habilitarAliquotaPersonalizadaIss ? Number(aliquotaIssPersonalizada) : undefined,
        localPrestacaoServico: tipoDocumento === 'NFSE' ? localPrestacaoServico : undefined,
        municipioTomador: tipoDocumento === 'NFSE' ? municipioMeuOrgao : undefined,
        retencaoInss: retencaoInss || Boolean(valorInssDestacado > 0 || valorMateriaisInss > 0),
        valorInssDestacado,
        valorMateriaisInss,
        valorContaVinculada,
        dataEmissao: new Date().toISOString().split('T')[0],
        itens: itens.map(item => ({
          ...item,
          valorBruto: parseFloat(String(item.valorBruto)) || 0
        })),
        optanteCprb
      };

      const res = await fetch(`${API_BASE_URL}/api/analisar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Erro HTTP ${res.status} ao calcular retenções`);
      }

      const data = await res.json();
      if (data.numeroProcesso) {
        setNumeroProcesso(data.numeroProcesso);
      } else if (numeroProcesso && !data.numeroProcesso) {
        data.numeroProcesso = numeroProcesso;
      }

      if (data.documentoHabil) {
        setDocumentoHabil(data.documentoHabil);
      } else if (documentoHabil && !data.documentoHabil) {
        data.documentoHabil = documentoHabil;
      }

      if (data.numeroEmpenho) {
        setNumeroEmpenho(data.numeroEmpenho);
      } else if (numeroEmpenho && !data.numeroEmpenho) {
        data.numeroEmpenho = numeroEmpenho;
      }

      setResultado(data);
      if (data.sicaf) {
        setSicafData(data.sicaf);
      } else if (data.fornecedorCnpj) {
        reconsultarSicaf(data.fornecedorCnpj);
      }
      if (data.jaAnalisadaAntes) {
        setMensagemSucesso(`✓ Cruzamento do Histórico: Nota já analisada anteriormente (${data.dataAnaliseAnterior || 'no histórico'}). Processo SEI (${data.numeroProcesso || 'SEI'}) preenchido automaticamente!`);
      } else {
        setMensagemSucesso(`✓ Retenções calculadas com sucesso para a Nota Fiscal ${data.numeroNota || numeroNota}!`);
      }
      setTimeout(() => setMensagemSucesso(null), 8000);

      // Scroll suave até o relatório
      setTimeout(() => {
        const el = document.getElementById('secao-relatorio-conferencia');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err: any) {
      console.error('Erro no cálculo:', err);
      alert('Erro ao calcular retenções: ' + (err.message || 'Verifique a conexão com o servidor.'));
    } finally {
      setCalculando(false);
    }
  };

  const handleConsultarCnpj = async () => {
    if (!fornecedorCnpj) return;
    try {
      setConsultandoCnpj(true);
      const res = await fetch(`${API_BASE_URL}/api/consultar-cnpj/${fornecedorCnpj.replace(/\D/g, '')}`);
      if (res.ok) {
        const data = await res.json();
        setFornecedorNome(data.razaoSocial || fornecedorNome);
        setOptanteSimples(data.optanteSimples);
        if (data.situacaoCadastral) setSituacaoCadastral(data.situacaoCadastral);
        if (data.municipio || data.uf) {
          setFornecedorCidadeUf(`${data.municipio || ''}${data.uf ? `/${data.uf}` : ''}`.trim());
        }
        const cnpjNum = fornecedorCnpj.replace(/\D/g, '');
        if (cnpjNum.length === 14) reconsultarSicaf(cnpjNum);
      }
    } catch (e) {
      alert('Não foi possível consultar o CNPJ.');
    } finally {
      setConsultandoCnpj(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    const fileNameLower = (file.name || '').toLowerCase();
    const isXml = fileNameLower.endsWith('.xml') || file.type.includes('xml');
    const isPdf = fileNameLower.endsWith('.pdf') || file.type.includes('pdf');

    if (!isXml && !isPdf) {
      alert(`O arquivo "${file.name}" não foi reconhecido como PDF ou XML válido. Por favor, envie um arquivo com extensão .pdf ou .xml.`);
      return;
    }

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('arquivo', file);
      formData.append('file', file);

      const endpoint = isXml ? `${API_BASE_URL}/api/upload-xml` : `${API_BASE_URL}/api/upload-pdf`;
      const res = await fetch(endpoint, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        let errMsg = 'Falha ao processar arquivo.';
        try {
          const errData = await res.json();
          errMsg = errData.error || errMsg;
        } catch {
          const txt = await res.text().catch(() => '');
          if (txt.includes('502') || txt.includes('503') || txt.includes('Service Unavailable') || !txt) {
            errMsg = 'O backend está inicializando (Cold Start do Render). Por favor, aguarde cerca de 30 segundos e envie novamente.';
          } else {
            errMsg = `Erro ${res.status}: ${txt.substring(0, 100)}`;
          }
        }
        throw new Error(errMsg);
      }

      let data: ResultadoConsolidado;
      try {
        data = await res.json();
      } catch {
        throw new Error('O servidor respondeu de forma incompleta. Aguarde alguns segundos (o servidor pode estar acordando) e tente novamente.');
      }
      setNumeroProcesso(data.numeroProcesso || '');
      setDocumentoHabil(data.documentoHabil || '');
      setNumeroEmpenho(data.numeroEmpenho || '');
      setResultado(data);

      setNumeroNota(data.numeroNota || '');
      setChaveAcesso(data.chaveAcesso || '');
      setFornecedorCnpj(data.fornecedorCnpj || '');
      setFornecedorNome(data.fornecedorNome || '');
      if (data.fornecedorMunicipio || data.fornecedorUf) {
        setFornecedorCidadeUf(`${data.fornecedorMunicipio || ''}${data.fornecedorUf ? `/${data.fornecedorUf}` : ''}`.trim());
      }
      setDestinatarioCnpj(data.destinatarioCnpj || '');
      setDestinatarioNome(data.destinatarioNome || '');
      setOptanteSimples(data.optanteSimples || false);

      if (data.tipoDocumento === 'NFSE') {
        setTipoDocumento('NFSE');
        setPercentualReducaoIss(data.percentualReducaoIssAplicado || 0);
        setRetencaoIss(data.issRetidoTomador !== undefined ? data.issRetidoTomador : true);
        if (data.localPrestacaoServico) {
          setLocalPrestacaoServico(data.localPrestacaoServico);
        } else {
          setLocalPrestacaoServico(municipioMeuOrgao);
        }
        if (data.aliqIssAplicada !== undefined) {
          setAliquotaIssPersonalizada(data.aliqIssAplicada);
        }
        if (data.totalInss && data.totalInss > 0) {
          setValorInssDestacado(data.totalInss);
          setRetencaoInss(true);
        } else {
          setValorInssDestacado(0);
          setRetencaoInss(false);
        }
        if (data.totalMateriaisInssDeducao && data.totalMateriaisInssDeducao > 0) {
          setValorMateriaisInss(data.totalMateriaisInssDeducao);
          setRetencaoInss(true);
        } else {
          setValorMateriaisInss(0);
        }
      } else {
        setTipoDocumento('NFE');
      }

      setItens(data.itens.map(it => ({
        numeroItem: it.numeroItem,
        descricao: it.descricao,
        ncm: it.ncm || '',
        cst: it.cst || '01',
        codigoServico: it.codigoServico,
        valorBruto: it.valorBruto,
        condicaoEspecial: it.codigoReceitaDarf || undefined
      })));

      if (data.jaAnalisadaAntes) {
        setMensagemSucesso(`✓ Cruzamento do Histórico: Nota já analisada anteriormente (${data.dataAnaliseAnterior || 'no histórico'}). Processo SEI (${data.numeroProcesso || 'SEI'}) preenchido automaticamente!`);
      } else {
        setMensagemSucesso(`✓ Nota Fiscal ${data.numeroNota || 'processada'} carregada e analisada com sucesso!`);
      }
      setTimeout(() => setMensagemSucesso(null), 8000);

      // Rola suavemente até o resumo/relatório
      setTimeout(() => {
        const el = document.getElementById('secao-relatorio-conferencia');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 150);
    } catch (err: any) {
      alert('Erro na leitura do arquivo: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleFilesUpload = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    if (files.length === 1) {
      return handleFileUpload(files[0]);
    }

    // Processamento em lote de múltiplos arquivos
    try {
      setUploading(true);
      setLoteProgresso(`Processando lote com ${files.length} notas fiscais e consultando Receita Federal...`);

      const formData = new FormData();
      files.forEach((f) => {
        formData.append('arquivos', f);
      });
      if (numeroProcesso) formData.append('numeroProcesso', numeroProcesso);
      if (documentoHabil) formData.append('documentoHabil', documentoHabil);
      if (numeroEmpenho) formData.append('numeroEmpenho', numeroEmpenho);

      const res = await fetch(`${API_BASE_URL}/api/upload-lote`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Falha ao processar lote de arquivos.');
      }

      const data: ProcessoConsolidadoData = await res.json();
      if (numeroProcesso && !data.numeroProcesso) data.numeroProcesso = numeroProcesso;
      if (numeroEmpenho && !data.notaEmpenho) data.notaEmpenho = numeroEmpenho;

      // Opção A: Inicia a nova rotina de Central de Triagem com Agrupamento por Fornecedor e Paginação
      if (data.notas && data.notas.length > 0) {
        setLoteTriagemNotas(data.notas);
        setLoteTriagemAberto(true);
      } else {
        setProcessoModalData(data);
      }

      setMensagemSucesso(`✓ Processamento em lote de ${files.length} documento(s) concluído com sucesso!`);
      setTimeout(() => setMensagemSucesso(null), 7000);
    } catch (err: any) {
      alert('Erro no processamento do lote: ' + err.message);
    } finally {
      setUploading(false);
      setLoteProgresso('');
    }
  };

  const handleSelectNotaDoHistorico = (nota: ResultadoConsolidado) => {
    setResultado(nota);
    setTipoDocumento(nota.tipoDocumento);
    setNumeroNota(nota.numeroNota || '');
    setChaveAcesso(nota.chaveAcesso || '');
    setNumeroProcesso(nota.numeroProcesso || '');
    setDocumentoHabil(nota.documentoHabil || '');
    setNumeroEmpenho(nota.numeroEmpenho || '');
    setFornecedorCnpj(nota.fornecedorCnpj || '');
    setFornecedorNome(nota.fornecedorNome || '');
    if (nota.fornecedorMunicipio || nota.fornecedorUf) {
      setFornecedorCidadeUf(`${nota.fornecedorMunicipio || ''}${nota.fornecedorUf ? `/${nota.fornecedorUf}` : ''}`.trim());
    }
    setDestinatarioCnpj(nota.destinatarioCnpj || '');
    setDestinatarioNome(nota.destinatarioNome || '');
    setOptanteSimples(nota.optanteSimples || false);
    setSituacaoCadastral(nota.situacaoCadastral || 'ATIVA');
    if (nota.sicaf) setSicafData(nota.sicaf);

    if (nota.tipoDocumento === 'NFSE') {
      setPercentualReducaoIss(nota.percentualReducaoIssAplicado || 0);
      setRetencaoIss(nota.issRetidoTomador !== undefined ? nota.issRetidoTomador : true);
      if (nota.localPrestacaoServico) {
        setLocalPrestacaoServico(nota.localPrestacaoServico);
      }
      if (nota.aliqIssAplicada !== undefined) {
        setAliquotaIssPersonalizada(nota.aliqIssAplicada);
      }
      setValorInssDestacado(nota.totalInss || 0);
      setValorMateriaisInss(nota.totalMateriaisInssDeducao || 0);
      setValorContaVinculada(nota.totalContaVinculada || 0);
      setRetencaoInss(Boolean(nota.totalInss && nota.totalInss > 0));
    }

    setItens(nota.itens.map(it => ({
      numeroItem: it.numeroItem,
      descricao: it.descricao,
      ncm: it.ncm || '',
      cst: it.cst || '01',
      codigoServico: it.codigoServico,
      valorBruto: it.valorBruto,
      condicaoEspecial: it.codigoReceitaDarf || undefined
    })));

    setActiveTab('analise');
  };

  const handleAddItem = () => {
    setItens([
      ...itens,
      {
        numeroItem: itens.length + 1,
        descricao: tipoDocumento === 'NFE' ? 'Novo Material / Consumo' : 'Novo Serviço',
        ncm: tipoDocumento === 'NFE' ? '' : undefined,
        cst: tipoDocumento === 'NFE' ? '01' : undefined,
        codigoServico: tipoDocumento === 'NFSE' ? '6190' : undefined,
        valorBruto: 0
      }
    ]);
  };

  const handleRemoveItem = (index: number) => {
    setItens(itens.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItens = [...itens];
    newItens[index][field] = value;
    setItens(newItens);
  };

  return (
    <div className="app-container">
      {/* Header Institucional */}
      <header className="app-header">
        <div className="header-brand">
          <div className="header-logo">
            <Building2 size={24} color="#ffffff" />
          </div>
          <div>
            <h1 className="header-title">Plataforma de Retenções Tributárias & Matriz Fiscal</h1>
            <p className="header-subtitle">Instrução e emissão de memórias de cálculo de retenção para processos no SEI (IN 1234/2012)</p>
          </div>
        </div>

        <div className="header-actions">
          <div className="header-badge">
            <ShieldCheck size={14} color="#10b981" />
            <span>IN RFB nº 1.234/2012 & INSS</span>
          </div>
        </div>
      </header>

      {/* Navegação por Abas */}
      <nav className="nav-tabs">
        <button 
          className={`nav-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          <BarChart3 size={18} />
          <span>Dashboard & Analytics</span>
        </button>

        <button 
          className={`nav-tab ${activeTab === 'analise' ? 'active' : ''}`}
          onClick={() => setActiveTab('analise')}
        >
          <Calculator size={18} />
          <span>Análise de Retenção</span>
        </button>

        <button 
          className={`nav-tab ${activeTab === 'historico' ? 'active' : ''}`}
          onClick={() => setActiveTab('historico')}
        >
          <Database size={18} />
          <span>Histórico no PostgreSQL</span>
        </button>

        <button 
          className={`nav-tab ${activeTab === 'anexo1' ? 'active' : ''}`}
          onClick={() => setActiveTab('anexo1')}
        >
          <BookOpen size={18} />
          <span>Tabela Anexo I (IN 1234)</span>
        </button>

        <button 
          className={`nav-tab ${activeTab === 'ncm' ? 'active' : ''}`}
          onClick={() => setActiveTab('ncm')}
        >
          <Layers size={18} />
          <span>Matriz de NCMs</span>
        </button>
      </nav>

      {/* Conteúdo Principal */}
      <main className="main-content">
        {/* Toast Notificação Flutuante de Sucesso (visível em qualquer ponto da tela) */}
        {mensagemSucesso && (
          <div className="floating-toast" role="alert" aria-live="assertive">
            <div style={{
              background: '#ecfdf5',
              padding: '8px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <CheckCircle2 size={24} color="#059669" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#065f46', marginBottom: '2px' }}>
                Análise Concluída!
              </div>
              <div style={{ fontSize: '0.85rem', color: '#1e293b', lineHeight: 1.4 }}>
                {mensagemSucesso}
              </div>
            </div>
            <button 
              type="button" 
              onClick={() => setMensagemSucesso(null)}
              title="Fechar notificação"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#64748b',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '1.1rem',
                fontWeight: 'bold',
                lineHeight: 1,
                alignSelf: 'flex-start'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#0f172a')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
            >
              ✕
            </button>
          </div>
        )}

        {activeTab === 'analise' && (
          <div className="tab-pane active">
            <div className="two-column-layout">
              {/* Painel Esquerdo: Entrada de Dados */}
              <div className="left-panel">
                {/* Upload de Nota Fiscal (XML ou PDF) - Individual ou em Lote */}
                <div 
                  className={`card drop-zone ${isDragging ? 'dragging' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                      handleFilesUpload(e.dataTransfer.files);
                    }
                  }}
                  style={{ marginBottom: '16px', textOverflow: 'ellipsis' }}
                >
                  <UploadCloud size={36} color="var(--primary)" style={{ marginBottom: '8px' }} />
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 4px 0' }}>
                    {uploading 
                      ? (loteProgresso || 'Processando e consultando Receita Federal...') 
                      : 'Importar Nota(s) Fiscal(is) — Individual ou em Lote'}
                  </h3>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
                    Arraste um arquivo individual ou múltiplos PDFs/XMLs para calcular o processo de pagamento unificado
                  </p>
                  
                  <input 
                    type="file" 
                    id="file-upload" 
                    multiple
                    accept=".pdf,.xml" 
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        handleFilesUpload(e.target.files);
                      }
                    }} 
                  />
                  <label htmlFor="file-upload" className="btn btn-outline" style={{ marginTop: '12px', fontSize: '0.8rem' }}>
                    Selecionar Arquivo(s) (PDF ou XML)
                  </label>
                </div>

                {/* Banner de Lote Ativo em Triagem (Opção A) */}
                {loteTriagemNotas && loteTriagemNotas.length > 0 && !loteTriagemAberto && (
                  <div style={{
                    marginBottom: '16px',
                    padding: '12px 16px',
                    background: '#eff6ff',
                    border: '1px solid #93c5fd',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '10px'
                  }}>
                    <div>
                      <strong style={{ fontSize: '0.85rem', color: '#1e40af', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Layers size={16} /> Central de Lote: {loteTriagemNotas.length} Notas Carregadas
                      </strong>
                      <div style={{ fontSize: '0.75rem', color: '#3b82f6', marginTop: '2px' }}>
                        Clique para retomar a triagem, aglutinação por processo e conferência paginada nota a nota.
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button 
                        className="btn-primary"
                        onClick={() => setLoteTriagemAberto(true)}
                        style={{ fontSize: '0.78rem', padding: '6px 12px' }}
                      >
                        Abrir Central
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Deseja descartar as notas deste lote?')) {
                            setLoteTriagemNotas(null);
                          }
                        }}
                        style={{
                          background: 'transparent',
                          border: '1px solid #cbd5e1',
                          color: '#64748b',
                          borderRadius: '6px',
                          padding: '6px 10px',
                          fontSize: '0.75rem',
                          cursor: 'pointer'
                        }}
                      >
                        Limpar
                      </button>
                    </div>
                  </div>
                )}

                {/* Banner de Processo Consolidado Ativo (se houver) */}
                {processoModalData && (
                  <div style={{
                    marginBottom: '16px',
                    padding: '12px 16px',
                    background: '#eff6ff',
                    border: '1px solid #93c5fd',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '10px'
                  }}>
                    <div>
                      <strong style={{ fontSize: '0.85rem', color: '#1e40af', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Layers size={16} /> Processo de Pagamento com {processoModalData.resumo.totalNotas} Nota(s) Consolidada(s)
                      </strong>
                      <div style={{ fontSize: '0.75rem', color: '#3b82f6', marginTop: '2px' }}>
                        Total Bruto: {(processoModalData.resumo.totalBruto || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} • Líquido: {(processoModalData.resumo.totalLiquido || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </div>
                    </div>
                    <button 
                      className="btn-primary"
                      onClick={() => setProcessoModalData(processoModalData)}
                      style={{ fontSize: '0.78rem', padding: '6px 12px' }}
                    >
                      Abrir Relatório Consolidado
                    </button>
                  </div>
                )}

                {/* Card de Configuração do CNPJ do Órgão / Estabelecimento */}
                <div className="card" style={{ background: '#f8fafc', border: '1px solid #cbd5e1', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                      <strong style={{ fontSize: '0.85rem', color: 'var(--text-main)' }}>🏢 Seu Órgão / Estabelecimento Tomador:</strong>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Usado para conferir destinatário e determinar incidência territorial de ISSQN (LC 116/2003).</div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <div>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block' }}>CNPJ DO ÓRGÃO:</span>
                        <input 
                          type="text" 
                          className="form-input" 
                          style={{ padding: '4px 8px', fontSize: '0.82rem', width: '165px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}
                          value={cnpjMeuEstabelecimento} 
                          onChange={(e) => handleSalvarCnpjConfigurado(e.target.value)} 
                          placeholder="15.126.437/0006-58"
                        />
                      </div>

                      <div>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block' }}>CIDADE DO ÓRGÃO:</span>
                        <input 
                          type="text" 
                          className="form-input" 
                          style={{ padding: '4px 8px', fontSize: '0.82rem', width: '130px', fontWeight: 700 }}
                          value={municipioMeuOrgao} 
                          onChange={(e) => handleSalvarMunicipioConfigurado(e.target.value)} 
                          placeholder="Vitória"
                          title="Cidade sede do seu órgão / tomador (obtida via Receita Federal ou ajustável manualmente)"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Banner de Validação Automática de Belonging (Destinatário) */}
                {destinatarioCnpj && (
                  <div style={{ 
                    marginBottom: '16px', 
                    padding: '12px 16px', 
                    borderRadius: 'var(--radius-md)', 
                    border: temDivergenciaDestinatario ? '2px solid #ef4444' : '1px solid #10b981',
                    background: temDivergenciaDestinatario ? '#fef2f2' : '#ecfdf5',
                    color: temDivergenciaDestinatario ? '#991b1b' : '#065f46',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                  }}>
                    {temDivergenciaDestinatario ? (
                      <AlertTriangle size={24} color="#dc2626" style={{ flexShrink: 0 }} />
                    ) : (
                      <CheckCircle2 size={24} color="#059669" style={{ flexShrink: 0 }} />
                    )}

                    <div style={{ flex: 1 }}>
                      <strong style={{ fontSize: '0.9rem', display: 'block', marginBottom: '2px' }}>
                        {temDivergenciaDestinatario 
                          ? 'DIVERGÊNCIA DE DESTINATÁRIO — NOTA EMITIDA PARA OUTRO ESTABELECIMENTO' 
                          : '✓ CONFERÊNCIA AUTOMÁTICA: DOCUMENTO PERTENCE AO SEU ESTABELECIMENTO'}
                      </strong>
                      <div style={{ fontSize: '0.8rem', lineHeight: 1.4 }}>
                        {temDivergenciaDestinatario ? (
                          <>
                            Esta nota fiscal foi emitida para o CNPJ <strong>{destinatarioCnpj}</strong> ({destinatarioNome || 'Destinatário Desconhecido'}).
                            O CNPJ configurado do seu estabelecimento é <strong>{cnpjMeuEstabelecimento}</strong>.
                            <div style={{ fontWeight: 700, marginTop: '4px', color: '#b91c1c' }}>
                              ⚠️ A emissão do relatório foi BLOQUEADA por segurança fiscal.
                            </div>
                          </>
                        ) : (
                          <>
                            O CNPJ do Destinatário da Nota (<strong>{destinatarioCnpj}</strong>) é exatamente igual ao CNPJ configurado do seu órgão.
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Formulário de Identificação da Nota */}
                <div className="card" style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 className="card-title" style={{ margin: 0 }}>
                      <FileText size={18} color="var(--primary)" />
                      Dados do Documento Fiscal
                    </h3>
                    <button className="btn btn-outline" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={limparFormulario}>
                      <RotateCcw size={12} /> Limpar
                    </button>
                  </div>

                  <div className="form-row">
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Tipo de Nota</label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                          type="button" 
                          className={`btn ${tipoDocumento === 'NFE' ? 'btn-primary' : 'btn-outline'}`}
                          onClick={() => setTipoDocumento('NFE')}
                          style={{ flex: 1, padding: '8px', fontSize: '0.8rem' }}
                        >
                          NF-e (Mercadoria / NCM)
                        </button>
                        <button 
                          type="button" 
                          className={`btn ${tipoDocumento === 'NFSE' ? 'btn-primary' : 'btn-outline'}`}
                          onClick={() => setTipoDocumento('NFSE')}
                          style={{ flex: 1, padding: '8px', fontSize: '0.8rem' }}
                        >
                          NFS-e (Serviço)
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Número da Nota</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        value={numeroNota} 
                        onChange={(e) => setNumeroNota(e.target.value)} 
                        placeholder="Ex: 4404 ou 257026"
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Chave de Acesso (Opcional)</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        value={chaveAcesso} 
                        onChange={(e) => setChaveAcesso(e.target.value)} 
                        placeholder="44 Dígitos da NF-e"
                      />
                    </div>
                  </div>

                  <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '16px' }}>
                    <div className="form-group">
                      <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Nº Processo Administrativo / SEI</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Padrão SEI</span>
                      </label>
                      <input 
                        type="text" 
                        className="form-input" 
                        value={numeroProcesso} 
                        onChange={(e) => {
                          const val = formatarProcessoSei(e.target.value);
                          setNumeroProcesso(val);
                          if (resultado) {
                            setResultado(prev => prev ? { ...prev, numeroProcesso: val } : null);
                          }
                        }} 
                        placeholder="Ex: 23068.012345/2026-99"
                        style={{ fontFamily: 'var(--font-mono)' }}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Documento Hábil - Liquidação</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Chave Integração</span>
                      </label>
                      <input 
                        type="text" 
                        className="form-input" 
                        value={documentoHabil} 
                        onChange={(e) => {
                          const val = e.target.value;
                          setDocumentoHabil(val);
                          if (resultado) {
                            setResultado(prev => prev ? { ...prev, documentoHabil: val } : null);
                          }
                        }} 
                        placeholder="Ex: 2026NS000123 / Chave"
                        style={{ fontFamily: 'var(--font-mono)' }}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Nota de Empenho (NE)</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        value={numeroEmpenho} 
                        onChange={(e) => {
                          const val = e.target.value.toUpperCase();
                          setNumeroEmpenho(val);
                          if (resultado) {
                            setResultado(prev => prev ? { ...prev, numeroEmpenho: val } : null);
                          }
                        }} 
                        placeholder="Ex: 2026NE000123"
                        style={{ fontFamily: 'var(--font-mono)' }}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">CNPJ do Fornecedor</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input 
                        type="text" 
                        className="form-input" 
                        value={fornecedorCnpj} 
                        onChange={(e) => setFornecedorCnpj(e.target.value)} 
                        placeholder="00.000.000/0000-00"
                      />
                      <button 
                        type="button" 
                        className="btn btn-outline" 
                        onClick={handleConsultarCnpj}
                        disabled={consultandoCnpj}
                        style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}
                      >
                        <Search size={14} /> {consultandoCnpj ? 'Consultando...' : 'Verificar Simples'}
                      </button>
                    </div>
                  </div>

                  {fornecedorCnpj && (
                    <div style={{ 
                      margin: '12px 0', 
                      padding: '8px 12px', 
                      borderRadius: 'var(--radius-sm)', 
                      background: optanteSimples ? '#fffbeb' : '#eff6ff',
                      border: optanteSimples ? '1px solid #fde68a' : '1px solid #bfdbfe',
                      fontSize: '0.8rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div>
                        <strong>Situação no Simples Nacional: </strong> 
                        <span style={{ color: optanteSimples ? '#d97706' : '#2563eb', fontWeight: 700 }}>
                          {optanteSimples ? 'OPTANTE PELO SIMPLES NACIONAL' : 'NÃO OPTANTE (REGIME NORMAL)'}
                        </span>
                        <span style={{ marginLeft: '8px', fontSize: '0.75rem', fontWeight: 600, color: '#16a34a' }}>
                          • Cadastral: {situacaoCadastral}
                        </span>
                        {fornecedorCidadeUf && (
                          <span style={{ marginLeft: '8px', fontSize: '0.75rem', fontWeight: 700, color: '#0369a1' }}>
                            • Município Sede: 📍 {fornecedorCidadeUf}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Fonte: Receita Federal</span>
                    </div>
                  )}

                  <div className="form-group">
                    <label className="form-label">Razão Social / Nome do Fornecedor</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={fornecedorNome} 
                      onChange={(e) => setFornecedorNome(e.target.value)} 
                      placeholder="Nome ou Razão Social conforme a Receita"
                    />
                  </div>

                  <div className="form-group" style={{ marginTop: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
                      <input 
                        type="checkbox" 
                        checked={optanteSimples} 
                        onChange={(e) => setOptanteSimples(e.target.checked)} 
                      />
                      <span>Optante pelo <strong>Simples Nacional</strong> (Dispensa de retenção federal - Art. 4º, XI da IN 1234/2012)</span>
                    </label>
                  </div>
                </div>

                {/* Opções Específicas de Serviço (NFS-e) */}
                {tipoDocumento === 'NFSE' && (
                  <div className="card" style={{ marginBottom: '20px', background: '#f8fafc', border: '1px solid #cbd5e1' }}>
                    <h3 className="card-title" style={{ margin: '0 0 12px 0' }}>
                      <Percent size={18} color="var(--primary)" />
                      Configurações de Serviços, ISS (Territorialidade) & INSS
                    </h3>

                    {/* Local da Prestação vs Cidade Sede do Órgão */}
                    <div style={{ marginBottom: '14px', padding: '10px 12px', borderRadius: '6px', background: '#ffffff', border: '1px solid #cbd5e1' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '6px' }}>
                        <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0369a1', margin: 0 }}>
                          📍 Local de Execução / Prestação do Serviço:
                        </label>
                        <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                          Regra LC 116/2003: ISS só incide se for executado em <strong>{municipioMeuOrgao}</strong>
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input 
                          type="text" 
                          className="form-input" 
                          style={{ padding: '6px 10px', fontSize: '0.82rem', flex: 1, fontWeight: 600 }}
                          value={localPrestacaoServico} 
                          onChange={(e) => setLocalPrestacaoServico(e.target.value)} 
                          placeholder={`Ex: ${municipioMeuOrgao}, Extrema, Belo Horizonte`}
                        />
                        <button 
                          type="button" 
                          className="btn btn-outline" 
                          style={{ padding: '6px 10px', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                          onClick={() => setLocalPrestacaoServico(municipioMeuOrgao)}
                        >
                          Usar {municipioMeuOrgao}
                        </button>
                      </div>
                      {localPrestacaoServico && localPrestacaoServico.trim().toUpperCase() !== municipioMeuOrgao.trim().toUpperCase() && (
                        <div style={{ marginTop: '6px', fontSize: '0.75rem', color: '#b45309', fontWeight: 600 }}>
                          ℹ️ Serviço executado fora de {municipioMeuOrgao} ({localPrestacaoServico}): Alíquota do ISS retido será 0,00% na fonte.
                        </div>
                      )}
                    </div>

                    <div className="form-row" style={{ gap: '16px', marginBottom: '12px' }}>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label className="form-label" style={{ fontWeight: 600 }}>Redução da Base de Cálculo do ISSQN (%)</label>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <input 
                            type="number" 
                            min="0"
                            max="100"
                            step="0.1" 
                            className="form-input" 
                            value={percentualReducaoIss} 
                            onChange={(e) => setPercentualReducaoIss(parseFloat(e.target.value) || 0)} 
                            placeholder="0%"
                            style={{ width: '90px' }}
                          />
                          <button 
                            type="button" 
                            className="btn btn-outline" 
                            style={{ padding: '6px 10px', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                            onClick={() => setPercentualReducaoIss(20)}
                            title="Aplicar 20% de Redução em Construção/Reforma (Lei Municipal nº 6.075/2003)"
                          >
                            ⚡ 20% (Construção/Reforma)
                          </button>
                          <button 
                            type="button" 
                            className="btn btn-outline" 
                            style={{ padding: '6px 8px', fontSize: '0.75rem' }}
                            onClick={() => setPercentualReducaoIss(0)}
                          >
                            0% (Integral)
                          </button>
                        </div>
                      </div>

                      <div className="form-group" style={{ flex: 1 }}>
                        <label className="form-label" style={{ fontWeight: 600 }}>Imposto Municipal (ISSQN)</label>
                        <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
                            <input 
                              type="checkbox" 
                              checked={retencaoIss} 
                              onChange={(e) => setRetencaoIss(e.target.checked)} 
                            />
                            <span>ISSQN Retido pelo Tomador na Fonte</span>
                          </label>

                          {retencaoIss && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '2px', background: '#ffffff', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.8rem', color: '#1e293b' }}>
                                <input 
                                  type="checkbox" 
                                  checked={habilitarAliquotaPersonalizadaIss} 
                                  onChange={(e) => setHabilitarAliquotaPersonalizadaIss(e.target.checked)} 
                                />
                                <span style={{ fontWeight: 600 }}>Alíquota Específica / Fornecedor</span>
                              </label>

                              {habilitarAliquotaPersonalizadaIss ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <input 
                                    type="number"
                                    min="0"
                                    max="10"
                                    step="0.01"
                                    className="form-input"
                                    value={aliquotaIssPersonalizada}
                                    onChange={(e) => setAliquotaIssPersonalizada(parseFloat(e.target.value) || 0)}
                                    style={{ width: '75px', padding: '4px 6px', fontSize: '0.82rem', fontWeight: 700, textAlign: 'right' }}
                                    placeholder="5.00"
                                  />
                                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>%</span>
                                </div>
                              ) : (
                                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                  (Padrão: 5,00% Vitória/ES)
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '10px', borderTop: '1px solid #e2e8f0' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
                        <input 
                          type="checkbox" 
                          checked={retencaoInss} 
                          onChange={(e) => setRetencaoInss(e.target.checked)} 
                        />
                        <span>Houve Cessão de Mão de Obra / Empreitada (Retenção INSS / Contribuição Previdenciária)</span>
                      </label>

                      {retencaoInss && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginLeft: '24px', background: '#ffffff', padding: '10px 12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <div>
                              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#334155' }}>Dedução de Materiais/Equipamentos da BC do INSS (R$): </span>
                              <input 
                                type="number"
                                step="0.01"
                                min="0"
                                className="form-input"
                                value={valorMateriaisInss}
                                onChange={(e) => setValorMateriaisInss(parseFloat(e.target.value) || 0)}
                                placeholder="R$ 0,00"
                                style={{ width: '130px', display: 'inline-block', marginLeft: '6px', fontWeight: 700, color: '#0f172a' }}
                              />
                            </div>

                            <div>
                              <span style={{ fontSize: '0.78rem', color: '#475569' }}>Valor do INSS Destacado (R$): </span>
                              <input 
                                type="number"
                                step="0.01"
                                min="0"
                                className="form-input"
                                value={valorInssDestacado}
                                onChange={(e) => setValorInssDestacado(parseFloat(e.target.value) || 0)}
                                placeholder="Automático (11%)"
                                style={{ width: '130px', display: 'inline-block', marginLeft: '6px' }}
                              />
                            </div>

                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>
                              <input 
                                type="checkbox" 
                                checked={optanteCprb} 
                                onChange={(e) => setOptanteCprb(e.target.checked)} 
                              />
                              <span>Empresa Optante pela CPRB (3,5%)</span>
                            </label>
                          </div>
                          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            💡 Conforme Art. 120 e 121 da IN RFB nº 2.110/2022, o valor dos materiais/equipamentos destacados na nota é abatido da base de cálculo, mantendo a alíquota oficial em 11%.
                          </span>
                        </div>
                      )}
                    </div>

                    <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #e2e8f0' }}>
                      <label className="form-label" style={{ fontWeight: 600, color: '#1e293b' }}>
                        🏦 Retenção para Conta-Depósito Vinculada (IN 5/2017 SEGES/ME)
                      </label>
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <input 
                          type="number"
                          step="0.01"
                          min="0"
                          className="form-input"
                          value={valorContaVinculada || ''}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setValorContaVinculada(val);
                            if (resultado) {
                              setResultado(prev => {
                                if (!prev) return null;
                                const totGeral = Number((prev.totalFederal + prev.totalInss + prev.totalIss + val).toFixed(2));
                                const liq = Number((prev.totalBruto - totGeral).toFixed(2));
                                return {
                                  ...prev,
                                  totalContaVinculada: val,
                                  totalRetidoGeral: totGeral,
                                  valorLiquido: liq
                                };
                              });
                            }
                          }}
                          placeholder="R$ 0,00"
                          style={{ width: '160px', fontWeight: 700, color: '#b45309' }}
                        />
                        <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                          Provisões trabalhistas (férias, 13º, rescisão) descontadas do pagamento e depositadas em Conta Vinculada.
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Detalhamento dos Itens / NCMs em formato de Tabela Interativa */}
                <div className="card">
                  <div className="card-header">
                    <div>
                      <h3 className="card-title">
                        <Layers size={18} color="var(--primary)" />
                        {tipoDocumento === 'NFE' ? 'Relação de Itens da Nota (NCM & CST)' : 'Valores do Serviço'}
                      </h3>
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {tipoDocumento === 'NFE' 
                          ? 'Cada item é analisado individualmente conforme o NCM e CST de PIS/COFINS.'
                          : 'Informações do serviço prestado para retenção.'}
                      </p>
                    </div>

                    <button className="btn btn-outline" type="button" onClick={handleAddItem} style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
                      <Plus size={14} /> Adicionar Item Manual
                    </button>
                  </div>

                  {itens.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '28px', background: '#f8fafc', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      Nenhum item adicionado ainda. Arraste um arquivo PDF/XML acima ou clique em <strong>"+ Adicionar Item Manual"</strong>.
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table className="tax-table" style={{ fontSize: '0.82rem' }}>
                        <thead>
                          <tr>
                            <th style={{ width: '40px' }}>Nº</th>
                            <th>DESCRIÇÃO DO PRODUTO / SERVIÇO</th>
                            {tipoDocumento === 'NFE' && <th style={{ width: '145px', minWidth: '145px' }}>NCM</th>}
                            {tipoDocumento === 'NFE' && <th style={{ width: '70px' }}>CST</th>}
                            <th style={{ width: '120px', textAlign: 'right' }}>VALOR (R$)</th>
                            {tipoDocumento === 'NFE' && <th style={{ width: '160px' }}>REGRA</th>}
                            <th style={{ width: '40px' }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {itens.map((item, index) => (
                            <tr key={index}>
                              <td style={{ fontWeight: 700, textAlign: 'center' }}>{index + 1}</td>
                              <td>
                                <input 
                                  type="text" 
                                  className="form-input" 
                                  style={{ padding: '6px 8px', fontSize: '0.82rem' }}
                                  value={item.descricao} 
                                  placeholder="Descrição do item"
                                  onChange={(e) => handleItemChange(index, 'descricao', e.target.value)} 
                                />
                              </td>
                              {tipoDocumento === 'NFE' && (
                                <td>
                                  <input 
                                    type="text" 
                                    className="form-input" 
                                    style={{ padding: '6px 10px', fontSize: '0.88rem', fontFamily: 'var(--font-mono)', fontWeight: 700, minWidth: '130px', boxSizing: 'border-box' }}
                                    value={item.ncm || ''} 
                                    onChange={(e) => handleItemChange(index, 'ncm', e.target.value)} 
                                    placeholder="30049059"
                                  />
                                </td>
                              )}
                              {tipoDocumento === 'NFE' && (
                                <td>
                                  <input 
                                    type="text" 
                                    className="form-input" 
                                    style={{ padding: '6px 8px', fontSize: '0.82rem', textAlign: 'center', fontFamily: 'var(--font-mono)' }}
                                    value={item.cst || '01'} 
                                    onChange={(e) => handleItemChange(index, 'cst', e.target.value)} 
                                    placeholder="04"
                                  />
                                </td>
                              )}
                              <td>
                                <input 
                                  type="number" 
                                  step="0.01" 
                                  className="form-input" 
                                  style={{ padding: '6px 8px', fontSize: '0.82rem', textAlign: 'right', fontWeight: 700 }}
                                  value={item.valorBruto || ''} 
                                  placeholder="0,00"
                                  onChange={(e) => handleItemChange(index, 'valorBruto', e.target.value)} 
                                />
                              </td>
                              {tipoDocumento === 'NFE' && (
                                <td>
                                  <select 
                                    className="form-select"
                                    value={item.condicaoEspecial || ''}
                                    onChange={(e) => handleItemChange(index, 'condicaoEspecial', e.target.value)}
                                    style={{ padding: '6px 8px', fontSize: '0.75rem' }}
                                  >
                                    <option value="">Automático (NCM/CST)</option>
                                    <option value="6147">Cód 6147 (5,85% Bens/Obras)</option>
                                    <option value="8767">Cód 8767 (2,20% Alíq. Zero)</option>
                                    <option value="6190">Cód 6190 (9,45% Serviços)</option>
                                    <option value="6175">Cód 6175 (7,05% Transporte)</option>
                                    <option value="8739">Cód 8739 (1,24% Combustível Varejo)</option>
                                    <option value="9060">Cód 9060 (4,89% Combustível Refinaria)</option>
                                    <option value="ISENTO">Cód ISENTO (0% Dispensa)</option>
                                  </select>
                                </td>
                              )}
                              <td style={{ textAlign: 'center' }}>
                                <button type="button" onClick={() => handleRemoveItem(index)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}>
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {itens.length > 0 && (
                    <button 
                      className="btn btn-primary btn-block" 
                      type="button" 
                      onClick={calcularRetencoes} 
                      disabled={temDivergenciaDestinatario || calculando}
                      style={{ 
                        marginTop: '16px',
                        opacity: (temDivergenciaDestinatario || calculando) ? 0.65 : 1,
                        cursor: (temDivergenciaDestinatario || calculando) ? 'not-allowed' : 'pointer',
                        background: temDivergenciaDestinatario ? '#ef4444' : undefined
                      }}
                    >
                      <Calculator size={18} />
                      {calculando 
                        ? 'Processando Cálculos e Regras...' 
                        : temDivergenciaDestinatario 
                          ? 'Bloqueado — CNPJ da Nota Pertence a Outro Estabelecimento' 
                          : 'Calcular Retenções e Gerar Relatório'}
                    </button>
                  )}

                  {/* Relatório e Certidão de Regularidade SICAF / SIAFI */}
                  {(fornecedorCnpj || sicafData || resultado?.sicaf) && (
                    <SicafCard 
                      sicaf={sicafData || resultado?.sicaf} 
                      cnpj={fornecedorCnpj || resultado?.fornecedorCnpj}
                      onRefresh={() => reconsultarSicaf()}
                      loading={consultandoSicaf}
                    />
                  )}
                </div>
              </div>

              {/* Painel Direito: Pré-Visualização e Relatório SEI */}
              <div className="right-panel" id="secao-relatorio-conferencia">
                {resultado ? (
                  <div>
                    <ReportPreview 
                      data={resultado} 
                      onClearAfterDownload={() => {
                        limparFormulario();
                        setMensagemSucesso('✓ Relatório PDF baixado e salvo no histórico! Tela limpa para a próxima análise.');
                        setTimeout(() => setMensagemSucesso(null), 6000);
                      }}
                      onUpdateData={(novoResultado) => {
                        setResultado(novoResultado);
                        if (novoResultado.numeroProcesso !== undefined) setNumeroProcesso(novoResultado.numeroProcesso);
                        if (novoResultado.documentoHabil !== undefined) setDocumentoHabil(novoResultado.documentoHabil);
                        if (novoResultado.numeroEmpenho !== undefined) setNumeroEmpenho(novoResultado.numeroEmpenho);
                        if (novoResultado.itens && novoResultado.itens.length > 0) {
                          setItens(novoResultado.itens.map(it => ({
                            numeroItem: it.numeroItem,
                            descricao: it.descricao,
                            ncm: it.ncm || '',
                            cst: it.cst || '01',
                            codigoServico: it.codigoServico,
                            valorBruto: it.valorBruto,
                            condicaoEspecial: it.codigoReceitaDarf || undefined
                          })));
                        }
                      }}
                    />
                  </div>
                ) : (
                  <div className="card empty-state">
                    <Sparkles size={48} color="var(--primary)" style={{ opacity: 0.4, marginBottom: '12px' }} />
                    <h3>Relatório de Retenção Tributária</h3>
                    <p>Envie um arquivo PDF/XML da nota fiscal ou preencha os dados à esquerda para calcular as retenções federais, INSS e ISSQN.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'historico' && (
          <HistoricoSearch 
            onSelectNota={handleSelectNotaDoHistorico} 
            onConsolidarNotas={(dados) => setProcessoModalData(dados)} 
          />
        )}
        {activeTab === 'anexo1' && <Anexo1Tab />}
        {activeTab === 'ncm' && <NcmMatrixTab />}
      </main>

      {/* Central de Triagem e Análise Paginada de Lote (Opção A) */}
      {loteTriagemAberto && loteTriagemNotas && (
        <LoteTriagemModal 
          notasIniciais={loteTriagemNotas} 
          onClose={() => setLoteTriagemAberto(false)}
        />
      )}

      {/* Modal de Processo de Pagamento Consolidado (Múltiplas Notas / Histórico) */}
      {processoModalData && (
        <ProcessoConsolidadoModal 
          dados={processoModalData} 
          onClose={() => setProcessoModalData(null)}
          podeSalvarNoBanco={activeTab === 'analise'} // Se veio de upload de lote, permite salvar no banco
        />
      )}
    </div>
  );
}
