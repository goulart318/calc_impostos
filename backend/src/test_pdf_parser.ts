import fs from 'fs';
import path from 'path';
import { PdfParser } from './services/pdfParser';

async function testPdfParser(filename: string) {
  const filePath = path.join('C:', 'Desenv-sistemas', 'Ret-Impostos', 'modelos', filename);
  if (!fs.existsSync(filePath)) return;
  
  const buffer = fs.readFileSync(filePath);
  const res = await PdfParser.parsePdf(buffer);
  console.log(`=======================================================`);
  console.log(` RESULTADO PARSER DO ARQUIVO: ${filename}`);
  console.log(`=======================================================`);
  console.log(`Número Nota: ${res.numeroNota}`);
  console.log(`CNPJ Fornecedor: ${res.fornecedorCnpj}`);
  console.log(`Razão Social: ${res.fornecedorNome}`);
  console.log(`Valor Total da Nota: R$ ${res.valorTotal}`);
  console.log(`Itens Extraídos:`, JSON.stringify(res.itens, null, 2));
}

async function run() {
  await testPdfParser('DBV_COMERCIO___111945.pdf');
  await testPdfParser('NF agille.pdf');
  await testPdfParser('NF_4404_NOVA.pdf');
}

run().catch(err => console.error(err));
