import React, { useState, useEffect } from 'react';
import { FileText, X, Check, Hash } from 'lucide-react';

interface Props {
  isOpen: boolean;
  titulo?: string;
  subtitulo?: string;
  valorInicialProcesso?: string;
  valorInicialDocumentoHabil?: string;
  valorInicialEmpenho?: string;
  onConfirm: (processo: string, empenho: string, documentoHabil?: string) => void;
  onCancel: () => void;
}

export const ModalPromptProcesso: React.FC<Props> = ({
  isOpen,
  titulo = 'Informe o Número do Processo',
  subtitulo = 'Para constar no cabeçalho e na memória de cálculo do relatório oficial em PDF',
  valorInicialProcesso = '',
  valorInicialDocumentoHabil = '',
  valorInicialEmpenho = '',
  onConfirm,
  onCancel
}) => {
  const [processo, setProcesso] = useState(valorInicialProcesso);
  const [documentoHabil, setDocumentoHabil] = useState(valorInicialDocumentoHabil);
  const [empenho, setEmpenho] = useState(valorInicialEmpenho);

  useEffect(() => {
    setProcesso(valorInicialProcesso || '');
    setDocumentoHabil(valorInicialDocumentoHabil || '');
    setEmpenho(valorInicialEmpenho || '');
  }, [valorInicialProcesso, valorInicialDocumentoHabil, valorInicialEmpenho, isOpen]);

  if (!isOpen) return null;

  // Formata número de processo SEI: xxxxx.yyyyyy/aaaa-dd
  const formatarProcessoSei = (val: string) => {
    const limpo = val.replace(/\D/g, '').slice(0, 17);
    if (limpo.length <= 5) return limpo;
    if (limpo.length <= 11) return `${limpo.slice(0, 5)}.${limpo.slice(5)}`;
    if (limpo.length <= 15) return `${limpo.slice(0, 5)}.${limpo.slice(5, 11)}/${limpo.slice(11)}`;
    return `${limpo.slice(0, 5)}.${limpo.slice(5, 11)}/${limpo.slice(11, 15)}-${limpo.slice(15)}`;
  };

  const handleProcessoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setProcesso(formatarProcessoSei(e.target.value));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(processo.trim(), empenho.trim(), documentoHabil.trim());
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      padding: '16px'
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '520px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)',
        overflow: 'hidden',
        border: '1px solid #cbd5e1',
        animation: 'fadeIn 0.2s ease-out'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          background: '#0f172a',
          color: '#ffffff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              background: '#2563eb',
              borderRadius: '8px',
              padding: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <FileText size={20} color="#ffffff" />
            </div>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0 }}>
                {titulo}
              </h3>
              <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '2px 0 0 0' }}>
                {subtitulo}
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              Número do Processo (SEI) <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                autoFocus
                value={processo}
                onChange={handleProcessoChange}
                placeholder="Ex: 23076.012345/2026-10"
                style={{
                  width: '100%',
                  padding: '10px 12px 10px 36px',
                  borderRadius: '6px',
                  border: '1px solid #94a3b8',
                  fontSize: '0.95rem',
                  fontWeight: 500,
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
              <Hash size={18} color="#64748b" style={{ position: 'absolute', left: '10px', top: '11px' }} />
            </div>
            <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginTop: '4px' }}>
              Padrão SEI formatado automaticamente ao digitar.
            </span>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              Documento Hábil - Liquidação <span style={{ color: '#64748b', fontWeight: 400 }}>(Opcional)</span>
            </label>
            <input
              type="text"
              value={documentoHabil}
              onChange={(e) => setDocumentoHabil(e.target.value)}
              placeholder="Ex: 2026NS000123 / Chave de Integração"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '0.95rem',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
              Nota de Empenho (NE) <span style={{ color: '#64748b', fontWeight: 400 }}>(Opcional)</span>
            </label>
            <input
              type="text"
              value={empenho}
              onChange={(e) => setEmpenho(e.target.value.toUpperCase())}
              placeholder="Ex: 2026NE000123"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '0.95rem',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#475569',
                fontSize: '0.875rem',
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              style={{
                padding: '8px 18px',
                borderRadius: '6px',
                border: 'none',
                background: '#2563eb',
                color: '#ffffff',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)'
              }}
            >
              <Check size={16} />
              Confirmar e Gerar PDF
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
