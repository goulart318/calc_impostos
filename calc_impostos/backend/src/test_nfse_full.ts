import fs from 'fs';
import path from 'path';
import { PdfParser } from './services/pdfParser';

async function test(filename: string) {
  const filePath = path.join('C:', 'Desenv-sistemas', 'Ret-Impostos', 'modelos', filename);
  if (!fs.existsSync(filePath)) return;
  const buffer = fs.readFileSync(filePath);
  const extraida = await PdfParser.parsePdf(buffer);
  console.log(`=======================================================`);
  console.log(` TESTE PARSER NFS-E: ${filename}`);
  console.log(`=======================================================`);
  console.log(`Tipo Documento: ${extraida.tipoDocumento} | Nota Nº: ${extraida.numeroNota}`);
  console.log(`Prestador (Fornecedor) CNPJ: ${extraida.fornecedorCnpj} | Nome: ${extraida.fornecedorNome}`);
  console.log(`Tomador (Órgão) CNPJ: ${extraida.destinatarioCnpj} | Nome: ${extraida.destinatarioNome}`);
  console.log(`Valor do Serviço: R$ ${extraida.valorTotal}`);
  console.log(`BC ISSQN: R$ ${extraida.bcIssqnNfse} | Redução Base ISSQN: ${extraida.percentualReducaoIssNfse}%`);
  console.log(`Destaques -> IRRF: R$ ${extraida.destaqueIr} | INSS/CP: R$ ${extraida.destaqueInss} | Sociais: R$ ${extraida.destaqueSocial} | ISSQN: R$ ${extraida.destaqueIss}`);
  console.log(`ISSQN Retido pelo Tomador: ${extraida.issqnRetidoTomador}`);
  console.log(`Descrição do Serviço: ${extraida.itens[0]?.descricao}`);
}

async function run() {
  await test('NF_84_comer.pdf');
  await test('NF_33912 - cetan.pdf');
}

run().catch(err => console.error(err));
