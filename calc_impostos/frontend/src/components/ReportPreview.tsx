import React, { useState, useEffect } from 'react';
import { 
  Download, 
  Database, 
  CheckCircle2,
  ShieldCheck,
  Edit3,
  RefreshCw,
  Plus,
  Trash2,
  RotateCcw,
  Sliders,
  Check,
  AlertTriangle,
  Sparkles
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
  alertaIncompatibilidade?: string;
  sugestaoMemoria?: boolean;
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

export interface DadosSicafConsulta {
  encontrado: boolean;
  ativo: boolean;
  habilitadoLicitar: boolean;
  cnpj: string;
  nomeRazaoSocial?: string;
  nomeMunicipio?: string;
  ufSigla?: string;
  codigoCnae?: number;
  nomeCnae?: string;
  naturezaJuridicaNome?: string;
  porteEmpresaNome?: string;
  consultadoEm: string;
  fonteConsulta: string;
  mensagem: string;
  codigoAutenticidade?: string;
  falhaConexao?: boolean;
  status?: 'HABILITADO' | 'COM_RESTRICAO' | 'NAO_CADASTRADO' | 'INDISPONIVEL';
}

export interface ResultadoConsolidado {
  tipoDocumento: 'NFE' | 'NFSE';
  numeroNota: string;
  chaveAcesso?: string;
  numeroProcesso?: string;
  numeroEmpenho?: string;
  fornecedorNome: string;
  fornecedorCnpj: string;
  fornecedorMunicipio?: string;
  fornecedorUf?: string;
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
  localPrestacaoServico?: string;
  municipioTomador?: string;
  aliqIssAplicada?: number;
  totalRetidoGeral: number;
  valorLiquido: number;
  naturezasEFDReinf: { codigo: string; descricao: string; valor: number }[];
  codigosReceitaDarf: { codigo: string; valor: number }[];
  fundamentacaoLegalResumo: string[];
  alertasCriticaFiscal?: string[];

  auditoriaInss?: {
    aliquotaOficialEsperada: number;
    aliquotaEfetivaSobreTotal: number;
    valorInssEsperadoTotal: number;
    valorInssDestacado: number;
    correspondeAliquotaOficial: boolean;
    tipoApuracao: 'CONFERE_11_PORCENTO' | 'DIVERGENCIA_BASE_OU_ALIQUOTA' | 'ISENTO_OU_NAO_DESTACADO';
    mensagemAlerta?: string;
  };

  // Cruzamento e Histórico de Análises Anteriores
  jaAnalisadaAntes?: boolean;
  idRegistroHistorico?: number;
  dataAnaliseAnterior?: string;
  mensagemCruzamento?: string;

  // Consulta Pública ao SICAF (Compras.gov.br)
  sicaf?: DadosSicafConsulta;
}

export const gerarNomeArquivoPdf = (
  numeroNota?: string, 
  fornecedorNome?: string,
  numeroProcesso?: string
): string => {
  const razaoSocial = (fornecedorNome || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s_-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toUpperCase();

  const processoLimpo = (numeroProcesso || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\//g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  const nota = (numeroNota || '').trim();

  // "número do processo" + "Relatório Retenção" + "Nome Fornecedor".pdf
  // Ex: "23525.025209_2026-18_Relatorio_Retencao_ST_JUDE_MEDICAL_BRASIL_LTDA.pdf"
  if (processoLimpo) {
    if (razaoSocial) {
      return `${processoLimpo}_Relatorio_Retencao_${razaoSocial}.pdf`;
    }
    return `${processoLimpo}_Relatorio_Retencao.pdf`;
  }

  if (razaoSocial) {
    return `Relatorio_Retencao_Nota_${nota || 'S_N'}_${razaoSocial}.pdf`;
  }
  return `Relatorio_Retencao_Nota_${nota || 'S_N'}.pdf`;
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
  onClearAfterDownload?: () => void;
}

export const ReportPreview: React.FC<Props> = ({ data, onUpdateData, onClearAfterDownload }) => {
  const [currentData, setCurrentData] = useState<ResultadoConsolidado>(data);
  const [dadosOriginais, setDadosOriginais] = useState<ResultadoConsolidado>(data);
  const [modoEdicao, setModoEdicao] = useState(false);
  const [modificado, setModificado] = useState(false);
  const [recalculando, setRecalculando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [baixandoPdf, setBaixandoPdf] = useState(false);
  const [memorizando, setMemorizando] = useState(false);
  const [memorizadoSucesso, setMemorizadoSucesso] = useState(false);


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

  // Mapeamento oficial de alíquotas e naturezas padrão da IN 1234/2012 e Tabela DDF025 EFD-Reinf
  const TABELA_RECEITAS_DARF: Record<string, { ir: number; csll: number; cofins: number; pis: number; totalFed: number; reinfPadrao: string; desc: string }> = {
    '6147': { ir: 1.20, csll: 1.00, cofins: 3.00, pis: 0.65, totalFed: 5.85, reinfPadrao: '17009', desc: 'Mercadorias / Bens / Obras (5,85%)' },
    '6190': { ir: 4.80, csll: 1.00, cofins: 3.00, pis: 0.65, totalFed: 9.45, reinfPadrao: '17099', desc: 'Prestação de Serviços em Geral (9,45%)' },
    '6175': { ir: 2.40, csll: 1.00, cofins: 3.00, pis: 0.65, totalFed: 7.05, reinfPadrao: '17023', desc: 'Transporte de Passageiros / Cargas (7,05%)' },
    '8767': { ir: 1.20, csll: 1.00, cofins: 0.00, pis: 0.00, totalFed: 2.20, reinfPadrao: '17022', desc: 'Produtos / Medicamentos Alíquota Zero PIS/COFINS (2,20%)' },
    '8739': { ir: 0.24, csll: 1.00, cofins: 0.00, pis: 0.00, totalFed: 1.24, reinfPadrao: '17013', desc: 'Combustíveis de Varejistas / Distribuidores (1,24%)' },
    '9060': { ir: 0.24, csll: 1.00, cofins: 3.00, pis: 0.65, totalFed: 4.89, reinfPadrao: '17013', desc: 'Combustíveis de Refinarias / Produtores (4,89%)' },
    '8850': { ir: 2.40, csll: 1.00, cofins: 0.00, pis: 0.00, totalFed: 3.40, reinfPadrao: '17024', desc: 'Transporte Internacional de Passageiros (3,40%)' },
    '8863': { ir: 0.00, csll: 1.00, cofins: 3.00, pis: 0.65, totalFed: 4.65, reinfPadrao: '17025', desc: 'Cooperativas e Associações Profissionais (4,65%)' },
    '6188': { ir: 2.40, csll: 1.00, cofins: 3.00, pis: 0.65, totalFed: 7.05, reinfPadrao: '17026', desc: 'Bancos e Seguro Saúde (7,05%)' },
    'ISENTO': { ir: 0.00, csll: 0.00, cofins: 0.00, pis: 0.00, totalFed: 0.00, reinfPadrao: 'ISENTO', desc: 'Dispensa / Imune de Retenção Federal (0%)' },
  };

  // Mapeamento oficial de compatibilidade entre Código da Receita DARF e Naturezas de Rendimento (EFD-Reinf DDF025 / IN 1234/2012)
  const MAPA_DARF_NATUREZAS: Record<string, { naturezasValidas: string[]; darfSugeridoDesc: string }> = {
    '6147': {
      naturezasValidas: ['17001', '17002', '17003', '17004', '17005', '17006', '17007', '17008', '17009'],
      darfSugeridoDesc: '6147 (5,85% — Bens, Mercadorias, Obras c/ Materiais e Serviços Hospitalares)'
    },
    '6190': {
      naturezasValidas: ['17028', '17029', '17030', '17031', '17032', '17033', '17034', '17035', '17037', '17050', '17099'],
      darfSugeridoDesc: '6190 (9,45% — Serviços em Geral, Vigilância, Limpeza, Locação Mão de Obra)'
    },
    '6175': {
      naturezasValidas: ['17023'],
      darfSugeridoDesc: '6175 (7,05% — Passagens e Transporte de Passageiros)'
    },
    '8767': {
      naturezasValidas: ['17019', '17020', '17021', '17022'],
      darfSugeridoDesc: '8767 (2,20% — Medicamentos/Produtos com Alíquota Zero de PIS/COFINS)'
    },
    '8739': {
      naturezasValidas: ['17013', '17014', '17015'],
      darfSugeridoDesc: '8739 (1,24% — Combustíveis de Comerciantes Varejistas)'
    },
    '9060': {
      naturezasValidas: ['17013', '17014', '17015'],
      darfSugeridoDesc: '9060 (4,89% — Combustíveis de Refinarias / Produtores / Distribuidores)'
    },
    '8850': {
      naturezasValidas: ['17024'],
      darfSugeridoDesc: '8850 (3,40% — Transporte Internacional de Passageiros)'
    },
    '8863': {
      naturezasValidas: ['17025'],
      darfSugeridoDesc: '8863 (4,65% — Serviços de Cooperativas e Associações)'
    },
    '6188': {
      naturezasValidas: ['17026', '17027'],
      darfSugeridoDesc: '6188 (7,05% — Bancos e Seguro Saúde)'
    },
    'ISENTO': {
      naturezasValidas: ['ISENTO'],
      darfSugeridoDesc: 'ISENTO (0,00% — Rendimento Imune ou Não Sujeito a Retenção)'
    }
  };

  // Mapeamento reverso para encontrar o código DARF oficial a partir de uma Natureza de Rendimento
  const MAPA_NATUREZA_PARA_DARF: Record<string, string> = {
    '17001': '6147', '17002': '6147', '17003': '6147', '17004': '6147', '17005': '6147', '17006': '6147', '17007': '6147', '17008': '6147', '17009': '6147',
    '17013': '8739', '17014': '8739', '17015': '8739',
    '17019': '8767', '17020': '8767', '17021': '8767', '17022': '8767',
    '17023': '6175',
    '17024': '8850',
    '17025': '8863',
    '17026': '6188', '17027': '6188',
    '17028': '6190', '17029': '6190', '17030': '6190', '17031': '6190', '17032': '6190', '17033': '6190', '17034': '6190', '17035': '6190', '17037': '6190', '17050': '6190', '17099': '6190',
    'ISENTO': 'ISENTO'
  };

  const validarIncompatibilidadeItem = (codDarf?: string, natReinf?: string): { incompativel: boolean; mensagem?: string; darfEsperado?: string } => {
    if (!codDarf || !natReinf) return { incompativel: false };
    const darfLimpo = codDarf.trim().toUpperCase();
    const natLimpa = natReinf.trim().toUpperCase();

    const darfEsperado = MAPA_NATUREZA_PARA_DARF[natLimpa];
    if (darfEsperado) {
      if (darfEsperado !== darfLimpo && !(darfEsperado === '8739' && darfLimpo === '9060')) {
        return {
          incompativel: true,
          darfEsperado,
          mensagem: `A Natureza de Rendimento ${natLimpa} exige o DARF ${darfEsperado}, mas está selecionado o DARF ${darfLimpo}.`
        };
      }
    } else if (MAPA_DARF_NATUREZAS[darfLimpo]) {
      const info = MAPA_DARF_NATUREZAS[darfLimpo];
      if (!info.naturezasValidas.includes(natLimpa) && natLimpa !== 'OUTRO') {
        return {
          incompativel: true,
          mensagem: `A Natureza ${natLimpa} não é compatível com o DARF ${darfLimpo}. Naturezas aceitas: ${info.naturezasValidas.join(', ')}.`
        };
      }
    }
    return { incompativel: false };
  };

  const handleMudarPreset = (index: number, novoPreset: string) => {
    setItensEditados(prev => {
      const clone = [...prev];
      const it = { ...clone[index], preset: novoPreset };

      if (TABELA_RECEITAS_DARF[novoPreset]) {
        const conf = TABELA_RECEITAS_DARF[novoPreset];
        it.aliqIr = conf.ir;
        it.aliqCsll = conf.csll;
        it.aliqPis = conf.pis;
        it.aliqCofins = conf.cofins;
        it.codigoReceitaDarf = novoPreset;
        // Ajusta natureza de acordo com serviço ou mercadoria se for 6147
        if (novoPreset === '6147') {
          it.naturezaRendimentoReinf = currentData.tipoDocumento === 'NFSE' ? '17003' : '17009';
        } else {
          it.naturezaRendimentoReinf = conf.reinfPadrao;
        }
        // Nota: NÃO altera it.aliqIss nem it.aliqInss ao mudar preset federal, preservando as customizações do usuário!
      }

      clone[index] = it;
      return clone;
    });
    setModificado(true);
  };

  const handleAtualizarCampo = (index: number, campo: keyof ItemEditavel, valor: any) => {
    setItensEditados(prev => {
      const clone = [...prev];
      const it = { ...clone[index], [campo]: valor };

      // Se o usuário digitou ou selecionou um código DARF reconhecido (ex: 6147, 6190, 8767, etc.)
      if (campo === 'codigoReceitaDarf') {
        const codNormalizado = String(valor || '').trim().toUpperCase();
        if (TABELA_RECEITAS_DARF[codNormalizado]) {
          const conf = TABELA_RECEITAS_DARF[codNormalizado];
          it.aliqIr = conf.ir;
          it.aliqCsll = conf.csll;
          it.aliqPis = conf.pis;
          it.aliqCofins = conf.cofins;
          it.preset = codNormalizado;
          if (codNormalizado === '6147') {
            it.naturezaRendimentoReinf = currentData.tipoDocumento === 'NFSE' ? '17003' : '17009';
          } else {
            it.naturezaRendimentoReinf = conf.reinfPadrao;
          }
        }
      }

      // Se o usuário digitou ou selecionou uma Natureza de Rendimento que possui DARF correspondente
      if (campo === 'naturezaRendimentoReinf') {
        const natNormalizada = String(valor || '').trim().toUpperCase();
        const darfCorrespondente = MAPA_NATUREZA_PARA_DARF[natNormalizada];
        if (darfCorrespondente && darfCorrespondente !== it.codigoReceitaDarf) {
          if (TABELA_RECEITAS_DARF[darfCorrespondente]) {
            const conf = TABELA_RECEITAS_DARF[darfCorrespondente];
            it.codigoReceitaDarf = darfCorrespondente;
            it.aliqIr = conf.ir;
            it.aliqCsll = conf.csll;
            it.aliqPis = conf.pis;
            it.aliqCofins = conf.cofins;
            it.preset = darfCorrespondente;
          }
        }
      }

      clone[index] = it;
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
    // Crítica de Incompatibilidade entre Natureza e DARF
    const itensIncompativeis = itensEditados
      .map((it, idx) => ({ it, erro: validarIncompatibilidadeItem(it.codigoReceitaDarf, it.naturezaRendimentoReinf), idx }))
      .filter(x => x.erro.incompativel);

    if (itensIncompativeis.length > 0) {
      const msgs = itensIncompativeis.map(x => `• Item #${x.it.numeroItem}: ${x.erro.mensagem}`).join('\n');
      const prosseguir = confirm(
        `⚠️ ATENÇÃO: DIVERGÊNCIA FISCAL DETECTADA:\n\n${msgs}\n\nDeseja continuar com o recálculo mesmo com esta incompatibilidade?`
      );
      if (!prosseguir) {
        return;
      }
    }

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
        fornecedorMunicipio: currentData.fornecedorMunicipio,
        fornecedorUf: currentData.fornecedorUf,
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
        localPrestacaoServico: currentData.localPrestacaoServico,
        municipioTomador: currentData.municipioTomador,
        valorMateriaisInss: currentData.totalMateriaisInssDeducao,
        valorContaVinculada: currentData.totalContaVinculada,
        aliqIss: currentData.aliqIssAplicada,
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
          manualAliqInss: item.aliqInss !== undefined ? Number(item.aliqInss) : undefined,
          manualAliqIss: item.aliqIss !== undefined ? Number(item.aliqIss) : undefined,
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
      setDadosOriginais(resultadoNovo);
      setModificado(false);
      // Preserva e atualiza o estado de itensEditados com os valores recém recalculados pelo motor
      setItensEditados(resultadoNovo.itens.map(itemParaEditavel));
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
    let proc = (currentData.numeroProcesso || '').trim();
    if (!proc) {
      const digitado = prompt(
        '⚠️ O Número do Processo SEI é OBRIGATÓRIO para a instrução processual.\n\nPor favor, informe o Número do Processo (Ex: 23068.012345/2026-99):'
      );
      if (!digitado || !digitado.trim()) {
        alert('Geração de relatório cancelada: O número do processo SEI precisa ser informado.');
        return;
      }
      proc = digitado.trim();
      const atualizado = { ...currentData, numeroProcesso: proc };
      setCurrentData(atualizado);
      if (onUpdateData) onUpdateData(atualizado);
    }

    try {
      setBaixandoPdf(true);
      const payloadEnvio = { ...currentData, numeroProcesso: proc };

      const response = await fetch(`${API_BASE_URL}/api/gerar-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadEnvio)
      });

      if (!response.ok) throw new Error('Falha ao gerar PDF');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = gerarNomeArquivoPdf(currentData.numeroNota, currentData.fornecedorNome, proc);
      document.body.appendChild(a);
      a.click();
      a.remove();

      // Gravação automática no banco de dados ao gerar o relatório PDF
      try {
        setSalvando(true);
        const saveRes = await fetch(`${API_BASE_URL}/api/notas/salvar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadEnvio)
        });
        if (saveRes.ok) {
          setSalvo(true);
          setTimeout(() => setSalvo(false), 4000);
        }
      } catch (errSave) {
        console.warn('Gravação automática após download falhou:', errSave);
      } finally {
        setSalvando(false);
      }

      // Limpa os campos e o resultado da análise individual na tela após o download
      if (onClearAfterDownload) {
        setTimeout(() => {
          onClearAfterDownload();
        }, 700);
      }
    } catch (err: any) {
      alert('Erro ao baixar PDF: ' + err.message);
    } finally {
      setBaixandoPdf(false);
    }
  };

  const handleSalvarPostgres = async () => {
    try {
      setSalvando(true);
      const payloadParaSalvar = {
        ...currentData,
        numeroProcesso: currentData.numeroProcesso || null,
        numeroEmpenho: currentData.numeroEmpenho || null
      };
      const response = await fetch(`${API_BASE_URL}/api/notas/salvar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadParaSalvar)
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

  const handleMemorizarFornecedor = async () => {
    if (!currentData.fornecedorCnpj) {
      alert('Fornecedor não possui CNPJ identificado para memorização.');
      return;
    }
    const primeiroItem = currentData.itens[0];
    if (!primeiroItem) {
      alert('Nenhum item disponível para memorização.');
      return;
    }

    try {
      setMemorizando(true);
      const payloadMemoria = {
        fornecedorCnpj: currentData.fornecedorCnpj,
        fornecedorNome: currentData.fornecedorNome,
        ncmPadrao: primeiroItem.ncm || undefined,
        descricaoPadrao: primeiroItem.descricao || undefined,
        codigoReceitaDarf: primeiroItem.codigoReceitaDarf,
        naturezaReinf: primeiroItem.naturezaRendimentoReinf,
        aliqIr: primeiroItem.aliqIr,
        aliqCsll: primeiroItem.aliqCsll,
        aliqCofins: primeiroItem.aliqCofins,
        aliqPis: primeiroItem.aliqPis,
        aliqInss: primeiroItem.aliqInss,
        aliqIss: primeiroItem.aliqIss,
        condicaoAplicavel: primeiroItem.condicaoAplicavel,
        fundamentacao: primeiroItem.fundamentacaoLegal,
        observacoes: `Memorizado pelo auditor via análise da NF #${currentData.numeroNota || 'S/N'}`
      };

      const res = await fetch(`${API_BASE_URL}/api/fornecedores/memoria`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadMemoria)
      });

      if (!res.ok) throw new Error('Falha ao salvar regra na memória');

      setMemorizadoSucesso(true);
      setTimeout(() => setMemorizadoSucesso(false), 4000);
    } catch (err: any) {
      alert('Erro ao memorizar regra do fornecedor: ' + err.message);
    } finally {
      setMemorizando(false);
    }
  };

  return (
    <div>
      {/* Barra de Ações Rápidas */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            className={`btn ${modoEdicao ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setModoEdicao(!modoEdicao)}
            type="button"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
          >
            {modoEdicao ? <Check size={16} /> : <Edit3 size={16} />}
            {modoEdicao ? 'Concluir Edição de Itens' : 'Editar Itens / Ajuste Manual'}
          </button>

          <button
            className="btn btn-outline"
            onClick={handleMemorizarFornecedor}
            disabled={memorizando}
            type="button"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.82rem',
              borderColor: memorizadoSucesso ? '#16a34a' : '#d97706',
              color: memorizadoSucesso ? '#16a34a' : '#b45309',
              background: memorizadoSucesso ? '#f0fdf4' : '#fffbeb',
              fontWeight: 600
            }}
            title="Salva esta classificação tributária na Memória Inteligente deste fornecedor para aplicação automática em notas futuras"
          >
            <Sparkles size={15} color={memorizadoSucesso ? '#16a34a' : '#d97706'} />
            {memorizadoSucesso ? 'Regra Memorizada!' : memorizando ? 'Memorizando...' : 'Memorizar Padrão do Fornecedor'}
          </button>

          {modificado && (
            <span className="badge badge-warning" style={{ fontSize: '0.78rem', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              ✏️ Ajustes Manuais pelo Auditor
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {onClearAfterDownload && (
            <button
              type="button"
              className="btn btn-outline"
              onClick={onClearAfterDownload}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.85rem',
                color: '#64748b'
              }}
              title="Limpa a tela e os campos da nota para iniciar uma nova análise"
            >
              <RotateCcw size={15} />
              Limpar / Nova Análise
            </button>
          )}

          <button 
            className="btn btn-outline" 
            onClick={handleSalvarPostgres}
            disabled={salvando}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px', 
              fontSize: '0.85rem',
              borderColor: salvo ? '#16a34a' : '#059669',
              color: salvo ? '#16a34a' : '#059669',
              background: salvo ? '#f0fdf4' : '#ffffff',
              fontWeight: 600
            }}
          >
            {salvo ? <CheckCircle2 size={16} color="#16a34a" /> : <Database size={16} color="#059669" />}
            {salvo ? 'Salvo no Banco!' : salvando ? 'Gravando...' : 'Salvar no Banco de Dados'}
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
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#ffffff', padding: '4px 10px', borderRadius: '6px', border: '1px solid #bae6fd' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0369a1' }}>🏛️ Alíquota ISS (%):</span>
                  <input 
                    type="number"
                    step="0.01"
                    min="0"
                    max="10"
                    className="form-input"
                    value={currentData.aliqIssAplicada !== undefined ? currentData.aliqIssAplicada : 5.00}
                    placeholder="5.00"
                    onChange={(e) => {
                      const novaAliq = parseFloat(e.target.value) || 0;
                      setCurrentData(prev => ({
                        ...prev,
                        aliqIssAplicada: novaAliq
                      }));
                      setItensEditados(prev => prev.map(it => ({ ...it, aliqIss: novaAliq })));
                      setModificado(true);
                    }}
                    style={{ width: '80px', padding: '4px 6px', fontSize: '0.8rem', fontWeight: 700, color: '#0369a1', textAlign: 'right' }}
                  />
                </div>

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
              </>
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

          {/* Banner de Crítica Fiscal Consolidada no Painel de Edição */}
          {(() => {
            const incompativeis = itensEditados.filter(it => validarIncompatibilidadeItem(it.codigoReceitaDarf, it.naturezaRendimentoReinf).incompativel);
            if (incompativeis.length === 0) return null;
            return (
              <div style={{
                width: '100%',
                marginTop: '10px',
                padding: '10px 14px',
                borderRadius: '6px',
                background: '#fef2f2',
                border: '1px solid #ef4444',
                color: '#991b1b',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '0.82rem'
              }}>
                <AlertTriangle size={20} color="#dc2626" style={{ flexShrink: 0 }} />
                <div>
                  <strong>⚠️ Crítica Fiscal de Incompatibilidade:</strong> Existe(m) {incompativeis.length} item(ns) com Natureza de Rendimento incompatível com o Código DARF selecionado. Revise os alertas nos cards abaixo antes de recalcular ou salvar.
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Documento Visual Idêntico ao Modelo do SEI */}
      <div className="report-document">
        
        {/* Banner Informativo de Cruzamento / Nota já analisada antes */}
        {currentData.jaAnalisadaAntes && (
          <div style={{
            marginBottom: '16px',
            padding: '12px 16px',
            borderRadius: '8px',
            background: '#f0fdf4',
            border: '1px solid #86efac',
            color: '#166534',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={18} color="#16a34a" />
              <span>
                <strong>Cruzamento Automático do Histórico:</strong> {currentData.mensagemCruzamento || `Nota fiscal analisada anteriormente em ${currentData.dataAnaliseAnterior || 'data anterior'}.`}
              </span>
            </div>
            {currentData.numeroProcesso && (
              <span style={{
                background: '#dcfce7',
                color: '#15803d',
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: '6px',
                border: '1px solid #86efac',
                whiteSpace: 'nowrap'
              }}>
                Processo SEI: {currentData.numeroProcesso}
              </span>
            )}
          </div>
        )}

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
              {modoEdicao ? (
                <input
                  type="text"
                  className="form-input"
                  value={currentData.numeroNota || ''}
                  onChange={(e) => {
                    const novoNumero = e.target.value;
                    const atualizado = { ...currentData, numeroNota: novoNumero };
                    setCurrentData(atualizado);
                    setModificado(true);
                    if (onUpdateData) onUpdateData(atualizado);
                  }}
                  placeholder="Ex: 88618"
                  style={{ fontSize: '0.85rem', padding: '3px 6px', fontFamily: 'var(--font-mono)', fontWeight: 700, width: '100%', marginTop: '2px' }}
                />
              ) : (
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>{currentData.numeroNota || '---'}</div>
              )}
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
              {(currentData.fornecedorMunicipio || currentData.fornecedorUf) && (
                <div style={{ marginTop: '3px', fontSize: '0.75rem', color: '#475569', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>📍 Local da Sede:</span>
                  <span style={{ color: '#0f172a', fontWeight: 700 }}>
                    {currentData.fornecedorMunicipio ? currentData.fornecedorMunicipio : ''}{currentData.fornecedorUf ? ` / ${currentData.fornecedorUf}` : ''}
                  </span>
                </div>
              )}
            </div>
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
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span>
                      {currentData.tipoDocumento === 'NFE' 
                        ? `NCM ${item.ncm || 'Geral'} ${item.cst ? `• CST: ${item.cst}` : ''}` 
                        : `Cód. ${item.codigoServico || '6190'}`}
                    </span>
                    {item.sugestaoMemoria && (
                      <span style={{
                        background: '#ecfdf5',
                        color: '#065f46',
                        border: '1px solid #a7f3d0',
                        borderRadius: '4px',
                        padding: '1px 6px',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        <Sparkles size={12} color="#059669" /> Memória Tributária Aplicada
                      </span>
                    )}
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

              {(() => {
                const erro = validarIncompatibilidadeItem(item.codigoReceitaDarf, item.naturezaRendimentoReinf);
                if (!erro.incompativel) return null;
                return (
                  <div style={{
                    marginTop: '8px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: '#fef2f2',
                    border: '1px solid #f87171',
                    color: '#991b1b',
                    fontSize: '0.8rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <AlertTriangle size={16} color="#dc2626" />
                    <span><strong>Atenção (Incompatibilidade Tributária):</strong> {erro.mensagem}</span>
                  </div>
                );
              })()}
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
                      onChange={(e) => handleAtualizarCampo(index, 'aliqInss', parseFloat(e.target.value) || 0)}
                      style={{ padding: '4px 6px', fontSize: '0.8rem', textAlign: 'right' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.65rem', fontWeight: 700, color: '#0369a1', display: 'block' }}>ISS (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-input"
                      value={item.aliqIss}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        handleAtualizarCampo(index, 'aliqIss', val);
                        if (index === 0) {
                          setCurrentData(prev => ({ ...prev, aliqIssAplicada: val }));
                        }
                      }}
                      style={{ padding: '4px 6px', fontSize: '0.8rem', textAlign: 'right', fontWeight: 700, borderColor: '#38bdf8' }}
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
                      }}
                      placeholder="Ex: 6147, 6190, 8767, ISENTO"
                      style={{ padding: '6px 10px', fontSize: '0.85rem', fontFamily: 'var(--font-mono)', fontWeight: 700, width: '130px' }}
                    />
                    <select
                      className="form-select"
                      value={['6147', '6190', '6175', '8767', '8739', '9060', '8850', '8863', '6188', 'ISENTO'].includes(item.codigoReceitaDarf) ? item.codigoReceitaDarf : 'OUTRO'}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val !== 'OUTRO') {
                          handleAtualizarCampo(index, 'codigoReceitaDarf', val);
                        }
                      }}
                      style={{ fontSize: '0.8rem', padding: '4px 6px', flex: 1, borderColor: '#cbd5e1' }}
                    >
                      <option value="6147">6147 — Mercadorias / Bens em Geral / Obras / Hospitais (5,85%)</option>
                      <option value="6190">6190 — Prestação de Serviços em Geral (9,45%)</option>
                      <option value="6175">6175 — Transporte de Passageiros / Cargas (7,05%)</option>
                      <option value="8767">8767 — Medicamentos / Isenção ou Alíquota Zero PIS/COFINS (2,20%)</option>
                      <option value="8739">8739 — Combustíveis de Comerciantes Varejistas (1,24%)</option>
                      <option value="9060">9060 — Combustíveis de Refinarias / Produtores / Distribuidores (4,89%)</option>
                      <option value="8850">8850 — Transporte Internacional de Passageiros (3,40%)</option>
                      <option value="8863">8863 — Serviços Prestados por Associações / Cooperativas (4,65%)</option>
                      <option value="6188">6188 — Bancos / Instituições Financeiras / Seguro Saúde (7,05%)</option>
                      <option value="ISENTO">ISENTO — Dispensa / Imune de Retenção Federal (0%)</option>
                      <option value="OUTRO">Outro Código (digitar ao lado)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#0369a1', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                    📌 NATUREZA DE RENDIMENTO (EFD-REINF R-4020 - DDF025):
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      className="form-input"
                      value={item.naturezaRendimentoReinf}
                      onChange={(e) => {
                        handleAtualizarCampo(index, 'naturezaRendimentoReinf', e.target.value.toUpperCase());
                      }}
                      placeholder="Ex: 17009, 17008, 17022, 17099, 17033"
                      style={{ padding: '6px 10px', fontSize: '0.85rem', fontFamily: 'var(--font-mono)', fontWeight: 700, width: '130px' }}
                    />
                    <select
                      className="form-select"
                      value={['17001', '17002', '17003', '17004', '17005', '17006', '17007', '17008', '17009', '17013', '17014', '17015', '17019', '17020', '17021', '17022', '17023', '17024', '17025', '17026', '17027', '17028', '17029', '17030', '17031', '17032', '17033', '17034', '17035', '17037', '17050', '17099', 'ISENTO'].includes(item.naturezaRendimentoReinf) ? item.naturezaRendimentoReinf : 'OUTRO'}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val !== 'OUTRO') {
                          handleAtualizarCampo(index, 'naturezaRendimentoReinf', val);
                        }
                      }}
                      style={{ fontSize: '0.8rem', padding: '4px 6px', flex: 1, borderColor: '#cbd5e1' }}
                    >
                      <option value="17009">17009 — Mercadorias e bens em geral [DARF 6147]</option>
                      <option value="17008">17008 — Medicamentos / Higiene adquiridos de produtor/distribuidor [DARF 6147]</option>
                      <option value="17001">17001 — Alimentação [DARF 6147]</option>
                      <option value="17002">17002 — Energia elétrica [DARF 6147]</option>
                      <option value="17003">17003 — Serviços com emprego de materiais [DARF 6147]</option>
                      <option value="17004">17004 — Construção Civil por empreitada com materiais [DARF 6147]</option>
                      <option value="17005">17005 — Serviços hospitalares (art. 30 IN 1234) [DARF 6147]</option>
                      <option value="17006">17006 — Transporte de cargas em geral [DARF 6147]</option>
                      <option value="17007">17007 — Serviços de auxílio diagnóstico, terapia e patologia [DARF 6147]</option>
                      <option value="17022">17022 — Medicamentos / Produtos com Alíquota Zero de PIS/COFINS [DARF 8767]</option>
                      <option value="17019">17019 — Perfumaria/higiene do § 1º art. 22 adquiridos de varejo [DARF 8767]</option>
                      <option value="17020">17020 — Produtos do § 2º do art. 22 [DARF 8767]</option>
                      <option value="17021">17021 — Produtos das alíneas "c" a "k" inciso I art. 5º [DARF 8767]</option>
                      <option value="17013">17013 — Gasolina, diesel, GLP de varejistas [DARF 8739]</option>
                      <option value="17014">17014 — Álcool etílico de comerciante varejista [DARF 8739]</option>
                      <option value="17015">17015 — Biodiesel de distribuidores/varejistas [DARF 8739]</option>
                      <option value="17023">17023 — Passagens e transporte de passageiros [DARF 6175]</option>
                      <option value="17024">17024 — Transporte internacional de passageiros [DARF 8850]</option>
                      <option value="17025">17025 — Serviços de associações e cooperativas [DARF 8863]</option>
                      <option value="17026">17026 — Bancos e instituições financeiras [DARF 6188]</option>
                      <option value="17027">17027 — Seguro Saúde [DARF 6188]</option>
                      <option value="17099">17099 — Demais serviços prestados em geral [DARF 6190]</option>
                      <option value="17031">17031 — Vigilância [DARF 6190]</option>
                      <option value="17032">17032 — Limpeza e conservação [DARF 6190]</option>
                      <option value="17033">17033 — Locação / Cessão de mão de obra [DARF 6190]</option>
                      <option value="17028">17028 — Serviços de abastecimento de água [DARF 6190]</option>
                      <option value="17029">17029 — Telefone [DARF 6190]</option>
                      <option value="17030">17030 — Correio e telégrafos [DARF 6190]</option>
                      <option value="17034">17034 — Intermediação de negócios [DARF 6190]</option>
                      <option value="17035">17035 — Administração, locação ou cessão de bens [DARF 6190]</option>
                      <option value="17037">17037 — Plano de saúde humano/odontológico fixo por servidor [DARF 6190]</option>
                      <option value="17050">17050 — Propaganda e Publicidade (art. 16 § 4º) [DARF 6190]</option>
                      <option value="ISENTO">ISENTO — Rendimento não sujeito a retenção</option>
                      <option value="OUTRO">Outra Natureza (digitar ao lado)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Crítica visual de Incompatibilidade entre DARF e Natureza */}
              {(() => {
                const erro = validarIncompatibilidadeItem(item.codigoReceitaDarf, item.naturezaRendimentoReinf);
                if (!erro.incompativel) return null;
                return (
                  <div style={{
                    marginTop: '10px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: '#fef2f2',
                    border: '1px solid #f87171',
                    color: '#991b1b',
                    fontSize: '0.8rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <AlertTriangle size={18} color="#dc2626" />
                      <span><strong>Incompatibilidade Fiscal:</strong> {erro.mensagem}</span>
                    </div>
                    {erro.darfEsperado && (
                      <button
                        type="button"
                        onClick={() => {
                          handleAtualizarCampo(index, 'codigoReceitaDarf', erro.darfEsperado);
                        }}
                        style={{
                          background: '#dc2626',
                          color: '#ffffff',
                          border: 'none',
                          padding: '4px 10px',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        Corrigir para DARF {erro.darfEsperado}
                      </button>
                    )}
                  </div>
                );
              })()}
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

              <tr style={{ background: '#f7fee7', borderLeft: '4px solid #84cc16' }}>
                <td style={{ paddingLeft: '28px' }}>
                  <span style={{ color: '#4d7c0f', fontWeight: 800, marginRight: '6px' }}>↳</span>
                  <strong style={{ color: '#365314' }}>IR</strong> — Imposto de Renda
                </td>
                <td style={{ color: '#365314', fontWeight: 600 }}>{currentData.totalBruto > 0 ? `${((currentData.totalIr / currentData.totalBruto) * 100).toFixed(2)}%` : '0,00%'}</td>
                <td style={{ fontSize: '0.78rem', color: '#4d7c0f' }}>IN RFB nº 1.234/2012</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: '#365314' }}>{formatBRL(currentData.totalIr)}</td>
              </tr>
              <tr style={{ background: '#f7fee7', borderLeft: '4px solid #84cc16' }}>
                <td style={{ paddingLeft: '28px' }}>
                  <span style={{ color: '#4d7c0f', fontWeight: 800, marginRight: '6px' }}>↳</span>
                  <strong style={{ color: '#365314' }}>CSLL</strong> — Contribuição Social s/ Lucro
                </td>
                <td style={{ color: '#365314', fontWeight: 600 }}>{currentData.totalBruto > 0 ? `${((currentData.totalCsll / currentData.totalBruto) * 100).toFixed(2)}%` : '0,00%'}</td>
                <td style={{ fontSize: '0.78rem', color: '#4d7c0f' }}>IN RFB nº 1.234/2012</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: '#365314' }}>{formatBRL(currentData.totalCsll)}</td>
              </tr>
              <tr style={{ background: '#f7fee7', borderLeft: '4px solid #84cc16' }}>
                <td style={{ paddingLeft: '28px' }}>
                  <span style={{ color: '#4d7c0f', fontWeight: 800, marginRight: '6px' }}>↳</span>
                  <strong style={{ color: '#365314' }}>COFINS</strong> — Seguridade Social
                </td>
                <td style={{ color: '#365314', fontWeight: 600 }}>{currentData.totalBruto > 0 ? `${((currentData.totalCofins / currentData.totalBruto) * 100).toFixed(2)}%` : '0,00%'}</td>
                <td style={{ fontSize: '0.78rem', color: '#4d7c0f' }}>IN RFB nº 1.234/2012</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: '#365314' }}>{formatBRL(currentData.totalCofins)}</td>
              </tr>
              <tr style={{ background: '#f7fee7', borderLeft: '4px solid #84cc16', borderBottom: '1px solid #d9f99d' }}>
                <td style={{ paddingLeft: '28px' }}>
                  <span style={{ color: '#4d7c0f', fontWeight: 800, marginRight: '6px' }}>↳</span>
                  <strong style={{ color: '#365314' }}>PIS/PASEP</strong> — Integração Social
                </td>
                <td style={{ color: '#365314', fontWeight: 600 }}>{currentData.totalBruto > 0 ? `${((currentData.totalPis / currentData.totalBruto) * 100).toFixed(2)}%` : '0,00%'}</td>
                <td style={{ fontSize: '0.78rem', color: '#4d7c0f' }}>IN RFB nº 1.234/2012</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: '#365314' }}>{formatBRL(currentData.totalPis)}</td>
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
                <td>
                  {(() => {
                    const normalizar = (str?: string) => (str || '')
                      .normalize('NFD')
                      .replace(/[\u0300-\u036f]/g, '')
                      .replace(/[^A-Za-z0-9]/g, '')
                      .toUpperCase();

                    const prest = currentData.localPrestacaoServico ? currentData.localPrestacaoServico.trim() : (currentData.municipioTomador || 'Vitória');
                    const tomador = currentData.municipioTomador ? currentData.municipioTomador.trim() : 'Vitória';
                    const executadoFora = normalizar(prest) !== normalizar(tomador);

                    return (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <strong>ISSQN</strong> — Imposto Municipal ({tomador}/ES)
                          {executadoFora ? (
                            <span style={{ background: '#fef3c7', color: '#92400e', fontSize: '0.68rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px' }}>
                              FORA DO MUNICÍPIO (ALÍQ. 0%)
                            </span>
                          ) : (
                            <span style={{ background: '#dcfce7', color: '#15803d', fontSize: '0.68rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px' }}>
                              EXECUTADO LOCALMENTE ({prest})
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px' }}>
                          Local de Prestação: <strong>{prest}</strong>
                          {executadoFora ? (
                            <span> — Não cabe retenção na fonte pelo tomador em {tomador} (Art. 3º da LC nº 116/2003).</span>
                          ) : (
                            <span> — Retenção devida no município de {tomador} (Art. 3º da LC nº 116/2003).</span>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </td>
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
