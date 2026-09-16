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

// =========================================================================
// 1. ENDPOINTS DE PROCESSAMENTO E CÁLCULO FISCAL
// =========================================================================

// Cálculo direto a partir de parâmetros
app.post('/api/analisar', async (req: Request, res: Response) => {
  try {
    const params: ParametrosCalculo = req.body;
    const resultado = await TaxEngine.processarNota(params);
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

    if (notaExtraida.fornecedorCnpj) {
      try {
        const cnpjInfo = await CnpjService.consultarCnpj(notaExtraida.fornecedorCnpj);
        optanteSimples = cnpjInfo.optanteSimples;
        optanteSimei = cnpjInfo.optanteSimei;
        dataOpcaoSimples = cnpjInfo.dataOpcaoSimples;
        fonteConsultaCnpj = cnpjInfo.fonteConsulta;
        situacaoCadastral = cnpjInfo.situacaoCadastral;
        if (cnpjInfo.razaoSocial && (!notaExtraida.fornecedorNome || notaExtraida.fornecedorNome === 'Fornecedor Desconhecido')) {
          notaExtraida.fornecedorNome = cnpjInfo.razaoSocial;
        }
      } catch (e) {
        console.warn('Não foi possível verificar Simples Nacional via API:', e);
      }
    }

    const params: ParametrosCalculo = {
      tipoDocumento: notaExtraida.tipoDocumento,
      numeroNota: notaExtraida.numeroNota,
      chaveAcesso: notaExtraida.chaveAcesso,
      fornecedorNome: notaExtraida.fornecedorNome,
      fornecedorCnpj: notaExtraida.fornecedorCnpj,
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
      retencaoInss: (notaExtraida.destaqueInss && notaExtraida.destaqueInss > 0) ? true : Boolean(req.body.retencaoInss)
    };

    const resultado = await TaxEngine.processarNota(params);
    resultado.optanteSimei = optanteSimei;
    resultado.dataOpcaoSimples = dataOpcaoSimples;
    resultado.fonteConsultaCnpj = fonteConsultaCnpj;

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

    if (notaExtraida.fornecedorCnpj) {
      try {
        const cnpjInfo = await CnpjService.consultarCnpj(notaExtraida.fornecedorCnpj);
        optanteSimples = cnpjInfo.optanteSimples;
        optanteSimei = cnpjInfo.optanteSimei;
        dataOpcaoSimples = cnpjInfo.dataOpcaoSimples;
        fonteConsultaCnpj = cnpjInfo.fonteConsulta;
        situacaoCadastral = cnpjInfo.situacaoCadastral;
        if (cnpjInfo.razaoSocial) {
          notaExtraida.fornecedorNome = cnpjInfo.razaoSocial;
        }
      } catch (e) {
        console.warn('Não foi possível consultar CNPJ do PDF:', e);
      }
    }

    const params: ParametrosCalculo = {
      tipoDocumento: notaExtraida.tipoDocumento,
      numeroNota: notaExtraida.numeroNota,
      chaveAcesso: notaExtraida.chaveAcesso,
      fornecedorNome: notaExtraida.fornecedorNome,
      fornecedorCnpj: notaExtraida.fornecedorCnpj,
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
      retencaoInss: (notaExtraida.destaqueInss && notaExtraida.destaqueInss > 0) ? true : Boolean(req.body.retencaoInss)
    };

    const resultado = await TaxEngine.processarNota(params);
    resultado.optanteSimei = optanteSimei;
    resultado.dataOpcaoSimples = dataOpcaoSimples;
    resultado.fonteConsultaCnpj = fonteConsultaCnpj;

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

        if (notaExtraida.fornecedorCnpj) {
          const cnpjLimpo = notaExtraida.fornecedorCnpj.replace(/\D/g, '');
          if (cnpjCache.has(cnpjLimpo)) {
            const cached = cnpjCache.get(cnpjLimpo);
            optanteSimples = cached.optanteSimples;
            optanteSimei = cached.optanteSimei;
            dataOpcaoSimples = cached.dataOpcaoSimples;
            fonteConsultaCnpj = cached.fonteConsulta;
            situacaoCadastral = cached.situacaoCadastral;
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
              if (cnpjInfo.razaoSocial) {
                notaExtraida.fornecedorNome = cnpjInfo.razaoSocial;
              }
            } catch (e) {
              console.warn(`Não foi possível consultar CNPJ ${cnpjLimpo}:`, e);
            }
          }
        }

        const params: ParametrosCalculo = {
          tipoDocumento: notaExtraida.tipoDocumento,
          numeroNota: notaExtraida.numeroNota,
          chaveAcesso: notaExtraida.chaveAcesso,
          fornecedorNome: notaExtraida.fornecedorNome,
          fornecedorCnpj: notaExtraida.fornecedorCnpj,
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
          retencaoInss: (notaExtraida.destaqueInss && notaExtraida.destaqueInss > 0) ? true : false
        };

        const resultado = await TaxEngine.processarNota(params);
        resultado.optanteSimei = optanteSimei;
        resultado.dataOpcaoSimples = dataOpcaoSimples;
        resultado.fonteConsultaCnpj = fonteConsultaCnpj;

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

// =========================================================================
// 2. GERAÇÃO DE RELATÓRIO EM PDF (INDIVIDUAL E CONSOLIDADO SEI)
// =========================================================================

app.post('/api/gerar-pdf', async (req: Request, res: Response) => {
  try {
    const resultado: ResultadoConsolidado = req.body;
    const pdfBuffer = await PdfReportGenerator.gerarRelatorio(resultado);
    const nomeArquivo = PdfReportGenerator.gerarNomeArquivo(resultado.numeroNota, resultado.fornecedorNome);

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
      'SELECT id, tipo_documento, numero_nota, chave_acesso, fornecedor_cnpj, fornecedor_nome, optante_simples, valor_bruto, valor_liquido, total_retido, created_at FROM notas_analisadas ORDER BY created_at DESC LIMIT 100;'
    );
    res.json(result.rows);
  } catch (error: any) {
    console.error('Erro ao listar notas:', error);
    res.status(500).json({ error: 'Erro ao buscar registros no banco de dados.' });
  }
});

// =========================================================================
// 3. PERSISTÊNCIA E BUSCA AVANÇADA NO POSTGRESQL
// =========================================================================

// Salvar / Atualizar Análise de Nota no PostgreSQL
app.post('/api/notas/salvar', async (req: Request, res: Response) => {
  try {
    const r: ResultadoConsolidado = req.body;

    const query = `
      INSERT INTO notas_analisadas (
        tipo_documento, numero_nota, chave_acesso, fornecedor_cnpj, fornecedor_nome,
        destinatario_cnpj, destinatario_nome, optante_simples, valor_bruto,
        valor_liquido, total_retido, dados_json
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id;
    `;

    const values = [
      r.tipoDocumento, r.numeroNota || 'S/N', r.chaveAcesso || null,
      r.fornecedorCnpj, r.fornecedorNome,
      r.destinatarioCnpj || null, r.destinatarioNome || null,
      r.optanteSimples, r.totalBruto, r.valorLiquido, r.totalRetidoGeral,
      JSON.stringify(r)
    ];

    const result = await pool.query(query, values);
    const notaId = result.rows[0].id;

    res.json({ success: true, notaId, message: 'Análise gravada com sucesso no histórico PostgreSQL!' });
  } catch (error: any) {
    console.error('Erro ao salvar nota no PostgreSQL:', error);
    res.status(500).json({ error: error.message || 'Erro ao salvar análise no banco de dados.' });
  }
});

// Pesquisar notas salvos por CNPJ, Chave de Acesso, Número da Nota ou Nome do Fornecedor
app.get('/api/notas/pesquisar', async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q || '').trim();
    let queryText = 'SELECT id, tipo_documento, numero_nota, chave_acesso, fornecedor_cnpj, fornecedor_nome, optante_simples, valor_bruto, valor_liquido, total_retido, created_at FROM notas_analisadas ORDER BY created_at DESC LIMIT 50;';
    let queryParams: any[] = [];

    if (q) {
      queryText = `
        SELECT id, tipo_documento, numero_nota, chave_acesso, fornecedor_cnpj, fornecedor_nome, optante_simples, valor_bruto, valor_liquido, total_retido, created_at
        FROM notas_analisadas
        WHERE fornecedor_cnpj ILIKE $1 
           OR chave_acesso ILIKE $1 
           OR numero_nota ILIKE $1 
           OR fornecedor_nome ILIKE $1
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

// Endpoint Analytics para o Dashboard Tributário
app.get('/api/dashboard/analytics', async (req: Request, res: Response) => {
  try {
    const naturezaFiltro = String(req.query.natureza || '').trim();

    const result = await pool.query(`
      SELECT id, tipo_documento, numero_nota, chave_acesso, fornecedor_cnpj, fornecedor_nome, 
             destinatario_cnpj, destinatario_nome, optante_simples, valor_bruto, 
             valor_liquido, total_retido, dados_json, created_at 
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
