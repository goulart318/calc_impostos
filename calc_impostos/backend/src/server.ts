import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { initDatabase, pool } from './config/db';
import { TaxEngine, ParametrosCalculo, ResultadoConsolidado } from './services/taxEngine';
import { NfeParser } from './services/nfeParser';
import { PdfParser } from './services/pdfParser';
import { XmlParser } from './services/xmlParser';
import { CnpjService } from './services/cnpjService';
import { PdfReportGenerator } from './services/pdfReportGenerator';
import { HistoryService } from './services/historyService';
import { SupplierMemoryService } from './services/supplierMemoryService';
import { SicafService, DadosSicafConsulta } from './services/sicafService';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

const upload = multer({ storage: multer.memoryStorage() });

// Middleware universal de upload (aceita qualquer nome de campo: 'arquivo', 'file', etc)
const uploadSingleFile = (req: Request, res: Response, next: any) => {
  upload.any()(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: 'Erro no envio do arquivo: ' + err.message });
    }
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      req.file = req.files[0];
    }
    next();
  });
};

// Inicializa o banco de dados
initDatabase();

/**
 * Cruza a nota fiscal analisada com o histórico no banco de dados.
 * Se já foi analisada antes, preenche automaticamente o número do processo SEI e nota de empenho,
 * além de persistir/atualizar o registro sem gerar duplicidade.
 */
async function cruzarComHistoricoEAutoPreencher(
  resultado: ResultadoConsolidado,
  processoInformadoReq?: string,
  empenhoInformadoReq?: string
): Promise<ResultadoConsolidado> {
  try {
    // 1. Consulta concomitante ao SICAF se ainda não preenchida
    if (!resultado.sicaf && resultado.fornecedorCnpj) {
      try {
        resultado.sicaf = await SicafService.consultarSicaf(resultado.fornecedorCnpj);
      } catch (errSicaf: any) {
        console.warn('Aviso na consulta ao SICAF:', errSicaf?.message || errSicaf);
      }
    }

    const notaAnterior = await HistoryService.buscarNotaHistorico({
      chaveAcesso: resultado.chaveAcesso,
      numeroNota: resultado.numeroNota,
      fornecedorCnpj: resultado.fornecedorCnpj,
      tipoDocumento: resultado.tipoDocumento
    });

    if (notaAnterior) {
      resultado.jaAnalisadaAntes = true;
      resultado.idRegistroHistorico = notaAnterior.id;
      if (notaAnterior.updatedAt || notaAnterior.createdAt) {
        const dt = new Date(notaAnterior.updatedAt || notaAnterior.createdAt);
        resultado.dataAnaliseAnterior = dt.toLocaleDateString('pt-BR') + ' às ' + dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      }

      // Se a requisição atual não enviou o número do processo, preenche automaticamente do histórico!
      const procReq = (processoInformadoReq || '').trim();
      if (!procReq && !resultado.numeroProcesso && notaAnterior.numeroProcesso) {
        resultado.numeroProcesso = notaAnterior.numeroProcesso;
      }

      // Se a requisição atual não enviou a nota de empenho, preenche automaticamente do histórico!
      const empReq = (empenhoInformadoReq || '').trim();
      if (!empReq && !resultado.numeroEmpenho && notaAnterior.numeroEmpenho) {
        resultado.numeroEmpenho = notaAnterior.numeroEmpenho;
      }

      if (resultado.numeroProcesso) {
        resultado.mensagemCruzamento = `✓ Nota fiscal já analisada anteriormente (${resultado.dataAnaliseAnterior || 'no histórico'}). Processo SEI (${resultado.numeroProcesso}) preenchido automaticamente.`;
      } else {
        resultado.mensagemCruzamento = `✓ Nota fiscal já analisada anteriormente (${resultado.dataAnaliseAnterior || 'no histórico'}).`;
      }
    }

    // Persistência automática no banco (UPSERT sem duplicidade)
    const saveRes = await HistoryService.salvarOuAtualizarNota(resultado);
    resultado.idRegistroHistorico = saveRes.id;
    if (saveRes.numeroProcesso && !resultado.numeroProcesso) {
      resultado.numeroProcesso = saveRes.numeroProcesso;
    }
    if (saveRes.numeroEmpenho && !resultado.numeroEmpenho) {
      resultado.numeroEmpenho = saveRes.numeroEmpenho;
    }
  } catch (err: any) {
    console.warn('Aviso no cruzamento histórico:', err?.message || err);
  }

  return resultado;
}

// =========================================================================
// 1. ENDPOINTS DE PROCESSAMENTO E CÁLCULO FISCAL
// =========================================================================

// Cálculo direto a partir de parâmetros
app.post('/api/analisar', async (req: Request, res: Response) => {
  try {
    const params: ParametrosCalculo = req.body;
    const resultado = await TaxEngine.processarNota(params);
    await cruzarComHistoricoEAutoPreencher(resultado, req.body.numeroProcesso, req.body.numeroEmpenho);
    res.json(resultado);
  } catch (error: any) {
    console.error('Erro na análise:', error);
    res.status(400).json({ error: error.message || 'Erro ao processar retenções.' });
  }
});

