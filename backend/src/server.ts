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
// 2. GERAÇÃO DE RELATÓRIO EM PDF (PADRÃO SEI)
// =========================================================================

app.post('/api/gerar-pdf', async (req: Request, res: Response) => {
  try {
    const resultado: ResultadoConsolidado = req.body;
    const pdfBuffer = await PdfReportGenerator.gerarRelatorio(resultado);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=relatorio_retencao_nota_${resultado.numeroNota || 'fiscal'}.pdf`);
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error('Erro ao gerar PDF:', error);
    res.status(500).json({ error: 'Erro ao gerar relatório em PDF.' });
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
