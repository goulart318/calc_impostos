-- Esquema do Banco de Dados PostgreSQL para Sistema de Retenções Tributárias

CREATE TABLE IF NOT EXISTS ncm_regras (
  id SERIAL PRIMARY KEY,
  ncm_prefixo VARCHAR(10) UNIQUE NOT NULL,
  descricao VARCHAR(255),
  descricao_categoria VARCHAR(255),
  codigo_receita VARCHAR(10) NOT NULL,
  natureza_reinf VARCHAR(10) NOT NULL,
  aliq_ir NUMERIC(5,2) DEFAULT 0,
  aliq_csll NUMERIC(5,2) DEFAULT 0,
  aliq_cofins NUMERIC(5,2) DEFAULT 0,
  aliq_pis NUMERIC(5,2) DEFAULT 0,
  condicao_aplicavel TEXT,
  fundamentacao_legal TEXT
);

-- Garante compatibilidade de colunas caso a tabela já tenha sido criada anteriormente
ALTER TABLE ncm_regras ADD COLUMN IF NOT EXISTS descricao_categoria VARCHAR(255);
ALTER TABLE ncm_regras ADD COLUMN IF NOT EXISTS descricao VARCHAR(255);
ALTER TABLE ncm_regras ALTER COLUMN descricao_categoria DROP NOT NULL;
ALTER TABLE ncm_regras ALTER COLUMN descricao DROP NOT NULL;

