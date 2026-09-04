import React, { useEffect, useState } from 'react';
import { Layers } from 'lucide-react';

export const NcmMatrixTab: React.FC = () => {
  const [ncms, setNcms] = useState<any[]>([]);
  const [busca, setBusca] = useState('');

  const ncmsIniciais = [
    { ncm_prefixo: '9018', descricao_categoria: 'Instrumentos e aparelhos para medicina, cirurgia e odontologia', condicao_aplicavel: 'Uso hospitalar / Alíquota zero PIS/COFINS', codigo_receita: '8767', natureza_reinf: '17022', aliq_ir: 1.20, aliq_csll: 1.00, aliq_cofins: 0.00, aliq_pis: 0.00, fundamentacao_legal: 'Art. 2º § 5º da IN RFB nº 1.234/2012' },
    { ncm_prefixo: '9019', descricao_categoria: 'Aparelhos de mecanoterapia, respiratórios e oxigenoterapia', condicao_aplicavel: 'Uso hospitalar / Alíquota zero PIS/COFINS', codigo_receita: '8767', natureza_reinf: '17022', aliq_ir: 1.20, aliq_csll: 1.00, aliq_cofins: 0.00, aliq_pis: 0.00, fundamentacao_legal: 'Art. 2º § 5º da IN RFB nº 1.234/2012' },
    { ncm_prefixo: '3003', descricao_categoria: 'Medicamentos em doses não individualizadas', condicao_aplicavel: 'Medicamentos / Alíquota zero PIS/COFINS', codigo_receita: '8767', natureza_reinf: '17022', aliq_ir: 1.20, aliq_csll: 1.00, aliq_cofins: 0.00, aliq_pis: 0.00, fundamentacao_legal: 'Art. 2º § 5º da IN RFB nº 1.234/2012 c/c Lei 10.147/2000' },
    { ncm_prefixo: '3004', descricao_categoria: 'Medicamentos para fins terapêuticos/profiláticos', condicao_aplicavel: 'Medicamentos / Alíquota zero PIS/COFINS', codigo_receita: '8767', natureza_reinf: '17022', aliq_ir: 1.20, aliq_csll: 1.00, aliq_cofins: 0.00, aliq_pis: 0.00, fundamentacao_legal: 'Art. 2º § 5º da IN RFB nº 1.234/2012 c/c Lei 10.147/2000' },
    { ncm_prefixo: '2710', descricao_categoria: 'Óleos de petróleo, combustíveis e lubrificantes', condicao_aplicavel: 'Combustíveis / Regime Monofásico', codigo_receita: '8739', natureza_reinf: '17021', aliq_ir: 0.24, aliq_csll: 1.00, aliq_cofins: 0.00, aliq_pis: 0.00, fundamentacao_legal: 'Art. 2º § 5º da IN RFB nº 1.234/2012 c/c Lei 9.718/1998' },
    { ncm_prefixo: '8708', descricao_categoria: 'Partes e acessórios de veículos automóveis', condicao_aplicavel: 'Autopeças / Regime Monofásico', codigo_receita: '8767', natureza_reinf: '17022', aliq_ir: 1.20, aliq_csll: 1.00, aliq_cofins: 0.00, aliq_pis: 0.00, fundamentacao_legal: 'Art. 2º § 5º da IN RFB nº 1.234/2012 c/c Lei 10.485/2002' },
    { ncm_prefixo: '4901', descricao_categoria: 'Livros, brochuras e impressos semelhantes', condicao_aplicavel: 'Livros / Imunidade e Alíquota zero PIS/COFINS', codigo_receita: '8767', natureza_reinf: '17022', aliq_ir: 1.20, aliq_csll: 1.00, aliq_cofins: 0.00, aliq_pis: 0.00, fundamentacao_legal: 'Art. 2º § 5º da IN RFB nº 1.234/2012 c/c Lei 10.865/2004' }
  ];

  useEffect(() => {
    fetch('http://localhost:3001/api/tabelas/ncm')
      .then(r => r.json())
      .then(d => setNcms(d.length > 0 ? d : ncmsIniciais))
      .catch(() => setNcms(ncmsIniciais));
  }, []);

  const listaFiltrada = ncms.filter(n => 
    n.ncm_prefixo.includes(busca) || 
    n.descricao_categoria.toLowerCase().includes(busca.toLowerCase()) ||
    n.condicao_aplicavel.toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">
            <Layers size={20} color="var(--primary)" />
            Matriz Inteligente de NCMs & Exceções (IN 1234/2012)
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Mapeamento automático de NCMs sujeitos à alíquota zero ou regime monofásico de PIS/COFINS (Códigos DARF 8767 / 8739 e EFD-Reinf 17022).
          </p>
        </div>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <input 
          type="text" 
          className="form-input" 
          placeholder="Pesquisar NCM (ex: 9018, 3004, 2710) ou descrição..." 
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="tax-table">
          <thead>
            <tr>
              <th>NCM (PREFIXO)</th>
              <th>CATEGORIA / DESCRIÇÃO</th>
              <th>CONDIÇÃO APLICÁVEL</th>
              <th>CÓD. DARF</th>
              <th>EFD-REINF</th>
              <th style={{ textAlign: 'right' }}>TOTAL FED.</th>
            </tr>
          </thead>
          <tbody>
            {listaFiltrada.map((item, idx) => (
              <tr key={idx}>
                <td>
                  <span style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', background: '#f1f5f9', padding: '3px 8px', borderRadius: '4px' }}>
                    {item.ncm_prefixo}
                  </span>
                </td>
                <td style={{ fontWeight: 600 }}>{item.descricao_categoria}</td>
                <td>
                  <span style={{ color: 'var(--primary)', fontWeight: 500, fontSize: '0.82rem' }}>
                    {item.condicao_aplicavel}
                  </span>
                </td>
                <td>
                  <strong style={{ color: '#1e40af' }}>{item.codigo_receita}</strong>
                </td>
                <td>
                  <span style={{ fontSize: '0.75rem', background: '#eff6ff', color: '#1e40af', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                    {item.natureza_reinf}
                  </span>
                </td>
                <td style={{ textAlign: 'right', fontWeight: 800, color: '#166534' }}>
                  {(Number(item.aliq_ir) + Number(item.aliq_csll) + Number(item.aliq_cofins) + Number(item.aliq_pis)).toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
