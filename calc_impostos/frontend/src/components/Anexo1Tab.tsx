import React, { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';

export const Anexo1Tab: React.FC = () => {
  const [regras, setRegras] = useState<any[]>([]);

  useEffect(() => {
    fetch('http://localhost:3001/api/tabelas/anexo1')
      .then(r => r.json())
      .then(d => setRegras(d))
      .catch(e => console.warn(e));
  }, []);

  const regrasPadrao = [
    { codigo_receita: '6147', aliq_ir: 1.20, aliq_csll: 1.00, aliq_cofins: 3.00, aliq_pis: 0.65, aliq_total: 5.85, descricao_natureza: 'Alimentação; Energia elétrica; Serviços com emprego de materiais; Construção Civil com materiais; Serviços hospitalares (art. 30 e 31); Mercadorias e bens em geral.' },
    { codigo_receita: '9060', aliq_ir: 0.24, aliq_csll: 1.00, aliq_cofins: 3.00, aliq_pis: 0.65, aliq_total: 4.89, descricao_natureza: 'Gasolina, óleo diesel, GLP, QAV e derivados de petróleo de refinarias/produtores/importadores; Álcool etílico de produtor; Biodiesel de produtor.' },
    { codigo_receita: '8739', aliq_ir: 0.24, aliq_csll: 1.00, aliq_cofins: 0.00, aliq_pis: 0.00, aliq_total: 1.24, descricao_natureza: 'Gasolina, óleo diesel, GLP de distribuidores/varejistas; Álcool etílico varejista; Biodiesel varejista/Pronaf.' },
    { codigo_receita: '8767', aliq_ir: 1.20, aliq_csll: 1.00, aliq_cofins: 0.00, aliq_pis: 0.00, aliq_total: 2.20, descricao_natureza: 'Transporte internacional de cargas; Estaleiros navais; Produtos farmacêuticos/higiene; Outros produtos ou serviços com isenção/não incidência/alíquota zero de PIS/Cofins (§ 5º art. 2º).' },
    { codigo_receita: '6175', aliq_ir: 2.40, aliq_csll: 1.00, aliq_cofins: 3.00, aliq_pis: 0.65, aliq_total: 7.05, descricao_natureza: 'Passagens aéreas, rodoviárias e transporte de passageiros em geral.' },
    { codigo_receita: '8850', aliq_ir: 2.40, aliq_csll: 1.00, aliq_cofins: 0.00, aliq_pis: 0.00, aliq_total: 3.40, descricao_natureza: 'Transporte internacional de passageiros efetuado por empresas nacionais.' },
    { codigo_receita: '8863', aliq_ir: 0.00, aliq_csll: 1.00, aliq_cofins: 3.00, aliq_pis: 0.65, aliq_total: 4.65, descricao_natureza: 'Serviços prestados por associações profissionais ou assemelhadas e cooperativas.' },
    { codigo_receita: '6188', aliq_ir: 2.40, aliq_csll: 1.00, aliq_cofins: 3.00, aliq_pis: 0.65, aliq_total: 7.05, descricao_natureza: 'Serviços de bancos, crédito, financiamento, seguradoras, previdência complementar e seguro saúde.' },
    { codigo_receita: '6190', aliq_ir: 4.80, aliq_csll: 1.00, aliq_cofins: 3.00, aliq_pis: 0.65, aliq_total: 9.45, descricao_natureza: 'Água, telefone, correios, vigilância, limpeza, locação de mão de obra, intermediação, administração/locação de bens, factoring, plano de saúde e DEMAIS SERVIÇOS.' }
  ];

  const lista = regras.length > 0 ? regras : regrasPadrao;

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">
            <BookOpen size={20} color="var(--primary)" />
            Tabela Oficial — Anexo I da IN RFB nº 1.234/2012
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Alíquotas oficiais de retenção ampla na fonte aplicáveis por órgãos e entidades da Administração Pública Federal.
          </p>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="tax-table">
          <thead>
            <tr>
              <th>CÓD. DARF</th>
              <th>NATUREZA DO BEM FORNECIDO OU SERVIÇO PRESTADO</th>
              <th style={{ textAlign: 'right' }}>IR (%)</th>
              <th style={{ textAlign: 'right' }}>CSLL (%)</th>
              <th style={{ textAlign: 'right' }}>COFINS (%)</th>
              <th style={{ textAlign: 'right' }}>PIS (%)</th>
              <th style={{ textAlign: 'right' }}>TOTAL FED. (%)</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((r, i) => (
              <tr key={i}>
                <td>
                  <span style={{ fontWeight: 800, color: 'var(--primary)', background: '#eff6ff', padding: '3px 8px', borderRadius: '4px' }}>
                    {r.codigo_receita}
                  </span>
                </td>
                <td style={{ maxWidth: '480px', fontSize: '0.82rem', lineHeight: '1.4' }}>
                  {r.descricao_natureza}
                </td>
                <td style={{ textAlign: 'right' }}>{Number(r.aliq_ir).toFixed(2)}%</td>
                <td style={{ textAlign: 'right' }}>{Number(r.aliq_csll).toFixed(2)}%</td>
                <td style={{ textAlign: 'right' }}>{Number(r.aliq_cofins).toFixed(2)}%</td>
                <td style={{ textAlign: 'right' }}>{Number(r.aliq_pis).toFixed(2)}%</td>
                <td style={{ textAlign: 'right', fontWeight: 800, color: '#1e40af', background: '#eff6ff' }}>
                  {Number(r.aliq_total).toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