// Upload e Parser de XML (NF-e ou NFS-e)
app.post('/api/upload-xml', uploadSingleFile, async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo XML enviado.' });
    }

    const notaExtraida = await XmlParser.parseXml(req.file.buffer);

    let optanteSimples = false;
    let optanteSimei = false;
    let dataOpcaoSimples = undefined;
    let fonteConsultaCnpj = undefined;
    let situacaoCadastral = 'ATIVA';

    let fornecedorMunicipio = undefined;
    let fornecedorUf = undefined;
    let sicafConsulta: DadosSicafConsulta | undefined = undefined;

    if (notaExtraida.fornecedorCnpj) {
      try {
        // Consulta CNPJ (Receita/Simples) e SICAF (Compras.gov.br) de forma CONCOMITANTE
        const [cnpjInfo, sicafInfo] = await Promise.all([
          CnpjService.consultarCnpj(notaExtraida.fornecedorCnpj).catch(e => {
            console.warn('Aviso na consulta ao CNPJ:', e?.message || e);
            return null;
          }),
          SicafService.consultarSicaf(notaExtraida.fornecedorCnpj).catch(e => {
            console.warn('Aviso na consulta ao SICAF:', e?.message || e);
            return null;
          })
        ]);

        if (cnpjInfo) {
          optanteSimples = cnpjInfo.optanteSimples;
          optanteSimei = cnpjInfo.optanteSimei;
          dataOpcaoSimples = cnpjInfo.dataOpcaoSimples;
          fonteConsultaCnpj = cnpjInfo.fonteConsulta;
          situacaoCadastral = cnpjInfo.situacaoCadastral;
          fornecedorMunicipio = cnpjInfo.municipio;
          fornecedorUf = cnpjInfo.uf;
          if (cnpjInfo.razaoSocial && (!notaExtraida.fornecedorNome || notaExtraida.fornecedorNome === 'Fornecedor Desconhecido')) {
            notaExtraida.fornecedorNome = cnpjInfo.razaoSocial;
          }
        }

        if (sicafInfo) {
          sicafConsulta = sicafInfo;
        }
      } catch (e) {
        console.warn('Não foi possível verificar Simples Nacional/SICAF via API:', e);
      }
    }

    const params: ParametrosCalculo = {
      tipoDocumento: notaExtraida.tipoDocumento,
      numeroNota: notaExtraida.numeroNota,
      chaveAcesso: notaExtraida.chaveAcesso,
      numeroProcesso: req.body.numeroProcesso ? String(req.body.numeroProcesso).trim() : undefined,
      numeroEmpenho: req.body.numeroEmpenho ? String(req.body.numeroEmpenho).trim() : undefined,
      fornecedorNome: notaExtraida.fornecedorNome,
      fornecedorCnpj: notaExtraida.fornecedorCnpj,
      fornecedorMunicipio: req.body.fornecedorMunicipio || fornecedorMunicipio,
      fornecedorUf: req.body.fornecedorUf || fornecedorUf,
      destinatarioNome: notaExtraida.destinatarioNome,
      destinatarioCnpj: notaExtraida.destinatarioCnpj,
      optanteSimples: optanteSimples,
      situacaoCadastral: situacaoCadastral,
      dataEmissao: notaExtraida.dataEmissao,
      itens: notaExtraida.itens,
      codigoServicoPadrao: notaExtraida.codigoServicoNfse || '6190',
      aliqIss: 5.00,
      percentualReducaoIss: parseFloat(String(req.body.percentualReducaoIss)) || notaExtraida.percentualReducaoIssNfse || 0,
      retencaoIss: req.body.retencaoIss !== undefined ? (req.body.retencaoIss === 'true' || req.body.retencaoIss === true) : (notaExtraida.issqnRetidoTomador !== undefined ? notaExtraida.issqnRetidoTomador : true),
      valorInssDestacado: parseFloat(String(req.body.valorInssDestacado)) || notaExtraida.destaqueInss || 0,
      valorMateriaisInss: parseFloat(String(req.body.valorMateriaisInss)) || (notaExtraida.percentualReducaoIssNfse ? Number((notaExtraida.valorTotal * (notaExtraida.percentualReducaoIssNfse / 100)).toFixed(2)) : 0),
      valorContaVinculada: parseFloat(String(req.body.valorContaVinculada)) || 0,
      retencaoInss: (notaExtraida.destaqueInss && notaExtraida.destaqueInss > 0) ? true : Boolean(req.body.retencaoInss),
      sicaf: sicafConsulta
    };

    const resultado = await TaxEngine.processarNota(params);
    resultado.optanteSimei = optanteSimei;
    resultado.dataOpcaoSimples = dataOpcaoSimples;
    resultado.fonteConsultaCnpj = fonteConsultaCnpj;

    await cruzarComHistoricoEAutoPreencher(resultado, req.body.numeroProcesso, req.body.numeroEmpenho);

    res.json(resultado);
  } catch (error: any) {
    console.error('Erro no processamento do XML:', error);
    res.status(400).json({ error: error.message || 'Erro ao processar arquivo XML.' });
  }
});

