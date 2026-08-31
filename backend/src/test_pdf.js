const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

async function testPdf(filename) {
  const filePath = path.join('C:', 'Desenv-sistemas', 'Ret-Impostos', 'modelos', filename);
  if (!fs.existsSync(filePath)) {
    console.log(`Arquivo não encontrado: ${filePath}`);
    return;
  }
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  console.log(`=======================================================`);
  console.log(` ARQUIVO: ${filename}`);
  console.log(`=======================================================`);
  console.log(data.text);
}

async function runAll() {
  await testPdf('DBV_COMERCIO___111945.pdf');
  await testPdf('NF agille.pdf');
  await testPdf('NF_4404_NOVA.pdf');
}

runAll().catch(err => console.error(err));
