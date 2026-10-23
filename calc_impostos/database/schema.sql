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
  documento_habil VARCHAR(60),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Garante compatibilidade caso a tabela já tenha sido criada anteriormente
ALTER TABLE notas_analisadas ADD COLUMN IF NOT EXISTS numero_processo VARCHAR(60);
ALTER TABLE notas_analisadas ADD COLUMN IF NOT EXISTS numero_empenho VARCHAR(50);
ALTER TABLE notas_analisadas ADD COLUMN IF NOT EXISTS documento_habil VARCHAR(60);

-- Multitenant: UASG do órgão dono da análise. Dados legados são todos do HUCAM (UASG 155012).
ALTER TABLE notas_analisadas ADD COLUMN IF NOT EXISTS uasg VARCHAR(6);
UPDATE notas_analisadas SET uasg = '155012' WHERE uasg IS NULL;
CREATE INDEX IF NOT EXISTS idx_notas_uasg ON notas_analisadas(uasg);

-- Índices para busca ultrarrápida por CNPJ, Chave de Acesso, Número da Nota, Processo, Empenho e Documento Hábil
CREATE INDEX IF NOT EXISTS idx_notas_fornecedor_cnpj ON notas_analisadas(fornecedor_cnpj);
CREATE INDEX IF NOT EXISTS idx_notas_chave_acesso ON notas_analisadas(chave_acesso);
CREATE INDEX IF NOT EXISTS idx_notas_numero_nota ON notas_analisadas(numero_nota);
CREATE INDEX IF NOT EXISTS idx_notas_numero_processo ON notas_analisadas(numero_processo);
CREATE INDEX IF NOT EXISTS idx_notas_numero_empenho ON notas_analisadas(numero_empenho);
CREATE INDEX IF NOT EXISTS idx_notas_documento_habil ON notas_analisadas(documento_habil);

-- =========================================================================
-- TABELA DE INTEGRAÇÃO COM RAUF_APP (ANÁLISE DOCUMENTAL E CONCILIAÇÃO DE LIQUIDAÇÕES)
-- =========================================================================
CREATE TABLE IF NOT EXISTS retencoes_calc_impostos (
  id SERIAL PRIMARY KEY,
  instituicao_id INTEGER NULL,
  uasg VARCHAR(6) NULL,
  numero_processo VARCHAR(60) NOT NULL,
  documento_habil VARCHAR(60) NOT NULL,
  numero_empenho VARCHAR(60),
  numero_nota VARCHAR(60) NOT NULL,
  chave_acesso VARCHAR(60),
  fornecedor_cnpj VARCHAR(20) NOT NULL,
  fornecedor_nome VARCHAR(255) NOT NULL,
  valor_bruto NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  total_retido NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  valor_liquido NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  valor_ir NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  valor_csll NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  valor_cofins NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  valor_pis NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  valor_inss NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  valor_iss NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  detalhamento_json JSONB,
  status_conciliacao VARCHAR(30) NOT NULL DEFAULT 'PENDENTE',
  origem_sistema VARCHAR(50) NOT NULL DEFAULT 'calc_impostos',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_retencoes_proc_dh_nota UNIQUE (numero_processo, documento_habil, numero_nota)
);

CREATE INDEX IF NOT EXISTS idx_retencoes_instituicao ON retencoes_calc_impostos(instituicao_id, uasg);
CREATE INDEX IF NOT EXISTS idx_retencoes_proc_dh ON retencoes_calc_impostos(numero_processo, documento_habil);
CREATE INDEX IF NOT EXISTS idx_retencoes_cnpj ON retencoes_calc_impostos(fornecedor_cnpj);
CREATE INDEX IF NOT EXISTS idx_retencoes_dh ON retencoes_calc_impostos(documento_habil);
CREATE INDEX IF NOT EXISTS idx_retencoes_status ON retencoes_calc_impostos(status_conciliacao);

-- Registros sem instituição pertencem ao HUCAM (UASG 155012; id 4 no Rauf SaaS)
UPDATE retencoes_calc_impostos SET uasg = '155012' WHERE uasg IS NULL;
UPDATE retencoes_calc_impostos SET instituicao_id = 4 WHERE instituicao_id IS NULL;