// Upload e Parser de PDF (DANFE ou NFS-e)
app.post('/api/upload-pdf', uploadSingleFile, async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo PDF enviado.' });
    }

    const notaExtraida = await PdfParser.parsePdf(req.file.buffer);

    let optanteSimples = false;
    let optanteSimei = false;
    let dataOpcaoSimples = undefined;
    let fonteConsultaCnpj = undefined;
    let situacaoCadastral = 'ATIVA';
    let fornecedorMunicipio = undefined;
    let fornecedorUf = undefined;
    let sicafConsultaPdf: DadosSicafConsulta | undefined = undefined;

    if (notaExtraida.fornecedorCnpj) {
      try {
        // Consulta CNPJ (Receita/Simples) e SICAF (Compras.gov.br) de forma CONCOMITANTE
        const [cnpjInfo, sicafInfo] = await Promise.all([
          CnpjService.consultarCnpj(notaExtraida.fornecedorCnpj).catch(e => {
            console.warn('Aviso na consulta ao CNPJ do PDF:', e?.message || e);
            return null;
          }),
          SicafService.consultarSicaf(notaExtraida.fornecedorCnpj).catch(e => {
            console.warn('Aviso na consulta ao SICAF do PDF:', e?.message || e);
            return null;
          })
        ]);

        if (cnpjInfo) {
          optanteSimples = cnpjInfo.optanteSimples;
          optanteSimei = cnpjInfo.optanteSimei;
          dataOpcaoSimples = cnpjInfo.dataOpcaoSimples;
          fonteConsultaCnpj = cnpjInfo.fonteConsulta;
          situacaoCadastral = cnpjInfo.situacaoCadastral;
          fornecedorMunicipio = cnpjInfo.municipio;
          fornecedorUf = cnpjInfo.uf;
          if (cnpjInfo.razaoSocial) {
            notaExtraida.fornecedorNome = cnpjInfo.razaoSocial;
          }
        }

        if (sicafInfo) {
          sicafConsultaPdf = sicafInfo;
        }
      } catch (e) {
        console.warn('Não foi possível consultar CNPJ/SICAF do PDF:', e);
      }
    }

    let municipioTomador = 'Vitória';
    if (notaExtraida.destinatarioCnpj) {
      try {
        const infoTom = await CnpjService.consultarCnpj(notaExtraida.destinatarioCnpj);
        if (infoTom.municipio) municipioTomador = infoTom.municipio;
      } catch (e) {
        // Fallback
      }
    }

    const params: ParametrosCalculo = {
      tipoDocumento: notaExtraida.tipoDocumento,
      numeroNota: notaExtraida.numeroNota,
      chaveAcesso: notaExtraida.chaveAcesso,
      numeroProcesso: req.body.numeroProcesso ? String(req.body.numeroProcesso).trim() : undefined,
      numeroEmpenho: req.body.numeroEmpenho ? String(req.body.numeroEmpenho).trim() : notaExtraida.numeroEmpenho,
      fornecedorNome: notaExtraida.fornecedorNome,
      fornecedorCnpj: notaExtraida.fornecedorCnpj,
      fornecedorMunicipio: req.body.fornecedorMunicipio || fornecedorMunicipio,
      fornecedorUf: req.body.fornecedorUf || fornecedorUf,
      destinatarioNome: notaExtraida.destinatarioNome,
      destinatarioCnpj: notaExtraida.destinatarioCnpj,
      optanteSimples: optanteSimples,
      situacaoCadastral: situacaoCadastral,
      dataEmissao: notaExtraida.dataEmissao,
      itens: notaExtraida.itens,
      codigoServicoPadrao: notaExtraida.codigoServicoNfse || '6190',
      aliqIss: req.body.aliqIss !== undefined ? parseFloat(String(req.body.aliqIss)) : (notaExtraida.aliqIssNfseDestaque !== undefined ? notaExtraida.aliqIssNfseDestaque : undefined),
      percentualReducaoIss: parseFloat(String(req.body.percentualReducaoIss)) || notaExtraida.percentualReducaoIssNfse || 0,
      retencaoIss: req.body.retencaoIss !== undefined ? (req.body.retencaoIss === 'true' || req.body.retencaoIss === true) : (notaExtraida.issqnRetidoTomador !== undefined ? notaExtraida.issqnRetidoTomador : true),
      localPrestacaoServico: req.body.localPrestacaoServico || notaExtraida.localPrestacaoServico,
      municipioTomador: req.body.municipioTomador || municipioTomador,
      valorInssDestacado: parseFloat(String(req.body.valorInssDestacado)) || notaExtraida.destaqueInss || 0,
      valorMateriaisInss: parseFloat(String(req.body.valorMateriaisInss)) || (notaExtraida.percentualReducaoIssNfse ? Number((notaExtraida.valorTotal * (notaExtraida.percentualReducaoIssNfse / 100)).toFixed(2)) : 0),
      valorContaVinculada: parseFloat(String(req.body.valorContaVinculada)) || 0,
      retencaoInss: (notaExtraida.destaqueInss && notaExtraida.destaqueInss > 0) ? true : Boolean(req.body.retencaoInss),
      sicaf: sicafConsultaPdf
    };

    const resultado = await TaxEngine.processarNota(params);
    resultado.optanteSimei = optanteSimei;
    resultado.dataOpcaoSimples = dataOpcaoSimples;
    resultado.fonteConsultaCnpj = fonteConsultaCnpj;

    await cruzarComHistoricoEAutoPreencher(resultado, req.body.numeroProcesso, req.body.numeroEmpenho);

    res.json(resultado);
  } catch (error: any) {
    console.error('Erro no processamento do PDF:', error);
    res.status(400).json({ error: error.message || 'Erro ao extrair informações do PDF.' });
  }
});

