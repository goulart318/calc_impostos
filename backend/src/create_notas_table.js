const { Client } = require('pg');

const client = new Client({
  host: 'localhost',
  port: 5432,
  database: 'ret_impostos',
  user: 'postgres',
  password: 'postgres'
});

async function run() {
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS notas_analisadas (
      id SERIAL PRIMARY KEY,
      tipo_documento VARCHAR(10) NOT NULL,
      numero_nota VARCHAR(50) NOT NULL,
      chave_acesso VARCHAR(60),
      fornecedor_cnpj VARCHAR(20) NOT NULL,
      fornecedor_nome VARCHAR(255) NOT NULL,
      destinatario_cnpj VARCHAR(20),
      destinatario_nome VARCHAR(255),
      optante_simples BOOLEAN DEFAULT FALSE,
      valor_bruto NUMERIC(15, 2) NOT NULL,
      valor_liquido NUMERIC(15, 2) NOT NULL,
      total_retido NUMERIC(15, 2) NOT NULL,
      dados_json JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_notas_fornecedor_cnpj ON notas_analisadas(fornecedor_cnpj);
    CREATE INDEX IF NOT EXISTS idx_notas_chave_acesso ON notas_analisadas(chave_acesso);
    CREATE INDEX IF NOT EXISTS idx_notas_numero_nota ON notas_analisadas(numero_nota);
  `);
  console.log('Tabela notas_analisadas e índices de pesquisa criados com sucesso!');
  await client.end();
}

run().catch(e => {
  console.error('Erro ao criar tabela:', e.message);
  process.exit(1);
});
