import fs from 'fs';
import path from 'path';
import { PdfParser } from './services/pdfParser';
import { TaxEngine, ParametrosCalculo } from './services/taxEngine';

async function testFullTax(filename: string) {
  const filePath = path.join('C:', 'Desenv-sistemas', 'Ret-Impostos', 'modelos', filename);
  if (!fs.existsSync(filePath)) return;
  
  const buffer = fs.readFileSync(filePath);
  const extraida = await PdfParser.parsePdf(buffer);

  const params: ParametrosCalculo = {
    tipoDocumento: extraida.tipoDocumento,
    numeroNota: extraida.numeroNota,
    chaveAcesso: extraida.chaveAcesso,
    fornecedorNome: extraida.fornecedorNome,
    fornecedorCnpj: extraida.fornecedorCnpj,
    destinatarioNome: extraida.destinatarioNome,
    destinatarioCnpj: extraida.destinatarioCnpj,
    optanteSimples: false,
    dataEmissao: extraida.dataEmissao,
    itens: extraida.itens
  };

  const resultado = await TaxEngine.processarNota(params);

  console.log(`=======================================================`);
  console.log(` TESTE COMPLETO MOTOR FISCAL: ${filename}`);
  console.log(`=======================================================`);
  console.log(`Nota: ${resultado.numeroNota} | Fornecedor: ${resultado.fornecedorNome}`);
  console.log(`Valor Total: R$ ${resultado.totalBruto}`);
  console.log(`Total Retido Geral: R$ ${resultado.totalRetidoGeral}`);
  console.log(`Alíquotas do Item 1: IR=${resultado.itens[0].aliqIr}%, CSLL=${resultado.itens[0].aliqCsll}%, COFINS=${resultado.itens[0].aliqCofins}%, PIS=${resultado.itens[0].aliqPis}%`);
  console.log(`Código DARF: ${resultado.itens[0].codigoReceitaDarf} | Condição: ${resultado.itens[0].condicaoAplicavel}`);
}

async function run() {
  await testFullTax('DBV_COMERCIO___111945.pdf');
  await testFullTax('NF agille.pdf');
  await testFullTax('NF_4404_NOVA.pdf');
}

run().catch(err => console.error(err));
