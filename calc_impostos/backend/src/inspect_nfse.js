const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

async function inspectNfse(filename) {
  const filePath = path.join('C:', 'Desenv-sistemas', 'Ret-Impostos', 'modelos', filename);
  if (!fs.existsSync(filePath)) return;
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  console.log(`=======================================================`);
  console.log(` INSPEÇÃO NFS-E: ${filename}`);
  console.log(`=======================================================`);
  console.log(data.text);
}

async function run() {
  await inspectNfse('NF_84_comer.pdf');
  await inspectNfse('NF_33912 - cetan.pdf');
}

run().catch(err => console.error(err));