-- Fila de sincronizações com o Rauf que falharam por indisponibilidade (reenviadas automaticamente)
CREATE TABLE IF NOT EXISTS rauf_sync_pendentes (
  id SERIAL PRIMARY KEY,
  uasg VARCHAR(6) NOT NULL,
  chave VARCHAR(200) NOT NULL UNIQUE,   -- processo|NS|nota|UASG
  payload JSONB NOT NULL,
  tentativas INTEGER NOT NULL DEFAULT 0,
  ultimo_erro TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Memória Tributária de Fornecedores (Aprendizado Ativo de Regras por CNPJ e NCM/Serviço)
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
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_memoria_fornecedor_cnpj ON memoria_tributaria_fornecedores(fornecedor_cnpj);
CREATE INDEX IF NOT EXISTS idx_memoria_ncm_padrao ON memoria_tributaria_fornecedores(ncm_padrao);

-- Regras Iniciais para Medicamentos, Equipamentos, Combustíveis, Livros e Autopeças
INSERT INTO ncm_regras (ncm_prefixo, descricao, descricao_categoria, codigo_receita, natureza_reinf, aliq_ir, aliq_csll, aliq_cofins, aliq_pis, condicao_aplicavel, fundamentacao_legal) VALUES
('2710', 'Óleos de petróleo ou de minerais betuminosos, combustíveis e lubrificantes', 'Óleos de petróleo ou de minerais betuminosos, combustíveis e lubrificantes', '8739', '17013', 0.24, 1.00, 0.00, 0.00, 'Combustíveis / Regime Monofásico', 'Art. 2º § 5º da IN RFB nº 1.234/2012 c/c Lei 9.718/1998'),
('3001', 'Glandulas e outros organos para usos terapeuticos', 'Glandulas e outros organos para usos terapeuticos', '8767', '17022', 1.20, 1.00, 0.00, 0.00, 'Medicamentos com Aliquota Zero de PIS/COFINS', 'Art. 2º § 5º da IN RFB nº 1.234/2012 c/c Lei 10.147/2000'),
('3002', 'Soro humano; sangue humano; vacinas, toxinas e produtos similares', 'Soro humano; sangue humano; vacinas, toxinas e produtos similares', '8767', '17022', 1.20, 1.00, 0.00, 0.00, 'Medicamentos com Aliquota Zero de PIS/COFINS', 'Art. 2º § 5º da IN RFB nº 1.234/2012 c/c Lei 10.147/2000'),
('3003', 'Medicamentos em doses especificas', 'Medicamentos em doses especificas', '8767', '17022', 1.20, 1.00, 0.00, 0.00, 'Medicamentos com Aliquota Zero de PIS/COFINS', 'Art. 2º § 5º da IN RFB nº 1.234/2012 c/c Lei 10.147/2000'),
('3004', 'Medicamentos em doses medidas para venda a retalho', 'Medicamentos em doses medidas para venda a retalho', '6147', '17008', 1.20, 1.00, 3.00, 0.65, 'Medicamentos com Aliquota Zero de PIS/COFINS', 'Art. 2º § 5º da IN RFB nº 1.234/2012 c/c Lei 10.147/2000'),
('3005', 'Ouvatas, gazes, ataduras e artigos analogos', 'Ouvatas, gazes, ataduras e artigos analogos', '8767', '17022', 1.20, 1.00, 0.00, 0.00, 'Artigos farmaceuticos com Aliquota Zero PIS/COFINS', 'Art. 2º § 5º da IN RFB nº 1.234/2012 c/c Lei 10.147/2000'),
('3006', 'Preparacoes e artigos farmaceuticos especificados na Nota 4', 'Preparacoes e artigos farmaceuticos especificados na Nota 4', '8767', '17022', 1.20, 1.00, 0.00, 0.00, 'Preparacoes farmaceuticas com Aliquota Zero PIS/COFINS', 'Art. 2º § 5º da IN RFB nº 1.234/2012 c/c Lei 10.147/2000'),
('4901', 'Livros, brochuras e impressos semelhantes', 'Livros, brochuras e impressos semelhantes', '8767', '17022', 1.20, 1.00, 0.00, 0.00, 'Livros / Imunidade e Alíquota zero PIS/COFINS', 'Art. 2º § 5º da IN RFB nº 1.234/2012 c/c Lei 10.865/2004'),
('8708', 'Partes e acessórios dos veículos automóveis das posições 8701 a 8705', 'Partes e acessórios dos veículos automóveis das posições 8701 a 8705', '8767', '17022', 1.20, 1.00, 0.00, 0.00, 'Autopeças / Regime Monofásico', 'Art. 2º § 5º da IN RFB nº 1.234/2012 c/c Lei 10.485/2002'),
('8713', 'Cadeiras de rodas e outros veículos para pessoas com deficiência', 'Cadeiras de rodas e outros veículos para pessoas com deficiência', '8767', '17022', 1.20, 1.00, 0.00, 0.00, 'Cadeiras de rodas / Alíquota zero PIS/COFINS (Decreto 6.426/2008)', 'Art. 2º § 5º da IN RFB nº 1.234/2012 c/c Lei 10.865/2004'),
('871420', 'Partes e acessórios de cadeiras de rodas e outros veículos da posição 87.13', 'Partes e acessórios de cadeiras de rodas e outros veículos da posição 87.13', '8767', '17022', 1.20, 1.00, 0.00, 0.00, 'Acessórios de cadeiras de rodas / Alíquota zero PIS/COFINS (Decreto 6.426/2008)', 'Art. 2º § 5º da IN RFB nº 1.234/2012 c/c Decreto 6.426/2008'),
('902110', 'Artigos e aparelhos ortopédicos ou para fraturas', 'Artigos e aparelhos ortopédicos ou para fraturas', '8767', '17022', 1.20, 1.00, 0.00, 0.00, 'Aparelhos ortopédicos / Alíquota zero PIS/COFINS (Decreto 6.426/2008)', 'Art. 2º § 5º da IN RFB nº 1.234/2012 c/c Decreto 6.426/2008'),
('90213', 'Artigos e aparelhos de próteses (articulares, oculares, etc.)', 'Artigos e aparelhos de próteses (articulares, oculares, etc.)', '8767', '17022', 1.20, 1.00, 0.00, 0.00, 'Próteses médicas / Alíquota zero PIS/COFINS (Decreto 6.426/2008)', 'Art. 2º § 5º da IN RFB nº 1.234/2012 c/c Decreto 6.426/2008'),
('902140', 'Aparelhos para facilitar a audição dos surdos', 'Aparelhos para facilitar a audição dos surdos', '8767', '17022', 1.20, 1.00, 0.00, 0.00, 'Aparelhos auditivos / Alíquota zero PIS/COFINS (Lei 10.865/2004)', 'Art. 2º § 5º da IN RFB nº 1.234/2012 c/c Lei 10.865/2004'),
('90219082', 'Aparelhos para facilitar a audição dos surdos (outros)', 'Aparelhos para facilitar a audição dos surdos (outros)', '8767', '17022', 1.20, 1.00, 0.00, 0.00, 'Aparelhos auditivos / Alíquota zero PIS/COFINS (Tabela 4.3.13 SPED)', 'Art. 2º § 5º da IN RFB nº 1.234/2012 c/c Decreto 6.426/2008'),
('90219092', 'Partes e acessórios de aparelhos auditivos', 'Partes e acessórios de aparelhos auditivos', '8767', '17022', 1.20, 1.00, 0.00, 0.00, 'Partes de aparelhos auditivos / Alíquota zero PIS/COFINS (Tabela 4.3.13 SPED)', 'Art. 2º § 5º da IN RFB nº 1.234/2012 c/c Decreto 6.426/2008'),
('90219019', 'Neuroestimuladores e implantes especiais', 'Neuroestimuladores e implantes especiais', '8767', '17022', 1.20, 1.00, 0.00, 0.00, 'Neuroestimuladores / Alíquota zero PIS/COFINS (Tabela 4.3.13 SPED)', 'Art. 2º § 5º da IN RFB nº 1.234/2012 c/c Decreto 6.426/2008'),
('901831', 'Seringas, mesmo com agulhas', 'Seringas, mesmo com agulhas', '8767', '17022', 1.20, 1.00, 0.00, 0.00, 'Seringas medicas com Aliquota Zero PIS/COFINS', 'Art. 2º § 5º da IN RFB nº 1.234/2012 c/c Decreto 6.426/2008'),
('901832', 'Agulhas tubulares de metal e agulhas para suturas', 'Agulhas tubulares de metal e agulhas para suturas', '8767', '17022', 1.20, 1.00, 0.00, 0.00, 'Agulhas medicas com Aliquota Zero PIS/COFINS', 'Art. 2º § 5º da IN RFB nº 1.234/2012 c/c Decreto 6.426/2008'),
('901839', 'Cateteres, canulas e instrumentos analogos', 'Cateteres, canulas e instrumentos analogos', '8767', '17022', 1.20, 1.00, 0.00, 0.00, 'Cateteres medicos com Aliquota Zero PIS/COFINS', 'Art. 2º § 5º da IN RFB nº 1.234/2012 c/c Decreto 6.426/2008'),
('9019', 'Aparelhos de mecanoterapia, massagem, ozonioterapia, oxigenoterapia e respiratórios', 'Aparelhos de mecanoterapia, massagem, ozonioterapia, oxigenoterapia e respiratórios', '8767', '17022', 1.20, 1.00, 0.00, 0.00, 'Uso hospitalar / Alíquota zero PIS/COFINS', 'Art. 2º § 5º da IN RFB nº 1.234/2012'),
('9022', 'Aparelhos de raios X e aparelhos que utilizem radiações alfa, beta ou gama', 'Aparelhos de raios X e aparelhos que utilizem radiações alfa, beta ou gama', '8767', '17022', 1.20, 1.00, 0.00, 0.00, 'Diagnóstico médico / Alíquota zero PIS/COFINS', 'Art. 2º § 5º da IN RFB nº 1.234/2012'),
('2716', 'Energia Elétrica', 'Energia Elétrica', '6147', '17002', 1.20, 1.00, 3.00, 0.65, 'Energia Elétrica / Regra Geral (5,85%)', 'Anexo I da IN RFB nº 1.234/2012 - Código 6147')
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
