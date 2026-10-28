export interface ValidacaoChaveAcesso {
  /** true quando foi possível comparar ao menos um dos campos (CNPJ ou número) */
  verificavel: boolean;
  /** true quando nenhuma divergência foi encontrada */
  valida: boolean;
  cnpjChave?: string;
  cnpjCorpo?: string;
  numeroChave?: string;
  numeroCorpo?: string;
  divergencias: string[];
}

function formatarCnpj(digitos: string): string {
  if (digitos.length !== 14) return digitos;
  return `${digitos.substring(0, 2)}.${digitos.substring(2, 5)}.${digitos.substring(5, 8)}/${digitos.substring(8, 12)}-${digitos.substring(12, 14)}`;
}

function normalizarNumero(valor?: string): string {
  return (valor || '').replace(/\D/g, '').replace(/^0+/, '');
}

/**
 * Confere os dados embutidos na chave de acesso da NF-e (44 dígitos) com os impressos/declarados
 * no corpo do documento.
 *
 * Estrutura da chave: cUF(2) AAMM(4) CNPJ(14) mod(2) série(3) nNF(9) tpEmis(1) cNF(8) DV(1)
 */
export class ChaveAcessoValidator {
  public static validar(params: {
    chaveAcesso?: string;
    cnpjCorpo?: string;
    numeroCorpo?: string;
  }): ValidacaoChaveAcesso {
    const chave = (params.chaveAcesso || '').replace(/\D/g, '');
    const resultado: ValidacaoChaveAcesso = { verificavel: false, valida: true, divergencias: [] };

    // Apenas NF-e modelo 55/65 (44 dígitos) possui CNPJ e número em posições fixas
    if (chave.length !== 44) return resultado;

    const cnpjChave = chave.substring(6, 20);
    const numeroChave = normalizarNumero(chave.substring(25, 34));
    resultado.cnpjChave = formatarCnpj(cnpjChave);
    resultado.numeroChave = numeroChave;

    const cnpjCorpo = (params.cnpjCorpo || '').replace(/\D/g, '');
    if (cnpjCorpo.length === 14) {
      resultado.cnpjCorpo = formatarCnpj(cnpjCorpo);
      resultado.verificavel = true;
      if (cnpjCorpo !== cnpjChave) {
        resultado.divergencias.push(
          `O CNPJ do emitente na chave de acesso (${formatarCnpj(cnpjChave)}) é diferente do CNPJ do emitente no corpo da nota (${formatarCnpj(cnpjCorpo)}).`
        );
      }
    }

    const numeroCorpo = normalizarNumero(params.numeroCorpo);
    if (numeroCorpo) {
      resultado.numeroCorpo = numeroCorpo;
      resultado.verificavel = true;
      if (numeroCorpo !== numeroChave) {
        resultado.divergencias.push(
          `O número da nota na chave de acesso (${numeroChave}) é diferente do número impresso no corpo da nota (${numeroCorpo}).`
        );
      }
    }

    resultado.valida = resultado.divergencias.length === 0;
    return resultado;
  }
}

