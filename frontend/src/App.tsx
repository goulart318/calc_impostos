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
import { ReportPreview, type ResultadoConsolidado } from './components/ReportPreview';
import { HistoricoSearch } from './components/HistoricoSearch';
import { Anexo1Tab } from './components/Anexo1Tab';
import { NcmMatrixTab } from './components/NcmMatrixTab';
import { DashboardTab } from './components/DashboardTab';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'analise' | 'historico' | 'anexo1' | 'ncm'>('analise');
  
  // Estado do formulário de análise (100% limpo inicialmente)
  const [tipoDocumento, setTipoDocumento] = useState<'NFE' | 'NFSE'>('NFE');
  const [numeroNota, setNumeroNota] = useState('');
  const [chaveAcesso, setChaveAcesso] = useState('');
  const [fornecedorCnpj, setFornecedorCnpj] = useState('');
  const [fornecedorNome, setFornecedorNome] = useState('');
  const [optanteSimples, setOptanteSimples] = useState(false);
  const [situacaoCadastral, setSituacaoCadastral] = useState('ATIVA');
  const [consultandoCnpj, setConsultandoCnpj] = useState(false);

  // CNPJ do Órgão do Usuário (Configurável e Salvo em LocalStorage)
  const [cnpjMeuEstabelecimento, setCnpjMeuEstabelecimento] = useState<string>(() => {
    return localStorage.getItem('cnpj_orgao_configurado') || '15.126.437/0006-58';
  });

  const handleSalvarCnpjConfigurado = (val: string) => {
    setCnpjMeuEstabelecimento(val);
    localStorage.setItem('cnpj_orgao_configurado', val);
  };

  // Dados do Destinatário/Tomador da Nota Fiscal Lido do Documento
  const [destinatarioCnpj, setDestinatarioCnpj] = useState<string>('');
  const [destinatarioNome, setDestinatarioNome] = useState<string>('');

  // Itens (Vazio por padrão)
  const [itens, setItens] = useState<any[]>([]);

  // Estados de NFS-e (Serviços)
  const [percentualReducaoIss, setPercentualReducaoIss] = useState<number>(0);
  const [retencaoIss, setRetencaoIss] = useState<boolean>(true); // DEFAULT = TRUE para tomador público
  const [valorInssDestacado, setValorInssDestacado] = useState<number>(0);
  const [valorMateriaisInss, setValorMateriaisInss] = useState<number>(0);
  const [valorContaVinculada, setValorContaVinculada] = useState<number>(0);
  const [retencaoInss, setRetencaoInss] = useState<boolean>(false);
  const [optanteCprb, setOptanteCprb] = useState(false);

  // Estado de Drag and Drop e Upload
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

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
    setFornecedorCnpj('');
    setFornecedorNome('');
    setOptanteSimples(false);
    setDestinatarioCnpj('');
    setDestinatarioNome('');
    setPercentualReducaoIss(0);
    setRetencaoIss(true);
    setValorInssDestacado(0);
    setValorContaVinculada(0);
    setRetencaoInss(false);
    setItens([]);
    setResultado(null);
  };

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
      const payload = {
        tipoDocumento,
        numeroNota: numeroNota || 'S/N',
        chaveAcesso,
        fornecedorNome: fornecedorNome || 'Fornecedor Não Informado',
        fornecedorCnpj: fornecedorCnpj || '',
        destinatarioNome,
        destinatarioCnpj,
        optanteSimples,
        percentualReducaoIss,
        retencaoIss,
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

      const res = await fetch('http://localhost:3001/api/analisar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        setResultado(data);
      }
    } catch (err) {
      console.warn('Erro no cálculo:', err);
    }
  };

  const handleConsultarCnpj = async () => {
    if (!fornecedorCnpj) return;
    try {
      setConsultandoCnpj(true);
      const res = await fetch(`http://localhost:3001/api/consultar-cnpj/${fornecedorCnpj.replace(/\D/g, '')}`);
      if (res.ok) {
        const data = await res.json();
        setFornecedorNome(data.razaoSocial || fornecedorNome);
        setOptanteSimples(data.optanteSimples);
        if (data.situacaoCadastral) setSituacaoCadastral(data.situacaoCadastral);
      }
    } catch (e) {
      alert('Não foi possível consultar o CNPJ.');
    } finally {
      setConsultandoCnpj(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    const isXml = file.name.endsWith('.xml');
    const isPdf = file.name.endsWith('.pdf');

    if (!isXml && !isPdf) {
      alert('Por favor, envie um arquivo XML ou PDF (DANFE).');
      return;
    }

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('arquivo', file);
      formData.append('file', file);

      const endpoint = isXml ? 'http://localhost:3001/api/upload-xml' : 'http://localhost:3001/api/upload-pdf';
      const res = await fetch(endpoint, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Falha ao processar arquivo.');
      }

      const data: ResultadoConsolidado = await res.json();
      setResultado(data);

      setNumeroNota(data.numeroNota || '');
      setChaveAcesso(data.chaveAcesso || '');
      setFornecedorCnpj(data.fornecedorCnpj || '');
      setFornecedorNome(data.fornecedorNome || '');
      setDestinatarioCnpj(data.destinatarioCnpj || '');
      setDestinatarioNome(data.destinatarioNome || '');
      setOptanteSimples(data.optanteSimples || false);

      if (data.tipoDocumento === 'NFSE') {
        setTipoDocumento('NFSE');
        setPercentualReducaoIss(data.percentualReducaoIssAplicado || 0);
        setRetencaoIss(data.issRetidoTomador !== undefined ? data.issRetidoTomador : true);
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
        condicaoEspecial: it.codigoReceitaDarf === '8767' ? '8767' : (it.codigoReceitaDarf === '6147' ? '6147' : undefined)
      })));
    } catch (err: any) {
      alert('Erro na leitura do arquivo: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSelectNotaDoHistorico = (nota: ResultadoConsolidado) => {
    setResultado(nota);
    setTipoDocumento(nota.tipoDocumento);
    setNumeroNota(nota.numeroNota || '');
    setChaveAcesso(nota.chaveAcesso || '');
    setFornecedorCnpj(nota.fornecedorCnpj || '');
    setFornecedorNome(nota.fornecedorNome || '');
    setDestinatarioCnpj(nota.destinatarioCnpj || '');
    setDestinatarioNome(nota.destinatarioNome || '');
    setOptanteSimples(nota.optanteSimples || false);
    setSituacaoCadastral(nota.situacaoCadastral || 'ATIVA');

    if (nota.tipoDocumento === 'NFSE') {
      setPercentualReducaoIss(nota.percentualReducaoIssAplicado || 0);
      setRetencaoIss(nota.issRetidoTomador !== undefined ? nota.issRetidoTomador : true);
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
      condicaoEspecial: it.codigoReceitaDarf === '8767' ? '8767' : (it.codigoReceitaDarf === '6147' ? '6147' : undefined)
    })));

    setActiveTab('analise');
  };

  const handleSalvarAnaliseNoBanco = async () => {
    if (!resultado) return;
    try {
      const res = await fetch('http://localhost:3001/api/notas/salvar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resultado)
      });
      if (res.ok) {
        alert(' Análise fiscal gravada com sucesso no histórico do PostgreSQL!');
      } else {
        alert('Erro ao gravar análise no banco de dados.');
      }
    } catch (e) {
      alert('Erro de conexão ao salvar no banco.');
    }
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
        {activeTab === 'analise' && (
          <div className="tab-pane active">
            <div className="two-column-layout">
              {/* Painel Esquerdo: Entrada de Dados */}
              <div className="left-panel">
                {/* Upload de Nota Fiscal (XML ou PDF) */}
                <div 
                  className={`card drop-zone ${isDragging ? 'dragging' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      handleFileUpload(e.dataTransfer.files[0]);
                    }
                  }}
                  style={{ marginBottom: '16px', textOverflow: 'ellipsis' }}
                >
                  <UploadCloud size={36} color="var(--primary)" style={{ marginBottom: '8px' }} />
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 4px 0' }}>
                    {uploading ? 'Processando e consultando Receita Federal...' : 'Importar Nota Fiscal (PDF ou XML)'}
                  </h3>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
                    O sistema extrai o CNPJ, NCMs, itens e valores automaticamente
                  </p>
                  
                  <input 
                    type="file" 
                    id="file-upload" 
                    accept=".pdf,.xml" 
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleFileUpload(e.target.files[0]);
                      }
                    }} 
                  />
                  <label htmlFor="file-upload" className="btn btn-outline" style={{ marginTop: '12px', fontSize: '0.8rem' }}>
                    Selecionar Arquivo
                  </label>
                </div>

                {/* Card de Configuração do CNPJ do Órgão / Estabelecimento */}
                <div className="card" style={{ background: '#f8fafc', border: '1px solid #cbd5e1', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                      <strong style={{ fontSize: '0.85rem', color: 'var(--text-main)' }}>🏢 CNPJ do Seu Órgão / Estabelecimento (Configurável):</strong>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Usado para validar se a nota fiscal foi emitida para o seu estabelecimento.</div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input 
                        type="text" 
                        className="form-input" 
                        style={{ padding: '4px 8px', fontSize: '0.82rem', width: '170px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}
                        value={cnpjMeuEstabelecimento} 
                        onChange={(e) => handleSalvarCnpjConfigurado(e.target.value)} 
                        placeholder="15.126.437/0006-58"
                      />
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
                      Configurações de Serviços, ISS (Vitória/ES) & INSS
                    </h3>

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
                        <label className="form-label" style={{ fontWeight: 600 }}>Imposto Municipal (ISSQN 5%)</label>
                        <div style={{ marginTop: '6px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
                            <input 
                              type="checkbox" 
                              checked={retencaoIss} 
                              onChange={(e) => setRetencaoIss(e.target.checked)} 
                            />
                            <span>ISSQN Retido pelo Tomador na Fonte (Vitória/ES)</span>
                          </label>
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
                          value={valorContaVinculada}
                          onChange={(e) => setValorContaVinculada(parseFloat(e.target.value) || 0)}
                          placeholder="R$ 0,00"
                          style={{ width: '160px', fontWeight: 700, color: '#0f172a' }}
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
                                    <option value="8767">Cód 8767 (2,20% Alíq. Zero)</option>
                                    <option value="6147">Cód 6147 (5,85% Geral)</option>
                                    <option value="8739">Cód 8739 (1,24% Combustível)</option>
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
                      disabled={temDivergenciaDestinatario}
                      style={{ 
                        marginTop: '16px',
                        opacity: temDivergenciaDestinatario ? 0.65 : 1,
                        cursor: temDivergenciaDestinatario ? 'not-allowed' : 'pointer',
                        background: temDivergenciaDestinatario ? '#ef4444' : undefined
                      }}
                    >
                      <Calculator size={18} />
                      {temDivergenciaDestinatario 
                        ? 'Bloqueado — CNPJ da Nota Pertence a Outro Estabelecimento' 
                        : 'Calcular Retenções e Gerar Relatório'}
                    </button>
                  )}
                </div>
              </div>

              {/* Painel Direito: Pré-Visualização e Relatório SEI */}
              <div className="right-panel">
                {resultado ? (
                  <div>
                    <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                      <button 
                        className="btn-primary" 
                        type="button" 
                        onClick={handleSalvarAnaliseNoBanco}
                        style={{ padding: '8px 16px', fontSize: '0.85rem', background: '#059669' }}
                      >
                        <Database size={16} /> Salvar Análise no Banco de Dados
                      </button>
                    </div>
                    <ReportPreview data={resultado} />
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
        {activeTab === 'historico' && <HistoricoSearch onSelectNota={handleSelectNotaDoHistorico} />}
        {activeTab === 'anexo1' && <Anexo1Tab />}
        {activeTab === 'ncm' && <NcmMatrixTab />}
      </main>
    </div>
  );
}
