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
    console.log(' Conectado com sucesso ao PostgreSQL (banco: ret_impostos)');
    
    // Executa o schema caso as tabelas não existam
    const possibleSchemaPaths = [
      path.resolve(__dirname, '../../../database/schema.sql'), // dev (src/config/db.ts)
      path.resolve(__dirname, '../../database/schema.sql'),    // dist/config ou dist/src
      path.resolve(process.cwd(), 'database/schema.sql'),
      path.resolve(process.cwd(), '../database/schema.sql')
    ];
    const schemaPath = possibleSchemaPaths.find(p => fs.existsSync(p));
    if (schemaPath) {
      const sql = fs.readFileSync(schemaPath, 'utf8');
      await client.query(sql);
      console.log(` Estrutura e sementes do banco carregadas com sucesso via: ${schemaPath}`);
    } else {
      console.warn('⚠️ Arquivo database/schema.sql não localizado nos caminhos esperados.');
    }
    client.release();
  } catch (err: any) {
    console.warn(' Aviso de conexão com PostgreSQL:', err.message);
    console.log('ℹ Verifique se o PostgreSQL está ativo e o banco "ret_impostos" criado no pgAdmin.');
  }
}
