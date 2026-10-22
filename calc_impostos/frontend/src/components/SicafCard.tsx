import React from 'react';
import { ShieldCheck, AlertCircle, RefreshCw, ExternalLink } from 'lucide-react';
import { type DadosSicafConsulta } from './ReportPreview';

interface Props {
  sicaf?: DadosSicafConsulta;
  cnpj?: string;
  onRefresh?: () => void;
  loading?: boolean;
}

export const SicafCard: React.FC<Props> = ({ sicaf, cnpj, onRefresh, loading = false }) => {
  const cnpjLimpo = (cnpj || '').replace(/\D/g, '');
  if (!cnpjLimpo && !sicaf) return null;

  const isFalha = Boolean(sicaf?.falhaConexao || sicaf?.status === 'INDISPONIVEL');
  const estaHabilitado = sicaf?.habilitadoLicitar === true;
  const isComRestricao = Boolean(sicaf && sicaf.encontrado && !estaHabilitado && !isFalha);
  const isNaoLocalizado = Boolean(sicaf && !sicaf.encontrado && !isFalha);
  const semConsultaAinda = !sicaf;

  let cardBorder = '#bbf7d0';
  let cardBg = '#f0fdf4';
  let iconBg = '#dcfce7';
  let iconColor = '#16a34a';
  let titleColor = '#166534';
  let subtitleColor = '#15803d';
  let titleText = 'SICAF / COMPRAS.GOV.BR: HABILITADO PARA LICITAR E RECEBER PAGAMENTOS (SIAFI)';
  let descText = sicaf?.mensagem || 'Fornecedor Ativo no Sistema de Compras do Governo Federal (Nada Consta em Impedimentos). Apto para liquidação no SIAFI.';

  if (semConsultaAinda) {
    cardBorder = '#cbd5e1';
    cardBg = '#f8fafc';
    iconBg = '#e2e8f0';
    iconColor = '#64748b';
    titleColor = '#334155';
    subtitleColor = '#475569';
    titleText = 'CONFORMIDADE SICAF / SIAFI: REGULARIDADE PRÉ-PAGAMENTO';
    descText = 'Clique para verificar a habilitação jurídica e regularidade do fornecedor no SICAF / Compras.gov.br.';
  } else if (isFalha) {
    cardBorder = '#fde68a';
    cardBg = '#fffbeb';
    iconBg = '#fef3c7';
    iconColor = '#d97706';
    titleColor = '#92400e';
    subtitleColor = '#b45309';
    titleText = 'SICAF: SERVIÇO PÚBLICO TEMPORARIAMENTE INDISPONÍVEL';
    descText = 'O portal Compras.gov.br demorou para responder. A análise de retenções tributárias foi processada sem bloqueio.';
  } else if (isComRestricao) {
    cardBorder = '#fca5a5';
    cardBg = '#fef2f2';
    iconBg = '#fee2e2';
    iconColor = '#dc2626';
    titleColor = '#991b1b';
    subtitleColor = '#b91c1c';
    titleText = 'SICAF / COMPRAS.GOV.BR: FORNECEDOR COM RESTRIÇÃO OU SANÇÃO IMPEDITIVA';
    descText = sicaf?.mensagem || 'Fornecedor com ocorrência impeditiva ativa no SICAF. Alerta para apropriação e pagamento no SIAFI.';
  } else if (isNaoLocalizado) {
    cardBorder = '#cbd5e1';
    cardBg = '#f8fafc';
    iconBg = '#e2e8f0';
    iconColor = '#64748b';
    titleColor = '#334155';
    subtitleColor = '#475569';
    titleText = 'SICAF: FORNECEDOR NÃO LOCALIZADO NA BASE ATIVA';
    descText = 'Fornecedor não possui registro ativo no SICAF Federal.';
  }

  return (
    <div style={{ 
      marginTop: '16px',
      padding: '12px 16px', 
      borderRadius: 'var(--radius-md)', 
      border: `1px solid ${cardBorder}`,
      background: cardBg,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: '12px',
      flexWrap: 'wrap'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '260px' }}>
        <div style={{ 
          width: '38px', 
          height: '38px', 
          borderRadius: '50%', 
          background: iconBg, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          flexShrink: 0
        }}>
          {estaHabilitado ? (
            <ShieldCheck size={20} color={iconColor} />
          ) : (
            <AlertCircle size={20} color={iconColor} />
          )}
        </div>
        <div>
          <div style={{ fontSize: '0.82rem', fontWeight: 800, color: titleColor, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>{titleText}</span>
          </div>
          <div style={{ fontSize: '0.74rem', color: subtitleColor, marginTop: '2px' }}>
            {descText}
            {sicaf && (
              <>
                {' • '}
                <span style={{ fontWeight: 600 }}>
                  📄 Certidão oficial anexada ao PDF do relatório para o SEI.
                </span>
              </>
            )}
          </div>
          {sicaf?.codigoAutenticidade && (
            <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '3px', fontFamily: 'var(--font-mono)' }}>
              Código de Autenticidade Digital: <strong style={{ color: '#0f172a' }}>{sicaf.codigoAutenticidade}</strong>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading || !cnpjLimpo}
            style={{
              fontSize: '0.73rem',
              fontWeight: 700,
              color: '#0f172a',
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              padding: '6px 10px',
              cursor: loading ? 'wait' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              whiteSpace: 'nowrap'
            }}
            title="Atualizar consulta do SICAF agora"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Consultando...' : sicaf ? 'Atualizar SICAF' : 'Consultar SICAF'}
          </button>
        )}

        {cnpjLimpo && (
          <a 
            href={`https://dadosabertos.compras.gov.br/modulo-fornecedor/1_consultarFornecedor?ativo=true&cnpj=${cnpjLimpo}`}
            target="_blank" 
            rel="noreferrer"
            style={{
              fontSize: '0.73rem',
              fontWeight: 700,
              color: '#2563eb',
              background: '#ffffff',
              border: '1px solid #bfdbfe',
              borderRadius: '6px',
              padding: '6px 10px',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              whiteSpace: 'nowrap'
            }}
            title="Abrir endpoint oficial do Compras.gov.br"
          >
            <ExternalLink size={13} />
            Dados Abertos SICAF
          </a>
        )}
      </div>
    </div>
  );
};
