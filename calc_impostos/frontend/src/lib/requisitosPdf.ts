/**
 * Requisitos para gerar/baixar o PDF da memória de cálculo:
 * Nº do processo SEI completo (17 dígitos) e NS da liquidação no padrão AAAANSXXXXXX.
 * (O servidor valida novamente: esta checagem só evita o clique em vão.)
 */
export function normalizarNS(v?: string | null): string | null {
  const m = /(\d{4})\s*NS\s*0*(\d{1,6})\b/i.exec((v || '').toUpperCase());
  if (!m || Number(m[2]) === 0) return null;
  return `${m[1]}NS${String(Number(m[2])).padStart(6, '0')}`;
}

export function processoSeiValido(v?: string | null): boolean {
  return (v || '').replace(/\D/g, '').length === 17;
}

export const MSG_NS =
  'Informe a NS da liquidação no padrão AAAANSXXXXXX (ex.: 2026NS001313). O PDF só pode ser baixado com a NS preenchida.';

/** Lista o que falta para liberar o download do PDF. */
export function pendenciasParaPdf(nota: { numeroProcesso?: string | null; documentoHabil?: string | null }): string[] {
  const falta: string[] = [];
  if (!processoSeiValido(nota.numeroProcesso)) falta.push('Nº do processo SEI completo');
  if (!normalizarNS(nota.documentoHabil)) falta.push('NS da liquidação (AAAANSXXXXXX)');
  return falta;
}
