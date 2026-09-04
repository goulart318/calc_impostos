const { Client } = require('pg');

async function fixNcmRules() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    database: 'ret_impostos',
    user: 'postgres',
    password: 'postgres'
  });

  await client.connect();
  console.log('Conectado ao PostgreSQL para atualizar ncm_regras...');

  await client.query(`DELETE FROM ncm_regras WHERE ncm_prefixo LIKE '9018%';`);

  await client.query(`
    INSERT INTO ncm_regras (ncm_prefixo, descricao_categoria, condicao_aplicavel, codigo_receita, natureza_reinf, aliq_ir, aliq_csll, aliq_cofins, aliq_pis, fundamentacao_legal)
    VALUES 
    ('901831', 'Seringas de uso médico', 'Seringas - Alíquota Zero PIS/COFINS (Lei 10.147/2000)', '8767', '17022', 1.20, 1.00, 0.00, 0.00, 'Art. 2º § 5º da IN 1234/2012 c/c Lei 10.147/2000'),
    ('901832', 'Agulhas de uso médico', 'Agulhas - Alíquota Zero PIS/COFINS (Lei 10.147/2000)', '8767', '17022', 1.20, 1.00, 0.00, 0.00, 'Art. 2º § 5º da IN 1234/2012 c/c Lei 10.147/2000'),
    ('901839', 'Cateteres e sondas', 'Cateteres, cânulas e sondas - Alíquota Zero PIS/COFINS (Lei 10.147/2000)', '8767', '17022', 1.20, 1.00, 0.00, 0.00, 'Art. 2º § 5º da IN 1234/2012 c/c Lei 10.147/2000');
  `);

  console.log('Regras de NCM no PostgreSQL atualizadas com SUCESSO ABSOLUTO!');
  await client.end();
}

fixNcmRules().catch(e => console.error(e));
