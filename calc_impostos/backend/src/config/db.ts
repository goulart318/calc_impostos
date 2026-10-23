import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL;

export const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: isProduction ? { rejectUnauthorized: false } : undefined,
        max: 10,
        idleTimeoutMillis: 30000,
      }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'ret_impostos',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        max: 10,
        idleTimeoutMillis: 30000,
      }
);

export async function initDatabase() {
  try {
    const client = await pool.connect();
    console.log(' Conectado com sucesso ao PostgreSQL.');

    // 1. DDL das tabelas essenciais para garantir inicialização independente de caminhos de arquivos em containers
    const coreDdl = `
      CREATE TABLE IF NOT EXISTS uasgs (
        id SERIAL PRIMARY KEY,
        uasg VARCHAR(6) UNIQUE NOT NULL,
        sigla VARCHAR(30),
        nome VARCHAR(255) NOT NULL,
        cnpj VARCHAR(20),
        municipio VARCHAR(100),
        rauf_instituicao_id INTEGER NULL,
        ativo BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO uasgs (uasg, sigla, nome, cnpj, municipio, rauf_instituicao_id)
      VALUES ('155012', 'HUCAM', 'Hospital Universitário Cassiano Antônio Moraes', '15126437000658', 'Vitória', 4)
      ON CONFLICT (uasg) DO NOTHING;

      CREATE TABLE IF NOT EXISTS usuarios_calc (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        senha_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'usuario',
        uasg_origem_id INTEGER REFERENCES uasgs(id),
        ativo BOOLEAN NOT NULL DEFAULT TRUE,
        forca_troca_senha BOOLEAN NOT NULL DEFAULT TRUE,
        tentativas_falhas INTEGER NOT NULL DEFAULT 0,
        bloqueado_ate TIMESTAMP NULL,
        ultimo_login TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

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
        numero_processo VARCHAR(60),
        numero_empenho VARCHAR(50),
        documento_habil VARCHAR(60),
        uasg VARCHAR(6),
        usuario_id INTEGER,
        usuario_email VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE notas_analisadas ADD COLUMN IF NOT EXISTS uasg VARCHAR(6);
      ALTER TABLE notas_analisadas ADD COLUMN IF NOT EXISTS usuario_id INTEGER;
      ALTER TABLE notas_analisadas ADD COLUMN IF NOT EXISTS usuario_email VARCHAR(100);

      CREATE TABLE IF NOT EXISTS memoria_tributaria_fornecedores (
        id SERIAL PRIMARY KEY,
        fornecedor_cnpj VARCHAR(20) NOT NULL,
        fornecedor_nome VARCHAR(255),
        ncm_padrao VARCHAR(10),
        descricao_padrao VARCHAR(255),
        codigo_receita_darf VARCHAR(10) NOT NULL,
        natureza_reinf VARCHAR(10) NOT NULL,
        aliq_ir NUMERIC(5,2) DEFAULT 0,
        aliq_csll NUMERIC(5,2) DEFAULT 0,
        aliq_cofins NUMERIC(5,2) DEFAULT 0,
        aliq_pis NUMERIC(5,2) DEFAULT 0,
        aliq_inss NUMERIC(5,2) DEFAULT 0,
        aliq_iss NUMERIC(5,2) DEFAULT 0,
        condicao_aplicavel TEXT,
        fundamentacao TEXT,
        observacoes TEXT,
        total_aplicacoes INT DEFAULT 1,
        uasg VARCHAR(6),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE memoria_tributaria_fornecedores ADD COLUMN IF NOT EXISTS uasg VARCHAR(6);

      CREATE TABLE IF NOT EXISTS rauf_credenciais (
        uasg VARCHAR(6) PRIMARY KEY,
        nome_orgao VARCHAR(255) NOT NULL,
        prefixo VARCHAR(12) NOT NULL,
        chave_cifrada TEXT NOT NULL,
        validada_em TIMESTAMP,
        cadastrado_por_id INTEGER,
        cadastrado_por_email VARCHAR(100),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS auditoria_chaves_rauf (
        id SERIAL PRIMARY KEY,
        uasg VARCHAR(6) NOT NULL,
        nome_orgao VARCHAR(255),
        acao VARCHAR(20) NOT NULL,
        usuario_id INTEGER,
        usuario_email VARCHAR(100),
        ip_origem VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS rauf_sync_pendentes (
        id SERIAL PRIMARY KEY,
        uasg VARCHAR(6) NOT NULL,
        chave VARCHAR(200) NOT NULL UNIQUE,
        payload JSONB NOT NULL,
        tentativas INTEGER NOT NULL DEFAULT 0,
        ultimo_erro TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    try {
      await client.query(coreDdl);
      console.log('✅ Tabelas e migrações essenciais executadas com sucesso.');
    } catch (coreErr: any) {
      console.warn('Aviso ao aplicar DDL inicial:', coreErr?.message || coreErr);
    }
    
    // 2. Tenta executar o schema.sql completo se disponível no disco
    const possibleSchemaPaths = [
      path.resolve(__dirname, '../../../database/schema.sql'),
      path.resolve(__dirname, '../../database/schema.sql'),
      path.resolve(__dirname, '../database/schema.sql'),
      path.resolve(process.cwd(), 'database/schema.sql'),
      path.resolve(process.cwd(), '../database/schema.sql'),
      path.resolve(process.cwd(), 'calc_impostos/database/schema.sql')
    ];
    const schemaPath = possibleSchemaPaths.find(p => fs.existsSync(p));
    if (schemaPath) {
      try {
        const sql = fs.readFileSync(schemaPath, 'utf8');
        await client.query(sql);
        console.log(` Estrutura completa e sementes carregadas via: ${schemaPath}`);
      } catch (sqlErr: any) {
        console.warn('Aviso na execução do schema.sql:', sqlErr?.message || sqlErr);
      }
    }
    client.release();
  } catch (err: any) {
    console.warn(' Aviso de conexão com PostgreSQL:', err.message);
  }
}
