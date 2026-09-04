import fs from 'fs';
import path from 'path';
import { PdfParser } from './services/pdfParser';

async function test(filename: string) {
  const filePath = path.join('C:', 'Desenv-sistemas', 'Ret-Impostos', 'modelos', filename);
  if (!fs.existsSync(filePath)) return;
  const buffer = fs.readFileSync(filePath);
  const extraida = await PdfParser.parsePdf(buffer);
  console.log(`=======================================================`);
  console.log(` ARQUIVO: ${filename}`);
  console.log(` Emitente (Fornecedor) CNPJ: ${extraida.fornecedorCnpj}`);
  console.log(` Destinatário (Tomador) CNPJ: ${extraida.destinatarioCnpj}`);
  console.log(` Destinatário Razão Social: ${extraida.destinatarioNome}`);
}

async function run() {
  await test('DBV_COMERCIO___111945.pdf');
  await test('NF agille.pdf');
  await test('NF_4404_NOVA.pdf');
}

run().catch(err => console.error(err));
