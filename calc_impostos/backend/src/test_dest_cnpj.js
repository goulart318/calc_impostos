const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

async function testDestCnpj(filename) {
  const filePath = path.join('C:', 'Desenv-sistemas', 'Ret-Impostos', 'modelos', filename);
  if (!fs.existsSync(filePath)) return;

  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  const text = data.text;

  console.log(`=======================================================`);
  console.log(` TODOS OS CNPJS ENCONTRADOS NO PDF: ${filename}`);
  console.log(`=======================================================`);
  const cnpjs = text.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g) || [];
  console.log(cnpjs);

  const idxDest = text.search(/DESTINAT[ÁA]RIO/i);
  console.log(`Índice de DESTINATÁRIO: ${idxDest}`);
  if (idxDest !== -1) {
    console.log(`TRECHO DESTINATÁRIO:`, JSON.stringify(text.substring(idxDest, idxDest + 500)));
  }
}

testDestCnpj('DBV_COMERCIO___111945.pdf').catch(err => console.error(err));
