/** Erro de regra de negócio com código estável, traduzido para HttpsError na borda. */
export type CodigoErro =
  | "NAO_AUTENTICADO"
  | "SEM_PERMISSAO"
  | "ARGUMENTO_INVALIDO"
  | "NAO_ENCONTRADO"
  | "BRINCO_DUPLICADO"
  | "CATEGORIA_INVALIDA";

export class ErroNegocio extends Error {
  constructor(
    readonly codigo: CodigoErro,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "ErroNegocio";
  }
}