// Upload e Processamento em Lote de Múltiplas Notas (PDFs e XMLs)
app.post('/api/upload-lote', upload.any(), async (req: Request, res: Response) => {
  try {
    const files = (req.files as Express.Multer.File[]) || [];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado para o lote.' });
    }

    const notasResultados: ResultadoConsolidado[] = [];
    const errosLote: Array<{ arquivo: string; erro: string }> = [];
    const cnpjCache = new Map<string, any>();
    const sicafCache = new Map<string, DadosSicafConsulta>();

    for (const file of files) {
      try {
        const isXml = file.originalname.toLowerCase().endsWith('.xml') || (file.mimetype && file.mimetype.includes('xml'));
        let notaExtraida;

        if (isXml) {
          notaExtraida = await XmlParser.parseXml(file.buffer);
        } else {
          notaExtraida = await PdfParser.parsePdf(file.buffer);
        }

        let optanteSimples = false;
        let optanteSimei = false;
        let dataOpcaoSimples = undefined;
        let fonteConsultaCnpj = undefined;
        let situacaoCadastral = 'ATIVA';

        let fornecedorMunicipio = undefined;
        let fornecedorUf = undefined;
        let sicafInfoLote: DadosSicafConsulta | undefined = undefined;

        if (notaExtraida.fornecedorCnpj) {
          const cnpjLimpo = notaExtraida.fornecedorCnpj.replace(/\D/g, '');
          
          // Consulta concorrente ou recuperação do cache para o CNPJ
          if (cnpjCache.has(cnpjLimpo)) {
            const cached = cnpjCache.get(cnpjLimpo);
            optanteSimples = cached.optanteSimples;
            optanteSimei = cached.optanteSimei;
            dataOpcaoSimples = cached.dataOpcaoSimples;
            fonteConsultaCnpj = cached.fonteConsulta;
            situacaoCadastral = cached.situacaoCadastral;
            fornecedorMunicipio = cached.municipio;
            fornecedorUf = cached.uf;
            if (cached.razaoSocial) {
              notaExtraida.fornecedorNome = cached.razaoSocial;
            }
          } else {
            try {
              const cnpjInfo = await CnpjService.consultarCnpj(cnpjLimpo);
              cnpjCache.set(cnpjLimpo, cnpjInfo);
              optanteSimples = cnpjInfo.optanteSimples;
              optanteSimei = cnpjInfo.optanteSimei;
              dataOpcaoSimples = cnpjInfo.dataOpcaoSimples;
              fonteConsultaCnpj = cnpjInfo.fonteConsulta;
              situacaoCadastral = cnpjInfo.situacaoCadastral;
              fornecedorMunicipio = cnpjInfo.municipio;
              fornecedorUf = cnpjInfo.uf;
              if (cnpjInfo.razaoSocial) {
                notaExtraida.fornecedorNome = cnpjInfo.razaoSocial;
              }
            } catch (e) {
              console.warn(`Não foi possível consultar CNPJ ${cnpjLimpo}:`, e);
            }
          }

          // Consulta concomitante ao SICAF no lote (com cache dedup)
          if (sicafCache.has(cnpjLimpo)) {
            sicafInfoLote = sicafCache.get(cnpjLimpo);
          } else {
            try {
              sicafInfoLote = await SicafService.consultarSicaf(cnpjLimpo);
              sicafCache.set(cnpjLimpo, sicafInfoLote);
            } catch (eSicaf) {
              console.warn(`Aviso ao consultar SICAF para ${cnpjLimpo} no lote:`, eSicaf);
            }
          }
        }

        const params: ParametrosCalculo = {
          tipoDocumento: notaExtraida.tipoDocumento,
          numeroNota: notaExtraida.numeroNota,
          chaveAcesso: notaExtraida.chaveAcesso,
          numeroProcesso: req.body.numeroProcesso ? String(req.body.numeroProcesso).trim() : undefined,
          numeroEmpenho: req.body.numeroEmpenho ? String(req.body.numeroEmpenho).trim() : undefined,
          fornecedorNome: notaExtraida.fornecedorNome,
          fornecedorCnpj: notaExtraida.fornecedorCnpj,
          fornecedorMunicipio,
          fornecedorUf,
          destinatarioNome: notaExtraida.destinatarioNome,
          destinatarioCnpj: notaExtraida.destinatarioCnpj,
          optanteSimples: optanteSimples,
          situacaoCadastral: situacaoCadastral,
          dataEmissao: notaExtraida.dataEmissao,
          itens: notaExtraida.itens,
          codigoServicoPadrao: notaExtraida.codigoServicoNfse || '6190',
          aliqIss: 5.00,
          percentualReducaoIss: notaExtraida.percentualReducaoIssNfse || 0,
          retencaoIss: notaExtraida.issqnRetidoTomador !== undefined ? notaExtraida.issqnRetidoTomador : true,
          valorInssDestacado: notaExtraida.destaqueInss || 0,
          valorMateriaisInss: notaExtraida.percentualReducaoIssNfse ? Number((notaExtraida.valorTotal * (notaExtraida.percentualReducaoIssNfse / 100)).toFixed(2)) : 0,
          valorContaVinculada: 0,
          retencaoInss: (notaExtraida.destaqueInss && notaExtraida.destaqueInss > 0) ? true : false,
          sicaf: sicafInfoLote
        };

        const resultado = await TaxEngine.processarNota(params);
        resultado.optanteSimei = optanteSimei;
        resultado.dataOpcaoSimples = dataOpcaoSimples;
        resultado.fonteConsultaCnpj = fonteConsultaCnpj;

        await cruzarComHistoricoEAutoPreencher(resultado, req.body.numeroProcesso, req.body.numeroEmpenho);

        notasResultados.push(resultado);
      } catch (errNota: any) {
        console.error(`Erro ao processar arquivo do lote ${file.originalname}:`, errNota);
        errosLote.push({ arquivo: file.originalname, erro: errNota.message || 'Falha no processamento' });
      }
    }

    if (notasResultados.length === 0) {
      return res.status(400).json({
        error: 'Nenhuma nota pôde ser processada com sucesso no lote.',
        detalhesErros: errosLote
      });
    }

    // Consolidação dos Totais
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
    const codigosDarfMap: Record<string, { codigo: string; valor: number; naturezaReinf?: string }> = {};

    notasResultados.forEach((n) => {
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

    const primeiraNota = notasResultados[0];
    const fornecedorPrincipal = {
      nome: primeiraNota.fornecedorNome,
      cnpj: primeiraNota.fornecedorCnpj,
      optanteSimples: primeiraNota.optanteSimples
    };

    res.json({
      success: true,
      totalArquivosRecebidos: files.length,
      totalProcessadasSucesso: notasResultados.length,
      errosLote,
      temMultiplosFornecedores: cnpjsDistintos.size > 1,
      fornecedorPrincipal,
      notas: notasResultados,
      resumo: {
        totalNotas: notasResultados.length,
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
    });
  } catch (error: any) {
    console.error('Erro no upload em lote:', error);
    res.status(500).json({ error: error.message || 'Erro ao processar lote de arquivos.' });
  }
});

// Consulta avulsa de CNPJ e Simples Nacional
app.get('/api/consultar-cnpj/:cnpj', async (req: Request, res: Response) => {
  try {
    const cnpj = String(req.params.cnpj);
    const info = await CnpjService.consultarCnpj(cnpj);
    res.json(info);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Consulta pública oficial ao SICAF / Compras.gov.br
app.get('/api/sicaf/consultar/:cnpj', async (req: Request, res: Response) => {
  try {
    const cnpj = String(req.params.cnpj);
    const info = await SicafService.consultarSicaf(cnpj);
    res.json(info);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Erro ao consultar SICAF.' });
  }
});

// Endpoint de Recálculo Reativo de Retenções (Edição de Itens e Parâmetros)
app.post('/api/recalcular', async (req: Request, res: Response) => {
  try {
    const params: ParametrosCalculo = req.body;
    if (!params || !params.itens || !Array.isArray(params.itens)) {
      return res.status(400).json({ error: 'Dados inválidos para recálculo de nota fiscal.' });
    }

    if (req.body.aliqIss !== undefined) {
      params.aliqIss = parseFloat(String(req.body.aliqIss));
    }

    const resultado = await TaxEngine.processarNota(params);
    if (req.body.optanteSimei !== undefined) resultado.optanteSimei = req.body.optanteSimei;
    if (req.body.dataOpcaoSimples !== undefined) resultado.dataOpcaoSimples = req.body.dataOpcaoSimples;
    if (req.body.fonteConsultaCnpj !== undefined) resultado.fonteConsultaCnpj = req.body.fonteConsultaCnpj;

    await cruzarComHistoricoEAutoPreencher(resultado, req.body.numeroProcesso, req.body.numeroEmpenho);

    res.json(resultado);
  } catch (error: any) {
    console.error('Erro ao recalcular nota fiscal:', error);
    res.status(500).json({ error: 'Erro ao recalcular retenções: ' + error.message });
  }
});

// =========================================================================
// 2. GERAÇÃO DE RELATÓRIO EM PDF (INDIVIDUAL E CONSOLIDADO SEI)
// =========================================================================

app.post('/api/gerar-pdf', async (req: Request, res: Response) => {
  try {
    const resultado: ResultadoConsolidado = req.body;

    // Garante que o SICAF esteja preenchido antes de gerar o relatório com anexo
    if (!resultado.sicaf && resultado.fornecedorCnpj) {
      try {
        resultado.sicaf = await SicafService.consultarSicaf(resultado.fornecedorCnpj);
      } catch (eSicaf) {
        console.warn('Aviso ao consultar SICAF antes de gerar PDF:', eSicaf);
      }
    }

    const pdfBuffer = await PdfReportGenerator.gerarRelatorio(resultado);
    const nomeArquivo = PdfReportGenerator.gerarNomeArquivo(resultado.numeroNota, resultado.fornecedorNome, resultado.numeroProcesso);

    // Salva ou atualiza automaticamente no histórico sem gerar duplicatas
    try {
      await HistoryService.salvarOuAtualizarNota(resultado);
    } catch (eSave) {
      console.warn('Erro ao auto-salvar nota ao gerar PDF:', eSave);
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error('Erro ao gerar PDF:', error);
    res.status(500).json({ error: 'Erro ao gerar relatório em PDF.' });
  }
});

// Geração de Relatório Consolidado em PDF de Processo com Múltiplas Notas
app.post('/api/processo/gerar-pdf-consolidado', async (req: Request, res: Response) => {
  try {
    const dadosProcesso = req.body;
    if (!dadosProcesso || !dadosProcesso.notas || !dadosProcesso.resumo) {
      return res.status(400).json({ error: 'Dados incompletos para geração do PDF consolidado.' });
    }

    const pdfBuffer = await PdfReportGenerator.gerarRelatorioConsolidado(dadosProcesso);
    const procLimpo = (dadosProcesso.numeroProcesso || 'SEI')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .substring(0, 30);
    const nomeArquivo = `Relatorio_Consolidado_Processo_${procLimpo}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error('Erro ao gerar PDF consolidado:', error);
    res.status(500).json({ error: 'Erro ao gerar relatório consolidado em PDF.' });
  }
});

// Listar histórico de notas salvas (compatibilidade)
app.get('/api/notas', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT id, tipo_documento, numero_nota, chave_acesso, numero_processo, numero_empenho, fornecedor_cnpj, fornecedor_nome, optante_simples, valor_bruto, valor_liquido, total_retido, created_at FROM notas_analisadas ORDER BY created_at DESC LIMIT 100;'
    );
    res.json(result.rows);
  } catch (error: any) {
    console.error('Erro ao listar notas:', error);
    res.status(500).json({ error: 'Erro ao buscar registros no banco de dados.' });
  }
});

// =========================================================================
// 3. PERSISTÊNCIA E BUSCA AVANÇADA NO POSTGRESQL (COM UPSERT / SEM DUPLICIDADE)
// =========================================================================

// Salvar / Atualizar Análise de Nota no PostgreSQL (Sem duplicidade)
app.post('/api/notas/salvar', async (req: Request, res: Response) => {
  try {
    const r: ResultadoConsolidado = req.body;
    const saveRes = await HistoryService.salvarOuAtualizarNota(r);

    res.json({
      success: true,
      notaId: saveRes.id,
      acao: saveRes.acao,
      numeroProcesso: saveRes.numeroProcesso,
      numeroEmpenho: saveRes.numeroEmpenho,
      message: saveRes.acao === 'ATUALIZADA' 
        ? 'Registro existente atualizado no histórico (sem duplicidade).' 
        : 'Análise gravada com sucesso no histórico PostgreSQL!'
    });
  } catch (error: any) {
    console.error('Erro ao salvar nota no PostgreSQL:', error);
    res.status(500).json({ error: error.message || 'Erro ao salvar análise no banco de dados.' });
  }
});

// Alias para compatibilidade
app.post('/api/salvar-nota', async (req: Request, res: Response) => {
  try {
    const r: ResultadoConsolidado = req.body;
    const saveRes = await HistoryService.salvarOuAtualizarNota(r);
    res.json({
      success: true,
      notaId: saveRes.id,
      acao: saveRes.acao,
      numeroProcesso: saveRes.numeroProcesso,
      numeroEmpenho: saveRes.numeroEmpenho
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Erro ao salvar análise no banco de dados.' });
  }
});

// Pesquisar notas salvos por CNPJ, Chave de Acesso, Número da Nota, Processo ou Empenho
app.get('/api/notas/pesquisar', async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q || '').trim();
    let queryText = 'SELECT id, tipo_documento, numero_nota, chave_acesso, numero_processo, numero_empenho, fornecedor_cnpj, fornecedor_nome, optante_simples, valor_bruto, valor_liquido, total_retido, dados_json, created_at FROM notas_analisadas ORDER BY created_at DESC LIMIT 50;';
    let queryParams: any[] = [];

    if (q) {
      queryText = `
        SELECT id, tipo_documento, numero_nota, chave_acesso, numero_processo, numero_empenho, fornecedor_cnpj, fornecedor_nome, optante_simples, valor_bruto, valor_liquido, total_retido, dados_json, created_at
        FROM notas_analisadas
        WHERE fornecedor_cnpj ILIKE $1 
           OR chave_acesso ILIKE $1 
           OR numero_nota ILIKE $1 
           OR fornecedor_nome ILIKE $1
           OR numero_processo ILIKE $1
           OR numero_empenho ILIKE $1
        ORDER BY created_at DESC 
        LIMIT 50;
      `;
      queryParams = [`%${q}%`];
    }

    const result = await pool.query(queryText, queryParams);
    res.json(result.rows);
  } catch (error: any) {
    console.error('Erro ao pesquisar notas:', error);
    res.status(500).json({ error: 'Erro ao buscar registros no banco de dados.' });
  }
});

// Endpoint para listagem de NCMs e Regras Tributárias
app.get('/api/tabelas/ncm', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT ncm_prefixo, descricao, descricao_categoria, codigo_receita, natureza_reinf,
             aliq_ir, aliq_csll, aliq_cofins, aliq_pis, condicao_aplicavel, fundamentacao_legal
      FROM ncm_regras
      ORDER BY ncm_prefixo ASC;
    `);
    res.json(result.rows);
  } catch (error: any) {
    console.warn('Erro ao consultar ncm_regras no PostgreSQL:', error.message);
    res.json([]);
  }
});

// =========================================================================
// MEMÓRIA TRIBUTÁRIA DE FORNECEDORES (APRENDIZADO ATIVO DE REGRAS)
// =========================================================================

// Salvar / atualizar regra na memória tributária do fornecedor
app.post('/api/fornecedores/memoria', async (req: Request, res: Response) => {
  try {
    const memoria = await SupplierMemoryService.salvarOuAtualizarMemoria(req.body);
    res.json({ success: true, memoria });
  } catch (error: any) {
    console.error('Erro ao salvar memória do fornecedor:', error);
    res.status(500).json({ error: error.message || 'Erro ao salvar memória tributária do fornecedor.' });
  }
});

// Listar regras memorizadas para um CNPJ
app.get('/api/fornecedores/memoria/:cnpj', async (req: Request, res: Response) => {
  try {
    const memorias = await SupplierMemoryService.listarPorCnpj(String(req.params.cnpj));
    res.json(memorias);
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao consultar memória do fornecedor.' });
  }
});

// Listar todas as regras memorizadas
app.get('/api/fornecedores/memorias', async (req: Request, res: Response) => {
  try {
    const todas = await SupplierMemoryService.listarTodas();
    res.json(todas);
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao listar memórias de fornecedores.' });
  }
});

// Excluir regra memorizada
app.delete('/api/fornecedores/memoria/:id', async (req: Request, res: Response) => {
  try {
    const sucesso = await SupplierMemoryService.excluir(Number(req.params.id));
    res.json({ success: sucesso });
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao excluir memória do fornecedor.' });
  }
});

// Endpoint Analytics para o Dashboard Tributário
app.get('/api/dashboard/analytics', async (req: Request, res: Response) => {
  try {
    const naturezaFiltro = String(req.query.natureza || '').trim();

    const result = await pool.query(`
      SELECT id, tipo_documento, numero_nota, chave_acesso, numero_processo, numero_empenho, 
             fornecedor_cnpj, fornecedor_nome, destinatario_cnpj, destinatario_nome, 
             optante_simples, valor_bruto, valor_liquido, total_retido, dados_json, created_at 
      FROM notas_analisadas 
      ORDER BY created_at DESC;
    `);

    const rows = result.rows;

    let totalBrutoAcumulado = 0;
    let totalGeralRetido = 0;
    let totalIr = 0;
    let totalCsll = 0;
    let totalPis = 0;
    let totalCofins = 0;
    let totalInss = 0;
    let totalIss = 0;

    const mefDarfMap: Record<string, { codigo: string; totalValor: number; count: number }> = {};
    const mefReinfMap: Record<string, { codigo: string; descricao: string; totalValor: number; count: number }> = {};
    const alertas: Array<{ id: number; numeroNota: string; fornecedorNome: string; tipo: string; mensagem: string }> = [];

    const notasDetalhadas: any[] = [];

    for (const r of rows) {
      const dj = r.dados_json || {};
      const bruto = parseFloat(r.valor_bruto) || 0;
      const retido = parseFloat(r.total_retido) || 0;

      totalBrutoAcumulado += bruto;
      totalGeralRetido += retido;
      totalIr += parseFloat(dj.totalIr) || 0;
      totalCsll += parseFloat(dj.totalCsll) || 0;
      totalPis += parseFloat(dj.totalPis) || 0;
      totalCofins += parseFloat(dj.totalCofins) || 0;
      totalInss += parseFloat(dj.totalInss) || 0;
      totalIss += parseFloat(dj.totalIss) || 0;

      // Processar Códigos DARF
      if (Array.isArray(dj.codigosReceitaDarf)) {
        for (const d of dj.codigosReceitaDarf) {
          const cod = String(d.codigo || 'OUTROS');
          const val = parseFloat(d.valor) || 0;
          if (!mefDarfMap[cod]) {
            mefDarfMap[cod] = { codigo: cod, totalValor: 0, count: 0 };
          }
          mefDarfMap[cod].totalValor += val;
          mefDarfMap[cod].count += 1;
        }
      }

      // Processar Naturezas EFD-Reinf
      const naturezasNota: string[] = [];
      if (Array.isArray(dj.naturezasEFDReinf)) {
        for (const nr of dj.naturezasEFDReinf) {
          const cod = String(nr.codigo || '');
          const desc = String(nr.descricao || 'Serviço/Bem');
          const val = parseFloat(nr.valor) || bruto;
          if (cod) {
            naturezasNota.push(cod);
            if (!mefReinfMap[cod]) {
              mefReinfMap[cod] = { codigo: cod, descricao: desc, totalValor: 0, count: 0 };
            }
            mefReinfMap[cod].totalValor += val;
            mefReinfMap[cod].count += 1;
          }
        }
      }

      // Verificar Alertas
      if (!r.optante_simples && retido === 0 && bruto > 0) {
        alertas.push({
          id: r.id,
          numeroNota: r.numero_nota,
          fornecedorNome: r.fornecedor_nome,
          tipo: 'RETENCAO_ZERADA',
          mensagem: `Nota nº ${r.numero_nota} de ${r.fornecedor_nome} não é optante do Simples, mas possui retenção zerada (R$ 0,00).`
        });
      }
      if (r.tipo_documento === 'NFE' && (!r.chave_acesso || r.chave_acesso.length < 44)) {
        alertas.push({
          id: r.id,
          numeroNota: r.numero_nota,
          fornecedorNome: r.fornecedor_nome,
          tipo: 'CHAVE_AUSENTE',
          mensagem: `Nota nº ${r.numero_nota} do tipo NFe está sem Chave de Acesso válida.`
        });
      }

      const notaItem = {
        id: r.id,
        tipoDocumento: r.tipo_documento,
        numeroNota: r.numero_nota,
        chaveAcesso: r.chave_acesso,
        numeroProcesso: r.numero_processo || dj.numeroProcesso || null,
        numeroEmpenho: r.numero_empenho || dj.numeroEmpenho || null,
        fornecedorCnpj: r.fornecedor_cnpj,
        fornecedorNome: r.fornecedor_nome,
        destinatarioCnpj: r.destinatario_cnpj,
        destinatarioNome: r.destinatario_nome,
        optanteSimples: r.optante_simples,
        valorBruto: bruto,
        valorLiquido: parseFloat(r.valor_liquido) || 0,
        totalRetido: retido,
        createdAt: r.created_at,
        naturezasReinf: naturezasNota,
        dadosJson: dj
      };

      if (!naturezaFiltro || naturezasNota.includes(naturezaFiltro)) {
        notasDetalhadas.push(notaItem);
      }
    }

    res.json({
      totaisPorTributo: {
        totalBrutoAcumulado: Number(totalBrutoAcumulado.toFixed(2)),
        totalGeralRetido: Number(totalGeralRetido.toFixed(2)),
        ir: Number(totalIr.toFixed(2)),
        csll: Number(totalCsll.toFixed(2)),
        pis: Number(totalPis.toFixed(2)),
        cofins: Number(totalCofins.toFixed(2)),
        inss: Number(totalInss.toFixed(2)),
        iss: Number(totalIss.toFixed(2))
      },
      totaisPorCodigoDarf: Object.values(mefDarfMap),
      naturezasEFDReinf: Object.values(mefReinfMap),
      alertas,
      totalNotasAnalisadas: rows.length,
      notas: notasDetalhadas
    });
  } catch (error: any) {
    console.error('Erro ao gerar dados do Dashboard:', error);
    res.status(500).json({ error: error.message || 'Erro ao carregar dados do Dashboard.' });
  }
});

// Buscar uma nota salva específica pelo ID
app.get('/api/notas/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const result = await pool.query('SELECT * FROM notas_analisadas WHERE id = $1;', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Análise não encontrada.' });
    }
    const nota = result.rows[0];
    res.json({
      id: nota.id,
      created_at: nota.created_at,
      ...nota.dados_json
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Erro ao carregar nota.' });
  }
});

// Inicia o servidor HTTP
app.listen(port, () => {
  console.log(` Servidor de Retenções Tributárias rodando na porta ${port}`);
  console.log(` Documentação e APIs ativas em http://localhost:${port}`);
});