CREATE TABLE IF NOT EXISTS fornecedores_simples (
  cnpj VARCHAR(14) PRIMARY KEY,
  razao_social VARCHAR(255),
  optante_simples BOOLEAN DEFAULT FALSE,
  optante_simei BOOLEAN DEFAULT FALSE,
  data_opcao_simples DATE,
  situacao_cadastral VARCHAR(50) DEFAULT 'ATIVA',
  ultima_consulta TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Análises Efetuadas (Histórico e Pesquisa)
CREATE TABLE IF NOT EXISTS notas_analisadas (
  id SERIAL PRIMARY KEY,
  tipo_documento VARCHAR(10) NOT NULL, -- NFE ou NFSE
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
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Garante compatibilidade caso a tabela já tenha sido criada anteriormente
ALTER TABLE notas_analisadas ADD COLUMN IF NOT EXISTS numero_processo VARCHAR(60);
ALTER TABLE notas_analisadas ADD COLUMN IF NOT EXISTS numero_empenho VARCHAR(50);

-- Índices para busca ultrarrápida por CNPJ, Chave de Acesso, Número da Nota, Processo e Empenho
CREATE INDEX IF NOT EXISTS idx_notas_fornecedor_cnpj ON notas_analisadas(fornecedor_cnpj);
CREATE INDEX IF NOT EXISTS idx_notas_chave_acesso ON notas_analisadas(chave_acesso);
CREATE INDEX IF NOT EXISTS idx_notas_numero_nota ON notas_analisadas(numero_nota);
CREATE INDEX IF NOT EXISTS idx_notas_numero_processo ON notas_analisadas(numero_processo);
CREATE INDEX IF NOT EXISTS idx_notas_numero_empenho ON notas_analisadas(numero_empenho);


-- Regras Iniciais para Medicamentos, Equipamentos, Combustíveis, Livros e Autopeças
INSERT INTO ncm_regras (ncm_prefixo, descricao, descricao_categoria, codigo_receita, natureza_reinf, aliq_ir, aliq_csll, aliq_cofins, aliq_pis, condicao_aplicavel, fundamentacao_legal) VALUES
('2710', 'Óleos de petróleo ou de minerais betuminosos, combustíveis e lubrificantes', 'Óleos de petróleo ou de minerais betuminosos, combustíveis e lubrificantes', '8739', '17021', 0.24, 1.00, 0.00, 0.00, 'Combustíveis / Regime Monofásico', 'Art. 2º § 5º da IN RFB nº 1.234/2012 c/c Lei 9.718/1998'),
('3001', 'Glandulas e outros organos para usos terapeuticos', 'Glandulas e outros organos para usos terapeuticos', '8767', '17022', 1.20, 1.00, 0.00, 0.00, 'Medicamentos com Aliquota Zero de PIS/COFINS', 'Art. 2º § 5º da IN RFB nº 1.234/2012 c/c Lei 10.147/2000'),
('3002', 'Soro humano; sangue humano; vacinas, toxinas e produtos similares', 'Soro humano; sangue humano; vacinas, toxinas e produtos similares', '8767', '17022', 1.20, 1.00, 0.00, 0.00, 'Medicamentos com Aliquota Zero de PIS/COFINS', 'Art. 2º § 5º da IN RFB nº 1.234/2012 c/c Lei 10.147/2000'),
('3003', 'Medicamentos em doses especificas', 'Medicamentos em doses especificas', '8767', '17022', 1.20, 1.00, 0.00, 0.00, 'Medicamentos com Aliquota Zero de PIS/COFINS', 'Art. 2º § 5º da IN RFB nº 1.234/2012 c/c Lei 10.147/2000'),
('3004', 'Medicamentos em doses medidas para venda a retalho', 'Medicamentos em doses medidas para venda a retalho', '8767', '17022', 1.20, 1.00, 0.00, 0.00, 'Medicamentos com Aliquota Zero de PIS/COFINS', 'Art. 2º § 5º da IN RFB nº 1.234/2012 c/c Lei 10.147/2000'),
('3005', 'Ouvatas, gazes, ataduras e artigos analogos', 'Ouvatas, gazes, ataduras e artigos analogos', '8767', '17022', 1.20, 1.00, 0.00, 0.00, 'Artigos farmaceuticos com Aliquota Zero PIS/COFINS', 'Art. 2º § 5º da IN RFB nº 1.234/2012 c/c Lei 10.147/2000'),
('3006', 'Preparacoes e artigos farmaceuticos especificados na Nota 4', 'Preparacoes e artigos farmaceuticos especificados na Nota 4', '8767', '17022', 1.20, 1.00, 0.00, 0.00, 'Preparacoes farmaceuticas com Aliquota Zero PIS/COFINS', 'Art. 2º § 5º da IN RFB nº 1.234/2012 c/c Lei 10.147/2000'),
('4901', 'Livros, brochuras e impressos semelhantes', 'Livros, brochuras e impressos semelhantes', '8767', '17022', 1.20, 1.00, 0.00, 0.00, 'Livros / Imunidade e Alíquota zero PIS/COFINS', 'Art. 2º § 5º da IN RFB nº 1.234/2012 c/c Lei 10.865/2004'),
('8708', 'Partes e acessórios dos veículos automóveis das posições 8701 a 8705', 'Partes e acessórios dos veículos automóveis das posições 8701 a 8705', '8767', '17022', 1.20, 1.00, 0.00, 0.00, 'Autopeças / Regime Monofásico', 'Art. 2º § 5º da IN RFB nº 1.234/2012 c/c Lei 10.485/2002'),
('901831', 'Seringas, mesmo com agulhas', 'Seringas, mesmo com agulhas', '8767', '17022', 1.20, 1.00, 0.00, 0.00, 'Seringas medicas com Aliquota Zero PIS/COFINS', 'Art. 2º § 5º da IN RFB nº 1.234/2012 c/c Decreto 6.426/2008'),
('901832', 'Agulhas tubulares de metal e agulhas para suturas', 'Agulhas tubulares de metal e agulhas para suturas', '8767', '17022', 1.20, 1.00, 0.00, 0.00, 'Agulhas medicas com Aliquota Zero PIS/COFINS', 'Art. 2º § 5º da IN RFB nº 1.234/2012 c/c Decreto 6.426/2008'),
('901839', 'Cateteres, canulas e instrumentos analogos', 'Cateteres, canulas e instrumentos analogos', '8767', '17022', 1.20, 1.00, 0.00, 0.00, 'Cateteres medicos com Aliquota Zero PIS/COFINS', 'Art. 2º § 5º da IN RFB nº 1.234/2012 c/c Decreto 6.426/2008'),
('9019', 'Aparelhos de mecanoterapia, massagem, ozonioterapia, oxigenoterapia e respiratórios', 'Aparelhos de mecanoterapia, massagem, ozonioterapia, oxigenoterapia e respiratórios', '8767', '17022', 1.20, 1.00, 0.00, 0.00, 'Uso hospitalar / Alíquota zero PIS/COFINS', 'Art. 2º § 5º da IN RFB nº 1.234/2012'),
('9021', 'Artigos e aparelhos ortopédicos, próteses e aparelhos para facilitar a audição', 'Artigos e aparelhos ortopédicos, próteses e aparelhos para facilitar a audição', '8767', '17022', 1.20, 1.00, 0.00, 0.00, 'Uso médico-hospitalar / Alíquota zero PIS/COFINS', 'Art. 2º § 5º da IN RFB nº 1.234/2012'),
('9022', 'Aparelhos de raios X e aparelhos que utilizem radiações alfa, beta ou gama', 'Aparelhos de raios X e aparelhos que utilizem radiações alfa, beta ou gama', '8767', '17022', 1.20, 1.00, 0.00, 0.00, 'Diagnóstico médico / Alíquota zero PIS/COFINS', 'Art. 2º § 5º da IN RFB nº 1.234/2012')
ON CONFLICT (ncm_prefixo) DO UPDATE SET
  descricao = EXCLUDED.descricao,
  descricao_categoria = EXCLUDED.descricao_categoria,
  codigo_receita = EXCLUDED.codigo_receita,
  natureza_reinf = EXCLUDED.natureza_reinf,
  aliq_ir = EXCLUDED.aliq_ir,
  aliq_csll = EXCLUDED.aliq_csll,
  aliq_cofins = EXCLUDED.aliq_cofins,
  aliq_pis = EXCLUDED.aliq_pis,
  condicao_aplicavel = EXCLUDED.condicao_aplicavel,
  fundamentacao_legal = EXCLUDED.fundamentacao_legal;
